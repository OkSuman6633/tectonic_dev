"""Session state management: load/save profiles and current build progress."""

import json
from typing import Any

from google.adk.tools import ToolContext

from ..shared_libraries.constants import (
    PROFILES_DIR,
    PROGRESS_KEYS,
    SESSIONS_DIR_NAME,
    STATE_AGENT_CARDS,
    STATE_GENERATED_FILES,
    STATE_GUARDRAIL_REPORT,
    STATE_INTENT,
    STATE_PROJECT_NAME,
    STATE_REQUIREMENTS,
)
from ..shared_libraries.types import parse_json_loose, slugify_identifier
from ..workspace import output_dir

_MAX_STATE_CHARS = 12_000
_SUMMARY_KEYS = (
    STATE_INTENT,
    STATE_REQUIREMENTS,
    STATE_GUARDRAIL_REPORT,
    STATE_AGENT_CARDS,
    STATE_PROJECT_NAME,
    STATE_GENERATED_FILES,
)


def render_state_block(context: Any, keys: tuple) -> str:
    """Render selected session-state values as a text block for an instruction provider."""
    parts = []
    for key in keys:
        value = context.state.get(key)
        if value is None or value == "" or value == {}:
            continue
        text = value if isinstance(value, str) else json.dumps(value, indent=2, default=str)
        if len(text) > _MAX_STATE_CHARS:
            text = text[:_MAX_STATE_CHARS] + "\n... (truncated)"
        parts.append(f"## {key}\n{text}")
    if not parts:
        return "\n\n# Session state\n(nothing has been recorded yet)"
    return "\n\n# Session state\n" + "\n\n".join(parts)


def save_progress(key: str, value: str, tool_context: ToolContext) -> dict:
    """Save a piece of build progress in the session state.

    Args:
        key: One of "intent", "requirements", "project_name" or "notes".
        value: A JSON string (for intent/requirements) or plain text (for project_name/notes).
        tool_context: Injected by ADK.

    Returns:
        dict with status.
    """
    if key not in PROGRESS_KEYS:
        return {"status": "error", "error": f"key must be one of {list(PROGRESS_KEYS)}"}
    if key in ("intent", "requirements"):
        try:
            tool_context.state[key] = parse_json_loose(value)
        except (ValueError, json.JSONDecodeError) as exc:
            return {"status": "error", "error": f"value must be valid JSON: {exc}"}
    elif key == STATE_PROJECT_NAME:
        tool_context.state[key] = slugify_identifier(value, default="generated_agent")
    else:
        tool_context.state[key] = str(value)
    return {"status": "success", "saved": key}


def load_progress(key: str, tool_context: ToolContext) -> dict:
    """Load a piece of build progress from the session state.

    Args:
        key: Any state key, for example "intent", "requirements", "guardrail_report", "agent_cards".
        tool_context: Injected by ADK.

    Returns:
        dict with status and the stored value (or found=False).
    """
    value = tool_context.state.get(key)
    if value is None:
        return {"status": "success", "found": False, "key": key}
    return {"status": "success", "found": True, "key": key, "value": value}


def get_session_summary(tool_context: ToolContext) -> dict:
    """Report which pipeline stages have already produced output in this session.

    Args:
        tool_context: Injected by ADK.

    Returns:
        dict describing completed stages, the active project and its approval status.
    """
    state = tool_context.state
    report = state.get(STATE_GUARDRAIL_REPORT) or {}
    cards = state.get(STATE_AGENT_CARDS) or {}
    project = state.get(STATE_PROJECT_NAME, "")
    req = state.get(STATE_REQUIREMENTS) or {}
    is_complete = False
    pending_questions = 0
    if isinstance(req, dict):
        is_complete = bool(req.get("is_complete", False))
        pending_questions = len(req.get("questions_for_user") or [])
    elif hasattr(req, "is_complete"):
        is_complete = bool(req.is_complete)
        pending_questions = len(getattr(req, "questions_for_user", []) or [])
    return {
        "status": "success",
        "project_name": project,
        "has_intent": bool(state.get(STATE_INTENT)),
        "has_requirements": bool(req),
        "requirements_complete": is_complete,
        "pending_questions_count": pending_questions,
        "guardrail_stage": report.get("stage", ""),
        "guardrail_approved": bool(report.get("approved", False)),
        "agent_cards": sorted((cards.get(project) or {}).keys()) if project else [],
        "generated_files": len(state.get(STATE_GENERATED_FILES) or []),
    }


def load_profile(profile_name: str) -> dict:
    """Load a JSON profile template from the profiles directory.

    Args:
        profile_name: "agent_card_default" (empty Agent Card template) or "agent_spec_example"
            (complete multi-agent specification example).

    Returns:
        dict with status and the parsed profile.
    """
    name = slugify_identifier(profile_name, default="profile")
    path = PROFILES_DIR / f"{name}.json"
    if not path.is_file():
        available = sorted(p.stem for p in PROFILES_DIR.glob("*.json"))
        return {"status": "error", "error": f"Unknown profile '{profile_name}'.", "available": available}
    try:
        return {"status": "success", "profile": json.loads(path.read_text(encoding="utf-8"))}
    except (OSError, json.JSONDecodeError) as exc:
        return {"status": "error", "error": str(exc)}


def persist_progress(tool_context: ToolContext) -> dict:
    """Write the current build progress to disk so a later session can restore it.

    Args:
        tool_context: Injected by ADK.

    Returns:
        dict with status and the snapshot file name.
    """
    project = tool_context.state.get(STATE_PROJECT_NAME) or "unnamed_project"
    snapshot = {key: tool_context.state.get(key) for key in _SUMMARY_KEYS if tool_context.state.get(key) is not None}
    folder = output_dir() / SESSIONS_DIR_NAME
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{slugify_identifier(project)}.json"
    path.write_text(json.dumps(snapshot, indent=2, default=str), encoding="utf-8")
    return {"status": "success", "file": f"{SESSIONS_DIR_NAME}/{path.name}"}


def restore_progress(project_name: str, tool_context: ToolContext) -> dict:
    """Restore previously persisted build progress for a project into the session state.

    Args:
        project_name: Project whose snapshot should be restored.
        tool_context: Injected by ADK.

    Returns:
        dict with status and the keys restored.
    """
    path = output_dir() / SESSIONS_DIR_NAME / f"{slugify_identifier(project_name)}.json"
    if not path.is_file():
        return {"status": "error", "error": f"No saved progress for '{project_name}'."}
    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"status": "error", "error": str(exc)}
    for key, value in snapshot.items():
        tool_context.state[key] = value
    return {"status": "success", "restored": sorted(snapshot.keys())}
