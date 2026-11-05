"""Safe local filesystem operations, sandboxed to the generated-agents output directory."""

import json
from pathlib import Path
from typing import Optional

from ..shared_libraries.constants import (
    ALLOWED_WRITE_SUFFIXES,
    FORBIDDEN_FILENAMES,
    FORBIDDEN_PATH_PARTS,
    FORBIDDEN_SUFFIXES,
    REGISTRY_DIR_NAME,
)
from ..shared_libraries.types import slugify_identifier
from ..workspace import output_dir

MAX_READ_CHARS = 60_000


def resolve_safe_path(relative_path: str, base: Optional[Path] = None) -> Path:
    """Resolve a relative path and guarantee it stays inside the sandbox directory."""
    root = (base or output_dir()).resolve()
    root.mkdir(parents=True, exist_ok=True)
    if not relative_path or Path(relative_path).is_absolute():
        raise ValueError("A non-empty relative path is required.")
    candidate = (root / relative_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"Path escapes the sandbox: {relative_path}")
    return candidate


def forbidden_reason(relative_path: str) -> Optional[str]:
    """Return why a path violates the local-only policy, or None if it is acceptable."""
    path = Path(relative_path)
    lowered_parts = [part.lower() for part in path.parts]
    name = path.name.lower()
    if name in FORBIDDEN_FILENAMES:
        return f"'{path.name}' is a deployment/containerisation file; this project is local-only."
    if any(part in FORBIDDEN_PATH_PARTS for part in lowered_parts):
        return "Path contains a CI/CD, cloud, cache or notebook directory, which is excluded."
    if name.endswith(FORBIDDEN_SUFFIXES):
        return f"Files ending in {path.suffix} are excluded (cloud/infra/notebook artefacts)."
    return None


def project_dir(project_name: str) -> Path:
    return resolve_safe_path(slugify_identifier(project_name, default="generated_agent"))


def write_file(relative_path: str, content: str, overwrite: bool = True) -> dict:
    """Write a text file inside the sandbox, enforcing the local-only policy."""
    try:
        reason = forbidden_reason(relative_path)
        if reason:
            return {"status": "error", "error": reason}
        filename = Path(relative_path).name.lower()
        if not relative_path.lower().endswith(ALLOWED_WRITE_SUFFIXES) and filename not in (".env.example", ".env", ".gitkeep"):
            return {"status": "error", "error": f"Only {', '.join(ALLOWED_WRITE_SUFFIXES)} files may be written."}
        target = resolve_safe_path(relative_path)
        if target.exists() and not overwrite:
            return {"status": "error", "error": f"{relative_path} already exists."}
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return {"status": "success", "path": str(target.relative_to(output_dir().resolve())), "bytes": len(content.encode("utf-8"))}
    except (OSError, ValueError) as exc:
        return {"status": "error", "error": str(exc)}


# --- Registry persistence (agent cards) ---------------------------------------
def registry_path(project_name: str) -> Path:
    return resolve_safe_path(f"{REGISTRY_DIR_NAME}/{slugify_identifier(project_name, default='generated_agent')}.json")


def read_registry(project_name: str) -> dict:
    """Return {agent_name: card_dict} persisted for a project, or {} if none exists."""
    try:
        path = registry_path(project_name)
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        return {card["name"]: card for card in data.get("cards", [])}
    except (OSError, ValueError, KeyError, json.JSONDecodeError):
        return {}


def write_registry(project_name: str, cards: dict) -> None:
    path = registry_path(project_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"project_name": slugify_identifier(project_name, default="generated_agent"), "cards": list(cards.values())}
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


# --- ADK tools -----------------------------------------------------------------
def read_text_file(relative_path: str) -> dict:
    """Read a text file from the generated-agents output directory.

    Args:
        relative_path: Path relative to the output directory, e.g. "my_agent/my_agent/agent.py".

    Returns:
        dict with status and the file content (truncated if very large).
    """
    try:
        target = resolve_safe_path(relative_path)
        if not target.is_file():
            return {"status": "error", "error": f"{relative_path} is not a file."}
        text = target.read_text(encoding="utf-8")
        truncated = len(text) > MAX_READ_CHARS
        return {"status": "success", "path": relative_path, "content": text[:MAX_READ_CHARS], "truncated": truncated}
    except (OSError, ValueError, UnicodeDecodeError) as exc:
        return {"status": "error", "error": str(exc)}


def list_files(relative_dir: str = ".") -> dict:
    """List files and folders under a directory of the generated-agents output directory.

    Args:
        relative_dir: Directory relative to the output directory. Use "." for the top level.

    Returns:
        dict with status and a sorted list of relative paths (folders end with "/").
    """
    try:
        root = output_dir().resolve()
        root.mkdir(parents=True, exist_ok=True)
        base = root if relative_dir in ("", ".") else resolve_safe_path(relative_dir)
        if not base.is_dir():
            return {"status": "error", "error": f"{relative_dir} is not a directory."}
        entries = []
        for path in sorted(base.rglob("*")):
            if any(part in ("__pycache__", ".pytest_cache") for part in path.parts):
                continue
            rel = str(path.relative_to(root))
            entries.append(rel + "/" if path.is_dir() else rel)
            if len(entries) >= 500:
                break
        return {"status": "success", "entries": entries}
    except (OSError, ValueError) as exc:
        return {"status": "error", "error": str(exc)}


def write_text_file(relative_path: str, content: str) -> dict:
    """Write a text file (.py, .json, .txt, .md or .env.example) into the output directory.

    Deployment, container, CI/CD and notebook files are rejected by policy.

    Args:
        relative_path: Destination path relative to the output directory.
        content: Full text content of the file.

    Returns:
        dict with status and the written path.
    """
    return write_file(relative_path, content)
