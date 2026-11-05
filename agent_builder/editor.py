"""Conversational editing of generated agents: change, verify, go live, or roll back.

``edit_agent(target, request)`` runs the agent editor on one generated project:

  1. snapshot the project's editable files and run the editor (one conversation per Studio session and
     project, so follow-ups like "make it shorter" refer to the previous change);
  2. verify what changed (safety scan + a real import of the root agent); the editor gets one repair
     round, after which a failing change is rolled back file by file;
  3. evict the cached agent and runner so the next run loads the new code, publish edited instructions
     to PromptOps (generated agents read their live prompt from there), and record the edit so
     ``undo_last_edit`` can restore it.
"""

from __future__ import annotations

import asyncio
import difflib
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google.adk.events import Event, EventActions
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from . import directory
from .directory import DirectoryError
from .shared_libraries.constants import EDITS_DIR_NAME
from .sub_agents.agent_editor.agent import agent_editor
from .sub_agents.agent_editor.tools import (
    STATE_EDIT_PROJECT,
    STATE_EDIT_READ,
    baselines,
    changed_paths,
    project_root,
    snapshot,
    verify_project,
)
from .tracing import logger
from .workspace import adk_user, output_dir

EDITOR_APP = "agent_editor"
MAX_HISTORY = 20
MAX_DIFF_LINES = 400
_SESSIONS = InMemorySessionService()
_locks: dict[str, asyncio.Lock] = {}
_seen: dict[str, str | None] = {}  # editor session -> digest of the files when its last turn ended
_attempts: dict[str, dict] = {}  # project -> outcome of its latest edit (lets a refreshed Studio catch up)
_tasks: set[asyncio.Task] = set()  # edits running detached from their caller


def _digest(snap: dict[str, str]) -> str:
    return hashlib.sha256(json.dumps(sorted(snap.items())).encode()).hexdigest()


def _target(target: str) -> dict:
    entry = directory.resolve(target)
    if entry is None:
        raise DirectoryError(f"No agent named {target!r}. Known: " + ", ".join(e["id"] for e in directory.list_entries()))
    if not entry.get("project"):
        raise DirectoryError(f"{entry['id']} is part of the Agent Builder and cannot be edited.")
    return entry


def _ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


def _key(project: str) -> str:
    """Projects are per user: two users' projects of the same name never share a lock or outcome."""
    return f"{adk_user()}/{project}"


def _lock(project: str) -> asyncio.Lock:
    return _locks.setdefault(_key(project), asyncio.Lock())


# --- files ---------------------------------------------------------------------------------------
def _prune_empty_dirs(folder: Path, stop: Path) -> None:
    while stop in folder.parents and folder.is_dir() and not [p for p in folder.iterdir() if p.name != "__pycache__"]:
        directory._rmtree(folder)
        folder = folder.parent


def _restore(project: str, target: dict[str, str], current: dict[str, str]) -> None:
    """Make the project's editable files equal to `target` (files absent from it are removed)."""
    root = project_root(project)
    for rel in changed_paths(target, current):
        path = root / rel
        if rel in target:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(target[rel], encoding="utf-8")
        else:
            path.unlink(missing_ok=True)
            _prune_empty_dirs(path.parent, root / project)


def _file_changes(before: dict[str, str], after: dict[str, str], with_diff: bool = True) -> list[dict]:
    out = []
    for rel in changed_paths(before, after):
        old, new = before.get(rel), after.get(rel)
        lines = list(difflib.unified_diff((old or "").splitlines(), (new or "").splitlines(), f"a/{rel}", f"b/{rel}", lineterm="", n=2))
        item: dict[str, Any] = {
            "path": rel, "status": "added" if old is None else "deleted" if new is None else "modified",
            "added": sum(1 for line in lines if line.startswith("+") and not line.startswith("+++")),
            "removed": sum(1 for line in lines if line.startswith("-") and not line.startswith("---")),
        }
        if with_diff:
            item["diff"] = "\n".join(lines[:MAX_DIFF_LINES]) + ("\n… (diff truncated)" if len(lines) > MAX_DIFF_LINES else "")
        out.append(item)
    return out


# --- PromptOps -----------------------------------------------------------------------------------
def _walk(agent):
    yield agent
    for sub in getattr(agent, "sub_agents", None) or []:
        yield from _walk(sub)


def _managed_prompt(agent) -> tuple[str, str] | None:
    """(PromptOps name, code template) of an agent whose instruction is a generated managed_instruction."""
    fn = getattr(agent, "instruction", None)
    code, closure = getattr(fn, "__code__", None), getattr(fn, "__closure__", None)
    if code is None or not closure:
        return None
    try:
        cells = dict(zip(code.co_freevars, (c.cell_contents for c in closure)))
    except ValueError:  # an empty closure cell
        return None
    team = getattr(fn, "__globals__", {}).get("TEAM")
    if not (isinstance(cells.get("template"), str) and isinstance(cells.get("agent_name"), str) and isinstance(team, str)):
        return None
    return f"{team}.{cells['agent_name']}", cells["template"]


async def _publish_prompts(project: str, changed: list[str]) -> list[dict]:
    """Make edited instructions live: a managed version promoted earlier must not shadow the edit."""
    dirs: set[str | None] = set()
    every_agent = False
    for rel in changed:
        inner = rel.split("/")[1:] if rel.split("/")[0] == project else []
        if inner[:1] == ["shared_libraries"]:
            every_agent = True
        elif inner[:1] == ["sub_agents"] and len(inner) >= 3:
            dirs.add(inner[1])
        elif inner in (["agent.py"], ["prompt.py"]):
            dirs.add(None)
    if not dirs and not every_agent:
        return []
    try:
        from tectonic_runtime import get_runtime

        promptops = get_runtime().module("promptops")
        tree = directory.project_tree(project)
        root = directory._load_agent(tree[0])  # the fresh code (caches were evicted)
    except Exception as exc:  # the edit is on disk either way; PromptOps follows unchanged code defaults itself
        return [{"error": f"PromptOps not updated: {exc}"}]
    dir_of = {e["name"]: e["dir"] for e in tree}
    results = []
    for agent in _walk(root):
        managed = _managed_prompt(agent)
        if managed is None or not (every_agent or (agent.name in dir_of and dir_of[agent.name] in dirs)):
            continue
        try:
            version, published = await promptops.publish_code_default(*managed)
            results.append({"prompt": managed[0], "version": version.version, "published": published})
        except Exception as exc:
            results.append({"prompt": managed[0], "error": str(exc)})
    return results


async def _audit(project: str, event_type: str, payload: dict) -> None:
    try:
        from tectonic_runtime import CallContext, get_runtime

        ctx = CallContext(agent_id=EDITOR_APP, role="admin", team=directory.BUILDER, session_id="studio")
        await get_runtime().invoke("auditability", "record_event", {"event_type": event_type, "team": project, "payload": payload}, ctx)
    except Exception as exc:  # bookkeeping never fails an edit
        logger.warning("editor: audit failed: %s", exc)


# --- history -------------------------------------------------------------------------------------
def _history_dir(project: str) -> Path:
    return output_dir() / EDITS_DIR_NAME / project


def _records(project: str) -> list[dict]:
    """Recorded edits of a project, newest first."""
    folder = _history_dir(project)
    out = []
    for path in sorted(folder.glob("*.json"), reverse=True) if folder.is_dir() else []:
        try:
            out.append({**json.loads(path.read_text(encoding="utf-8")), "_file": path})
        except (OSError, ValueError):
            logger.warning("editor: unreadable edit record %s", path)
    return out


def _record(project: str, entry: dict, request: str, summary: str, before: dict, after: dict, changed: list[str]) -> dict:
    folder = _history_dir(project)
    folder.mkdir(parents=True, exist_ok=True)
    edit_id = f"{time.time_ns() // 1_000_000:013d}-{uuid.uuid4().hex[:6]}"  # sorts chronologically
    record = {"id": edit_id, "project": project, "target": entry["id"], "request": request, "summary": summary,
              "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "files": {rel: {"before": before.get(rel), "after": after.get(rel)} for rel in changed}}
    (folder / f"{edit_id}.json").write_text(json.dumps(record, indent=1), encoding="utf-8")
    for old in sorted(folder.glob("*.json"))[:-MAX_HISTORY]:
        old.unlink(missing_ok=True)
    return record


def list_edits(target: str) -> dict:
    """The recorded edits of a project (newest first), without file contents."""
    project = _target(target)["project"]
    edits = [{"id": r["id"], "target": r.get("target"), "request": r.get("request", ""), "summary": r.get("summary", ""),
              "created_at": r.get("created_at"), "files": sorted(r.get("files", {}))} for r in _records(project)]
    lock = _locks.get(_key(project))
    return {"status": "success", "project": project, "edits": edits, "editing": bool(lock and lock.locked()),
            "last_attempt": _attempts.get(_key(project))}


# --- editing -------------------------------------------------------------------------------------
def _runner() -> Runner:
    return Runner(app_name=EDITOR_APP, agent=agent_editor, session_service=_SESSIONS, plugins=directory._plugins())


async def _open_session(session_id: str, project: str, files: dict[str, str]) -> bool:
    """Create the editor conversation, or report (and reset its read list) when the files changed since
    its last turn: a manual edit, an undo or a rollback happened, so what it read before is stale."""
    session = await _SESSIONS.get_session(app_name=EDITOR_APP, user_id=adk_user(), session_id=session_id)
    if session is None:
        await _SESSIONS.create_session(app_name=EDITOR_APP, user_id=adk_user(), session_id=session_id,
                                       state={STATE_EDIT_PROJECT: project})
        return False
    if _seen.get(session_id) == _digest(files):
        return False
    await _SESSIONS.append_event(session, Event(author="user", invocation_id=f"sync-{uuid.uuid4().hex[:8]}",
                                                actions=EventActions(state_delta={STATE_EDIT_READ: []})))
    return True


def _repair_message(problems: list[str]) -> str:
    return ("Verification failed after your change:\n" + "\n".join(f"- {p}" for p in problems)
            + "\nFix every problem now (re-read the files, write the corrected versions, call check_agent).")


def _settle(task: asyncio.Task) -> None:
    _tasks.discard(task)
    exc = None if task.cancelled() else task.exception()  # retrieved here in case its caller has gone
    if exc is not None and not isinstance(exc, DirectoryError):
        logger.warning("editor: background edit failed: %s", exc)


async def _detached(coro) -> Any:
    """Run file-changing work to completion even if the caller is cancelled (the browser was refreshed,
    or the Builder run that called edit_agent stopped): a change is always verified, then kept or
    rolled back, never left half-applied."""
    task = asyncio.ensure_future(coro)
    _tasks.add(task)
    task.add_done_callback(_settle)
    return await asyncio.shield(task)


async def edit_agent(target: str, request: str, session_key: str = "studio") -> dict:
    """Apply a natural-language change to a generated agent (see the module docstring)."""
    request = (request or "").strip()
    if not request:
        raise DirectoryError("Describe the change you want to make.")
    entry = _target(target)
    return await _detached(_edit_locked(entry, request, session_key))


async def _edit_locked(entry: dict, request: str, session_key: str) -> dict:
    async with _lock(entry["project"]):
        result = await _edit(entry, request, session_key)
        _attempts[_key(entry["project"])] = {
            "request": request, "status": result["status"], "edit_id": result.get("edit_id"),
            "summary": result.get("summary") or result.get("reply") or "", "error": result.get("error"),
            "problems": result.get("problems", []), "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        return result


async def _edit(entry: dict, request: str, session_key: str) -> dict:
    project, started = entry["project"], time.perf_counter()
    session_id = directory.session_id_for(session_key, f"edit:{project}")
    before = snapshot(project)
    stale = await _open_session(session_id, project, before)
    message = (f"Target agent: {entry['id']} (name: {entry['name']})\n"
               + ("Note: the project files changed since your last turn; re-read files before changing them.\n" if stale else "")
               + f"Change request: {request}")
    trace: list[dict] = [{"type": "agent", "agent": agent_editor.name, "detail": f"editing {project}"}]
    base = {"project": project, "target": entry["id"], "agent": entry["name"], "app_name": directory.app_name(project), "trace": trace}
    no_problems = {"ok": True, "problems": []}
    baselines[project] = before
    try:
        reply = await directory.drive(_runner(), session_id, message, trace)
        after = snapshot(project)
        changed = changed_paths(before, after)
        verification = await verify_project(project, set(changed)) if changed else no_problems
        if not verification["ok"]:
            reply = await directory.drive(_runner(), session_id, _repair_message(verification["problems"]), trace) or reply
            after = snapshot(project)
            changed = changed_paths(before, after)
            verification = await verify_project(project, set(changed)) if changed else no_problems
    except Exception as exc:
        logger.exception("editor: editing %s failed", project)
        current = snapshot(project)
        rolled_back = bool(changed_paths(before, current))
        _restore(project, before, current)
        _seen[session_id] = None
        return {**base, "status": "error", "error": f"The editor failed: {exc}", "rolled_back": rolled_back,
                "duration_ms": _ms(started)}
    except BaseException:  # cancelled (the server is shutting down): never leave a half-applied change
        _restore(project, before, snapshot(project))
        _seen[session_id] = None
        raise
    finally:
        baselines.pop(project, None)

    if not verification["ok"]:
        _restore(project, before, after)
        _seen[session_id] = None
        return {**base, "status": "error", "rolled_back": True, "reply": reply, "problems": verification["problems"],
                "error": "The change did not pass verification, so every file was restored.", "duration_ms": _ms(started)}
    _seen[session_id] = _digest(after)
    if not changed:
        return {**base, "status": "no_change", "summary": reply or "No change was needed.", "files": [], "duration_ms": _ms(started)}

    directory._evict(project)
    prompts = await _publish_prompts(project, changed)
    record = _record(project, entry, request, reply, before, after, changed)
    await _audit(project, "AGENT_EDITED", {"project": project, "target": entry["id"], "request": request[:500],
                                           "edit_id": record["id"], "files": changed})
    return {**base, "status": "success", "edit_id": record["id"], "summary": reply or "Change applied.",
            "files": _file_changes(before, after), "prompts": prompts, "verification": verification, "duration_ms": _ms(started)}


async def undo_last_edit(target: str) -> dict:
    """Restore the files of a project's most recent recorded edit (refused if they changed since)."""
    return await _detached(_undo_locked(_target(target)))


async def _undo_locked(entry: dict) -> dict:
    project = entry["project"]
    async with _lock(project):
        records = _records(project)
        if not records:
            raise DirectoryError(f"{project} has no recorded edit to undo.")
        record = records[0]
        current = snapshot(project)
        drifted = sorted(rel for rel, f in record["files"].items() if current.get(rel) != f.get("after"))
        if drifted:
            raise DirectoryError("Cannot undo safely: " + ", ".join(drifted) + " changed after that edit.")
        restored = dict(current)
        for rel, f in record["files"].items():
            if f.get("before") is None:
                restored.pop(rel, None)
            else:
                restored[rel] = f["before"]
        _restore(project, restored, current)
        changed = changed_paths(current, restored)
        verification = await verify_project(project, set(changed))
        if not verification["ok"]:
            _restore(project, current, restored)
            raise DirectoryError("Undo would leave the agent broken, so nothing was changed: " + "; ".join(verification["problems"]))
        directory._evict(project)
        prompts = await _publish_prompts(project, changed)
        record["_file"].unlink(missing_ok=True)
        await _audit(project, "AGENT_EDIT_UNDONE", {"project": project, "edit_id": record["id"], "files": changed})
        return {"status": "success", "project": project, "target": record.get("target") or entry["id"],
                "app_name": directory.app_name(project), "undone": record["id"], "request": record.get("request", ""),
                "files": _file_changes(current, restored), "prompts": prompts}
