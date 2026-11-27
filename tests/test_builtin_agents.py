"""Tests for automatic per-user provisioning of built-in starter agents (social_media_content_ideation)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_builder import auth, builtin_agents, db, directory, entitlements, studio_api, workspace


def _setup_env(tmp_path: Path, monkeypatch):
    data_dir = tmp_path / "data"
    out_dir = tmp_path / "generated_agents"
    monkeypatch.setenv("TECTONIC_DATA_DIR", str(data_dir))
    monkeypatch.setenv("AGENT_BUILDER_OUTPUT_DIR", str(out_dir))
    monkeypatch.setenv("TECTONIC_AUTH_SECRET", "test-secret-for-builtin-agents")
    monkeypatch.setenv("TECTONIC_AUTH", "on")
    monkeypatch.setattr(workspace, "OUTPUT_DIR", out_dir)
    monkeypatch.setattr(directory, "OUTPUT_DIR", out_dir)
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(auth, "_failures", {})
    db.close_connections()
    db.init_db()
    return data_dir, out_dir


def _build_app() -> FastAPI:
    app = FastAPI()
    studio_api.install(app)

    @app.get("/directory/agents")
    async def directory_agents():
        uid = workspace.current_user() if studio_api.auth_enabled() else None
        if not studio_api.auth_enabled() or uid:
            builtin_agents.ensure_default_agents(uid)
        return {"agents": directory.list_entries()}

    return app


def test_builtin_bundle_is_clean():
    root = builtin_agents.template_root()
    assert "social_media_content_ideation" in builtin_agents.builtin_names()
    agent_root = root / "social_media_content_ideation"
    assert (agent_root / "social_media_content_ideation" / "agent.py").is_file()
    assert (root / "_registry" / "social_media_content_ideation.json").is_file()
    # Never ship personal .env secrets or runtime SQLite DBs in the bundled template.
    assert not (agent_root / ".env").exists()
    assert not list(agent_root.rglob("*.db"))


def test_register_and_api_provision_isolated_agent_per_user(tmp_path, monkeypatch):
    _, out_dir = _setup_env(tmp_path, monkeypatch)
    app = _build_app()
    client = TestClient(app)

    alice = auth.register("alice_social", "password123", email="alice_s@example.com")
    bob = auth.register("bob_social", "password123", email="bob_s@example.com")

    alice_dir = out_dir / alice["id"] / "social_media_content_ideation"
    bob_dir = out_dir / bob["id"] / "social_media_content_ideation"
    assert (alice_dir / "social_media_content_ideation" / "agent.py").is_file()
    assert (bob_dir / "social_media_content_ideation" / "agent.py").is_file()
    assert (alice_dir / "data" / "creative").is_dir()
    assert not (alice_dir / ".env").exists()
    assert not list(alice_dir.rglob("*.db"))
    assert not list(alice_dir.rglob("__pycache__"))
    assert (out_dir / alice["id"] / "_registry" / "social_media_content_ideation.json").is_file()

    alice_headers = {"Authorization": f"Bearer {auth.issue_token(alice)}"}
    bob_headers = {"Authorization": f"Bearer {auth.issue_token(bob)}"}

    alice_agents = client.get("/api/system/agents", headers=alice_headers).json()["agents"]
    assert [a["name"] for a in alice_agents] == ["social_media_content_ideation"]
    expected_app = f"generated_agents.{alice['id']}.social_media_content_ideation.social_media_content_ideation"
    assert alice_agents[0]["appName"] == expected_app

    alice_dir_entries = client.get("/directory/agents", headers=alice_headers).json()["agents"]
    dir_ids = {e["id"] for e in alice_dir_entries}
    assert "social_media_content_ideation" in dir_ids
    assert "social_media_content_ideation/competitor_scout" in dir_ids

    alice_apps = client.get("/list-apps", headers=alice_headers).json()
    assert expected_app in alice_apps

    # Workspace isolation: Bob's token cannot access Alice's appName.
    assert client.post("/run", headers=bob_headers, json={"appName": expected_app}).status_code == 403


def test_existing_user_login_and_token_hydration_seed_default_agent(tmp_path, monkeypatch):
    data_dir, out_dir = _setup_env(tmp_path, monkeypatch)
    app = _build_app()
    client = TestClient(app)

    carol = auth.register("carol_old", "password123", email="carol@example.com")
    token = auth.issue_token(carol)

    # Simulate an existing user created BEFORE built-in agent provisioning existed.
    shutil.rmtree(out_dir / carol["id"])
    assert not (out_dir / carol["id"]).exists()

    # Logging in automatically provisions social_media_content_ideation.
    auth.login("carol_old", "password123")
    assert (out_dir / carol["id"] / "social_media_content_ideation" / "social_media_content_ideation" / "agent.py").is_file()

    # Now simulate cold-start wipe + token auto-hydration (AuthMiddleware re-creates DB row + workspace).
    db.close_connections()
    shutil.rmtree(data_dir)
    shutil.rmtree(out_dir / carol["id"])
    db.init_db()

    res = client.get("/api/system/agents", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert any(a["name"] == "social_media_content_ideation" for a in res.json()["agents"])


def test_starter_quota_exempts_builtin_and_deletion_persists(tmp_path, monkeypatch):
    _setup_env(tmp_path, monkeypatch)
    app = _build_app()
    client = TestClient(app)

    dave = auth.register("dave_starter", "password123", email="dave@example.com")
    headers = {"Authorization": f"Bearer {auth.issue_token(dave)}"}

    # Starter plan user with pre-provisioned social_media_content_ideation still keeps 1 custom slot.
    with workspace.as_user(dave["id"]):
        status = entitlements.plan_status(dave["id"])
        assert status["usage"]["agents"] == 0
        ok, reason = entitlements.agent_creation_allowed(dave["id"], "my_custom_agent")
        assert ok and reason == ""

        # Verify project tree loads cleanly via directory AST parser.
        tree = directory.project_tree("social_media_content_ideation")
        assert any(e["id"] == "social_media_content_ideation" for e in tree)

    # If the user explicitly deletes the built-in agent, subsequent polls keep it deleted.
    async def _delete():
        with workspace.as_user(dave["id"]):
            await directory.delete_agent("social_media_content_ideation")

    import asyncio

    asyncio.run(_delete())
    after_delete = client.get("/api/system/agents", headers=headers).json()["agents"]
    assert after_delete == []
