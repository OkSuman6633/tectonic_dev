import asyncio
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_builder import studio_api
from agent_builder.db import ConversationRepository, init_db
from agent_builder.telemetry import TelemetryHub
from agent_builder.workspace import as_user


def _make_client(tmp_path, monkeypatch, *, auth_on: bool = False):
    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TECTONIC_AUTH", "on" if auth_on else "off")
    init_db()
    app = FastAPI()
    app.include_router(studio_api.router)
    return TestClient(app)


def test_conversation_repository_crud_and_isolation(tmp_path, monkeypatch):
    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    init_db()

    payload_a = {
        "title": "Attendance Manager",
        "builderSessionId": "sess-a",
        "messages": [
            {"id": "m1", "sender": "user", "content": "Create an attendance manager", "timestamp": "10:00"},
            {"id": "m2", "sender": "assistant", "content": "Sure!", "timestamp": "10:01"},
        ],
        "spec": {"goal": "Track attendance", "tools": [], "guardrails": [], "architecture": "coordinator"},
        "telemetry": {
            "agents": {"agent_builder": {"id": "agent_builder", "role": "agent_builder", "parentId": None, "state": "idle"}},
            "agentOrder": ["agent_builder"],
            "moduleOrder": ["guardrails"],
            "modules": {"guardrails": {"id": "guardrails", "label": "Guardrails", "state": "idle"}},
        },
        "createdAt": 1000.0,
        "updatedAt": 1001.0,
    }
    summary = ConversationRepository.upsert("u_alice0000001", "conv-1", payload_a)
    assert summary["id"] == "conv-1"
    assert summary["title"] == "Attendance Manager"
    assert summary["messageCount"] == 2
    assert summary["userMessageCount"] == 1
    assert summary["agentCount"] == 1
    assert summary["moduleCount"] == 1

    # Bob cannot see, read, rename, overwrite, or delete Alice's conversation.
    assert ConversationRepository.list_by_user("u_bob000000002") == []
    assert ConversationRepository.get("u_bob000000002", "conv-1") is None
    assert ConversationRepository.rename("u_bob000000002", "conv-1", "Stolen") is None
    assert ConversationRepository.delete("u_bob000000002", "conv-1") is False

    try:
        ConversationRepository.upsert("u_bob000000002", "conv-1", {"title": "Overwrite"})
        assert False, "Expected PermissionError when another user overwrites conv-1"
    except PermissionError:
        pass

    loaded = ConversationRepository.get("u_alice0000001", "conv-1")
    assert loaded is not None
    assert loaded["telemetry"]["agentOrder"] == ["agent_builder"]
    assert loaded["messages"][0]["content"] == "Create an attendance manager"

    renamed = ConversationRepository.rename("u_alice0000001", "conv-1", "Updated Title")
    assert renamed is not None
    assert renamed["title"] == "Updated Title"

    assert ConversationRepository.delete("u_alice0000001", "conv-1") is True
    assert ConversationRepository.list_by_user("u_alice0000001") == []


def test_conversations_http_endpoints(tmp_path, monkeypatch):
    client = _make_client(tmp_path, monkeypatch, auth_on=False)

    # Save two conversations (one with 3D telemetry, one empty new conversation)
    res1 = client.put(
        "/api/conversations/conv-old",
        json={
            "title": "Flight Coordinator",
            "builderSessionId": "sid-1",
            "messages": [{"id": "u1", "sender": "user", "content": "Build flight agent", "timestamp": "09:00"}],
            "telemetry": {
                "agentOrder": ["agent_builder", "code_generator"],
                "agents": {
                    "agent_builder": {"id": "agent_builder", "role": "agent_builder", "parentId": None, "state": "idle"},
                    "code_generator": {"id": "code_generator", "role": "code_generator", "parentId": "agent_builder", "state": "idle"},
                },
                "moduleOrder": ["long_term_memory"],
                "modules": {"long_term_memory": {"id": "long_term_memory", "label": "Long-Term Memory", "state": "idle"}},
            },
            "updatedAt": 2000.0,
        },
    )
    assert res1.status_code == 200
    assert res1.json()["agentCount"] == 2

    res2 = client.put(
        "/api/conversations/conv-new",
        json={
            "title": "New Conversation",
            "builderSessionId": "sid-2",
            "messages": [{"id": "w1", "sender": "assistant", "content": "Hello", "timestamp": "09:05"}],
            "telemetry": {"agentOrder": [], "agents": {}, "moduleOrder": [], "modules": {}},
            "updatedAt": 3000.0,
        },
    )
    assert res2.status_code == 200
    assert res2.json()["agentCount"] == 0

    listed = client.get("/api/conversations")
    assert listed.status_code == 200
    items = listed.json()["conversations"]
    assert [c["id"] for c in items] == ["conv-new", "conv-old"]

    fetched = client.get("/api/conversations/conv-old")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["telemetry"]["agentOrder"] == ["agent_builder", "code_generator"]
    assert body["telemetry"]["moduleOrder"] == ["long_term_memory"]

    patched = client.patch("/api/conversations/conv-old", json={"title": "Renamed Flight Agent"})
    assert patched.status_code == 200
    assert patched.json()["title"] == "Renamed Flight Agent"

    deleted = client.delete("/api/conversations/conv-new")
    assert deleted.status_code == 200
    assert client.get("/api/conversations/conv-new").status_code == 404


def test_telemetry_hub_emits_replay_end_and_latest_seq():
    async def _run():
        hub = TelemetryHub()
        with as_user(None):
            hub.emit("AGENT_CREATED", id="agent_builder", role="agent_builder", parent_id=None)
            hub.emit("AGENT_STATE_CHANGE", id="agent_builder", state="idle")
        q = hub.subscribe(owner=None)
        events = []
        while not q.empty():
            events.append(q.get_nowait())
        hub.unsubscribe(q)
        return events

    events = asyncio.run(_run())
    assert events[0]["type"] == "HELLO"
    assert events[0]["latest_seq"] >= 2
    assert events[-1]["type"] == "REPLAY_END"
    types = [e["type"] for e in events]
    assert "AGENT_CREATED" in types
    assert "AGENT_STATE_CHANGE" in types
