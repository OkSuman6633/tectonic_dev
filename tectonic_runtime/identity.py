"""Who an agent is, derived from the ADK app it runs in — the basis of permission inheritance.

The Builder runs as app ``agent_builder`` and gets the ``admin`` role. Every project it generates
is served as app ``generated_agents.<project>.<project>``; all of that project's agents (root and
sub-agents alike) are ``worker``s in team ``<project>``. No per-agent configuration is needed:
a worker inherits its team scope (budget, knowledge namespace, audit visibility, prompts) simply
by being part of the project the Builder generated.
"""

from __future__ import annotations

from typing import Any

BUILDER_APP = "agent_builder"


def team_from_app(app_name: str | None) -> str | None:
    if not app_name:
        return None
    if app_name == BUILDER_APP:
        return BUILDER_APP
    return app_name.rstrip(".").split(".")[-1] or None


def role_from_app(app_name: str | None) -> str:
    return "admin" if app_name == BUILDER_APP else "worker"


def app_name_of(context: Any) -> str | None:
    """App name from an ADK ToolContext / CallbackContext / InvocationContext."""
    for attr in ("app_name",):
        if isinstance(getattr(context, attr, None), str):
            return getattr(context, attr)
    inv = getattr(context, "_invocation_context", None) or getattr(context, "invocation_context", None)
    name = getattr(inv, "app_name", None)
    return name if isinstance(name, str) else None


def session_id_of(context: Any) -> str | None:
    session = getattr(context, "session", None)
    if session is None:
        inv = getattr(context, "_invocation_context", None) or getattr(context, "invocation_context", None)
        session = getattr(inv, "session", None)
    sid = getattr(session, "id", None)
    return sid if isinstance(sid, str) else None
