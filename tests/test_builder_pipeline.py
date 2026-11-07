"""The Builder's deterministic pipeline: decision protocol, state machine, research and finalize."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from tectonic_runtime import CallContext, ModuleEventBus, reset_runtime

ADMIN = CallContext(agent_id="agent_builder", role="admin")


ALL_STEPS = ["discovery", "io", "topology", "agents", "modules", "governance", "compile"]
_UNSET = object()


def tool_ctx(state: dict | None = None, user: str = "", session: str = "builder-sess", plan=_UNSET):
    """`plan`: the steps the user chose to decide on the step-plan card (default: all of them; None = not chosen)."""
    state = state if state is not None else {}
    state.setdefault("interview", {}).setdefault("plan", ALL_STEPS if plan is _UNSET else plan)
    return SimpleNamespace(state=state, agent_name="agent_builder",
                           user_content=SimpleNamespace(parts=[SimpleNamespace(text=user)]), session=SimpleNamespace(id=session))


DECISIONS = [
    {"id": "storage", "title": "Where should records live?", "why": "Persistence", "category": "data",
     "options": [{"label": "SQLite", "description": "queryable", "recommended": True}, {"label": "JSON files"}]},
    {"id": "output_channels", "title": "Where should reports go?", "multi_select": True, "category": "interaction",
     "options": [{"label": "Chat"}, {"label": "Email", "recommended": True}, {"label": "CSV export"}]},
    {"id": "budget", "title": "Monthly LLM budget?", "category": "platform",
     "options": [{"label": "$5 / month, alert", "recommended": True}, {"label": "$20 / month, hard cap"}]},
]


@pytest.fixture
def rt():
    return reset_runtime(ModuleEventBus())


async def test_present_decisions_publishes_structured_cards_and_skips_answered(rt):
    from agent_builder.tools.build_pipeline import present_decisions

    ctx = tool_ctx({"requirements": {"project_name": "invoice_desk", "decisions": DECISIONS},
                    "decisions_answered": {"storage": {"title": "x", "choice": "SQLite"}}})
    out = await present_decisions(ctx)
    pending = ctx.state["pending_decisions"]
    assert out["status"] == "success" and out["step"]["number"] == 1 and pending["round"] == 1
    assert [q["id"] for q in pending["questions"]] == ["output_channels", "budget"]  # storage already answered
    assert pending["questions"][0]["multi_select"] and [o["id"] for o in pending["questions"][0]["options"]] == ["A", "B", "C"]
    assert "- [ ] B) Email (Recommended)" in out["markdown"] and "Other: write your own" in out["markdown"]


@pytest.mark.parametrize(("reply", "expected"), [
    ('Selected...\n\nDECISIONS_JSON: {"answers": {"output_channels": {"options": ["A", "C"]}, "budget": {"custom": "$12 hard cap"}}}',
     {"output_channels": "Chat, CSV export", "budget": "$12 hard cap"}),
    ("1C 2B", {"output_channels": "CSV export", "budget": "$20 / month, hard cap"}),
    ("use defaults", {"output_channels": "Email", "budget": "$5 / month, alert"}),
])
async def test_apply_decisions_accepts_every_reply_form(rt, reply, expected):
    from agent_builder.tools.build_pipeline import apply_decisions, present_decisions

    ctx = tool_ctx({"requirements": {"project_name": "invoice_desk", "decisions": DECISIONS[1:]}})
    await present_decisions(ctx)
    out = await apply_decisions(reply, ctx)
    assert out["status"] == "success" and ctx.state["pending_decisions"] == {}
    assert {k: v["choice"] for k, v in ctx.state["decisions_answered"].items()} == expected
    audit = rt.module("auditability")
    await audit.flush()
    assert any(e.event_type == "DESIGN_DECISIONS" for e in audit.repository.events)


async def test_explicit_choices_are_remembered_as_preferences(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, present_decisions

    ctx = tool_ctx({"requirements": {"decisions": DECISIONS[:1]}})
    await present_decisions(ctx)
    await apply_decisions('DECISIONS_JSON: {"answers": {"storage": {"option": "B"}}}', ctx)
    recall = await rt.invoke("long_term_memory", "recall", {"query": "records live preference"}, ADMIN)
    assert any("JSON files" in i["content"] for i in recall.data["items"])


def test_build_status_walks_the_interview_then_the_build(rt):
    from agent_builder.tools.build_pipeline import build_status

    def phase(state, user=""):
        return build_status(tool_ctx(state, user))["phase"]

    s: dict = {}
    assert phase(s) == "classify"
    s["intent"] = {"category": "create_agent"}
    # The request guardrail is deterministic: build_status runs it itself (no orchestrator round-trip).
    assert phase(s, "Build an invoice desk agent") == "interview:discovery"
    assert any(e.get("stage") == "request" and e.get("approved") for e in s["guardrail_history"])
    assert s["build_phase"]["step_index"] == 0 and len(s["build_phase"]["steps"]) == 7
    s["requirements"] = {"project_name": "invoice_desk", "decisions": DECISIONS[:1], "is_complete": False}
    assert phase(s) == "present_decisions"
    s["pending_decisions"] = {"round": 1, "questions": DECISIONS[:1]}
    assert phase(s, "What does SQLite mean?") == "awaiting_user"
    assert phase(s, "A, B") == "apply_decisions"
    assert phase(s, "### 1. Storage\n- [x] A) SQLite") == "apply_decisions"
    s["pending_decisions"] = {}
    s["decisions_answered"] = {"storage": {"step": "discovery", "choice": "SQLite"}}
    s["interview"] = {"index": 1, "completed": ["discovery"]}
    assert phase(s) == "interview:io"
    s["interview"] = {"index": 2, "completed": ["discovery", "io"]}
    assert phase(s) == "design_research"  # grounded before proposing a topology
    s["design_research"] = {"answer": "..."}
    assert phase(s) == "interview:topology"
    s["interview"] = {"index": 6, "completed": ["discovery", "io", "topology", "agents", "modules", "governance"]}
    assert phase(s) == "compile_requirements"
    s["requirements"] = {"project_name": "invoice_desk", "decisions": [], "is_complete": True}
    assert phase(s) == "review_design"  # idea provider + design critic before the spec is compiled
    s["design_review"] = {"stage": "design", "score": 6, "verdict": "revise",
                          "issues": [{"severity": "major", "problem": "no export", "fix": "add export_csv"}]}
    s["design_ideas"] = {"ideas": []}
    assert phase(s) == "compile_specification"  # no refine round: the fixes go into the spec
    s["interview"]["approved"] = True
    s["guardrail_history"].append({"stage": "design", "approved": True})
    assert phase(s) == "agent_cards"
    s["agent_cards"] = {"invoice_desk": {"invoice_desk": {"name": "invoice_desk"}}}
    assert phase(s) == "code_generation"
    s["generated_files"] = ["invoice_desk/agent.py"]
    assert phase(s) == "verification"
    s["verification"] = {"project": "invoice_desk", "ok": True}
    assert phase(s) == "review_code"
    s["code_review"] = {"stage": "code", "project": "invoice_desk", "score": 5, "verdict": "revise",
                        "issues": [{"severity": "blocker", "problem": "fake results", "fix": "query the db"}]}
    assert phase(s) == "code_fix" and s["verification"] == {}  # fixed code must be verified again
    assert phase(s) == "verification"
    s["verification"] = {"project": "invoice_desk", "ok": True}
    assert phase(s) == "finalize"
    s["build_record"] = {"project": "invoice_desk", "provisioned": True}
    assert phase(s) == "deliver" and s["build_phase"]["build_stage"] == 5


async def test_interview_advances_one_step_per_answer_and_caps_questions(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, present_decisions

    ctx = tool_ctx({"requirements": {"project_name": "invoice_desk", "decisions": DECISIONS}})
    out = await present_decisions(ctx)
    assert out["question_count"] == 2 and out["markdown"].startswith("**Step 1 of 7")
    await apply_decisions("use defaults", ctx)
    assert ctx.state["interview"]["index"] == 1 and ctx.state["interview"]["completed"] == ["discovery"]
    assert {e["step"] for e in ctx.state["decisions_answered"].values()} == {"discovery"}


async def test_checkbox_reply_with_other_text_is_parsed(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, present_decisions

    ctx = tool_ctx({"requirements": {"decisions": DECISIONS[1:]}})
    await present_decisions(ctx)
    reply = ("### 1. Where should reports go? (select all that apply)\n- [x] A) Chat\n- [ ] B) Email (Recommended)\n"
             "- [x] C) CSV export\n### 2. Monthly LLM budget? (select one)\n- [ ] A) $5 / month, alert\n- [x] Other: $50 hard cap")
    await apply_decisions(reply, ctx)
    got = ctx.state["decisions_answered"]
    assert got["output_channels"]["option_ids"] == ["A", "C"]
    assert got["budget"]["custom"] and got["budget"]["choice"] == "$50 hard cap"


async def test_modules_step_is_a_full_checklist_and_drives_the_spec(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, compile_specification, present_decisions
    from agent_builder.tools.interview import PLATFORM_MODULES

    q = {"id": "platform_modules", "title": "Which modules?", "multi_select": True, "category": "platform",
         "options": [{"label": "Agentic RAG knowledge base", "description": "answer from the FAQ", "recommended": True},
                     {"label": "Zendesk MCP server", "description": "read tickets", "recommended": True}]}
    req = {"project_name": "Support Desk", "goal": "Triage tickets", "architecture": "coordinator",
           "root_agent": {"name": "support_desk", "role": "coordinator"},
           "sub_agents": [{"name": "faq_answerer", "role": "answers questions from the FAQ knowledge"},
                          {"name": "escalation_agent", "role": "escalates urgent tickets"}]}
    ctx = tool_ctx({"requirements": {**req, "decisions": [q]}, "interview": {"index": 4, "completed": []}})
    out = await present_decisions(ctx)
    options = ctx.state["pending_decisions"]["questions"][0]["options"]
    assert out["step"]["key"] == "modules" and len(options) == 1 + len(PLATFORM_MODULES)  # every catalog module offered
    await apply_decisions("use defaults", ctx)  # multi-select default = every recommended option
    assert ctx.state["interview"]["index"] == 5

    ctx.state["requirements"] = {**req, "is_complete": True, "decisions": []}
    spec = await compile_specification(ctx)
    cfg = ctx.state["architecture_spec"]["config"]
    assert spec["status"] == "success" and spec["project"] == "support_desk" and spec["enabled_modules"] == ["agentic_rag"]
    assert cfg["modules"]["agentic_rag"]["used_by"] == ["faq_answerer"]
    assert cfg["integrations"][0]["name"] == "Zendesk MCP server"
    assert "Approve & build" in spec["decision_markdown"] and ctx.state["pending_decisions"]["step"]["key"] == "compile"


async def test_spec_approval_and_revision(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, compile_specification

    req = {"project_name": "desk", "is_complete": True, "root_agent": {"name": "desk"}}
    base = {"requirements": req, "interview": {"index": 6, "completed": ["discovery", "io", "topology", "agents", "modules", "governance"]},
            "decisions_answered": {"budget": {"step": "governance", "title": "Budget", "choice": "$5"}}}
    ctx = tool_ctx(json.loads(json.dumps(base)))
    await compile_specification(ctx)
    await apply_decisions('DECISIONS_JSON: {"answers": {"spec_approval": {"option": "E"}}}', ctx)
    assert ctx.state["interview"]["index"] == 5 and ctx.state["interview"]["return_to_compile"]
    assert "budget" not in ctx.state["decisions_answered"] and not ctx.state["architecture_spec"]

    ctx = tool_ctx(json.loads(json.dumps(base)))
    await compile_specification(ctx)
    await apply_decisions("use defaults", ctx)
    assert ctx.state["interview"]["approved"]


async def test_step_plan_card_comes_first_and_records_the_users_steps(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, build_status, present_decisions

    state = {"intent": {"intent": "create_agent"}, "guardrail_report": {"stage": "request", "approved": True},
             "requirements": {"project_name": "desk", "decisions": DECISIONS}}
    assert build_status(tool_ctx(state, plan=None))["phase"] == "plan_steps"
    ctx = tool_ctx(state, plan=None)
    out = await present_decisions(ctx)
    q = ctx.state["pending_decisions"]["questions"][0]
    assert out["status"] == "success" and q["id"] == "step_plan" and q["multi_select"] and len(q["options"]) == 8
    assert [o["label"] for o in q["options"] if o["recommended"]] == ["Final compilation"]
    # Ticks topology (C) and modules (E): the user decides those two, the AI the rest.
    await apply_decisions('DECISIONS_JSON: {"answers": {"step_plan": {"options": ["C", "E"]}}}', ctx)
    assert ctx.state["interview"]["plan"] == ["topology", "modules"] and ctx.state["interview"]["index"] == 0
    assert "step_plan" not in ctx.state["decisions_answered"]  # a workflow choice, not a design decision
    assert ctx.state["requirements"]["decisions"] == DECISIONS  # the first step's questions are kept

    ctx = tool_ctx({"requirements": {"decisions": DECISIONS}}, plan=None)
    await present_decisions(ctx)
    await apply_decisions("use defaults", ctx)
    assert ctx.state["interview"]["plan"] == ["compile"]

    ctx = tool_ctx({"requirements": {"decisions": DECISIONS}}, plan=None)
    await present_decisions(ctx)
    await apply_decisions('DECISIONS_JSON: {"answers": {"step_plan": {"options": ["A", "H"]}}}', ctx)
    assert ctx.state["interview"]["plan"] == []  # "None: let the AI decide everything" wins


async def test_steps_the_user_did_not_pick_are_decided_by_the_ai_without_stopping(rt):
    from agent_builder.tools.build_pipeline import build_status, present_decisions

    state = {"intent": {"intent": "create_agent"}, "guardrail_report": {"stage": "request", "approved": True},
             "requirements": {"project_name": "desk", "decisions": DECISIONS[:2]}}
    status = build_status(tool_ctx(state, plan=["compile"]))
    assert status["phase"] == "present_decisions" and status["decided_by"] == "ai"
    ctx = tool_ctx(state, plan=["compile"])
    out = await present_decisions(ctx)
    assert out["status"] == "auto_applied" and ctx.state["pending_decisions"] == {}
    assert ctx.state["interview"]["index"] == 1 and ctx.state["interview"]["completed"] == ["discovery"]
    answered = ctx.state["decisions_answered"]
    assert answered["storage"]["choice"] == "SQLite" and answered["output_channels"]["choice"] == "Email"
    assert all(e["defaulted"] for e in answered.values())
    build_status(ctx)
    journey = ctx.state["build_phase"]
    assert journey["plan_chosen"] and [s["auto"] for s in journey["steps"]] == [True] * 6 + [False]


async def test_final_review_left_to_the_ai_approves_and_a_revision_hands_the_step_back(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, compile_specification

    req = {"project_name": "desk", "is_complete": True, "root_agent": {"name": "desk"}}
    ctx = tool_ctx({"requirements": req, "interview": {"index": 6, "completed": ALL_STEPS[:6]}}, plan=[])
    out = await compile_specification(ctx)
    assert out["status"] == "auto_approved" and ctx.state["interview"]["approved"] and out["markdown"]

    ctx = tool_ctx({"requirements": req, "interview": {"index": 6, "completed": ALL_STEPS[:6]}}, plan=["compile"])
    await compile_specification(ctx)
    await apply_decisions('DECISIONS_JSON: {"answers": {"spec_approval": {"option": "B"}}}', ctx)
    assert ctx.state["interview"]["plan"] == ["compile", "topology"]  # revising topology: now the user decides it


def test_spec_enables_modules_the_design_relies_on():
    from agent_builder.tools.interview import compile_spec

    req = {"project_name": "desk", "root_agent": {"name": "desk", "instruction_outline": "Check core_spend_status, then core_knowledge_search."}}
    decisions = {"platform_modules": {"step": "modules", "selected": [{"label": "RAG", "module_id": "agentic_rag"}]},
                 "budget": {"step": "governance", "title": "Monthly LLM budget", "choice": "$25 hard cap"}}
    spec = compile_spec(req, decisions)
    assert spec["enabled_modules"] == ["agentic_rag", "finops"]  # core_knowledge_search is already covered by RAG
    assert spec["config"]["implied_modules"] == ["finops"]


def test_generated_workers_only_get_enabled_module_tools():
    from tectonic_runtime.adk_tools import worker_tools

    names = {t.__name__ for t in worker_tools("desk", modules=["agentic_rag", "finops"])}
    assert {"core_ask_knowledge", "core_knowledge_search", "core_spend_status"} <= names
    assert not names & {"core_remember", "core_call_tool", "core_classify_intent", "core_audit_trail"}
    assert len(worker_tools("desk")) > len(names)


async def test_design_research_seeds_playbook_once_and_cites_it(rt):
    from agent_builder.tools.build_pipeline import PLAYBOOK_TITLE, design_research

    ctx = tool_ctx()
    out = await design_research("Which architecture for an assistant with billing and reporting workflows?", ctx)
    assert out["status"] == "success" and PLAYBOOK_TITLE in out["sources"]
    await design_research("storage choices", ctx)
    titles = [d["title"] for d in rt.module("agentic_rag").documents.values()]
    assert titles.count(PLAYBOOK_TITLE) == 1 and ctx.state["design_research"]["question"] == "storage choices"


async def test_finalize_build_provisions_team_from_decisions(rt):
    from agent_builder.tools.build_pipeline import finalize_build
    from tectonic_runtime.adk_tools import CORE_MODULE_INSTRUCTIONS

    cards = {"invoice_desk": {"name": "invoice_desk", "description": "Coordinator", "instruction": "Route billing requests.", "tools": []},
             "refund_agent": {"name": "refund_agent", "description": "Refunds", "instruction": "Handle refunds safely.", "tools": [{"name": "issue_refund"}]}}
    ctx = tool_ctx({
        "requirements": {"project_name": "invoice_desk", "goal": "Run the invoice desk", "architecture": "coordinator",
                         "tools": [{"name": "issue_refund", "description": "Refund an order"}], "acceptance_criteria": ["refund needs approval"]},
        "decisions_answered": {"budget": {"title": "Monthly LLM budget?", "category": "platform", "choice": "$20 / month, hard cap"}},
        "agent_cards": {"invoice_desk": cards}, "generated_files": ["a", "b"],
    })
    out = await finalize_build("invoice_desk", ctx)
    assert out["status"] == "success"
    assert out["steps"]["budget"]["limit"] == 20.0 and out["steps"]["budget"]["enforcement"] == "block"
    assert out["steps"]["knowledge"]["namespace"] == "invoice_desk"
    assert {p["prompt"] for p in out["steps"]["prompts"]} == {"invoice_desk.invoice_desk", "invoice_desk.refund_agent"}

    # The managed prompt is exactly what the generated agent will request (so code-sync stays aligned).
    po = rt.module("promptops")
    template, vid = await po.resolve_template("invoice_desk.refund_agent", "w1", "Handle refunds safely.\n" + CORE_MODULE_INSTRUCTIONS)
    assert vid and template.startswith("Handle refunds safely.")
    assert ctx.state["build_record"]["provisioned"]

    trail = (await rt.invoke("auditability", "query", {"event_type": "BUILD_COMPLETED"}, ADMIN)).data["events"]
    assert trail and trail[0]["payload"]["spec_sha256"] == ctx.state["build_record"]["spec_sha256"]
    blueprint = (await rt.invoke("agentic_rag", "documents_list", {"namespace": "shared"}, ADMIN)).data["documents"]
    assert any(d["title"] == "Blueprint: invoice_desk" for d in blueprint)


async def test_generated_worker_instruction_is_served_by_promptops(rt):
    from agent_builder.sub_agents.code_generator.tools import _GEN_CORE_MODULES

    namespace: dict = {}
    source = _GEN_CORE_MODULES.replace("{project}", "invoice_desk").replace("{enabled_modules}", "None")
    exec(compile(source, "core_modules.py", "exec"), namespace)
    # Regression guard: a broken runtime import used to leave every generated agent with no platform tools.
    from tectonic_runtime.adk_tools import worker_tools

    assert namespace["CORE_MODULE_TOOLS"] and len(namespace["CORE_MODULE_TOOLS"]) == len(worker_tools("invoice_desk"))
    assert namespace["CORE_MODULE_INSTRUCTIONS"]
    provider = namespace["managed_instruction"]("refund_agent", "Handle refunds for {customer}.", ["customer"])
    ctx = SimpleNamespace(state={"customer": "ACME"}, session=SimpleNamespace(id="s1"))
    assert await provider(ctx) == "Handle refunds for ACME."
    reg = await rt.invoke("promptops", "register", {"prompt_name": "invoice_desk.refund_agent", "template": "V2 refunds for {customer}."}, ADMIN)
    await rt.invoke("promptops", "promote", {"version_id": reg.data["version_id"]}, ADMIN)
    assert await provider(SimpleNamespace(state={"customer": "ACME"}, session=SimpleNamespace(id="s2"))) == "V2 refunds for ACME."


def test_requirements_schema_converts_legacy_questions():
    from agent_builder.shared_libraries.types import Requirements, fix_requirements_json

    r = Requirements.model_validate({"is_complete": True, "questions_for_user": [
        "Storage:\n- [ ] A) SQLite (Recommended) — durable\n- [ ] B) JSON — simple\n- [ ] C) Other: [custom]"]})
    assert r.decisions[0].id == "storage" and [o.label for o in r.decisions[0].options] == ["SQLite", "JSON"]
    assert r.is_complete is False  # open decisions can never be "complete"
    assert json.loads(fix_requirements_json("not json at all"))["decisions"]
