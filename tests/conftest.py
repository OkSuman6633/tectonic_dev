import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

STATE_VARS = {
    "TECTONIC_LTM_PATH": "ltm.json",
    "TECTONIC_VECTOR_PATH": ":memory:",
    "TECTONIC_VECTOR_NS_PATH": "vector_ns.json",
    "TECTONIC_RAG_DOCS_PATH": "rag_docs.json",
    "TECTONIC_FINOPS_PATH": "finops.json",
    "TECTONIC_PROMPTOPS_PATH": "promptops.json",
    "TECTONIC_AUDIT_PATH": "audit.jsonl",
}


@pytest.fixture(autouse=True)
def isolated_platform_state(tmp_path, monkeypatch):
    """Every test: offline models (no network) and all persistent stores under tmp_path."""
    monkeypatch.setenv("TECTONIC_OFFLINE", "1")
    for var, name in STATE_VARS.items():
        monkeypatch.setenv(var, name if name == ":memory:" else str(tmp_path / name))
    return tmp_path
