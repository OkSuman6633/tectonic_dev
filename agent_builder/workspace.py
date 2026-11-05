"""Per-user workspaces: who is calling, and where that user's generated agents live.

With sign-in enabled (server_full.py) every request runs as one account id (``u_<12 hex>``). That id
is the ADK ``user_id`` of all its sessions, and its generated projects live in their own folder:

    generated_agents/u_<id>/<project>/<project>/agent.py   →  app generated_agents.u_<id>.<project>.<project>

Without a signed-in user (local ``server.py``, tests) everything stays at the top of generated_agents/
exactly as before.
"""

from __future__ import annotations

import re
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Iterator

from google.adk.plugins.base_plugin import BasePlugin

from .shared_libraries.constants import OUTPUT_DIR

USER_ID = re.compile(r"^u_[0-9a-f]{12}$")
_current_user: ContextVar[str | None] = ContextVar("tectonic_user", default=None)


def is_user_id(value: Any) -> bool:
    return isinstance(value, str) and bool(USER_ID.match(value))


def current_user() -> str | None:
    return _current_user.get()


def set_user(user_id: str | None):
    """Bind the caller for the rest of this task (returns the token for ``reset_user``)."""
    return _current_user.set(user_id if is_user_id(user_id) else None)


def reset_user(token) -> None:
    _current_user.reset(token)


@contextmanager
def as_user(user_id: str | None) -> Iterator[None]:
    token = set_user(user_id)
    try:
        yield
    finally:
        reset_user(token)


def output_dir() -> Path:
    """The caller's generated-agents folder (the shared root when nobody is signed in)."""
    user = current_user()
    return OUTPUT_DIR / user if user else OUTPUT_DIR


def packages_root() -> Path:
    """The folder that must be on sys.path to import generated projects by their app name."""
    return OUTPUT_DIR.parent


def module_prefix() -> str:
    """Dotted package path of the caller's projects, e.g. ``generated_agents.u_ab12cd34ef56``."""
    user = current_user()
    return f"{OUTPUT_DIR.name}.{user}" if user else OUTPUT_DIR.name


def owner_of_app(app_name: str | None) -> str | None:
    """The account a generated app belongs to (None for the Builder and unowned projects)."""
    parts = (app_name or "").split(".")
    return parts[1] if len(parts) == 4 and parts[0] == OUTPUT_DIR.name and is_user_id(parts[1]) else None


def adk_user() -> str:
    """ADK user id for sessions the server opens itself (directory chat, editor)."""
    return current_user() or "studio"


class WorkspacePlugin(BasePlugin):
    """Binds the run's ADK user id as the current user, so tools write into that user's workspace and
    telemetry is delivered only to them. Must be registered before the telemetry plugin."""

    def __init__(self, name: str = "tectonic_workspace") -> None:
        super().__init__(name=name)

    async def before_run_callback(self, *, invocation_context: Any) -> None:
        user = getattr(invocation_context, "user_id", None)
        if is_user_id(user):
            set_user(user)
        return None


workspace_plugin = WorkspacePlugin()
