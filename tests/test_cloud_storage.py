"""Tests for zero-cost GCS persistence (SQLite + files/folders) and token auto-hydration."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_builder import auth, cloud_storage, db
from agent_builder.db import ConversationRepository, UserRepository


class _MemoryBlob:
    def __init__(self, store: dict[str, bytes], name: str) -> None:
        self._store = store
        self.name = name

    def upload_from_filename(self, filename: str) -> None:
        self._store[self.name] = Path(filename).read_bytes()

    def download_to_filename(self, filename: str) -> None:
        Path(filename).write_bytes(self._store[self.name])

    def exists(self) -> bool:
        return self.name in self._store

    def delete(self) -> None:
        self._store.pop(self.name, None)


class _MemoryBucket:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def blob(self, name: str) -> _MemoryBlob:
        return _MemoryBlob(self.objects, name)

    def list_blobs(self, prefix: str = ""):
        return [_MemoryBlob(self.objects, k) for k in sorted(self.objects) if k.startswith(prefix)]


def test_gcs_round_trip_preserves_users_conversations_and_generated_agents(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    out_dir = tmp_path / "generated_agents"
    monkeypatch.setenv("TECTONIC_DATA_DIR", str(data_dir))
    monkeypatch.setenv("AGENT_BUILDER_OUTPUT_DIR", str(out_dir))
    monkeypatch.setenv("TECTONIC_GCS_PREFIX", "tectonic-state")
    monkeypatch.setattr(auth, "_secret_cache", None)

    bucket = _MemoryBucket()
    cloud_storage.set_bucket_for_tests(bucket)
    try:
        db.init_db()
        alice = auth.register("alice", "supersecret123", email="alice@example.com")
        ConversationRepository.upsert(
            alice["id"],
            "conv-1",
            {
                "title": "My 3D Agent",
                "messages": [{"id": "m1", "sender": "user", "content": "Build agent", "timestamp": "10:00"}],
                "telemetry": {"agentOrder": ["agent_builder"], "agents": {"agent_builder": {"id": "agent_builder"}}},
            },
        )

        # Simulate extra persistent files/folders: plans, model overrides, generated agent, platform store
        (data_dir / "builder_models.json").write_text('{"u_1": {"model": "gemini-4-hydrogen"}}', encoding="utf-8")
        agent_file = out_dir / alice["id"] / "demo_agent" / "demo_agent" / "agent.py"
        agent_file.parent.mkdir(parents=True, exist_ok=True)
        agent_file.write_text("root_agent = 'demo'\n", encoding="utf-8")
        finops_file = out_dir / "_platform" / "finops.json"
        finops_file.parent.mkdir(parents=True, exist_ok=True)
        finops_file.write_text('{"spend": 0.12}', encoding="utf-8")

        cloud_storage.flush()
        assert "tectonic-state/data/tectonic.db" in bucket.objects
        assert "tectonic-state/data/builder_models.json" in bucket.objects
        assert f"tectonic-state/generated_agents/{alice['id']}/demo_agent/demo_agent/agent.py" in bucket.objects
        assert "tectonic-state/generated_agents/_platform/finops.json" in bucket.objects

        # Simulate Cloud Run container wipe (scale-to-zero / redeploy)
        db.close_connections()
        shutil.rmtree(data_dir)
        shutil.rmtree(out_dir)
        assert not data_dir.exists()
        assert not out_dir.exists()

        # Restore into a fresh directory before app startup
        assert cloud_storage.restore_state(force=True) is True

        # User login, conversations + 3D view, model configs, generated agents, and platform files are intact
        logged_in = auth.login("alice", "supersecret123")
        assert logged_in["id"] == alice["id"]
        conv = ConversationRepository.get(alice["id"], "conv-1")
        assert conv is not None
        assert conv["telemetry"]["agentOrder"] == ["agent_builder"]
        assert (data_dir / "builder_models.json").exists()
        assert agent_file.read_text(encoding="utf-8") == "root_agent = 'demo'\n"
        assert finops_file.read_text(encoding="utf-8") == '{"spend": 0.12}'

        # Deleting a generated agent locally deletes it from GCS on next sync
        shutil.rmtree(out_dir / alice["id"] / "demo_agent")
        cloud_storage.sync_files_now(include_db=True)
        assert f"tectonic-state/generated_agents/{alice['id']}/demo_agent/demo_agent/agent.py" not in bucket.objects
    finally:
        cloud_storage.set_bucket_for_tests(None)


def test_token_auto_hydration_after_ephemeral_db_wipe(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("TECTONIC_DATA_DIR", str(data_dir))
    monkeypatch.setenv("TECTONIC_AUTH_SECRET", "stable-secret-from-secret-manager")
    monkeypatch.setattr(auth, "_secret_cache", None)
    cloud_storage.set_bucket_for_tests(None)

    db.init_db()
    alice = auth.register("alice", "password123", email="alice@example.com")
    token = auth.issue_token(alice)

    # Wipe entire data dir (cold start) while Secret Manager secret stays the same
    db.close_connections()
    shutil.rmtree(data_dir)
    db.init_db()
    assert UserRepository.get_by_id(alice["id"]) is None

    app = FastAPI()

    @app.get("/api/ping")
    async def ping():
        return {"ok": True}

    app.add_middleware(auth.AuthMiddleware, list_apps=lambda: [])
    client = TestClient(app)

    res = client.get("/api/ping", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    # User record is re-hydrated into SQLite from the verified token
    hydrated = UserRepository.get_by_id(alice["id"])
    assert hydrated is not None
    assert hydrated["username"] == "alice"
