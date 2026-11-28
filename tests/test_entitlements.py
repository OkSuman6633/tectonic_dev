"""Subscription entitlements: plan storage, model/module gating, usage ledger, run caps, and API."""

from __future__ import annotations

import pytest

from agent_builder import entitlements
from agent_builder import workspace

USER = "u_" + "a" * 12


@pytest.fixture(autouse=True)
def isolated_plans(tmp_path, monkeypatch):
    """Plans and usage live under the test's own data dir (never the real one)."""
    from agent_builder import db

    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path))
    db.close_connections()
    db.init_db()
    db.UserRepository.create(
        user_id=USER,
        username="admin_entitlements",
        email="admin_entitlements@tectonic.local",
        password_hash="",
        is_admin=True,
    )
    yield
    db.close_connections()


# --- plan definitions -------------------------------------------------------------------------
def test_all_plans_defined():
    for pid in entitlements.PLAN_IDS:
        plan = entitlements.plan_definition(pid)
        assert plan["name"] and plan["max_model_tier"]
    assert entitlements.plans_catalog()[0]["id"] == "starter"


def test_unknown_plan_rejected():
    with pytest.raises(ValueError):
        entitlements.plan_definition("platinum")


# --- model tiers -----------------------------------------------------------------------------
def test_starter_allows_economy_only():
    assert entitlements.model_allowed("starter", "gemini-3.6-flash")
    assert entitlements.model_allowed("starter", "claude-haiku-5-5")
    assert not entitlements.model_allowed("starter", "claude-sonnet-5-5")
    assert not entitlements.model_allowed("starter", "claude-opus-5-5")
    assert not entitlements.model_allowed("starter", "gemini-2.5-pro")


def test_pro_allows_flagship():
    assert entitlements.model_allowed("pro", "claude-opus-5-5")
    assert entitlements.model_allowed("pro", "claude-fable-5-1")


def test_allowed_models_matches_catalogue_tiers():
    starter = set(entitlements.allowed_models("starter"))
    assert starter == {"gemini-3.8-flash", "gemini-3.5-flash-lite", "claude-haiku-5-5"}
    assert "claude-opus-5-5" in entitlements.allowed_models("pro")


# --- plan choice persistence ------------------------------------------------------------------
def test_set_and_get_plan():
    assert entitlements.get_plan_id(USER) is None
    entitlements.set_plan_id(USER, "business")
    assert entitlements.get_plan_id(USER) == "business"
    entitlements.set_plan_id(USER, "pro")  # admin accounts can switch between paid tiers
    assert entitlements.get_plan_id(USER) == "pro"
    with pytest.raises(ValueError, match="Starter plan"):
        entitlements.set_plan_id(USER, "starter")  # Starter trial cannot be re-claimed on an existing account


def test_effective_plan_defaults_to_starter_before_choice():
    assert entitlements.effective_plan_id("u_unknown000000") == "starter"


def test_auth_off_defaults_to_pro():
    assert entitlements.get_plan_id(None) == "pro"


def test_single_user_plan_persists():
    assert entitlements.get_plan_id(None) == "pro"
    entitlements.set_plan_id(None, "business")
    assert entitlements.get_plan_id(None) == "business"
    entitlements.set_plan_id(None, "starter")
    assert entitlements.get_plan_id(None) == "starter"


# --- module & connector gating ---------------------------------------------------------------
def test_module_gating():
    assert entitlements.module_allowed("starter", "guardrails")
    assert entitlements.module_allowed("starter", "short_term_memory")
    assert not entitlements.module_allowed("starter", "long_term_memory")
    assert not entitlements.module_allowed("starter", "vector_db")
    assert not entitlements.module_allowed("starter", "image_generation")
    assert entitlements.module_allowed("pro", "vector_db")
    assert entitlements.module_allowed("pro", "image_generation")
    assert entitlements.module_allowed("business", "multi_tenancy")
    assert entitlements.module_allowed("enterprise", "regulatory_compliance")


def test_connector_gating():
    assert entitlements.allowed_connectors("starter") == []
    assert "google_analytics" in entitlements.allowed_connectors("pro")
    assert not entitlements.connector_allowed("starter", "google_analytics")
    assert entitlements.connector_allowed("pro", "google_analytics")


# --- broadened orchestration limits & lock/unlock status ----------------------------------------
def test_broadened_orchestration_limits():
    assert entitlements.plan_definition("starter")["max_sub_agents"] == 3
    assert entitlements.plan_definition("starter")["max_iterations"] == 30
    assert entitlements.plan_definition("starter")["max_concurrent_runs"] == 2
    assert entitlements.plan_definition("pro")["max_sub_agents"] == 8
    assert entitlements.plan_definition("pro")["max_iterations"] == 80
    assert entitlements.plan_definition("business")["max_sub_agents"] == 15
    assert entitlements.plan_definition("business")["max_iterations"] == 200
    assert entitlements.plan_definition("business")["max_concurrent_runs"] == 50
    assert entitlements.plan_definition("enterprise")["max_sub_agents"] == 0  # 0 = negotiated/unlimited


def test_module_lock_hints():
    hint = entitlements.module_lock_hint("starter", "image_generation")
    assert hint and "Starter" in hint and "Upgrade" in hint and "Pro" in hint
    assert entitlements.module_lock_hint("starter", "guardrails") is None
    assert entitlements.module_lock_hint("pro", "image_generation") is None
    assert entitlements.module_lock_hint("enterprise", "image_generation") is None


def test_tool_lock_status():
    assert entitlements.tool_allowed("starter", "web_search")
    assert not entitlements.tool_allowed("starter", "image_generation")
    assert not entitlements.tool_allowed("starter", "connectors")
    assert entitlements.tool_allowed("pro", "image_generation")
    assert entitlements.tool_allowed("pro", "connectors")
    assert "image_generation" in entitlements.locked_tools("starter")
    assert "image_generation" not in entitlements.locked_tools("pro")
    hint = entitlements.tool_lock_hint("starter", "connectors")
    assert hint and "Starter" in hint and "Upgrade" in hint


def test_locked_modules_exclude_allowed():
    assert "guardrails" not in entitlements.locked_modules("starter")
    assert "long_term_memory" in entitlements.locked_modules("starter")
    assert not entitlements.locked_modules("enterprise")


async def test_plan_status_surfaces_lock_status(monkeypatch):
    monkeypatch.setattr("agent_builder.directory.projects", lambda: [])
    from agent_builder import studio_api

    token = workspace.set_user(USER)
    try:
        entitlements.set_plan_id(USER, "starter")
        status = await studio_api.current_plan()
        assert "image_generation" in status["locked_modules"]
        assert "image_generation" in status["locked_tools"]
        assert "guardrails" not in status["locked_modules"]
    finally:
        workspace.reset_user(token)


# --- monthly token usage ----------------------------------------------------------------------
def test_record_and_read_monthly_tokens():
    assert entitlements.monthly_tokens(USER) == 0
    assert entitlements.record_tokens(USER, 1000) == 1000
    assert entitlements.record_tokens(USER, 500) == 1500


def test_quota_exhausted_hard_cap():
    entitlements.set_plan_id(USER, "starter")  # 500k cap
    assert not entitlements.quota_exhausted(USER)
    entitlements.record_tokens(USER, 500_000)
    assert entitlements.quota_exhausted(USER)


def test_enterprise_quota_unlimited():
    entitlements.set_plan_id(USER, "enterprise")  # 0 = unlimited
    entitlements.record_tokens(USER, 1_000_000_000)
    assert not entitlements.quota_exhausted(USER)


# --- per-run guardrails -----------------------------------------------------------------------
def test_run_token_cap():
    entitlements.set_plan_id(USER, "starter")  # 50k per run
    entitlements.begin_run(USER)
    assert not entitlements.run_cap_exhausted()
    entitlements.add_run_tokens(50_000)
    assert entitlements.run_cap_exhausted()
    entitlements.end_run()
    assert entitlements.run_tokens() == 0  # context cleared


def test_iteration_cap():
    entitlements.set_plan_id(USER, "starter")  # 30 iterations (broadened from 15)
    entitlements.begin_run(USER)
    for _ in range(29):
        entitlements.note_iteration()
    assert not entitlements.iterations_exhausted()
    entitlements.note_iteration()
    assert entitlements.iterations_exhausted()
    entitlements.end_run()


# --- agent-slot limit -------------------------------------------------------------------------
def test_agent_creation_limit(monkeypatch):
    monkeypatch.setattr("agent_builder.directory.projects", lambda: ["agent_a"])
    entitlements.set_plan_id(USER, "starter")  # max 1 agent
    ok, reason = entitlements.agent_creation_allowed(USER, "agent_b")
    assert not ok and "AGENT_LIMIT_EXCEEDED" in reason

    entitlements.set_plan_id(USER, "pro")  # max 10 agents
    ok, _ = entitlements.agent_creation_allowed(USER, "agent_b")
    assert ok


# --- plan-compliance reports --------------------------------------------------------------------
def _fake_project(monkeypatch, tmp_path, tree):
    """Point the report helpers at an isolated output dir and a fixed project tree."""
    monkeypatch.setattr("agent_builder.workspace.output_dir", lambda: tmp_path)
    monkeypatch.setattr("agent_builder.directory.projects", lambda: ["demo"])
    monkeypatch.setattr("agent_builder.directory.project_tree", lambda name: tree)
    (tmp_path / "demo").mkdir()
    (tmp_path / "demo" / "agent.py").write_text("root_agent = LlmAgent(name='root')\n", encoding="utf-8")


def test_project_report_what_was_built_vs_starter_limits(monkeypatch, tmp_path):
    _fake_project(monkeypatch, tmp_path, [
        {"kind": "project", "name": "root", "tools": ["web_search", "file_manager"]},
        {"kind": "sub_agent", "name": "worker", "tools": ["memory"]},
    ])
    entitlements.set_plan_id(USER, "starter")  # max_sub_agents=3, no connectors
    r = entitlements.project_report(USER, "demo")
    assert r["plan_name"] == "Starter" and r["project"] == "demo"
    assert r["built"]["agents"] == 2 and r["built"]["sub_agents"] == 1
    assert r["built"]["tools"] == ["file_manager", "memory", "web_search"]
    assert r["built"]["files"] == 1
    assert r["limits"]["max_agents"] == 1 and r["limits"]["max_sub_agents"] == 3
    assert r["compliance"]["sub_agents_within_limit"] is True
    assert r["compliance"]["agents_within_limit"] is True  # one project total, limit 1
    assert r["allowed_connectors"] == []
    assert "claude-opus-5-5" not in r["allowed_models"]


def test_project_report_flags_limit_breach(monkeypatch, tmp_path):
    _fake_project(monkeypatch, tmp_path, [
        {"kind": "project", "name": "root", "tools": []},
        {"kind": "sub_agent", "name": "a", "tools": []},
        {"kind": "sub_agent", "name": "b", "tools": []},
        {"kind": "sub_agent", "name": "c", "tools": []},
        {"kind": "sub_agent", "name": "d", "tools": []},
    ])
    entitlements.set_plan_id(USER, "starter")  # max_sub_agents=3
    r = entitlements.project_report(USER, "demo")
    assert r["compliance"]["sub_agents_within_limit"] is False


def test_account_report_lists_projects_and_usage(monkeypatch, tmp_path):
    _fake_project(monkeypatch, tmp_path, [
        {"kind": "project", "name": "root", "tools": ["web_search"]},
    ])
    entitlements.set_plan_id(USER, "pro")
    entitlements.record_tokens(USER, 12_345)
    r = entitlements.account_report(USER)
    assert r["plan_name"] == "Pro" and r["effective_plan_id"] == "pro"
    assert r["usage"]["monthly_tokens"] == 12_345 and r["usage"]["agents"] == 1
    assert len(r["projects"]) == 1 and r["projects"][0]["project"] == "demo"
    assert "claude-opus-5-5" in r["allowed_models"]


# --- API surface (route handlers, called directly with a bound user) --------------------------
async def test_plan_api_roundtrip(monkeypatch):
    monkeypatch.setattr("agent_builder.directory.projects", lambda: [])
    from agent_builder import studio_api

    token = workspace.set_user(USER)
    try:
        listing = await studio_api.list_plans()
        assert [p["id"] for p in listing["plans"]] == list(entitlements.PLAN_IDS)
        assert all(not p["chosen"] for p in listing["plans"])

        # Before choosing, plan_id is null (the UI shows the picker) but enforcement defaults to starter.
        status = await studio_api.current_plan()
        assert status["plan_id"] is None
        assert status["effective_plan_id"] == "starter"

        chosen = await studio_api.choose_plan({"plan_id": "business"})
        assert chosen["plan_id"] == "business"
        assert entitlements.get_plan_id(USER) == "business"

        listing = await studio_api.list_plans()
        assert next(p for p in listing["plans"] if p["id"] == "business")["chosen"] is True
    finally:
        workspace.reset_user(token)


async def test_choose_plan_rejects_unknown(monkeypatch):
    from agent_builder import studio_api

    token = workspace.set_user(USER)
    try:
        with pytest.raises(Exception):
            await studio_api.choose_plan({"plan_id": "platinum"})
    finally:
        workspace.reset_user(token)


async def test_image_endpoint_plan_gating():
    from fastapi import HTTPException

    from agent_builder import studio_api

    token = workspace.set_user(USER)
    try:
        entitlements.set_plan_id(USER, "starter")
        with pytest.raises(HTTPException) as exc:
            await studio_api.generate_image({"prompt": "a logo"})
        assert exc.value.status_code == 403  # MODULE_LOCKED on Starter

        entitlements.set_plan_id(USER, "pro")
        # TECTONIC_OFFLINE=1 (conftest) → the module reports an error, not a crash.
        with pytest.raises(HTTPException) as exc2:
            await studio_api.generate_image({"prompt": "a logo"})
        assert exc2.value.status_code == 400

        recent = await studio_api.recent_images()
        assert recent.get("count") == 0
    finally:
        workspace.reset_user(token)


def test_web_search_provider_choice(monkeypatch):
    from agent_builder.tools import web_search as ws

    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("APIFY_TOKEN", "apify-demo")
    assert ws.get_provider(USER) == "auto"
    ws.set_provider(USER, "apify")
    assert ws.get_provider(USER) == "apify"
    st = ws.providers_status(USER)
    assert st["selected"] == "apify" and st["effective"] == "apify"
    assert {p["id"] for p in st["providers"] if p["configured"]} == {"duckduckgo", "apify"}
    ws.set_provider(USER, "tavily")  # no Tavily key → falls back to auto
    assert ws.providers_status(USER)["effective"] == "auto"


async def test_web_search_api_roundtrip():
    from agent_builder import studio_api

    token = workspace.set_user(USER)
    try:
        status = await studio_api.web_search_status()
        assert status["selected"] == "auto"
        updated = await studio_api.web_search_choose({"provider": "duckduckgo"})
        assert updated["selected"] == "duckduckgo"
    finally:
        workspace.reset_user(token)


async def test_core_generate_image_plan_gate(monkeypatch):
    from types import SimpleNamespace

    from tectonic_runtime import adk_tools

    calls: list = []

    class FakeRuntime:
        async def invoke(self, module, op, payload, ctx):
            calls.append((op, payload))
            return SimpleNamespace(
                ok=True,
                data={"images": [], "count": 0, "model": "gemini-2.5-flash-image", "vector": False,
                      "edited": False, "notes": [], "model_text": "", "display": ""},
            )

    monkeypatch.setattr(adk_tools, "get_runtime", lambda: FakeRuntime())
    fake_ctx = SimpleNamespace(user_id=USER, agent_name="agent_builder", app_name="agent_builder",
                               session=SimpleNamespace(id="sess-1"))

    entitlements.set_plan_id(USER, "starter")
    out = await adk_tools.core_generate_image("a logo", tool_context=fake_ctx)
    assert out["status"] == "error" and "Starter" in out["error"] and "Upgrade" in out["error"]
    assert calls == []  # blocked before the module was called

    entitlements.set_plan_id(USER, "pro")
    out2 = await adk_tools.core_generate_image("a logo", tool_context=fake_ctx)
    assert out2["status"] == "success" and calls  # Pro passes the gate and calls the module


# --- model settings gating --------------------------------------------------------------------
def test_catalogue_filtered_by_plan():
    from agent_builder import model_settings

    ids = set(m["id"] for m in model_settings._catalogue_for(USER))  # no plan yet → starter
    assert ids == {"gemini-3.8-flash", "gemini-3.5-flash-lite", "claude-haiku-5-5"}

    entitlements.set_plan_id(USER, "pro")
    ids = set(m["id"] for m in model_settings._catalogue_for(USER))
    assert "claude-opus-5-5" in ids and len(ids) == len(model_settings.CATALOGUE)


async def test_starter_cannot_byok():
    from agent_builder import model_settings

    token = workspace.set_user(USER)
    try:
        entitlements.set_plan_id(USER, "starter")
        with pytest.raises(model_settings.SettingsError) as exc:
            await model_settings.save_custom("claude-opus-5-5")
        assert "does not allow a custom model" in str(exc.value)
    finally:
        workspace.reset_user(token)


async def test_pro_byok_passes_plan_gate(monkeypatch):
    from agent_builder import model_settings

    monkeypatch.setenv("ANTHROPIC_API_KEY", "")  # no platform key → deterministic stop after the plan gate
    token = workspace.set_user(USER)
    try:
        entitlements.set_plan_id(USER, "pro")
        # The plan gate allows it; it then stops at the missing key (proves it got past the gate).
        with pytest.raises(model_settings.SettingsError) as exc:
            await model_settings.save_custom("claude-opus-5-5")
        assert "Anthropic API key" in str(exc.value)
    finally:
        workspace.reset_user(token)
