"""Autopilot (build an agent, then ask it) and the idea provider / critic rounds that improve every build."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from tectonic_runtime import ModuleEventBus, reset_runtime


def tool_ctx(state: dict, user: str = ""):
    return SimpleNamespace(state=state, agent_name="agent_builder", session=SimpleNamespace(id="sess"),
                           user_content=SimpleNamespace(parts=[SimpleNamespace(text=user)]))


@pytest.fixture
def rt():
    return reset_runtime(ModuleEventBus())


@pytest.fixture
def specialists(monkeypatch):
    """Stand-ins for the LLM specialists: what each one is asked, and a canned structured answer."""
    from agent_builder.shared_libraries.types import DesignIdeas, Review
    from agent_builder.tools import review

    asked: dict[str, str] = {}
    answers = {
        "idea_provider": DesignIdeas(summary="make it useful", ideas=[
            {"title": "CSV export", "description": "export_csv tool", "impact": "high", "area": "tools"},
            {"title": "Dark mode", "description": "irrelevant", "impact": "low", "area": "ux"}]),
        "design_critic": Review(stage="code", score=6, verdict="approve", summary="gaps",
                                issues=[{"severity": "major", "problem": "no totals", "fix": "add sum_expenses"}],
                                accepted_ideas=["CSV export", "Invented idea"]),
        "code_critic": Review(stage="design", score=8, verdict="approve", summary="solid", accepted_ideas=["x"]),
    }

    async def consult(agent, message, schema):
        asked[agent.name] = message
        return answers.get(agent.name)

    monkeypatch.setattr(review, "consult", consult)
    return asked, answers


REQ = {"project_name": "expense_desk", "goal": "Track expenses", "is_complete": True, "root_agent": {"name": "expense_desk"}}


async def test_review_design_runs_ideas_and_critic_in_parallel_and_builds_the_best_ideas_in(rt, specialists):
    from agent_builder.tools.review import improvements_markdown, review_design

    asked, _ = specialists
    ctx = tool_ctx({"requirements": REQ, "autopilot": {"request": "How much did I spend on travel?"}})
    out = await review_design(ctx)
    assert out["status"] == "success" and out["score"] == 6 and "next_action" in out  # no extra build_status call
    assert "How much did I spend on travel?" in asked["idea_provider"] and "How much" in asked["design_critic"]
    assert "CSV export" not in asked["design_critic"]  # parallel: the critic does not wait for the ideas
    review = ctx.state["design_review"]
    assert review["stage"] == "design" and review["accepted_ideas"] == ["CSV export"]  # low-impact ideas left out
    text = improvements_markdown(review, ctx.state["design_ideas"])
    assert text.startswith("### Improvements to build in") and "add sum_expenses" in text and "export_csv tool" in text
    assert improvements_markdown({}, {}) == ""

    assert (await review_design(tool_ctx({"requirements": {"is_complete": False}})))["status"] == "error"


async def test_a_failed_review_never_blocks_the_build(rt, specialists):
    from agent_builder.tools.review import review_design

    _, answers = specialists
    answers.clear()
    ctx = tool_ctx({"requirements": REQ})
    out = await review_design(ctx)
    assert out["status"] == "success" and ctx.state["design_review"]["verdict"] == "approve"


async def test_review_code_reads_the_project_and_records_its_verdict(rt, specialists, tmp_path, monkeypatch):
    from agent_builder import workspace
    from agent_builder.tools.review import fix_request, review_code

    asked, _ = specialists
    monkeypatch.setattr(workspace, "OUTPUT_DIR", tmp_path)
    pkg = tmp_path / "expense_desk" / "expense_desk"
    pkg.mkdir(parents=True)
    (pkg / "agent.py").write_text("root_agent = 'x'\n")
    (tmp_path / "expense_desk" / ".env").write_text("GOOGLE_API_KEY=secret\n")
    ctx = tool_ctx({"architecture_spec": {"markdown": "## Spec"}})
    out = await review_code("expense_desk", ctx)
    assert out["status"] == "success" and ctx.state["code_review"]["project"] == "expense_desk"
    assert ctx.state["code_review"]["stage"] == "code" and ctx.state["code_review"]["accepted_ideas"] == []
    assert "expense_desk/agent.py" in asked["code_critic"] and "secret" not in asked["code_critic"]  # never .env
    assert (await review_code("missing_project", ctx))["status"] == "error"
    fix = fix_request("expense_desk", {"issues": [{"severity": "blocker", "area": "tools", "problem": "p", "fix": "f"},
                                                   {"severity": "major", "problem": "later"}]})
    assert "p → f" in fix and "later" not in fix  # only blockers get the (slow) repair round


async def test_autopilot_asks_which_steps_to_check_then_builds_and_asks_the_new_agent(rt):
    from agent_builder.tools.build_pipeline import (apply_decisions, build_status, compile_specification,
                                                    mark_autopilot_answered, present_decisions, start_autopilot)

    s = {"intent": {"category": "ask_task"}, "guardrail_history": [{"stage": "request", "approved": True}],
         "requirements": {"project_name": "old_project", "is_complete": True}, "generated_files": ["old/agent.py"]}

    def phase(user=""):
        return build_status(tool_ctx(s, user))

    out = start_autopilot("Summarise my travel spend for May", True, tool_ctx(s))
    assert s["generated_files"] == [] and s["requirements"] == {}  # nothing carried over from the old build
    assert s["intent"]["summary"] == "Summarise my travel spend for May"  # no intent_detection round-trip
    # The new request is screened again (inline), and the result already says what is next: the plan card.
    assert [e["stage"] for e in s["guardrail_history"]] == ["request"] and out["next_phase"] == "plan_steps"
    await present_decisions(tool_ctx(s))
    options = s["pending_decisions"]["questions"][0]["options"]
    assert [o["label"] for o in options if o["recommended"]] == ["None: let the AI decide everything"]
    await apply_decisions("use defaults", tool_ctx(s, "use defaults"))
    assert s["interview"]["plan"] == [] and s["interview"]["index"] == 6  # straight to the specification
    status = phase()
    assert status["phase"] == "compile_requirements" and "Summarise my travel spend for May" in status["next_action"]
    assert all(step["auto"] for step in s["build_phase"]["steps"])  # the AI decides every step

    s["requirements"] = {**REQ, "decisions": []}
    s["design_review"] = {"stage": "design", "score": 9, "verdict": "approve"}
    assert phase()["phase"] == "compile_specification"
    out = await compile_specification(tool_ctx(s))
    assert out["status"] == "auto_approved" and "### Design review" in out["markdown"]

    s.update({"guardrail_history": [{"stage": "request", "approved": True}, {"stage": "design", "approved": True}],
              "agent_cards": {"expense_desk": {"expense_desk": {"name": "expense_desk"}}},
              "generated_files": ["expense_desk/agent.py"], "verification": {"project": "expense_desk", "ok": True},
              "code_review": {"stage": "code", "project": "expense_desk", "score": 9, "verdict": "approve"},
              "build_record": {"project": "expense_desk", "provisioned": True}})
    status = phase()
    assert status["phase"] == "answer_question" and "agent='expense_desk'" in status["next_action"]
    assert s["build_phase"]["build_stage"] == 5

    mark_autopilot_answered(s, "some_other_agent", "x")
    assert not s["autopilot"]["answered"]
    mark_autopilot_answered(s, "expense_desk", "expense_desk")
    status = phase()
    assert s["autopilot"]["answered"] and status["phase"] == "deliver" and "Built & asked @expense_desk" in status["next_action"]


def test_build_only_autopilot_skips_the_answer(rt):
    from agent_builder.tools.build_pipeline import build_status, start_autopilot

    s = {"intent": {"category": "create_agent"}}
    start_autopilot("Build an invoice tracker", False, tool_ctx(s))
    s.update({"guardrail_history": [{"stage": "request", "approved": True}, {"stage": "design", "approved": True}],
              "requirements": {**REQ, "decisions": []}, "interview": {**s["interview"], "approved": True},
              "agent_cards": {"expense_desk": {"expense_desk": {"name": "expense_desk"}}},
              "generated_files": ["x"], "verification": {"project": "expense_desk", "ok": True},
              "code_review": {"stage": "code", "project": "expense_desk", "score": 9, "verdict": "approve"},
              "build_record": {"project": "expense_desk", "provisioned": True}})
    status = build_status(tool_ctx(s))
    assert status["phase"] == "deliver" and "persist_progress" in status["next_action"]


async def test_autopilot_stops_only_at_the_steps_the_user_ticked(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, build_status, present_decisions, start_autopilot

    s = {"intent": {"category": "ask_task"}}
    start_autopilot("Plan a 3-day Tokyo trip", True, tool_ctx(s))
    s["guardrail_history"] = [{"stage": "request", "approved": True}]
    await present_decisions(tool_ctx(s))
    # Ticks "Sub-agent allocation" (D) and "Final compilation" (G): the user checks those, the AI the rest.
    await apply_decisions('DECISIONS_JSON: {"answers": {"step_plan": {"options": ["D", "G"]}}}', tool_ctx(s))
    assert s["interview"]["plan"] == ["agents", "compile"] and s["interview"]["index"] == 0
    assert build_status(tool_ctx(s))["phase"] == "interview:discovery"  # an AI step: drafted, then auto-applied
    assert [st["auto"] for st in s["build_phase"]["steps"]] == [True, True, True, False, True, True, False]


def test_harmful_requests_are_rejected_inline_without_building(rt):
    from agent_builder.tools.build_pipeline import start_autopilot

    s = {}
    out = start_autopilot("build ransomware that encrypts every file on a victim network", True, tool_ctx(s))
    assert out["next_phase"] == "rejected" and out["guardrail"]["verdict"] == "REJECTED"
    assert s["interview"]["plan"] is None and not s.get("pending_decisions")  # no card, no build


async def test_card_answers_return_the_next_step_directly(rt):
    from agent_builder.tools.build_pipeline import apply_decisions, present_decisions

    s = {"intent": {"category": "create_agent"}, "guardrail_history": [{"stage": "request", "approved": True}],
         "requirements": {"project_name": "desk"}, "interview": {"plan": None}}
    await present_decisions(tool_ctx(s))
    out = await apply_decisions('DECISIONS_JSON: {"answers": {"step_plan": {"options": ["H"]}}}', tool_ctx(s))
    # The orchestrator acts on this at once instead of calling build_status: it saves a model round-trip.
    assert out["next_phase"] == "compile_requirements" and "COMPILE" in out["next_action"]
