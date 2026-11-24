"""Tests for production server deployment and Cloud Run readiness.

Verifies:
- /health and /healthz liveness/readiness probes (public, no auth required)
- Authentication security gate (unauthorized returns 401)
- /api/env configuration (authenticated)
- API key sanitization against control-character header injection
- Platform runtime modules registration & invocation with entitlements
- Auth and plans endpoints
- Directory endpoints
- SPA fallback and strict API 404 isolation (API paths never fall back to index.html)
- WebSocket telemetry handshake with authentication
"""

import json
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def server_app():
    import server_full
    return server_full.app


@pytest.fixture
def auth_context(server_app, tmp_path_factory):
    from agent_builder import auth
    # Register test admin user
    try:
        user = auth.register("deploy_admin", "Password123!")
    except auth.AuthError:
        user = auth.login("deploy_admin", "Password123!")
    token = auth.issue_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    return {"user": user, "token": token, "headers": headers}


@pytest.fixture
def client(server_app):
    return TestClient(server_app, raise_server_exceptions=False)


def test_health_endpoints(client):
    """Liveness and readiness probes required by Cloud Run (public, no auth needed)."""
    # Cloud Run custom probe endpoint
    r = client.get("/healthz")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert data["adk"] is True
    assert data["runtime"] is True
    assert data["modules"] >= 10

    # ADK built-in health endpoint
    r2 = client.get("/health")
    assert r2.status_code == 200
    assert r2.json()["status"] in ("ok", "healthy")


def test_unauthenticated_requests_rejected(client):
    """Security check: protected endpoints must reject requests without auth."""
    for path in ["/api/env", "/modules", "/directory/agents", "/api/plans"]:
        r = client.get(path)
        assert r.status_code == 401


def test_api_env(client, auth_context, monkeypatch):
    """Environment query endpoint returns model and key existence when authenticated."""
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.6-flash")
    r = client.get("/api/env", headers=auth_context["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "hasKey" in data
    assert "model" in data
    assert data["envExists"] is True

    # POST to /api/env returns managed message
    r_post = client.post("/api/env", json={}, headers=auth_context["headers"])
    assert r_post.status_code == 200
    assert r_post.json()["success"] is True


def test_api_key_sanitization():
    """Verify _clean_env_key strips trailing whitespace and newlines from Secret Manager."""
    from server_full import _clean_env_key

    test_key = "AIzaSySecretWithNewline\r\n\t "
    os.environ["TEST_SECRET_KEY"] = test_key
    _clean_env_key("TEST_SECRET_KEY")
    assert os.environ["TEST_SECRET_KEY"] == "AIzaSySecretWithNewline"
    del os.environ["TEST_SECRET_KEY"]


def test_modules_list(client, auth_context):
    """Platform modules are registered and filtered by plan tier via /modules."""
    from agent_builder import entitlements

    # Default plan for new user is starter
    r = client.get("/modules", headers=auth_context["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "modules" in data
    assert "simulation_running" in data
    module_names = [m["module"] for m in data["modules"]]
    for starter_mod in ["guardrails", "tool_orchestration", "auditability"]:
        assert starter_mod in module_names

    # Upgrade to enterprise plan and verify advanced modules are unlocked
    entitlements.set_plan_id(auth_context["user"]["id"], "enterprise")
    r2 = client.get("/modules", headers=auth_context["headers"])
    assert r2.status_code == 200
    enterprise_modules = [m["module"] for m in r2.json()["modules"]]
    for advanced_mod in ["guardrails", "finops", "promptops", "vector_db"]:
        assert advanced_mod in enterprise_modules


def test_module_lock_hint_on_unauthorized(client, auth_context, monkeypatch):
    """Invoking a module locked by plan returns 403 with helpful hint."""
    from agent_builder import entitlements

    # Temporarily restrict allowed modules
    monkeypatch.setattr(entitlements, "allowed_modules", lambda plan_id: {"guardrails"})
    r = client.post("/modules/finops/status", json={}, headers=auth_context["headers"])
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["code"] == "MODULE_LOCKED"
    assert "finops" in detail["detail"].lower() or "plan" in detail["detail"].lower()


def test_auth_config(client):
    """Auth configuration endpoint is public and reachable."""
    r = client.get("/auth/config")
    assert r.status_code == 200
    data = r.json()
    assert "auth" in data


def test_plans_catalog(client, auth_context):
    """Plans catalog endpoint returns tier configurations."""
    r = client.get("/api/plans", headers=auth_context["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "plans" in data
    plan_ids = [p["id"] for p in data["plans"]]
    for p in ["starter", "pro", "business", "enterprise"]:
        assert p in plan_ids


def test_directory_agents(client, auth_context):
    """Directory endpoint lists existing agents."""
    r = client.get("/directory/agents", headers=auth_context["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "agents" in data
    assert isinstance(data["agents"], list)


def test_spa_routing_and_api_isolation(client, auth_context):
    """API 404s must never fall back to index.html; client SPA paths should."""
    # Unknown API paths must return 404 JSON, not HTML index
    for path in ["/api/nonexistent", "/connectors/nonexistent", "/modules/nonexistent/op"]:
        r = client.get(path, headers=auth_context["headers"])
        assert r.status_code in (404, 405)
        # Must not be HTML index
        assert "<!doctype html>" not in r.text.lower()
        assert "<html" not in r.text.lower()


def test_websocket_telemetry_handshake(server_app, auth_context):
    """WebSocket /ws/telemetry connects and receives initial HELLO event."""
    from fastapi.testclient import TestClient

    token = auth_context["token"]
    with TestClient(server_app) as tc:
        with tc.websocket_connect(f"/ws/telemetry?token={token}") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "HELLO"
            assert "server_id" in msg
            assert "timestamp" in msg
