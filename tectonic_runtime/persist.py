"""Small persistence helpers: atomic JSON snapshots of module state, and typed reload of the
modules' dataclass records (enums and datetimes restored from their JSON forms)."""

from __future__ import annotations

import json
import os
import threading
import typing
import uuid
from dataclasses import fields, is_dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from ._paths import STATE_DIR

_lock = threading.Lock()


def state_path(filename: str, env_var: str) -> Path | None:
    """Where a store persists. Env var overrides; the value ':memory:' disables persistence."""
    raw = os.getenv(env_var)
    if raw == ":memory:":
        return None
    return Path(raw) if raw else STATE_DIR / filename


def read_json(path: Path | None) -> Any:
    if path is None or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        backup = path.with_suffix(f".corrupt-{uuid.uuid4().hex[:6]}{path.suffix}")
        path.replace(backup)
        print(f"[tectonic_runtime] unreadable state file moved aside: {backup.name}")
        return None


def write_json(path: Path | None, payload: Any) -> None:
    if path is None:
        return
    from .base import to_jsonable

    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(to_jsonable(payload), indent=1), encoding="utf-8")
        tmp.replace(path)


def _coerce(hint: Any, value: Any) -> Any:
    if value is None:
        return None
    for candidate in typing.get_args(hint) or (hint,):
        if candidate is datetime and isinstance(value, str):
            return datetime.fromisoformat(value)
        if isinstance(candidate, type) and issubclass(candidate, Enum):
            return candidate(value)
    return value


def from_dict(cls: type, raw: dict[str, Any]) -> Any:
    """Rebuild a (flat) dataclass record from its JSON dict."""
    assert is_dataclass(cls)
    hints = typing.get_type_hints(cls)
    known = {f.name for f in fields(cls)}
    return cls(**{k: _coerce(hints.get(k), v) for k, v in raw.items() if k in known})
