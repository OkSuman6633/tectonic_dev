"""Multi-user isolation: accounts, the request gate, per-user agent folders and per-user telemetry."""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi import Body, FastAPI, Request, WebSocket
from fastapi.testclient import TestClient


@pytest.fixture
def accounts(tmp_path, monkeypatch):
    from agent_builder import auth

    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("TECTONIC_ADMINS", raising=False)
    monkeypatch.delenv("TECTONIC_AUTH_SECRET", raising=False)
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(auth, "_failures", {})
    return auth


def test_register_login_and_tokens(accounts, monkeypatch):
    auth = accounts
    alice = auth.register("alice", "correct horse")
    bob = auth.register("Bob", "battery staple")
    assert alice["admin"] and not bob["admin"]  # the first account administers the server
    assert alice["id"] != bob["id"] and alice["id"].startswith("u_")
    with pytest.raises(auth.AuthError, match="taken"):
        auth.register("BOB", "whatever123")
    with pytest.raises(auth.AuthError, match="8 characters"):
        auth.register("carol", "short")
    assert "correct horse" not in (auth.data_dir() / "users.json").read_text()  # only hashes are stored

    assert auth.login("bob", "battery staple")["id"] == bob["id"]
    with pytest.raises(auth.AuthError, match="Wrong"):
        auth.login("bob", "nope")
    token = auth.issue_token(bob)
    assert auth.verify_token(token) == bob["id"]
    body, sig = token.split(".")
    assert auth.verify_token(f"{body}.{sig[:-2]}AA") is None  # forged
    assert auth.verify_token("garbage") is None

    monkeypatch.setenv("TECTONIC_ADMINS", "bob")
    assert auth.get_user(bob["id"])["admin"] and not auth.get_user(alice["id"])["admin"]


def test_repeated_wrong_passwords_lock_the_account(accounts):
    auth = accounts
    auth.register("dave", "long enough pw")
    for _ in range(8):
        with pytest.raises(auth.AuthError, match="Wrong"):
            auth.login("dave", "bad")
    with pytest.raises(auth.AuthError, match="Too many"):
        auth.login("dave", "long enough pw")


@pytest.fixture
def gate(accounts):
    """A stand-in for the ADK server behind the real AuthMiddleware: each route echoes what it received."""
    from agent_builder.workspace import current_user

    auth = accounts
    app = FastAPI()

    @app.post("/run")
    async def run(body: dict = Body(...)):
        return {"body": body, "user": current_user()}

    @app.get("/apps/{app_name}/users/{user_id}/sessions/{sid}")
    async def session(app_name: str, user_id: str, sid: str):
        return {"user_id": user_id, "user": current_user()}

    @app.get("/api/system/agents")
    async def agents():
        return {"user": current_user()}

    @app.websocket("/ws/telemetry")
    async def ws(websocket: WebSocket):
        await websocket.accept()
        await websocket.send_text(current_user() or "")
        await websocket.close()

    @app.get("/")
    async def index():
        return {"spa": True}

    app.add_middleware(auth.AuthMiddleware, list_apps=lambda: [f"generated_agents.{current_user()}.desk.desk"])
    users = {name: auth.register(name, "password123") for name in ("alice", "bob")}
    tokens = {name: {"Authorization": f"Bearer {auth.issue_token(u)}"} for name, u in users.items()}
    return TestClient(app), users, tokens


def test_requests_need_a_signed_in_user_except_the_app_itself(gate):
    client, users, tokens = gate
    assert client.get("/").json() == {"spa": True}
    assert client.get("/api/system/agents").status_code == 401
    assert client.get("/api/system/agents", headers={"Authorization": "Bearer forged.token"}).status_code == 401
    assert client.get("/api/system/agents", headers=tokens["bob"]).json() == {"user": users["bob"]["id"]}
    for closed in ("/run_live", "/dev-ui", "/debug/trace/x", "/apps/agent_builder/trigger/pubsub"):
        assert client.post(closed, headers=tokens["bob"]).status_code in (403, 404)


def test_adk_calls_always_run_as_the_signed_in_user_on_their_own_apps(gate):
    client, users, tokens = gate
    alice, bob = users["alice"]["id"], users["bob"]["id"]

    # The browser cannot pick another user id: the gate rewrites it to the signed-in one.
    out = client.post("/run", headers=tokens["bob"], json={"appName": "agent_builder", "userId": alice, "sessionId": "s"}).json()
    assert out == {"body": {"appName": "agent_builder", "userId": bob, "sessionId": "s"}, "user": bob}
    assert client.post("/run", headers=tokens["bob"], json={"appName": f"generated_agents.{bob}.desk.desk"}).json()["body"]["userId"] == bob
    # ...nor run someone else's generated agent, or an unowned one.
    for app_name in (f"generated_agents.{alice}.desk.desk", "generated_agents.desk.desk"):
        assert client.post("/run", headers=tokens["bob"], json={"appName": app_name, "userId": bob}).status_code == 403

    got = client.get(f"/apps/agent_builder/users/{alice}/sessions/s1", headers=tokens["bob"]).json()
    assert got == {"user_id": bob, "user": bob}  # Alice's sessions are unreachable
    assert client.get(f"/apps/generated_agents.{alice}.desk.desk/users/{bob}/sessions/s1", headers=tokens["bob"]).status_code == 403
    assert client.get("/list-apps", headers=tokens["bob"]).json() == ["agent_builder", f"generated_agents.{bob}.desk.desk"]


def test_websocket_takes_the_token_from_the_query(gate, accounts):
    client, users, tokens = gate
    token = tokens["alice"]["Authorization"].split()[1]
    with client.websocket_connect(f"/ws/telemetry?token={token}") as ws:
        assert ws.receive_text() == users["alice"]["id"]
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/telemetry") as ws:
            ws.receive_text()


def test_each_user_has_their_own_agent_folder(tmp_path, monkeypatch):
    from agent_builder import directory, workspace
    from agent_builder.tools.file_manager import project_dir, write_file

    root = tmp_path / "generated_agents"
    monkeypatch.setattr(workspace, "OUTPUT_DIR", root)
    alice, bob = "u_aaaaaaaaaaaa", "u_bbbbbbbbbbbb"
    with workspace.as_user(alice):
        assert write_file("desk/desk/agent.py", "root_agent = None\n")["status"] == "success"
        assert project_dir("desk") == (root / alice / "desk").resolve()
        assert directory.projects() == ["desk"] and directory.app_name("desk") == f"generated_agents.{alice}.desk.desk"
        assert workspace.owner_of_app(directory.app_name("desk")) == alice
    with workspace.as_user(bob):
        assert directory.projects() == []  # Bob cannot see Alice's project
        assert "escapes" in write_file(f"../{alice}/desk/desk/agent.py", "x = 1\n")["error"]
    assert directory.projects() == []  # nor can a request without a user
    assert workspace.owner_of_app("agent_builder") is None and not workspace.is_user_id("default_user")


async def test_telemetry_reaches_only_its_owner():
    from agent_builder.telemetry import TelemetryHub
    from agent_builder.workspace import as_user

    hub = TelemetryHub()
    with as_user("u_aaaaaaaaaaaa"):
        hub.emit("AGENT_CREATED", id="agent_builder")
    alice_q, bob_q = hub.subscribe(owner="u_aaaaaaaaaaaa"), hub.subscribe(owner="u_bbbbbbbbbbbb")
    with as_user("u_bbbbbbbbbbbb"):
        hub.emit("AGENT_STATE_CHANGE", id="agent_builder", state="thinking")
        assert not hub.knows("agent_builder")  # Alice's builder is not Bob's
    hub.emit("MODULE_STATE", module="finops", state="idle")  # platform-wide: everyone

    def drain(q: asyncio.Queue) -> list[str]:
        return [q.get_nowait()["type"] for _ in range(q.qsize())]

    assert drain(alice_q) == ["HELLO", "AGENT_CREATED", "MODULE_STATE"]
    assert drain(bob_q) == ["HELLO", "AGENT_STATE_CHANGE", "MODULE_STATE"]


async def test_each_user_picks_their_own_builder_model_and_sees_the_key_in_use(accounts, monkeypatch):
    from agent_builder import model_settings
    from agent_builder.shared_libraries.constants import MODEL
    from agent_builder.workspace import as_user

    monkeypatch.setenv("GOOGLE_API_KEY", "AIzaLIVEKEY0123456789")
    monkeypatch.setattr(model_settings, "_choices", {})
    monkeypatch.setattr(model_settings, "_update_env_file", lambda updates: None)
    default = MODEL.model
    alice, bob = "u_aaaaaaaaaaaa", "u_bbbbbbbbbbbb"

    with as_user(alice):
        out = await model_settings.apply("gemini-2.5-pro", admin=False)  # any user may switch their own model
        assert out["model"] == "gemini-2.5-pro" and out["can_edit_keys"] is False
        assert out["active_key_hint"] == "AIzaLI…"  # read from the live client: first characters only
        with pytest.raises(model_settings.SettingsError, match="admin"):
            await model_settings.apply("gemini-2.5-pro", google_api_key="AIzaOTHER", admin=False)
    with as_user(bob):
        assert model_settings.status()["model"] == default  # Alice's choice is hers alone
    assert MODEL.model == default

    model_settings._choices.clear()  # e.g. a restart: the saved preference comes back
    with as_user(alice):
        assert MODEL.current()[1] == "gemini-2.5-pro"
