"""Unit and integration tests for SQLite Auth, 7-Day Starter Subscription, and Web Search."""

from __future__ import annotations

import time
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_builder import auth, db, entitlements
from agent_builder.db import UserRepository, SubscriptionRepository
from agent_builder.tools.web_search import web_search


@pytest.fixture
def clean_env(tmp_path, monkeypatch):
    """Sets an isolated TECTONIC_DATA_DIR for testing."""
    data_dir = tmp_path / "data"
    monkeypatch.setenv("TECTONIC_DATA_DIR", str(data_dir))
    monkeypatch.delenv("TECTONIC_ADMINS", raising=False)
    monkeypatch.delenv("TECTONIC_AUTH_SECRET", raising=False)
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(auth, "_failures", {})
    db.init_db()
    return data_dir


def test_sqlite_user_registration_and_validation(clean_env):
    # Valid registration
    alice = auth.register("alice", "password123", email="alice@example.com")
    assert alice["username"] == "alice"
    assert alice["email"] == "alice@example.com"
    assert alice["admin"] is True  # First user is admin

    # Duplicate username
    with pytest.raises(auth.AuthError, match="taken"):
        auth.register("alice", "password456", email="alice2@example.com")

    # Duplicate email
    with pytest.raises(auth.AuthError, match="email already exists"):
        auth.register("bob", "password456", email="alice@example.com")

    # Invalid email format
    with pytest.raises(auth.AuthError, match="valid email"):
        auth.register("charlie", "password456", email="not-an-email")

    # Short password
    with pytest.raises(auth.AuthError, match="at least 8"):
        auth.register("dave", "short", email="dave@example.com")


def test_bcrypt_hashing_and_verification(clean_env):
    auth.register("alice", "supersecret123", email="alice@example.com")
    
    # Check that database stores bcrypt hash
    user_record = UserRepository.get_by_username("alice")
    assert user_record is not None
    assert user_record["password_hash"].startswith("$2b$")
    assert "supersecret123" not in user_record["password_hash"]

    # Verify login succeeds with correct password
    logged_in = auth.login("alice", "supersecret123")
    assert logged_in["username"] == "alice"

    # Verify login by email succeeds
    logged_in_email = auth.login("alice@example.com", "supersecret123")
    assert logged_in_email["username"] == "alice"

    # Verify wrong password raises AuthError
    with pytest.raises(auth.AuthError, match="Wrong"):
        auth.login("alice", "wrongpass")


def test_automatic_7_day_starter_trial_creation(clean_env):
    alice = auth.register("alice", "password123")
    sub = SubscriptionRepository.get_by_user_id(alice["id"])
    assert sub is not None
    assert sub["plan_id"] == "starter"
    assert sub["status"] == "active"
    
    # Verify expiration is ~7 days in the future (within 10 seconds of tolerance)
    expected_expiry = sub["started_at"] + (7 * 86400)
    assert abs(sub["expires_at"] - expected_expiry) < 10


def test_admin_usernames_and_plan_access(clean_env):
    # Register a standard first user to consume the first-user auto-admin slot
    root_user = auth.register("setup_owner", "password123")
    assert root_user["admin"] is True

    # Non-admin user (username without 'admin')
    bob = auth.register("bob_developer", "password123")
    assert bob["admin"] is False

    # Admin users: usernames containing 'admin' with spaces and variations
    data_admin = auth.register("data admin", "password123")
    assert data_admin["admin"] is True

    admin_portal = auth.register("admin portal", "password123")
    assert admin_portal["admin"] is True

    admin_account = auth.register("admin account", "password123")
    assert admin_account["admin"] is True

    # Non-admin user can only access Starter plan; other plans are not available
    bob_plans = entitlements.public_plans(bob["id"])
    for p in bob_plans:
        if p["id"] == "starter":
            assert p["available"] is True
        else:
            assert p["available"] is False
            assert "admin" in p["unavailable_reason"].lower()

    # Attempting to upgrade bob to Pro must be rejected
    with pytest.raises(ValueError, match="admin"):
        SubscriptionRepository.set_plan(bob["id"], "pro")

    with pytest.raises(ValueError, match="admin"):
        entitlements.set_plan_id(bob["id"], "pro")

    # Admin user (e.g. data admin) has all other plans available
    admin_plans = entitlements.public_plans(data_admin["id"])
    for p in admin_plans:
        assert p["available"] is True
        assert p["unavailable_reason"] is None

    # Admin user can upgrade to Pro plan
    upgraded = SubscriptionRepository.set_plan(data_admin["id"], "pro")
    assert upgraded["plan_id"] == "pro"
    assert upgraded["status"] == "active"


def test_starter_plan_expiration_and_one_per_account(clean_env):
    user = auth.register("regular_user", "password123")
    user_id = user["id"]

    sub = SubscriptionRepository.get_by_user_id(user_id)
    assert sub["plan_id"] == "starter"
    assert sub["status"] == "active"

    # Simulate passage of 7 days by updating expires_at to the past
    conn = db.get_connection()
    with db._db_lock:
        with conn:
            conn.execute(
                "UPDATE subscriptions SET expires_at = ?, updated_at = ? WHERE user_id = ?",
                (time.time() - 60, time.time(), user_id),
            )

    expired_sub = SubscriptionRepository.get_by_user_id(user_id)
    assert expired_sub["status"] == "expired"

    # User cannot renew or create another Starter plan on the same account
    with pytest.raises(ValueError, match="create another account"):
        SubscriptionRepository.set_plan(user_id, "starter")

    # Trying create_starter on existing account does not overwrite or renew expired trial
    SubscriptionRepository.create_starter(user_id)
    still_expired = SubscriptionRepository.get_by_user_id(user_id)
    assert still_expired["status"] == "expired"

    # But creating another account provisions a fresh 7-day Starter plan
    new_user = auth.register("new_account_user", "password123")
    new_sub = SubscriptionRepository.get_by_user_id(new_user["id"])
    assert new_sub["plan_id"] == "starter"
    assert new_sub["status"] == "active"
    assert new_sub["expires_at"] > time.time()


def test_auth_middleware_blocks_expired_subscription(clean_env):
    app = FastAPI()

    @app.get("/api/system/agents")
    async def get_agents():
        return {"status": "ok"}

    @app.get("/api/plans")
    async def get_plans():
        return {"plans": ["starter", "pro", "enterprise"]}

    @app.get("/auth/me")
    async def get_me():
        return {"me": "ok"}

    app.add_middleware(auth.AuthMiddleware, list_apps=lambda: [])
    client = TestClient(app)

    # Register user (active starter trial)
    alice = auth.register("alice", "password123")
    token = auth.issue_token(alice)
    headers = {"Authorization": f"Bearer {token}"}

    # Active user can access protected route
    res = client.get("/api/system/agents", headers=headers)
    assert res.status_code == 200

    # Expire subscription after 7 days
    conn = db.get_connection()
    with db._db_lock:
        with conn:
            conn.execute(
                "UPDATE subscriptions SET status = 'expired', expires_at = ?, updated_at = ? WHERE user_id = ?",
                (time.time() - 60, time.time(), alice["id"]),
            )

    # Expired user is blocked from protected execution routes with 403 PLAN_EXPIRED
    res_blocked = client.get("/api/system/agents", headers=headers)
    assert res_blocked.status_code == 403
    data = res_blocked.json()
    assert data["code"] == "PLAN_EXPIRED"

    # But expired user CAN still access plan selection and auth routes
    res_plans = client.get("/api/plans", headers=headers)
    assert res_plans.status_code == 200

    res_me = client.get("/auth/me", headers=headers)
    assert res_me.status_code == 200


def test_web_search_duckduckgo_fallback(monkeypatch):
    # Perform DuckDuckGo search directly
    result = web_search("Python programming language", max_results=3, provider="duckduckgo")
    assert result["status"] == "success"
    assert result["provider"] == "duckduckgo"
    assert len(result["results"]) > 0
    assert "url" in result["results"][0]
    assert "title" in result["results"][0]


def test_web_search_non_gemini_uses_duckduckgo_by_default(monkeypatch):
    # Simulate non-Gemini active model (e.g. Claude)
    from agent_builder.tools import web_search as ws_mod
    monkeypatch.setattr(ws_mod, "is_gemini_active", lambda: False)

    # In auto mode, non-Gemini model must default to DuckDuckGo
    status = ws_mod.providers_status(None)
    assert status["effective"] == "duckduckgo"

    result = ws_mod.web_search("FastAPI Python framework", max_results=3)
    assert result["status"] == "success"
    assert result["provider"] == "duckduckgo"
    assert len(result["results"]) > 0


def test_adaptive_google_search_tool_behavior():
    import asyncio
    from agent_builder.agent import AdaptiveGoogleSearchTool
    from google.adk.models.llm_request import LlmRequest

    tool = AdaptiveGoogleSearchTool()

    # Gemini model gets native Google Search grounding
    req_gemini = LlmRequest(model="gemini-3.6-flash")
    asyncio.run(tool.process_llm_request(llm_request=req_gemini))
    assert req_gemini.config is not None
    assert req_gemini.config.tools is not None
    assert any(hasattr(t, "google_search") and t.google_search for t in req_gemini.config.tools)

    # Non-Gemini model (Claude) safely bypasses Google Search without raising an exception
    req_claude = LlmRequest(model="claude-sonnet-5-5")
    asyncio.run(tool.process_llm_request(llm_request=req_claude))
    assert req_claude.config is None or not req_claude.config.tools

