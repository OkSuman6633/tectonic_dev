"""Built-in starter agents automatically provisioned for every user workspace.

Starter templates live under ``<repo>/builtin_agents/<name>/`` (clean source + README +
``.env.example``, plus optional ``_registry/<name>.json``; never user ``data/`` or secret ``.env``).
When a user registers, logs in, loads their Studio workspace, or connects in single-user mode,
``ensure_default_agents`` idempotently seeds each built-in agent into that user's isolated folder
under ``generated_agents/`` so every user gets their own runnable, editable copy without sharing
SQLite research databases or files across accounts.
"""

from __future__ import annotations

import json
import os
import shutil
import threading
from pathlib import Path

from .shared_libraries.constants import REGISTRY_DIR_NAME
from .tracing import logger

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_SKIP_DIR_NAMES = {"__pycache__", ".pytest_cache", ".mypy_cache", ".adk", "data"}
_SKIP_FILE_NAMES = {".env"}
_SKIP_FILE_SUFFIXES = (".pyc", ".pyo", ".tmp")
_SEEDED_MARKER_REL = Path("_builtin") / "seeded.json"
_lock = threading.RLock()


def template_root() -> Path:
    """Return the directory containing bundled starter agent templates."""
    raw = os.getenv("TECTONIC_BUILTIN_AGENTS_DIR", "").strip()
    return (Path(raw).expanduser() if raw else _PROJECT_ROOT / "builtin_agents").resolve()


def builtin_names() -> list[str]:
    """Names of every bundled starter agent available in ``template_root()``."""
    root = template_root()
    if not root.is_dir():
        return []
    names = [
        p.name
        for p in root.iterdir()
        if p.is_dir() and not p.name.startswith((".", "_")) and (p / p.name / "agent.py").is_file()
    ]
    return sorted(names)


def _ignore_template_entries(_dirpath: str, names: list[str]) -> set[str]:
    return {
        n
        for n in names
        if n in _SKIP_DIR_NAMES or n in _SKIP_FILE_NAMES or n.endswith(_SKIP_FILE_SUFFIXES)
    }


def _read_seeded(marker_path: Path) -> set[str]:
    if not marker_path.is_file():
        return set()
    try:
        data = json.loads(marker_path.read_text(encoding="utf-8"))
        items = data.get("seeded") if isinstance(data, dict) else []
        return {str(x) for x in items if isinstance(x, str)}
    except Exception:
        return set()


def _write_seeded(marker_path: Path, seeded: set[str]) -> None:
    marker_path.parent.mkdir(parents=True, exist_ok=True)
    marker_path.write_text(json.dumps({"seeded": sorted(seeded)}, indent=2) + "\n", encoding="utf-8")


def _workspace_root(user_id: str | None) -> Path:
    from . import workspace

    if user_id is None:
        return workspace.output_dir()
    with workspace.as_user(user_id):
        return workspace.output_dir()


def _schedule_cloud_sync() -> None:
    try:
        from . import cloud_storage

        if cloud_storage.is_enabled():
            cloud_storage.schedule_files_sync()
    except Exception:
        pass


def ensure_default_agents(user_id: str | None = None) -> list[str]:
    """Ensure every built-in agent is provisioned once into ``user_id``'s isolated workspace.

    If a user already has the agent (created manually or migrated) or previously deleted it after it
    was recorded in ``_builtin/seeded.json``, it is left untouched.
    """
    names = builtin_names()
    if not names:
        return []

    src_root = template_root()
    target_root = _workspace_root(user_id)
    marker_path = target_root / _SEEDED_MARKER_REL
    added: list[str] = []
    marker_dirty = False

    with _lock:
        seeded = _read_seeded(marker_path)
        pending = [n for n in names if n not in seeded]
        if not pending:
            return []

        for name in pending:
            src_dir = src_root / name
            dest_dir = target_root / name
            if not (dest_dir / name / "agent.py").is_file():
                try:
                    dest_dir.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(
                        src_dir,
                        dest_dir,
                        ignore=_ignore_template_entries,
                        dirs_exist_ok=True,
                    )
                    (dest_dir / "data" / "creative").mkdir(parents=True, exist_ok=True)

                    reg_src = src_root / REGISTRY_DIR_NAME / f"{name}.json"
                    reg_dst = target_root / REGISTRY_DIR_NAME / f"{name}.json"
                    if reg_src.is_file() and not reg_dst.exists():
                        reg_dst.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(reg_src, reg_dst)

                    added.append(name)
                except Exception as exc:
                    logger.warning("Failed to provision built-in agent %s for %s: %s", name, user_id or "local", exc)
                    continue
            seeded.add(name)
            marker_dirty = True

        if marker_dirty:
            _write_seeded(marker_path, seeded)

    if added or marker_dirty:
        _schedule_cloud_sync()
    return added
