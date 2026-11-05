"""Make each module's ``src/`` importable in-process (they ship as separate services)."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODULES_DIR = PROJECT_ROOT / "modules"

# Folder name under modules/ -> import package inside its src/.
MODULE_PACKAGES = {
    "guardrails": "guardrails",
    "intent-detection": "intent_detection",
    "short-term-memory": "short_term_memory",
    "tool-orchestration": "tool_orchestration",
    "long-term-memory": "long_term_memory",
    "agentic-rag": "agentic_rag",
    "finops": "finops",
    "promptops": "promptops",
    "vector-db": "vector_db",
    "auditability": "auditability",
}

# Persistent state for the in-process platform (override per store via TECTONIC_*_PATH env vars).
STATE_DIR = PROJECT_ROOT / "generated_agents" / "_platform"


def ensure_module_paths() -> None:
    for folder in MODULE_PACKAGES:
        src = MODULES_DIR / folder / "src"
        if src.is_dir() and str(src) not in sys.path:
            sys.path.append(str(src))
