"""Agent directory: every agent the Studio knows, reachable from the Builder chat, and deletable.

Entries (``id`` is the address used by the chat, the API and the Builder's tools):

  agent_builder               the Builder itself (the chat's default target)    kind=builder
  agent_builder/<name>        its specialists (intent_detection, ...)            kind=builder_sub_agent
  <project>                   a generated project's root agent                   kind=project
  <project>/<agent_dir>       a generated sub-agent                              kind=sub_agent

The generated code is the source of truth: each project's tree is read from its agent.py files
(AST), so it also reflects manual edits. Builder agents are protected; generated ones can be
deleted, which removes their code, detaches them from their parent and evicts every cache.
"""

from __future__ import annotations

import ast
import importlib
import json
import os
import re
import shutil
import stat
import sys
import time
from pathlib import Path
from typing import Any, Callable

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from .shared_libraries.constants import EDITS_DIR_NAME, OUTPUT_DIR, REGISTRY_DIR_NAME, SESSIONS_DIR_NAME  # noqa: F401 (re-exported)
from .tracing import logger
from .workspace import adk_user, module_prefix, output_dir, packages_root

BUILDER = "agent_builder"
_AGENT_CLASSES = {"LlmAgent", "Agent", "SequentialAgent", "ParallelAgent", "LoopAgent"}
_SESSIONS = InMemorySessionService()  # conversations with agents addressed directly from the chat
_evict_hooks: list[Callable[[str], None]] = []


class DirectoryError(ValueError):
    """A request the directory refuses (unknown agent, protected agent, ...)."""


# --- naming -----------------------------------------------------------------------------------------
def app_name(project: str) -> str:
    """ADK app name of a generated project in the caller's workspace (identity.py derives the worker team from it)."""
    return f"{module_prefix()}.{project}.{project}"


def _package_dir(project: str) -> Path:
    return output_dir() / project / project


def projects() -> list[str]:
    """The caller's generated projects, newest first."""
    root = output_dir()
    if not root.exists():
        return []
    found = [p for p in root.iterdir()
             if p.is_dir() and not p.name.startswith(("_", ".")) and (p / p.name / "agent.py").exists()]
    return [p.name for p in sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)]


# --- reading the generated code ---------------------------------------------------------------------
def _literal(node: ast.AST | None) -> str:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else ""


def _parse_agent_file(path: Path) -> dict | None:
    """The agent defined in an agent.py: name, description, tools and sub-agent variables."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError) as exc:
        logger.warning("directory: cannot parse %s: %s", path, exc)
        return None
    imports: dict[str, str] = {}  # variable -> sub_agents/<dir>
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module and node.module.endswith(".agent"):
            parts = node.module.split(".")
            target_dir = parts[-2] if len(parts) >= 2 else ""
            for alias in node.names:
                imports[alias.asname or alias.name] = target_dir
    for node in tree.body:
        if not (isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and isinstance(node.targets[0], ast.Name)):
            continue
        func = node.value.func
        cls = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
        if cls not in _AGENT_CLASSES:
            continue
        kw = {k.arg: k.value for k in node.value.keywords if k.arg}

        def names(key: str) -> list[str]:
            value = kw.get(key)
            return [e.id for e in value.elts if isinstance(e, ast.Name)] if isinstance(value, ast.List) else []

        var = node.targets[0].id
        return {"var": var, "name": _literal(kw.get("name")) or var, "description": _literal(kw.get("description")),
                "type": cls, "tools": names("tools"), "sub_agent_vars": names("sub_agents"), "imports": imports}
    return None


def project_tree(project: str) -> list[dict]:
    """Every agent of a generated project, root first (depth-first), read from its code."""
    pkg = _package_dir(project)
    entries: list[dict] = []
    seen: set[str] = set()

    def visit(path: Path, agent_dir: str | None, parent: str | None, depth: int) -> None:
        info = _parse_agent_file(path)
        if info is None:
            return
        entry_id = project if agent_dir is None else f"{project}/{agent_dir}"
        if entry_id in seen:
            return
        seen.add(entry_id)
        children = [d for v in info["sub_agent_vars"] if (d := info["imports"].get(v))]
        entries.append({
            "id": entry_id, "name": info["name"], "project": project, "parent": parent, "depth": depth,
            "kind": "project" if agent_dir is None else "sub_agent", "agent_type": info["type"],
            "description": info["description"], "tools": info["tools"], "dir": agent_dir,
            "children": [f"{project}/{d}" for d in children], "app_name": app_name(project), "deletable": True,
        })
        for child in children:
            child_file = pkg / "sub_agents" / child / "agent.py"
            if child_file.exists():
                visit(child_file, child, entry_id, depth + 1)

    root = pkg / "agent.py"
    if root.exists():
        visit(root, None, None, 0)
    return entries


def _builder_specialists() -> list:
    """The Builder's specialists: its AgentTools plus the idea provider and critics its review tools run."""
    from google.adk.tools.agent_tool import AgentTool

    from .agent import root_agent
    from .sub_agents.design_review.agent import code_critic_agent, design_critic_agent, idea_provider_agent

    return [t.agent for t in root_agent.tools if isinstance(t, AgentTool)] + [idea_provider_agent, design_critic_agent, code_critic_agent]


def _builder_entries() -> list[dict]:
    from .agent import root_agent

    entries = [{"id": BUILDER, "name": BUILDER, "project": None, "parent": None, "depth": 0, "kind": "builder",
                "agent_type": "LlmAgent", "description": root_agent.description, "tools": [], "dir": None,
                "children": [], "app_name": BUILDER, "deletable": False}]
    for agent in _builder_specialists():
        entries[0]["children"].append(f"{BUILDER}/{agent.name}")
        entries.append({"id": f"{BUILDER}/{agent.name}", "name": agent.name, "project": None, "parent": BUILDER,
                        "depth": 1, "kind": "builder_sub_agent", "agent_type": type(agent).__name__,
                        "description": agent.description, "tools": [getattr(t, "__name__", getattr(t, "name", "")) for t in getattr(agent, "tools", [])],
                        "dir": None, "children": [], "app_name": BUILDER, "deletable": False})
    return entries


def list_entries() -> list[dict]:
    entries = _builder_entries()
    for project in projects():
        entries.extend(project_tree(project))
    return entries


def resolve(target: str, entries: list[dict] | None = None) -> dict | None:
    """Find an agent by id ('proj/agent'), agent name, project name or '@mention' (case-insensitive)."""
    key = (target or "").strip().lstrip("@").strip().lower()
    if not key:
        return None
    entries = entries if entries is not None else list_entries()
    for match in (lambda e: e["id"].lower() == key,
                  lambda e: e["name"].lower() == key,
                  lambda e: e["kind"] == "project" and e["project"].lower() == key,
                  lambda e: e["id"].lower().endswith("/" + key)):
        hits = [e for e in entries if match(e)]
        if hits:
            return hits[0]
    return None


# --- running an agent from the chat ----------------------------------------------------------------
def _load_agent(entry: dict):
    """The live agent object for an entry, detached so it can run on its own."""
    if entry["kind"] == "builder_sub_agent":
        for agent in _builder_specialists():
            if agent.name == entry["name"]:
                return agent
        raise DirectoryError(f"Builder specialist {entry['name']!r} is not loaded")
    parent_dir = str(packages_root())
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
    module = importlib.import_module(f"{app_name(entry['project'])}.agent")
    root = module.root_agent
    if entry["kind"] == "project":
        return root
    agent = root.find_agent(entry["name"])
    if agent is None:
        raise DirectoryError(f"{entry['name']!r} is not part of {entry['project']!r}'s agent tree")
    # Run the specialist on its own: no parent to hand control back to.
    update: dict[str, Any] = {"parent_agent": None}
    if hasattr(agent, "disallow_transfer_to_parent"):
        update.update(disallow_transfer_to_parent=True, disallow_transfer_to_peers=True)
    return agent.model_copy(update=update)


def _short(value: Any, limit: int = 160) -> str:
    text = value if isinstance(value, str) else json.dumps(value, default=str, ensure_ascii=False)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _plugins() -> list:
    from .attachments import attachment_plugin

    try:
        from .telemetry import telemetry_plugin

        return [attachment_plugin, telemetry_plugin]
    except Exception:  # telemetry is optional (e.g. in tests)
        return [attachment_plugin]


def session_id_for(session_key: str, entry_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.:-]", "_", f"{session_key}:{entry_id}")[:120]


async def drive(runner: Runner, session_id: str, message: str, trace: list[dict],
                attachments: list[types.Part] | None = None) -> str:
    """Run one turn and return the final text reply; agent hand-offs and tool calls are appended to
    `trace` (whose first step names the agent that starts). `attachments` are image / document parts sent
    with the message. Closes the runner."""
    reply, last_author = "", trace[0]["agent"] if trace else ""
    parts = [types.Part(text=message), *(attachments or [])]
    try:
        async for event in runner.run_async(user_id=adk_user(), session_id=session_id,
                                            new_message=types.Content(role="user", parts=parts)):
            author = event.author or ""
            if author and author not in ("user", last_author):
                trace.append({"type": "agent", "agent": author, "detail": f"handoff from {last_author}"})
                last_author = author
            for call in event.get_function_calls():
                trace.append({"type": "tool", "agent": author, "name": call.name, "args": _short(call.args or {}), "id": call.id})
            for resp in event.get_function_responses():
                status = resp.response.get("status") if isinstance(resp.response, dict) else None
                for step in reversed(trace):
                    if step["type"] == "tool" and step.get("id") == resp.id and "status" not in step:
                        step["status"] = status or "done"
                        break
            parts = event.content.parts if event.content and event.content.parts else []
            text = "".join(p.text for p in parts if p.text and not p.thought)
            if text and author != "user":
                reply = text
    finally:
        await runner.close()
        for step in trace:
            step.pop("id", None)
    return reply


async def run_agent(target: str, message: str, session_key: str = "default",
                    attachments: list[types.Part] | None = None) -> dict:
    """Send a message (and optional image / document parts) to any agent in the directory; returns its
    reply and the call trace."""
    entry = resolve(target)
    if entry is None:
        raise DirectoryError(f"No agent named {target!r}. Known: " + ", ".join(e["id"] for e in list_entries()))
    if entry["kind"] == "builder":
        raise DirectoryError("The Builder is the chat itself: send the message without an @target.")
    agent = _load_agent(entry)
    runner = Runner(app_name=entry["app_name"], agent=agent, session_service=_SESSIONS, plugins=_plugins(),
                    auto_create_session=True)
    trace: list[dict] = [{"type": "agent", "agent": entry["name"], "detail": f"{entry['kind'].replace('_', ' ')} · {entry['id']}"}]
    started = time.perf_counter()
    reply = await drive(runner, session_id_for(session_key, entry["id"]), message, trace, attachments)
    return {"status": "success", "target": entry["id"], "agent": entry["name"], "kind": entry["kind"],
            "project": entry["project"], "reply": reply or "(no text reply)", "trace": trace,
            "duration_ms": round((time.perf_counter() - started) * 1000)}


# --- deletion ------------------------------------------------------------------------------------
def on_evict(hook: Callable[[str], None]) -> None:
    """Register a cache-eviction hook (the API server drops its cached agent + runner for the app)."""
    _evict_hooks.append(hook)


def purge_modules(project: str) -> None:
    """Forget a project's imported modules so the next import reads the code on disk."""
    prefix = app_name(project).rsplit(".", 1)[0]  # generated_agents.<project>
    for name in [m for m in sys.modules if m == prefix or m.startswith(prefix + ".")]:
        del sys.modules[name]
    importlib.invalidate_caches()


def _evict(project: str) -> None:
    purge_modules(project)
    for hook in _evict_hooks:
        try:
            hook(app_name(project))
        except Exception as exc:
            logger.warning("directory: evict hook failed: %s", exc)


def _rmtree(path: Path) -> None:
    def make_writable(func, p, _exc):  # read-only files on Windows
        os.chmod(p, stat.S_IWRITE)
        func(p)

    if path.exists():
        shutil.rmtree(path, onexc=make_writable) if sys.version_info >= (3, 12) else shutil.rmtree(path, onerror=make_writable)


def _format(code: str) -> str:
    try:
        from .sub_agents.code_generator.tools import _format as fmt

        return fmt(code)
    except Exception:
        return code


def _detach(parent_file: Path, removed_dirs: set[str], removed_names: list[str]) -> None:
    """Remove the imports of the deleted sub-agents and their entries in `sub_agents=[...]`."""
    source = parent_file.read_text(encoding="utf-8")
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))

    def pos(lineno: int, col: int) -> int:
        return offsets[lineno - 1] + len(lines[lineno - 1].encode("utf-8")[:col].decode("utf-8", "ignore"))

    removed_vars: set[str] = set()
    edits: list[tuple[int, int, str]] = []
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module and node.module.endswith(".agent"):
            parts = node.module.split(".")
            if len(parts) >= 2 and parts[-2] in removed_dirs:
                removed_vars.update(a.asname or a.name for a in node.names)
                edits.append((offsets[node.lineno - 1], offsets[node.end_lineno], ""))
    for node in ast.walk(tree):
        if isinstance(node, ast.keyword) and node.arg == "sub_agents" and isinstance(node.value, ast.List):
            kept = [ast.get_source_segment(source, e) for e in node.value.elts
                    if not (isinstance(e, ast.Name) and e.id in removed_vars)]
            v = node.value
            edits.append((pos(v.lineno, v.col_offset), pos(v.end_lineno, v.end_col_offset), "[" + ", ".join(kept) + "]"))
    for start, end, text in sorted(edits, reverse=True):
        source = source[:start] + text + source[end:]
    ast.parse(source)  # never write a broken parent
    parent_file.write_text(_format(source), encoding="utf-8")

    prompt_file = parent_file.with_name("prompt.py")
    if prompt_file.exists() and "INSTRUCTION" in prompt_file.read_text(encoding="utf-8"):
        names = ", ".join(f"`{n}`" for n in removed_names)
        note = (f"\n\n# Removed in the Studio on {time.strftime('%Y-%m-%d')}.\n"
                f"INSTRUCTION += {json.dumps(chr(10) * 2 + f'The sub-agent(s) {names} were removed: never delegate or transfer to them; handle or politely decline those requests yourself.')}\n")
        prompt_file.write_text(prompt_file.read_text(encoding="utf-8").rstrip() + "\n" + note, encoding="utf-8")


def _update_registry(project: str, removed_names: set[str]) -> None:
    from .tools.file_manager import read_registry, write_registry

    cards = read_registry(project)
    if not cards:
        return
    kept = {}
    for name, card in cards.items():
        if name in removed_names:
            continue
        if isinstance(card.get("sub_agents"), list):
            card["sub_agents"] = [s for s in card["sub_agents"] if s not in removed_names]
        kept[name] = card
    write_registry(project, kept)


async def _platform_cleanup(project: str | None, payload: dict) -> dict:
    """Best-effort: drop the project's knowledge namespace and audit the deletion."""
    out: dict[str, Any] = {}
    try:
        from tectonic_runtime import CallContext, get_runtime

        rt = get_runtime()
        ctx = CallContext(agent_id=BUILDER, role="admin", team=BUILDER, session_id="studio")
        if project and payload.get("kind") == "project":
            docs = await rt.invoke("agentic_rag", "documents_list", {"namespace": project}, ctx)
            removed = 0
            for doc in (docs.data or {}).get("documents", []) if docs.ok else []:
                if doc.get("namespace") == project and (await rt.invoke("agentic_rag", "delete_document", {"doc_id": doc["doc_id"]}, ctx)).ok:
                    removed += 1
            out["knowledge_documents_removed"] = removed
        audit = await rt.invoke("auditability", "record_event", {"event_type": "AGENT_DELETED", "team": project or BUILDER,
                                                                 "payload": payload}, ctx)
        out["audit_sequence"] = (audit.data or {}).get("sequence") if audit.ok else None
    except Exception as exc:  # the code is already gone; platform bookkeeping must not fail the delete
        out["platform_error"] = str(exc)
    return out


def _forget(names: list[str], project: str | None) -> None:
    try:
        from .telemetry import hub

        hub.forget(names, project=project)
    except Exception:
        pass


async def delete_agent(target: str) -> dict:
    """Delete a generated project (``<project>``) or one of its sub-agents (``<project>/<agent>``).

    A sub-agent's descendants go with it (unless another surviving agent also uses them); its parent's
    code is edited to drop it, and the parent's prompt is told not to delegate to it any more.
    """
    entries = list_entries()
    entry = next((e for e in entries if e["id"] == target), None) or resolve(target, entries)
    if entry is None:
        raise DirectoryError(f"No agent {target!r}")
    if not entry["deletable"]:
        raise DirectoryError(f"{entry['id']} is part of the Agent Builder and cannot be deleted")
    project = entry["project"]
    tree = [e for e in entries if e["project"] == project]

    if entry["kind"] == "project":
        names = [e["name"] for e in tree]
        _evict(project)
        root = output_dir()
        _rmtree(root / project)
        for extra in (root / REGISTRY_DIR_NAME / f"{project}.json", root / SESSIONS_DIR_NAME / f"{project}.json"):
            extra.unlink(missing_ok=True)
        _rmtree(root / EDITS_DIR_NAME / project)
        payload = {"kind": "project", "project": project, "agents": names}
        platform = await _platform_cleanup(project, payload)
        _forget(names, project)
        return {"status": "success", "kind": "project", "project": project, "deleted": [e["id"] for e in tree],
                "agents": names, "platform": platform}

    # Sub-agent: the target plus descendants that no surviving agent still references.
    by_id = {e["id"]: e for e in tree}
    removed = {entry["id"]}
    changed = True
    while changed:
        changed = False
        for e in tree:
            if e["id"] in removed:
                continue
            referrers = [p for p in tree if e["id"] in p["children"]]
            if referrers and all(p["id"] in removed for p in referrers):
                removed.add(e["id"])
                changed = True
    removed_entries = [by_id[i] for i in removed]
    removed_dirs = {e["dir"] for e in removed_entries}
    removed_names = [e["name"] for e in removed_entries]
    pkg = _package_dir(project)
    parents = [p for p in tree if p["id"] not in removed and set(p["children"]) & removed]
    for parent in parents:
        parent_file = pkg / "agent.py" if parent["kind"] == "project" else pkg / "sub_agents" / parent["dir"] / "agent.py"
        _detach(parent_file, removed_dirs, removed_names)
    for d in removed_dirs:
        _rmtree(pkg / "sub_agents" / d)
    _update_registry(project, set(removed_names))
    _evict(project)
    payload = {"kind": "sub_agent", "project": project, "agents": removed_names, "parents": [p["name"] for p in parents]}
    platform = await _platform_cleanup(project, payload)
    _forget(removed_names, project)
    return {"status": "success", "kind": "sub_agent", "project": project, "deleted": sorted(removed),
            "agents": removed_names, "detached_from": [p["id"] for p in parents], "platform": platform}
