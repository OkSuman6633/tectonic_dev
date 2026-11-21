"""External Connector Module: Meta Ads + GA4 connectors, the credential vault, the pause/resume flow,
tool binding and — above all — that credentials never leak into events, logs, results or the model."""

from __future__ import annotations

import base64
import json
import logging
from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from tectonic_runtime import CallContext, ModuleEventBus, reset_runtime
from tectonic_runtime.connectors import (ConnectionKey, CredentialsInvalid, CredentialVault, Credentials,
                                         GoogleAnalyticsConnector, MetaAdsConnector, find_secrets, register_secret, scrub)
from tectonic_runtime.connectors.http import ConnectorHTTP

META_TOKEN = "EAAB" + "Zq9" * 20
OWNER = "u_0123456789ab"
OTHER = "u_ffffffffffff"
APP = f"generated_agents.{OWNER}.shop.shop"


@pytest.fixture(autouse=True)
def no_backoff(monkeypatch):
    monkeypatch.setattr(ConnectorHTTP, "_backoff", lambda self, attempt: 0)


@pytest.fixture
def events() -> list[dict]:
    return []


@pytest.fixture
def rt(events):
    bus = ModuleEventBus()
    bus.subscribe(events.append)
    return reset_runtime(bus)


def form(request: httpx.Request) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(request.content.decode()).items()}


# --- fake Meta Graph API ----------------------------------------------------------------------------
class FakeMeta:
    def __init__(self, token: str = META_TOKEN) -> None:
        self.token = token
        self.calls: list[httpx.Request] = []
        self.created: dict[str, str] = {}
        self.campaign_status = "PAUSED"
        self.fail_with: dict | None = None
        self.rate_limited = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        assert self.token not in str(request.url), "tokens must never be put in URLs"
        if request.headers.get("authorization") != f"Bearer {self.token}":
            return httpx.Response(400, json={"error": {"message": "Invalid OAuth access token.", "code": 190}})
        if self.fail_with:
            return httpx.Response(400, json={"error": self.fail_with})
        if self.rate_limited:
            self.rate_limited -= 1
            return httpx.Response(400, json={"error": {"message": "User request limit reached", "code": 17}})
        path, params = request.url.path, request.url.params
        if path.endswith("/act_123456789") and request.method == "GET":
            return httpx.Response(200, json={"id": "act_123456789", "name": "Acme Shop", "account_status": 1,
                                             "currency": "USD", "timezone_name": "America/New_York"})
        if path.endswith("/act_123456789/insights"):
            if params.get("after") == "c1":
                return httpx.Response(200, json={"data": [{
                    "campaign_id": "2", "campaign_name": "Retargeting", "impressions": "500", "clicks": "50",
                    "spend": "50.00", "actions": [{"action_type": "omni_purchase", "value": "5"}],
                    "action_values": [{"action_type": "omni_purchase", "value": "400.00"}]}], "paging": {"cursors": {"after": "c2"}}})
            return httpx.Response(200, json={"data": [{
                "campaign_id": "1", "campaign_name": "Prospecting", "impressions": "1000", "clicks": "20", "spend": "100.00",
                "actions": [{"action_type": "omni_purchase", "value": "4"}, {"action_type": "purchase", "value": "4"},
                            {"action_type": "link_click", "value": "18"}],
                "action_values": [{"action_type": "omni_purchase", "value": "300.00"}],
                "purchase_roas": [{"action_type": "omni_purchase", "value": "3.0"}]}],
                "paging": {"cursors": {"after": "c1"}, "next": "https://graph.facebook.com/next?access_token=" + self.token}})
        if path.endswith("/act_123456789/campaigns") and request.method == "POST":
            self.created = form(request)
            return httpx.Response(200, json={"id": "999"})
        if path.endswith("/999") and request.method == "GET":
            return httpx.Response(200, json={"id": "999", "name": "x", "status": self.campaign_status})
        if path.endswith("/999") and request.method == "POST":
            self.campaign_status = form(request)["status"]
            return httpx.Response(200, json={"success": True})
        return httpx.Response(404, json={"error": {"message": f"unexpected {request.method} {path}", "code": 100}})


def meta(fake: FakeMeta, token: str = META_TOKEN) -> MetaAdsConnector:
    creds = Credentials("meta_ads", "access_token", {"access_token": token, "ad_account_id": "act_123456789"},
                        secret_names={"access_token", "app_secret"})
    return MetaAdsConnector(creds, transport=httpx.MockTransport(fake))


async def test_meta_insights_paginates_and_computes_roas():
    fake = FakeMeta()
    data = await meta(fake).fetch_data("insights", {"level": "campaign", "date_preset": "last_30d"})
    assert [r["campaign_name"] for r in data["rows"]] == ["Prospecting", "Retargeting"]
    first, second = data["rows"]
    assert first["roas"] == 3.0 and first["purchases"] == 4.0  # omni_purchase only: no double counting
    assert second["roas"] == 8.0  # computed from purchase value / spend when Meta omits purchase_roas
    totals = data["totals"]
    assert totals == {**totals, "spend": 150.0, "impressions": 1500, "clicks": 70, "purchase_value": 700.0}
    assert totals["roas"] == round(700 / 150, 4) and totals["ctr"] == round(70 / 1500 * 100, 4)
    assert data["period"] == {"date_preset": "last_30d"}
    assert fake.calls[1].url.params["after"] == "c1"  # cursor paging, never Meta's token-bearing next URL


async def test_meta_campaigns_are_always_staged_paused():
    fake = FakeMeta()
    fake.campaign_status = "ACTIVE"  # Meta reports something unexpected: the connector must re-pause
    out = await meta(fake).execute_action("create_campaign", {"name": "Black Friday", "objective": "OUTCOME_SALES",
                                                              "status": "ACTIVE", "daily_budget": 5000})
    assert fake.created["status"] == "PAUSED" and fake.created["daily_budget"] == "5000"
    assert fake.created["special_ad_categories"] == "[]"
    assert out["status"] == "PAUSED" and fake.campaign_status == "PAUSED"
    assert "review_url" in out and any("forced to PAUSED" in n for n in out["notes"])

    dry = await meta(FakeMeta()).execute_action("create_campaign", {"name": "x", "objective": "OUTCOME_TRAFFIC", "dry_run": True})
    assert dry["dry_run"] and dry["payload"]["status"] == "PAUSED" and dry["payload"]["is_adset_budget_sharing_enabled"] == "false"


async def test_meta_errors_map_to_retry_or_reauth():
    fake = FakeMeta()
    fake.rate_limited = 2  # retried transparently
    assert (await meta(fake).fetch_data("account", {}))["account_name"] == "Acme Shop"

    with pytest.raises(CredentialsInvalid, match="190"):
        await meta(FakeMeta(), token="EAAB" + "bad" * 20).authenticate()
    fake = FakeMeta()
    fake.fail_with = {"message": "(#100) Invalid parameter", "code": 100}
    with pytest.raises(Exception) as exc:
        await meta(fake).fetch_data("insights", {})
    assert not isinstance(exc.value, CredentialsInvalid) and "Invalid parameter" in str(exc.value)


def test_meta_credential_input_is_normalised():
    clean = MetaAdsConnector.normalize_credentials("access_token", {"access_token": META_TOKEN, "ad_account_id": "123456789"})
    assert clean["ad_account_id"] == "act_123456789" and "app_secret" not in clean
    with pytest.raises(Exception, match="unexpected format"):
        MetaAdsConnector.normalize_credentials("access_token", {"access_token": META_TOKEN, "ad_account_id": "acme"})


# --- fake GA4 + Google OAuth ---------------------------------------------------------------------------
def service_account() -> tuple[dict, rsa.RSAPrivateKey]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    return ({"type": "service_account", "project_id": "p", "private_key_id": "kid1", "private_key": pem,
             "client_email": "reporter@p.iam.gserviceaccount.com", "token_uri": "https://evil.example.com/token"}, key)


class FakeGoogle:
    def __init__(self, public_key=None) -> None:
        self.public_key = public_key
        self.calls: list[httpx.Request] = []
        self.issued = "ya29." + "a" * 40
        self.reject_token: str | None = None
        self.forbid = False
        self.report_bodies: list[dict] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        url = str(request.url)
        if url == "https://oauth2.googleapis.com/token":
            body = form(request)
            if body["grant_type"] == "urn:ietf:params:oauth:grant-type:jwt-bearer":
                header, payload, sig = body["assertion"].split(".")
                pad = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))  # noqa: E731
                self.public_key.verify(pad(sig), f"{header}.{payload}".encode(), padding.PKCS1v15(), hashes.SHA256())
                claims = json.loads(pad(payload))
                assert claims["scope"].endswith("analytics.readonly") and claims["aud"] == "https://oauth2.googleapis.com/token"
            else:
                assert body["grant_type"] == "refresh_token" and body["client_secret"] == "csecret"
            return httpx.Response(200, json={"access_token": self.issued, "expires_in": 3600})
        assert request.headers["authorization"].startswith("Bearer ")
        if request.headers["authorization"] == f"Bearer {self.reject_token}":
            return httpx.Response(401, json={"error": {"code": 401, "status": "UNAUTHENTICATED", "message": "expired"}})
        if self.forbid:
            return httpx.Response(403, json={"error": {"code": 403, "status": "PERMISSION_DENIED",
                                                        "message": "User does not have sufficient permissions for this property."}})
        if url.endswith("/properties/123456:runReport"):
            body = json.loads(request.content)
            self.report_bodies.append(body)
            dims = [d["name"] for d in body.get("dimensions", [])]
            mets = [m["name"] for m in body["metrics"]]
            rows = [{"dimensionValues": [{"value": f"{d}-{i}"} for d in dims],
                     "metricValues": [{"value": str(10 * (i + 1))} for _ in mets]} for i in range(2 if dims else 1)]
            return httpx.Response(200, json={
                "dimensionHeaders": [{"name": d} for d in dims],
                "metricHeaders": [{"name": m, "type": "TYPE_INTEGER"} for m in mets],
                "rows": rows, "rowCount": len(rows), "totals": [{"metricValues": [{"value": "30"} for _ in mets]}],
                "metadata": {"currencyCode": "EUR", "timeZone": "Europe/Berlin"}})
        return httpx.Response(404, json={"error": {"code": 404, "status": "NOT_FOUND", "message": url}})


def ga4(fake: FakeGoogle, scheme: str, values: dict) -> GoogleAnalyticsConnector:
    clean = GoogleAnalyticsConnector.normalize_credentials(scheme, values)
    creds = Credentials("google_analytics", scheme, clean, secret_names=GoogleAnalyticsConnector.secret_field_names(scheme))
    return GoogleAnalyticsConnector(creds, transport=httpx.MockTransport(fake))


async def test_ga4_service_account_signs_jwt_and_runs_reports():
    info, key = service_account()
    fake = FakeGoogle(key.public_key())
    conn = ga4(fake, "service_account", {"property_id": "properties/123456", "service_account_json": json.dumps(info)})
    profile = await conn.authenticate()
    assert profile == {"property_id": "123456", "currency": "EUR", "timezone": "Europe/Berlin",
                       "service_account": "reporter@p.iam.gserviceaccount.com"}
    # The key file's token_uri pointed elsewhere: the signed assertion still only went to Google.
    assert all("evil.example.com" not in str(c.url) for c in fake.calls)

    report = await conn.fetch_data("source_medium", {"start_date": "7daysAgo", "limit": 5,
                                                     "filters": [{"field": "country", "value": "DE"}]})
    assert report["dimensions"] == ["sessionSourceMedium"] and report["rows"][0]["sessions"] == 10
    assert report["totals"]["sessions"] == 30 and isinstance(report["totals"]["sessions"], int)
    body = fake.report_bodies[-1]
    assert body["dimensionFilter"]["filter"]["stringFilter"]["value"] == "DE"
    assert body["orderBys"][0]["metric"]["metricName"] == "sessions"
    token_calls = [c for c in fake.calls if "oauth2" in str(c.url)]
    assert len(token_calls) == 1  # the minted token is cached

    conv = await conn.fetch_data("conversions", {"by": "deviceCategory"})
    assert conv["overall"]["sessionKeyEventRate"] == 30 and conv["by"]["dimension"] == "deviceCategory"


async def test_ga4_oauth_refreshes_an_expired_token_and_explains_403():
    fake = FakeGoogle()
    fake.reject_token = "ya29." + "old" * 10
    conn = ga4(fake, "oauth", {"property_id": "123456", "access_token": fake.reject_token, "refresh_token": "1//" + "r" * 30,
                               "client_id": "cid.apps.googleusercontent.com", "client_secret": "csecret"})
    data = await conn.fetch_data("traffic_overview", {"by": "date"})
    assert data["rows"] and conn.credentials.cache["access_token"] == fake.issued

    with pytest.raises(Exception, match="refresh token needs"):
        GoogleAnalyticsConnector.normalize_credentials("oauth", {"property_id": "1234", "refresh_token": "1//x"})
    info, key = service_account()
    fake = FakeGoogle(key.public_key())
    fake.forbid = True
    with pytest.raises(CredentialsInvalid, match="reporter@p.iam.gserviceaccount.com as a Viewer"):
        await ga4(fake, "service_account", {"property_id": "123456", "service_account_json": json.dumps(info)}).authenticate()


# --- vault ----------------------------------------------------------------------------------------
def test_vault_is_per_account_encrypted_and_expiring():
    now = [1000.0]
    vault = CredentialVault(ttl_seconds=60, clock=lambda: now[0])
    key = ConnectionKey(OWNER, "meta_ads")
    vault.put(key, scheme="access_token", values={"access_token": META_TOKEN, "ad_account_id": "act_1"},
              secret_names={"access_token"}, profile={"account_name": "Acme"})
    assert vault.credentials(key).require("access_token") == META_TOKEN
    assert META_TOKEN not in repr(vault.credentials(key))
    assert all(META_TOKEN.encode() not in blob for blob in vault.store._data.values())  # ciphertext at rest
    summary = vault.connections(OWNER)[0]
    assert summary["fields"] == {"ad_account_id": "act_1"} and summary["secret_fields"] == ["access_token"]
    assert META_TOKEN not in json.dumps(summary)
    assert vault.credentials(ConnectionKey(OTHER, "meta_ads")) is None  # another account sees nothing
    assert vault.credentials(ConnectionKey(OWNER, "meta_ads", "client_b")) is None  # another named account
    now[0] += 61
    assert vault.credentials(key) is None and vault.connections(OWNER) == []


# --- redaction -------------------------------------------------------------------------------------
def test_scrub_masks_registered_and_well_known_secrets(caplog):
    from tectonic_runtime.connectors import install_log_redaction

    custom = "my-very-private-value-123"
    register_secret(custom)
    text = (f"token {META_TOKEN} and {custom} and ya29.{'b' * 30} and https://x?access_token=abc123&ok=1 "
            "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----")
    out = scrub({"nested": [text]})["nested"][0]
    for leaked in (META_TOKEN, custom, "ya29.", "abc123", "MIIE"):
        assert leaked not in out
    assert "ok=1" in out
    assert set(find_secrets(f"here: {META_TOKEN}")) >= {"meta_access_token"}
    assert find_secrets("Show me last week's ROAS") == []

    install_log_redaction()
    with caplog.at_level(logging.WARNING):
        logging.getLogger("test.connectors").warning("calling with %s", META_TOKEN)
    assert META_TOKEN not in caplog.text and "[REDACTED]" in caplog.text


# --- module: connect once, use everywhere, notices for data problems ----------------------------------------
WORKER = CallContext(agent_id="analyst", tenant_id=OWNER, session_id="s1", team="shop")
INSIGHTS = {"connector": "meta_ads", "resource": "insights"}


async def connect_meta(module) -> dict:
    return await module.connect(owner=OWNER, connector="meta_ads", scheme="access_token",
                                values={"access_token": META_TOKEN, "ad_account_id": "123456789"})


async def test_not_connected_returns_guidance_and_a_chat_notice(rt, events):
    module = rt.module("external_connectors")
    fake = FakeMeta()
    module.transport = httpx.MockTransport(fake)

    result = await rt.invoke("external_connectors", "fetch_data", INSIGHTS, WORKER)
    assert result.ok and result.data["status"] == "not_connected"
    message = result.data["message"]
    assert "External Tools window" in message and "Never ask for credentials in the chat" in message
    assert "Continue with any parts of the task" in message
    assert fake.calls == []  # nothing was fetched without credentials

    notices = module.notices(OWNER, team="shop")
    assert [(n["kind"], n["connector"], n["agent"], n["what"]) for n in notices] == [
        ("not_connected", "meta_ads", "analyst", "meta_ads_insights")]
    assert module.notices(OTHER) == [] and module.notices(OWNER, team="other_project") == []
    assert module.notices(OWNER, after_seq=module.latest_notice_seq()) == []
    assert any(e["type"] == "CONNECTOR_NOTICE" for e in events)


async def test_connected_once_serves_every_project_and_specialist(rt, events):
    module = rt.module("external_connectors")
    module.transport = httpx.MockTransport(FakeMeta())
    with pytest.raises(CredentialsInvalid):  # a wrong token is rejected at the form, nothing stored
        await module.connect(owner=OWNER, connector="meta_ads", scheme="access_token",
                             values={"access_token": "EAAB" + "nope" * 10, "ad_account_id": "123456789"})
    assert module.vault.connections(OWNER) == []

    out = await connect_meta(module)
    assert out["profile"]["account_name"] == "Acme Shop" and out["status"] == "active"

    for ctx in (WORKER,  # the project that asked
                CallContext(agent_id="reporter", tenant_id=OWNER, session_id="nested-42", team="shop"),  # AgentTool
                CallContext(agent_id="planner", tenant_id=OWNER, team="another_workflow")):  # any other project
        result = await rt.invoke("external_connectors", "fetch_data", {**INSIGHTS, "params": {"date_preset": "last_7d"}}, ctx)
        assert result.data["status"] == "ok" and result.data["data"]["totals"]["spend"] == 150.0
        assert result.data["account"]["currency"] == "USD"

    stranger = CallContext(agent_id="analyst", tenant_id=OTHER, team="shop")
    assert (await rt.invoke("external_connectors", "fetch_data", INSIGHTS, stranger)).data["status"] == "not_connected"
    assert META_TOKEN not in json.dumps(events, default=str)  # nothing secret reaches telemetry or audit


async def test_revoked_credentials_report_connection_failed(rt):
    module = rt.module("external_connectors")
    fake = FakeMeta()
    module.transport = httpx.MockTransport(fake)
    await connect_meta(module)
    fake.token = "EAAB" + "rotated" * 6  # the user revoked the token in Meta
    result = await rt.invoke("external_connectors", "fetch_data", {"connector": "meta_ads", "resource": "campaigns"}, WORKER)
    assert result.data["status"] == "connection_failed" and "190" in result.data["message"]
    assert module.vault.status(ConnectionKey(OWNER, "meta_ads"))["status"] == "invalid"
    again = await rt.invoke("external_connectors", "fetch_data", INSIGHTS, WORKER)
    assert again.data["status"] == "connection_failed"  # stays failed until reconnected
    assert [n["kind"] for n in module.notices(OWNER)] == ["connection_failed", "connection_failed"]


async def test_provider_failures_and_empty_results_become_notices(rt):
    module = rt.module("external_connectors")
    fake = FakeMeta()
    module.transport = httpx.MockTransport(fake)
    await connect_meta(module)

    fake.fail_with = {"message": "Service temporarily unavailable", "code": 2}
    failed = await rt.invoke("external_connectors", "fetch_data", INSIGHTS, WORKER)
    assert failed.ok and failed.data["status"] == "fetch_failed" and "Do not invent" in failed.data["message"]

    fake.fail_with = {"message": "(#100) Invalid parameter", "code": 100}  # the agent's mistake: an error to fix, no notice
    bad = await rt.invoke("external_connectors", "fetch_data", INSIGHTS, WORKER)
    assert not bad.ok and "Invalid parameter" in bad.error

    fake.fail_with = None
    module.transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"data": []}))
    empty = await rt.invoke("external_connectors", "fetch_data", INSIGHTS, WORKER)
    assert empty.data["status"] == "ok" and empty.data["no_data"] and "no data" in empty.data["message"]
    assert [n["kind"] for n in module.notices(OWNER)] == ["fetch_failed", "no_data"]


async def test_operation_errors_are_clear(rt):
    bad = await rt.invoke("external_connectors", "fetch_data", {"connector": "tiktok", "resource": "x"}, WORKER)
    assert not bad.ok and "unknown connector" in bad.error
    bad = await rt.invoke("external_connectors", "execute_action", {"connector": "ga4", "action": "delete_property"}, WORKER)
    assert not bad.ok and "no write capability" in bad.error


# --- tool binding -------------------------------------------------------------------------------------
def tool_context(user: str = OWNER, session: str = "s1") -> SimpleNamespace:
    return SimpleNamespace(agent_name="analyst", user_id=user, session=SimpleNamespace(id=session), app_name=APP)


async def test_adk_tools_declare_json_schema_and_run_through_the_module(rt):
    from google.adk.models.llm_request import LlmRequest

    from tectonic_runtime.connectors.tools import connector_tools, tool_specs

    tools = {t.name: t for t in connector_tools()}
    assert {"connector_status", "meta_ads_insights", "meta_ads_create_campaign", "ga4_report", "ga4_source_medium",
            "ga4_conversions"} <= set(tools)
    assert "connector_request_access" not in tools  # connections are made in External Tools, never via the agent
    schema = tools["meta_ads_insights"]._get_declaration().parameters_json_schema
    assert schema["properties"]["level"]["enum"] == ["account", "campaign", "adset", "ad"] and "connection" in schema["properties"]
    assert tools["ga4_report"]._get_declaration().parameters_json_schema["required"] == ["metrics"]
    assert {s["name"] for s in tool_specs()} == set(tools)

    request = LlmRequest()
    for tool in tools.values():
        await tool.process_llm_request(tool_context=tool_context(), llm_request=request)
    instruction = str(request.config.system_instruction)
    assert instruction.count("External data sources (client accounts)") == 1 and "External Tools window" in instruction

    module = rt.module("external_connectors")
    module.transport = httpx.MockTransport(FakeMeta())
    missing = await tools["meta_ads_insights"].run_async(args={"level": "campaign"}, tool_context=tool_context())
    assert missing["status"] == "not_connected" and module.notices(OWNER)[0]["team"] == "shop"
    await connect_meta(module)
    data = await tools["meta_ads_insights"].run_async(args={"level": "campaign"}, tool_context=tool_context(session="nested"))
    assert data["status"] == "ok" and data["data"]["row_count"] == 2
    status = await tools["connector_status"].run_async(args={}, tool_context=tool_context())
    assert {c["connector"]: c["status"] for c in status["connections"]} == {"meta_ads": "active", "google_analytics": "not_connected"}


def test_worker_tools_include_connectors_only_when_enabled():
    from tectonic_runtime.adk_tools import module_instructions, worker_tools

    names = lambda tools: {getattr(t, "__name__", None) or t.name for t in tools}  # noqa: E731
    assert "meta_ads_insights" not in names(worker_tools("shop", modules=["guardrails"]))
    assert "meta_ads_insights" in names(worker_tools("shop", modules=["guardrails", "external_connectors"]))
    only_ga4 = names(worker_tools("shop", modules=["external_connectors"], connectors=["ga4"]))
    assert "ga4_report" in only_ga4 and "meta_ads_insights" not in only_ga4
    assert "External data sources" in module_instructions(None) and "External data sources" not in module_instructions(["finops"])


async def test_pasted_credentials_never_reach_the_model():
    from google.genai import types

    from tectonic_runtime.connectors.plugin import connector_secrets_plugin

    message = types.Content(role="user", parts=[types.Part(text=f"here is my token {META_TOKEN}, show ROAS")])
    cleaned = await connector_secrets_plugin.on_user_message_callback(invocation_context=None, user_message=message)
    text = " ".join(p.text for p in cleaned.parts)
    assert META_TOKEN not in text and "show ROAS" in text and "External Tools window" in text
    plain = types.Content(role="user", parts=[types.Part(text="show last week's ROAS")])
    assert await connector_secrets_plugin.on_user_message_callback(invocation_context=None, user_message=plain) is None


# --- HTTP API behind the External Tools window ---------------------------------------------------------
@pytest.fixture
def api(rt, tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from agent_builder import auth
    from agent_builder.connectors_api import router

    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("TECTONIC_AUTH_SECRET", raising=False)
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(auth, "_failures", {})
    users = {name: auth.register(name, "password123") for name in ("alice", "bob")}
    # Connectors are a Pro feature: put both accounts on Pro so the catalog shows them.
    from agent_builder import entitlements

    for u in users.values():
        entitlements.set_plan_id(u["id"], "pro")
    app = FastAPI()
    app.include_router(router)
    app.add_middleware(auth.AuthMiddleware, list_apps=lambda: [])
    rt.module("external_connectors").transport = httpx.MockTransport(FakeMeta())
    headers = {n: {"Authorization": f"Bearer {auth.issue_token(u)}"} for n, u in users.items()}
    return TestClient(app), headers, users


def test_external_tools_api_connects_lists_and_never_returns_secrets(api, rt):
    client, headers, users = api
    body = {"connector": "meta_ads", "scheme": "access_token", "values": {"access_token": META_TOKEN, "ad_account_id": "123456789"}}
    assert client.get("/connectors/catalog").status_code == 401  # sign-in required
    catalog = client.get("/connectors/catalog", headers=headers["alice"]).json()["connectors"]
    assert {c["name"] for c in catalog} == {"meta_ads", "google_analytics"}

    rejected = client.post("/connectors/connect", headers=headers["alice"],
                           json={**body, "values": {"access_token": "EAAB" + "bad" * 15, "ad_account_id": "123456789"}})
    assert rejected.status_code == 400 and rejected.json()["detail"]["code"] == "credentials_invalid"
    assert "EAAB" not in rejected.text

    ok = client.post("/connectors/connect", headers=headers["alice"], json=body)
    assert ok.status_code == 200 and ok.json()["connection"]["profile"]["account_name"] == "Acme Shop"
    listed = client.get("/connectors/connections", headers=headers["alice"])
    assert listed.json()["connections"][0]["fields"] == {"ad_account_id": "act_123456789"}
    assert META_TOKEN not in ok.text + listed.text
    assert client.get("/connectors/connections", headers=headers["bob"]).json()["connections"] == []  # per account

    gone = client.delete("/connectors/connections/meta_ads", headers=headers["alice"])
    assert gone.status_code == 200 and gone.json()["removed"] is True
    assert client.get("/connectors/connections", headers=headers["alice"]).json()["connections"] == []


async def test_notices_api_returns_the_turns_notices_per_account(api, rt):
    client, headers, users = api
    cursor = client.get("/connectors/notices?after=999999", headers=headers["alice"]).json()["latest"]
    alice = CallContext(agent_id="analyst", tenant_id=users["alice"]["id"], team="shop")
    await rt.invoke("external_connectors", "fetch_data", {"connector": "ga4", "resource": "report",
                                                          "params": {"metrics": ["sessions"]}}, alice)
    turn = client.get(f"/connectors/notices?after={cursor}&project=shop", headers=headers["alice"]).json()
    assert [(n["kind"], n["connector"], n["label"]) for n in turn["notices"]] == [
        ("not_connected", "google_analytics", "Google Analytics 4")]
    assert client.get(f"/connectors/notices?after={cursor}&project=other", headers=headers["alice"]).json()["notices"] == []
    assert client.get(f"/connectors/notices?after={cursor}", headers=headers["bob"]).json()["notices"] == []
    assert "owner" not in turn["notices"][0]


# --- every workflow runs on the Agent Builder's current model ---------------------------------------------
def test_generated_agents_are_bound_to_the_builder_model():
    from google.adk.agents import LlmAgent
    from google.adk.tools.agent_tool import AgentTool

    from agent_builder.shared_libraries.constants import MODEL
    from agent_builder.workflow_model import bind_studio_model

    specialist = LlmAgent(name="analyst", model="gemini-2.5-flash", instruction="x")
    helper = LlmAgent(name="helper", model="gemini-2.5-pro", instruction="x")
    root = LlmAgent(name="manager", model="gemini-1.5-flash", instruction="x",
                    tools=[AgentTool(agent=specialist)], sub_agents=[helper])
    assert bind_studio_model(root) == 3
    assert root.model is MODEL and specialist.model is MODEL and helper.model is MODEL
    assert bind_studio_model(root) == 0  # idempotent


async def test_builder_model_choice_reaches_generated_workflows():
    """Whatever the Builder resolves for this user (default or custom) is what the workflow calls."""
    from google.adk.agents import LlmAgent
    from google.adk.models.base_llm import BaseLlm

    from agent_builder.shared_libraries.constants import MODEL
    from agent_builder.workflow_model import workflow_model_plugin

    class Recorder(BaseLlm):
        async def generate_content_async(self, llm_request, stream=False):  # pragma: no cover - not called
            yield None

    chosen = Recorder(model="claude-haiku-5-5")
    previous = MODEL._resolver
    MODEL.set_resolver(lambda: (chosen, "claude-haiku-5-5"))  # this user's Builder choice
    try:
        agent = LlmAgent(name="worker", model="gemini-2.5-flash", instruction="x")
        await workflow_model_plugin.before_run_callback(invocation_context=SimpleNamespace(app_name=APP, agent=agent))
        assert agent.canonical_model is MODEL and MODEL.current()[0] is chosen
    finally:
        MODEL.set_resolver(previous)

    builder_agent = LlmAgent(name="b", model="gemini-2.5-flash", instruction="x")
    await workflow_model_plugin.before_run_callback(invocation_context=SimpleNamespace(app_name="agent_builder", agent=builder_agent))
    assert builder_agent.model == "gemini-2.5-flash"  # the Builder's own agents are left as configured
