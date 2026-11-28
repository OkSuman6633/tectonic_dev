"""Unit and functional tests for ExecutionManager, stop/abort routes, media API, studio routes, and runtime core."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


# --- Unit tests: tectonic_runtime/identity.py, persist.py, events.py ------------------------------
def test_runtime_identity_and_event_bus():
    from tectonic_runtime.events import ModuleEventBus
    from tectonic_runtime.identity import app_name_of, role_from_app, session_id_of, team_from_app

    assert team_from_app("agent_builder") == "agent_builder"
    assert team_from_app("generated_agents.u_123.sales_bot.sales_bot") == "sales_bot"
    assert team_from_app(None) is None
    assert role_from_app("agent_builder") == "admin"
    assert role_from_app("generated_agents.u_123.sales_bot.sales_bot") == "worker"

    ctx = SimpleNamespace(_invocation_context=SimpleNamespace(app_name="generated_agents.demo.demo", session=SimpleNamespace(id="s-99")))
    assert app_name_of(ctx) == "generated_agents.demo.demo"
    assert session_id_of(ctx) == "s-99"

    seen: list[dict] = []
    bus = ModuleEventBus()
    unsub = bus.subscribe(seen.append)
    bus.subscribe(lambda _e: (_ for _ in ()).throw(RuntimeError("bad listener")))  # isolated
    bus.emit("MODULE_STATE", module="finops", state="idle")
    assert len(seen) == 1 and seen[0]["module"] == "finops"
    unsub()
    bus.emit("MODULE_STATE", module="finops", state="busy")
    assert len(seen) == 1


class _PersistColor(str, Enum):
    BLUE = "blue"


@dataclass
class _PersistRec:
    name: str
    color: _PersistColor
    when: datetime


def test_runtime_persist_atomic_json_and_from_dict(tmp_path, monkeypatch):
    from tectonic_runtime import persist

    monkeypatch.setenv("TECTONIC_TEST_STORE", ":memory:")
    assert persist.state_path("x.json", "TECTONIC_TEST_STORE") is None

    target = tmp_path / "nested" / "store.json"
    persist.write_json(target, {"k": "v"})
    assert persist.read_json(target) == {"k": "v"}

    # Corrupt JSON is quarantined and read_json returns None safely
    target.write_text("{broken json", encoding="utf-8")
    assert persist.read_json(target) is None
    assert list(target.parent.glob("store.corrupt-*.json"))

    rebuilt = persist.from_dict(_PersistRec, {"name": "a", "color": "blue", "when": "2026-11-28T10:00:00", "extra": 123})
    assert rebuilt.color is _PersistColor.BLUE and rebuilt.when.year == 2026


# --- Unit & functional tests: ExecutionManager & /api/run/stop ------------------------------------
async def test_execution_manager_cancels_matching_session_tasks(monkeypatch):
    from agent_builder.execution_manager import ExecutionManager
    from agent_builder.telemetry import hub

    emitted: list[tuple[str, dict]] = []
    monkeypatch.setattr(hub, "emit", lambda t, **p: emitted.append((t, p)))

    mgr = ExecutionManager()
    started_a, started_b = asyncio.Event(), asyncio.Event()

    async def worker(ev: asyncio.Event):
        ev.set()
        await asyncio.sleep(60)

    t_a = asyncio.create_task(worker(started_a))
    t_b = asyncio.create_task(worker(started_b))
    await asyncio.gather(started_a.wait(), started_b.wait())

    mgr.register_task("sess-a", t_a)
    mgr.register_task("sess-b", t_b)

    cancelled = await mgr.abort_execution(session_id="sess-a", app_name="agent_builder")
    assert cancelled >= 1
    with pytest.raises(asyncio.CancelledError):
        await t_a
    assert not t_b.done()

    # Global abort cancels remaining tasks and emits RUN_COMPLETED
    cancelled_all = await mgr.abort_execution()
    assert cancelled_all >= 1
    with pytest.raises(asyncio.CancelledError):
        await t_b
    assert any(t == "RUN_COMPLETED" for t, _ in emitted)


def test_stop_run_and_agent_file_endpoints(tmp_path, monkeypatch):
    from agent_builder import auth, db, studio_api, workspace

    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TECTONIC_AUTH", "on")
    monkeypatch.setenv("TECTONIC_AUTH_SECRET", "secret-exec-test")
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(workspace, "OUTPUT_DIR", tmp_path / "generated_agents")
    db.close_connections()
    db.init_db()

    app = FastAPI()
    studio_api.install(app)
    client = TestClient(app)

    alice = auth.register("admin_exec", "password123")
    headers = {"Authorization": f"Bearer {auth.issue_token(alice)}"}

    # Stop endpoint works cleanly
    r_stop = client.post("/api/run/stop", json={"sessionId": "s1"}, headers=headers)
    assert r_stop.status_code == 200 and r_stop.json()["status"] == "stopped"

    # Seeded built-in project exists; test file save, path traversal block, and .env write/read
    r_save = client.post(
        "/api/system/agents/social_media_content_ideation/files",
        json={"filePath": "notes.md", "content": "# Notes"},
        headers=headers,
    )
    assert r_save.status_code == 200 and r_save.json()["success"] is True

    r_escape = client.post(
        "/api/system/agents/social_media_content_ideation/files",
        json={"filePath": "../../outside.txt", "content": "nope"},
        headers=headers,
    )
    assert r_escape.status_code == 400

    r_env_bad = client.post(
        "/api/system/agents/social_media_content_ideation/env",
        json={"apiKey": ""},
        headers=headers,
    )
    assert r_env_bad.status_code == 400

    r_env_ok = client.post(
        "/api/system/agents/social_media_content_ideation/env",
        json={"apiKey": "AIzaUserCustomKey123456", "model": "gemini-3.5-flash-lite"},
        headers=headers,
    )
    assert r_env_ok.status_code == 200
    r_env_get = client.get("/api/system/agents/social_media_content_ideation/env", headers=headers)
    assert r_env_get.status_code == 200
    assert r_env_get.json()["apiKey"] == "AIzaUserCustomKey123456"
    assert r_env_get.json()["model"] == "gemini-3.5-flash-lite"


# --- Functional tests: media_api.py owner isolation & security headers ---------------------------
def test_media_api_serves_only_to_owner_with_security_headers(tmp_path, monkeypatch):
    from agent_builder import auth, db, studio_api
    from tectonic_runtime.media import get_media_store

    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TECTONIC_AUTH", "on")
    monkeypatch.setenv("TECTONIC_AUTH_SECRET", "secret-media-test")
    monkeypatch.setattr(auth, "_secret_cache", None)
    db.close_connections()
    db.init_db()

    alice = auth.register("alice_media", "password123")
    bob = auth.register("bob_media", "password123")
    img = get_media_store().save(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, owner=alice["id"], mime_type="image/png", prompt="cat")

    app = FastAPI()
    studio_api.install(app)
    client = TestClient(app)

    alice_h = {"Authorization": f"Bearer {auth.issue_token(alice)}"}
    bob_h = {"Authorization": f"Bearer {auth.issue_token(bob)}"}

    assert client.get(f"/media/images/{img.id}").status_code == 401
    assert client.get(f"/media/images/{img.id}", headers=bob_h).status_code == 404
    assert client.get("/media/images/nonexistent", headers=alice_h).status_code == 404

    ok = client.get(f"/media/images/{img.id}?download=true", headers=alice_h)
    assert ok.status_code == 200
    assert ok.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in ok.headers["content-security-policy"]
    assert "attachment" in ok.headers["content-disposition"]
