"""File tools of the agent editor, sandboxed to the one generated project being edited.

The project comes from session state (``edit_project``), never from the model, so the editor cannot
reach another project, the Builder, ``.env`` files or ``data/``. Every write is safety-scanned and
formatted; ``check_agent`` statically scans the changed files and imports the root agent.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import traceback
from pathlib import Path

from google.adk.agents import BaseAgent
from google.adk.tools import ToolContext

from ... import directory
from ...tools.file_manager import forbidden_reason
from ...workspace import is_user_id, output_dir
from ..code_generator.tools import _format
from ..guardrails.tools import scan_python_source

STATE_EDIT_PROJECT = "edit_project"
STATE_EDIT_READ = "edit_files_read"  # files the editor has read (it may only overwrite those)
EDITABLE_SUFFIXES = (".py", ".txt", ".md", ".json")
_SKIP_PARTS = {"data", "__pycache__"}
_ROOT_FILES = ("requirements.txt", "README.md")
_IMPORT_TIMEOUT_S = 120
MAX_READ_CHARS = 60_000

# The project's files when the current edit started: check_agent only blames files the edit changed
# for static findings (a pre-existing warning-level issue elsewhere must not block an unrelated edit).
baselines: dict[str, dict[str, str]] = {}
_verified: dict[str, tuple[str, dict]] = {}  # project -> (snapshot digest, verification result)


# --- project files -----------------------------------------------------------------------------
def project_root(project: str) -> Path:
    return output_dir() / project


def editable_files(project: str) -> list[str]:
    """Editable text files of a project, relative to its folder (posix paths)."""
    root = project_root(project)
    if not root.is_dir():
        return []
    out = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if (path.is_file() and path.suffix.lower() in EDITABLE_SUFFIXES
                and not any(part in _SKIP_PARTS or part.startswith(".") for part in rel.parts)):
            out.append(rel.as_posix())
    return out


def snapshot(project: str) -> dict[str, str]:
    """{relative path: text} of every editable file of the project."""
    root = project_root(project)
    snap = {}
    for rel in editable_files(project):
        try:
            snap[rel] = (root / rel).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
    return snap


def resolve_editable(project: str, raw_path: str) -> tuple[str, Path]:
    """Normalise a path the model gave and guarantee it is an editable file of this project."""
    parts = [p for p in (raw_path or "").replace("\\", "/").split("/") if p not in ("", ".")]
    if parts[:1] == [directory.OUTPUT_DIR.name]:  # "generated_agents/<project>/...": relative to the workspace
        parts = parts[1:]
        if parts[:1] and is_user_id(parts[0]):  # "generated_agents/u_<id>/<project>/..."
            parts = parts[1:]
        if parts[:1] == [project]:
            parts = parts[1:]
    elif parts[:2] == [project, project]:  # "<project>/<project>/agent.py": relative to generated_agents
        parts = parts[1:]
    if not parts or ".." in parts:
        raise ValueError("Give a path inside the project, e.g. '<project>/prompt.py'.")
    if any(p.startswith(".") or p in _SKIP_PARTS for p in parts):
        raise ValueError(".env files, data/ and hidden files cannot be edited.")
    rel = "/".join(parts)
    if Path(rel).suffix.lower() not in EDITABLE_SUFFIXES:
        raise ValueError(f"Only {', '.join(EDITABLE_SUFFIXES)} files can be edited.")
    if not (parts[0] == project and len(parts) > 1) and rel not in _ROOT_FILES:
        raise ValueError(f"Edit files inside the '{project}/' package, or requirements.txt.")
    reason = forbidden_reason(rel)
    if reason:
        raise ValueError(reason)
    root = project_root(project).resolve()
    target = (root / rel).resolve()
    if root not in target.parents:
        raise ValueError("Path escapes the project.")
    return rel, target


def changed_paths(before: dict[str, str], after: dict[str, str]) -> list[str]:
    return sorted(p for p in set(before) | set(after) if before.get(p) != after.get(p))


# --- verification ------------------------------------------------------------------------------
def _import_check(project: str) -> list[str]:
    """Import the project's root agent from the code on disk (catches errors a parse cannot).

    Runs in the server process, where ADK and the platform are already loaded (a fresh interpreter
    takes ~30s); the server imports this same code on the agent's next run anyway. The project's
    modules are purged before and after, so nothing half-imported is left behind.
    """
    directory.purge_modules(project)
    try:
        root = directory._load_agent({"kind": "project", "project": project})
        if not isinstance(root, BaseAgent):
            return ["agent.py does not define root_agent as a Google ADK agent."]
        return []
    except BaseException as exc:  # SystemExit / KeyboardInterrupt from module code too: report, never crash
        lines = [line.rstrip() for chunk in traceback.format_exception(exc) for line in chunk.splitlines() if line.strip()]
        return ["Importing the agent failed:\n" + "\n".join(lines[-12:])]
    finally:
        directory.purge_modules(project)


async def verify_project(project: str, only: set[str] | None = None) -> dict:
    """Static scan (of `only`, or every file) plus a real import of the root agent."""
    snap = snapshot(project)
    digest = hashlib.sha256(json.dumps([str(project_root(project)), sorted(snap.items()), sorted(only or [])]).encode()).hexdigest()
    cached = _verified.get(project)
    if cached and cached[0] == digest:
        return cached[1]
    problems: list[str] = []
    if f"{project}/agent.py" not in snap:
        problems.append(f"{project}/agent.py is missing.")
    for rel, text in snap.items():
        if only is not None and rel not in only:
            continue
        if rel.endswith(".py"):
            findings = scan_python_source(text, rel, expect_root_agent=rel == f"{project}/agent.py")
            problems += [f"{f['location']}: {f['message']}" for f in findings if f["severity"] == "blocker"]
        elif rel.endswith(".json"):
            try:
                json.loads(text)
            except ValueError as exc:
                problems.append(f"{rel}: invalid JSON ({exc})")
    if not problems:
        try:
            problems += await asyncio.wait_for(asyncio.to_thread(_import_check, project), _IMPORT_TIMEOUT_S)
        except asyncio.TimeoutError:
            problems.append(f"Importing the agent took longer than {_IMPORT_TIMEOUT_S}s (an import-time loop or blocking call?).")
    result = {"ok": not problems, "problems": problems[:20]}
    _verified[project] = (digest, result)
    return result


# --- ADK tools -----------------------------------------------------------------------------------
def _project(tool_context: ToolContext) -> str:
    project = tool_context.state.get(STATE_EDIT_PROJECT) or ""
    if not project or not project_root(project).is_dir():
        raise ValueError("No project is open for editing.")
    return project


def list_agent_files(tool_context: ToolContext) -> dict:
    """List the editable files of the project being edited (paths relative to the project folder).

    Args:
        tool_context: Injected by ADK.

    Returns:
        dict with status, project and files.
    """
    try:
        project = _project(tool_context)
    except ValueError as exc:
        return {"status": "error", "error": str(exc)}
    return {"status": "success", "project": project, "files": editable_files(project)}


def read_agent_file(path: str, tool_context: ToolContext) -> dict:
    """Read one file of the project being edited.

    Args:
        path: Path from list_agent_files, e.g. "<project>/prompt.py".
        tool_context: Injected by ADK.

    Returns:
        dict with status, path and content.
    """
    try:
        project = _project(tool_context)
        rel, target = resolve_editable(project, path)
    except ValueError as exc:
        return {"status": "error", "error": str(exc)}
    if not target.is_file():
        return {"status": "error", "error": f"{rel} does not exist (call list_agent_files)."}
    text = target.read_text(encoding="utf-8", errors="replace")
    read = list(tool_context.state.get(STATE_EDIT_READ) or [])
    if rel not in read:
        tool_context.state[STATE_EDIT_READ] = [*read, rel]
    return {"status": "success", "path": rel, "content": text[:MAX_READ_CHARS], "truncated": len(text) > MAX_READ_CHARS}


def write_agent_file(path: str, content: str, tool_context: ToolContext) -> dict:
    """Write the COMPLETE new content of one project file (creates it if new). Python is safety-scanned
    and formatted; an existing file must have been read first.

    Args:
        path: Path inside the project, e.g. "<project>/prompt.py" or "<project>/tools/custom_tools.py".
        content: The whole file content (not a fragment).
        tool_context: Injected by ADK.

    Returns:
        dict with status and path, or the blocking findings to fix.
    """
    try:
        project = _project(tool_context)
        rel, target = resolve_editable(project, path)
    except ValueError as exc:
        return {"status": "error", "error": str(exc)}
    read = list(tool_context.state.get(STATE_EDIT_READ) or [])
    if target.exists() and rel not in read:
        return {"status": "error", "error": f"Read {rel} with read_agent_file before overwriting it."}
    if not content.strip() and rel.endswith((".txt", ".md", ".json")):
        return {"status": "error", "error": "Refusing to write an empty file."}
    final = content
    if rel.endswith(".py"):
        findings = scan_python_source(content, rel, expect_root_agent=rel == f"{project}/agent.py")
        blockers = [f for f in findings if f["severity"] == "blocker"]
        if blockers:
            return {"status": "error", "error": "Code rejected by the guardrail scan.", "blockers": blockers}
        final = _format(content)
    elif rel.endswith(".json"):
        try:
            json.loads(content)
        except ValueError as exc:
            return {"status": "error", "error": f"Invalid JSON: {exc}"}
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(final, encoding="utf-8")
    if rel not in read:
        tool_context.state[STATE_EDIT_READ] = [*read, rel]
    return {"status": "success", "path": rel, "bytes": len(final.encode("utf-8"))}


async def check_agent(tool_context: ToolContext) -> dict:
    """Verify the project after your changes: safety scan of the changed files and a real import of the
    root agent. Fix every problem it reports, then call it again.

    Args:
        tool_context: Injected by ADK.

    Returns:
        dict with status, ok and problems.
    """
    try:
        project = _project(tool_context)
    except ValueError as exc:
        return {"status": "error", "error": str(exc)}
    base = baselines.get(project)
    only = set(changed_paths(base, snapshot(project))) if base is not None else None
    return {"status": "success", **await verify_project(project, only)}
