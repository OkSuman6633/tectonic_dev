"""Agentic-RAG, Vector DB, FinOps, PromptOps and Auditability on the shared runtime (offline models)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from tectonic_runtime import CallContext, ModuleEventBus, reset_runtime

ADMIN = CallContext(agent_id="agent_builder", role="admin", session_id="builder-s1")
WORKER = CallContext(agent_id="billing_worker", role="worker", team="invoice_desk", session_id="w-s1")
OUTSIDER = CallContext(agent_id="ops_worker", role="worker", team="other_team")

POLICY = (
    "Invoices are issued in EUR.\n\n"
    "VAT is shown separately on every invoice.\n\n"
    "Refunds above 500 EUR require approval from the finance controller under policy FIN-204.\n\n"
    "Customer data is retained for seven years."
)


@pytest.fixture
def rt():
    return reset_runtime(ModuleEventBus())


def tool_ctx(app: str, agent: str = "some_agent", session: str = "sess-1"):
    """Shape of an ADK ToolContext as seen by tectonic_runtime.identity."""
    return SimpleNamespace(agent_name=agent, user_id="u1", session=SimpleNamespace(id=session),
                           _invocation_context=SimpleNamespace(app_name=app, session=SimpleNamespace(id=session)))


# --- Vector DB ----------------------------------------------------------------------------------
async def test_vector_namespaces_isolate_teams(rt):
    await rt.invoke("vector_db", "index", {"text": "Invoices are issued in EUR.", "namespace": "invoice_desk"}, ADMIN)
    await rt.invoke("vector_db", "index", {"text": "Other team pricing for invoices.", "namespace": "other_team"}, ADMIN)
    await rt.invoke("vector_db", "index", {"text": "Office closes on December 25."}, ADMIN)  # shared

    hits = (await rt.invoke("vector_db", "search", {"query": "invoices currency"}, WORKER)).data["hits"]
    assert {h["namespace"] for h in hits} <= {"invoice_desk", "shared"}
    assert hits[0]["content"].startswith("Invoices are issued in EUR")

    denied = await rt.invoke("vector_db", "search", {"query": "x", "namespaces": ["invoice_desk"]}, OUTSIDER)
    assert not denied.ok and "outside team" in denied.error
    write_shared = await rt.invoke("vector_db", "index", {"text": "x", "namespace": "shared"}, WORKER)
    assert not write_shared.ok
    migrate = await rt.invoke("vector_db", "migrate_embeddings", {}, WORKER)
    assert not migrate.ok and "requires admin" in migrate.error


async def test_vector_migration_reembeds_behind_alias(rt):
    await rt.invoke("vector_db", "index", {"text": "alpha beta gamma"}, ADMIN)
    before = (await rt.invoke("vector_db", "stats", {}, ADMIN)).data
    result = (await rt.invoke("vector_db", "migrate_embeddings", {}, ADMIN)).data
    after = (await rt.invoke("vector_db", "stats", {}, ADMIN)).data
    assert result["status"] == "completed" and result["points_migrated"] == 1
    assert after["collection"] != before["collection"] and after["total_points"] == 1


# --- Agentic-RAG --------------------------------------------------------------------------------
def test_chunker_respects_size_and_overlaps():
    from tectonic_runtime.services.agentic_rag_service import chunk_text

    text = "\n\n".join(f"Paragraph {i}. " + "word " * 60 for i in range(10))
    chunks = chunk_text(text, max_chars=500, overlap=80)
    assert len(chunks) > 3 and all(len(c) <= 500 + 81 for c in chunks)
    assert chunks[1].startswith(chunks[0][-80:])


async def test_rag_routes_self_corrects_and_cites(rt):
    await rt.invoke("agentic_rag", "ingest", {"title": "Invoice policy", "text": POLICY, "namespace": "invoice_desk"}, ADMIN)
    out = (await rt.invoke("agentic_rag", "ask", {"question": "Who approves refunds over 500 EUR under FIN-204?"}, WORKER)).data
    first = out["hops"][0]
    assert "knowledge_base" in first["backends"] and "memory" in first["backends"]  # identifier + "who" → routed
    assert out["citations"] and out["citations"][0]["source"] == "Invoice policy"
    assert "[1]" in out["answer"] and "finance controller" in out["answer"]

    # An unanswerable question with an impossible threshold exercises the reformulation loop.
    loop = (await rt.invoke("agentic_rag", "retrieve", {"query": "quarterly marketing headcount plan", "threshold": 0.99,
                                                        "max_hops": 3}, WORKER)).data
    assert loop["outcome"] == "max_hops_reached" and len(loop["hops"]) == 3
    assert not loop["hops"][0]["reformulated"] and loop["hops"][1]["reformulated"]
    assert loop["hops"][1]["query"] != loop["hops"][0]["query"] and loop["hops"][0]["gaps"]


async def test_rag_context_respects_token_budget(rt):
    long_doc = "\n\n".join(f"Section {i}: invoices are processed in batch {i} with reference INV-{i:03d}." * 3 for i in range(30))
    await rt.invoke("agentic_rag", "ingest", {"title": "Batches", "text": long_doc}, ADMIN)
    out = (await rt.invoke("agentic_rag", "retrieve", {"query": "invoice batch processing", "budget_tokens": 200}, ADMIN)).data
    assert out["context_tokens"] <= 200 + 120  # one passage may exceed a tiny budget on its own
    assert [c["n"] for c in out["citations"]] == list(range(1, len(out["citations"]) + 1))


async def test_rag_documents_are_team_scoped(rt):
    await rt.invoke("agentic_rag", "ingest", {"title": "Team doc", "text": POLICY}, WORKER)
    mine = (await rt.invoke("agentic_rag", "documents_list", {}, WORKER)).data["documents"]
    theirs = (await rt.invoke("agentic_rag", "documents_list", {}, OUTSIDER)).data["documents"]
    assert [d["namespace"] for d in mine] == ["invoice_desk"] and theirs == []
    deleted = await rt.invoke("agentic_rag", "delete_document", {"doc_id": mine[0]["doc_id"]}, OUTSIDER)
    assert not deleted.ok


# --- FinOps -------------------------------------------------------------------------------------
async def test_finops_meters_with_rate_card_and_blocks(rt):
    fin = rt.module("finops")
    cost = await fin.meter(team="invoice_desk", agent_id="billing_worker", model="gemini/gemini-2.5-flash",
                           input_tokens=1_000_000, output_tokens=100_000)
    assert cost == pytest.approx(0.30 + 0.25)  # list rates per 1M tokens

    assert not (await rt.invoke("finops", "set_budget", {"team": "invoice_desk", "limit_usd": 0.5}, WORKER)).ok
    await rt.invoke("finops", "set_budget", {"team": "invoice_desk", "limit_usd": 0.5, "enforcement": "block"}, ADMIN)
    report = (await rt.invoke("finops", "report", {}, WORKER)).data
    team = report["teams"][0]
    assert team["team"] == "invoice_desk" and team["budget"]["blocked"] and team["budget"]["alert"]
    assert team["by_model"][0]["model"] == "gemini-2.5-flash" and team["tokens"]["input"] == 1_000_000
    assert (await rt.invoke("finops", "check", {}, WORKER)).data["allowed"] is False
    assert (await rt.invoke("finops", "check", {}, OUTSIDER)).data["allowed"] is True
    peek = await rt.invoke("finops", "report", {"team": "invoice_desk"}, OUTSIDER)
    assert not peek.ok


async def test_finops_unknown_model_is_flagged_estimate_and_admin_rate_wins(rt):
    rates = {r["model"]: r for r in (await rt.invoke("finops", "rates", {}, ADMIN)).data["rates"]}
    assert rates["gemini-2.5-flash"]["estimate"] is True
    fin = rt.module("finops")
    assert fin.rate_for("gemini-9-ultra")["source"] == "fallback"
    await rt.invoke("finops", "set_rate", {"model": "gemini-9-ultra", "input_per_mtok": 2, "output_per_mtok": 8}, ADMIN)
    assert fin.rate_for("gemini/gemini-9-ultra") | {} == fin.rate_for("gemini-9-ultra")
    assert fin.rate_for("gemini-9-ultra")["estimate"] is False


async def test_platform_model_calls_are_metered(rt):
    from tectonic_runtime import models

    await models._report("gemini-2.5-flash-lite", "generate", 10_000, 1_000, estimated=False)
    report = (await rt.invoke("finops", "report", {"team": "agent_builder"}, ADMIN)).data
    assert report["teams"][0]["by_agent"][0]["agent"] == "runtime"


# --- PromptOps ----------------------------------------------------------------------------------
async def test_promptops_lifecycle_ab_test_and_rollback(rt):
    po = rt.module("promptops")
    default = "You are a billing assistant."  # the prompt's code default, constant for this test
    template, v1 = await po.resolve_template("billing.system", "s0", default)
    assert template == "You are a billing assistant." and v1

    cand = (await rt.invoke("promptops", "register", {"prompt_name": "billing.system", "template": "Be precise. Cite policy."}, ADMIN)).data
    assert cand["status"] == "draft" and cand["version"] == "v2"
    assert not (await rt.invoke("promptops", "promote", {"version_id": cand["version_id"]}, WORKER)).ok

    test = (await rt.invoke("promptops", "start_ab_test", {"candidate_version_id": cand["version_id"]}, ADMIN)).data
    served = {}
    for i in range(80):
        text, vid = await po.resolve_template("billing.system", f"session-{i}", default)
        assert (await po.resolve_template("billing.system", f"session-{i}", default))[1] == vid  # sticky arm
        served[vid] = served.get(vid, 0) + 1
        await po.record("billing.system", passed=("Cite policy" in text) or i % 4 == 0, session_id=f"session-{i}")
    assert len(served) == 2 and min(served.values()) > 20

    status = (await rt.invoke("promptops", "ab_status", {"ab_test_id": test["ab_test_id"]}, ADMIN)).data
    assert status["significant"] and status["winner_version_id"] == cand["version_id"]
    await rt.invoke("promptops", "conclude_ab_test", {"ab_test_id": test["ab_test_id"]}, ADMIN)
    assert (await po.resolve_template("billing.system", "new-session", default))[0] == "Be precise. Cite policy."

    rolled = (await rt.invoke("promptops", "rollback", {"version_id": v1}, ADMIN)).data
    assert rolled["status"] == "active" and rolled["rolled_back_to"] == "v1"
    assert (await po.resolve_template("billing.system", "another", default))[0] == "You are a billing assistant."
    statuses = {v["version"]: v["status"] for v in (await rt.invoke("promptops", "versions", {"prompt_name": "billing.system"}, ADMIN)).data["versions"]}
    assert statuses["v2"] == "archived" and list(statuses.values()).count("active") == 1


async def test_promptops_follows_code_default_until_admin_promotes(rt):
    po = rt.module("promptops")
    assert (await po.resolve_template("agent_builder.root", "s", "code v1"))[0] == "code v1"
    assert (await po.resolve_template("agent_builder.root", "s", "code v2"))[0] == "code v2"  # code changed → follows
    custom = (await rt.invoke("promptops", "register", {"prompt_name": "agent_builder.root", "template": "admin tuned"}, ADMIN)).data
    await rt.invoke("promptops", "promote", {"version_id": custom["version_id"]}, ADMIN)
    assert (await po.resolve_template("agent_builder.root", "s", "code v3"))[0] == "admin tuned"  # admin wins


# --- Auditability -------------------------------------------------------------------------------
async def test_audit_chains_redacts_scopes_and_detects_tampering(rt, isolated_platform_state):
    audit = rt.module("auditability")
    audit.observe({"type": "AGENT_CREATED", "id": "billing_worker", "team": "invoice_desk", "parent_id": None})
    audit.observe({"type": "TOKEN_STREAM", "id": "billing_worker", "chunk": "Email jane@example.com about "})
    audit.observe({"type": "TOKEN_STREAM", "id": "billing_worker", "chunk": "the refund."})
    audit.observe({"type": "TOOL_CALL_START", "id": "billing_worker", "tool_name": "refund", "payload": {}, "team": "invoice_desk"})
    audit.observe({"type": "AGENT_CREATED", "id": "ops_bot", "team": "other_team", "parent_id": None})
    await rt.invoke("finops", "set_budget", {"team": "x", "limit_usd": 1}, WORKER)  # denied → audited

    trail = (await rt.invoke("auditability", "query", {}, WORKER)).data
    types = [e["event_type"] for e in trail["events"]]
    assert "AGENT_REASONING" in types and all(e["team"] == "invoice_desk" for e in trail["events"])
    reasoning = next(e for e in trail["events"] if e["event_type"] == "AGENT_REASONING")
    assert "[REDACTED_EMAIL]" in reasoning["payload"]["text"] and "jane@" not in json.dumps(trail)

    denied = (await rt.invoke("auditability", "ask", {"question": "show permission denied events"}, ADMIN)).data
    assert denied["filter"]["event_type"] == "MODULE_ACCESS_DENIED" and denied["total"] == 1
    assert (await rt.invoke("auditability", "verify", {}, ADMIN)).data["valid"]
    assert not (await rt.invoke("auditability", "export", {}, WORKER)).ok
    pack = (await rt.invoke("auditability", "export", {}, ADMIN)).data
    assert pack["chain_valid"] and pack["event_count"] > 0

    # Tamper with the persisted log, reload, and verify must pinpoint the edit.
    await audit.flush()
    log = isolated_platform_state / "audit.jsonl"
    lines = log.read_text(encoding="utf-8").splitlines()
    rec = json.loads(lines[1])
    rec["payload"]["tool_name"] = "something_else"
    lines[1] = json.dumps(rec)
    log.write_text("\n".join(lines) + "\n", encoding="utf-8")
    rt2 = reset_runtime(ModuleEventBus())
    verdict = (await rt2.invoke("auditability", "verify", {}, ADMIN)).data
    assert verdict["valid"] is False and verdict["break_at_sequence"] == 2


# --- Inheritance through the ADK surface --------------------------------------------------------
async def test_workers_inherit_team_and_builder_is_admin_via_app_name(rt):
    from tectonic_runtime.adk_tools import _ctx, core_add_knowledge, core_provision_team, core_spend_status

    worker = _ctx(tool_ctx("generated_agents.invoice_desk.invoice_desk", agent="billing_worker"))
    builder = _ctx(tool_ctx("agent_builder", agent="code_generator"))
    assert (worker.role, worker.team) == ("worker", "invoice_desk")
    assert (builder.role, builder.team) == ("admin", "agent_builder")

    wctx = tool_ctx("generated_agents.invoice_desk.invoice_desk", agent="billing_worker")
    denied = await core_provision_team("invoice_desk", 1.0, tool_context=wctx)
    assert denied["status"] == "error" and "requires admin" in denied["error"]
    ok = await core_provision_team("invoice_desk", 1.0, tool_context=tool_ctx("agent_builder", agent="agent_builder"))
    assert ok["status"] == "success"
    added = await core_add_knowledge("Notes", "Refund window is 30 days.", tool_context=wctx)
    assert added["data"]["namespace"] == "invoice_desk"
    spend = await core_spend_status(tool_context=wctx)
    assert spend["data"]["teams"][0]["team"] == "invoice_desk"


async def test_telemetry_plugin_blocks_llm_calls_over_budget(rt, monkeypatch):
    import tectonic_runtime
    from agent_builder import telemetry

    monkeypatch.setattr(tectonic_runtime, "get_runtime", lambda: rt)
    await rt.module("finops").meter(team="invoice_desk", agent_id="billing_worker", model="gemini-2.5-flash",
                                    input_tokens=2_000_000, output_tokens=0)
    await rt.invoke("finops", "set_budget", {"team": "invoice_desk", "limit_usd": 0.10, "enforcement": "block"}, ADMIN)

    cb = SimpleNamespace(agent_name="billing_worker", invocation_id="i1",
                         _invocation_context=SimpleNamespace(app_name="generated_agents.invoice_desk.invoice_desk"))
    response = await telemetry.telemetry_plugin.before_model_callback(callback_context=cb, llm_request=None)
    assert response is not None and "budget exhausted" in response.content.parts[0].text
    builder_cb = SimpleNamespace(agent_name="agent_builder", invocation_id="i2", _invocation_context=SimpleNamespace(app_name="agent_builder"))
    assert await telemetry.telemetry_plugin.before_model_callback(callback_context=builder_cb, llm_request=None) is None


async def test_admin_and_operator_default_to_every_namespace(rt):
    await rt.invoke("agentic_rag", "ingest", {"title": "Team policy", "text": POLICY, "namespace": "invoice_desk"}, ADMIN)
    operator = CallContext(agent_id="operator", role="operator")
    out = (await rt.invoke("agentic_rag", "ask", {"question": "late payment fee FIN-204 refunds"}, operator)).data
    assert "invoice_desk" in out["namespaces"] and out["citations"]


async def test_operator_reads_are_not_audited_but_writes_are(rt):
    operator = CallContext(agent_id="operator", role="operator")
    for _ in range(3):
        await rt.invoke("finops", "report", {}, operator)
    await rt.invoke("finops", "set_budget", {"team": "t", "limit_usd": 2}, operator)
    await rt.invoke("finops", "report", {}, WORKER)  # agent reads stay in the trail
    rows = (await rt.invoke("auditability", "query", {"event_type": "MODULE_CALL_END"}, ADMIN)).data["events"]
    ops = [(e["payload"]["agent_id"], e["payload"]["operation"]) for e in rows]
    assert ("operator", "set_budget") in ops and ("billing_worker", "report") in ops
    assert ("operator", "report") not in ops
