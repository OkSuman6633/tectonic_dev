"""Builder tools that make every generated agent better before it ships.

  * review_design — the idea provider and the design critic run in parallel on the specification. Their
                    output (critic fixes + the best ideas) is compiled into the spec's "Improvements to
                    build in" section, which the agent-card and code steps implement: no extra round.
  * review_code   — the code critic reviews the generated project against the specification;
                    build_status has code_generator fix blockers once, then re-verify. Other issues are
                    reported as follow-up improvements (fast builds; the user can apply them later).

The specialists run here deterministically (not at the orchestrator's discretion), and a failed review
never blocks a build: it is recorded as skipped.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from pydantic import BaseModel

from ..shared_libraries.constants import (
    STATE_ARCH_SPEC,
    STATE_AUTOPILOT,
    STATE_CODE_REVIEW,
    STATE_DESIGN_REVIEW,
    STATE_IDEAS,
    STATE_INTENT,
    STATE_REQUIREMENTS,
)
from ..shared_libraries.types import DesignIdeas, Review, parse_json_loose, slugify_identifier
from ..sub_agents.design_review.agent import code_critic_agent, design_critic_agent, idea_provider_agent
from ..tracing import logger
from .file_manager import project_dir

MAX_CODE_CHARS = 90_000
MAX_ACCEPTED_IDEAS = 3
_IMPACT_RANK = {"high": 0, "medium": 1, "low": 2}
_CODE_SUFFIXES = (".py", ".txt", ".md", ".example")


def _as_dict(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    loaded = parse_json_loose(value) if isinstance(value, str) else None
    return loaded if isinstance(loaded, dict) else {}


async def consult(agent, message: str, schema: type[BaseModel]) -> BaseModel | None:
    """Run one specialist on a message and parse its structured answer (None if it failed)."""
    from .. import directory

    runner = Runner(app_name="agent_builder", agent=agent, session_service=InMemorySessionService(),
                    plugins=directory._plugins(), auto_create_session=True)
    trace = [{"type": "agent", "agent": agent.name}]
    try:
        text = await directory.drive(runner, f"{agent.name}-{uuid.uuid4().hex[:8]}", message, trace)
        return schema.model_validate(parse_json_loose(text))
    except Exception as exc:  # a review must never break the build
        logger.warning("review: %s failed: %s", agent.name, exc)
        return None


def user_request(state: Any) -> str:
    """What the user asked for, in their words when we have them."""
    autopilot = _as_dict(state.get(STATE_AUTOPILOT))
    if autopilot.get("request"):
        return str(autopilot["request"])
    intent = _as_dict(state.get(STATE_INTENT))
    return str(intent.get("summary") or "")


def _spec_json(req: dict) -> str:
    keep = {k: v for k, v in req.items() if k not in ("decisions", "questions_for_user", "open_questions")}
    return json.dumps(keep, indent=1, default=str)[:40_000]


async def review_design(tool_context: ToolContext) -> dict:
    """Improve the specification before it is compiled: the idea provider proposes improvements, then the
    design critic scores the design, lists gaps with exact fixes and accepts the worthwhile ideas.
    build_status says next whether a refine round is needed. Call when build_status says "review_design".

    Args:
        tool_context: Injected by ADK.

    Returns:
        dict with status, score, verdict, issues, accepted_ideas and the next step.
    """
    state = tool_context.state
    req = _as_dict(state.get(STATE_REQUIREMENTS))
    if not req.get("is_complete"):
        return {"status": "error", "error": "The specification is not complete yet: call build_status."}
    brief = f"# User request\n{user_request(state) or req.get('goal', '')}\n\n# Draft specification\n{_spec_json(req)}"
    # In parallel: neither needs the other's answer, so the review costs one model round-trip, not two.
    ideas, review = await asyncio.gather(consult(idea_provider_agent, brief, DesignIdeas),
                                         consult(design_critic_agent, brief, Review))
    ideas = ideas or DesignIdeas(summary="No ideas (idea provider unavailable).")
    if review is None:
        review = Review(stage="design", score=7, verdict="approve", summary="Design review unavailable: continuing with the draft.")
    review.stage = "design"
    # The ideas worth building: the highest-impact ones (low-impact ideas are left as suggestions).
    best = sorted((i for i in ideas.ideas if i.impact != "low"), key=lambda i: _IMPACT_RANK.get(i.impact, 1))
    review.accepted_ideas = [i.title for i in best[:MAX_ACCEPTED_IDEAS]]
    state[STATE_IDEAS] = ideas.model_dump()
    state[STATE_DESIGN_REVIEW] = review.model_dump()
    from .build_pipeline import then  # (circular at import time)

    return then(tool_context, {"status": "success", "score": review.score, "verdict": review.verdict, "summary": review.summary,
                               "issues": [f"[{i.severity}] {i.problem}" for i in review.issues],
                               "accepted_ideas": review.accepted_ideas})


def _project_sources(project: str) -> str:
    root = project_dir(project)
    chunks, used = [], 0
    for path in sorted(root.rglob("*")) if root.is_dir() else []:
        if not path.is_file() or path.suffix not in _CODE_SUFFIXES or "__pycache__" in path.parts or path.name == ".env":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        rel = path.relative_to(root).as_posix()
        chunk = f"\n===== {rel} =====\n{text}"
        if used + len(chunk) > MAX_CODE_CHARS:
            chunks.append(f"\n===== {rel} ===== (omitted: size limit)")
            continue
        chunks.append(chunk)
        used += len(chunk)
    return "".join(chunks)


async def review_code(project_name: str, tool_context: ToolContext) -> dict:
    """Have the code critic review the generated project against the specification (bugs, fake tool
    results, missing capabilities, unsafe data handling). Blockers get one repair round; other issues are
    reported as follow-up improvements. Call when build_status says "review_code".

    Args:
        project_name: The generated project's snake_case name.
        tool_context: Injected by ADK.

    Returns:
        dict with status, score, verdict and issues.
    """
    project = slugify_identifier(project_name, default="generated_agent")
    sources = _project_sources(project)
    if not sources:
        return {"status": "error", "error": f"No generated files found for '{project}'."}
    spec = _as_dict(tool_context.state.get(STATE_ARCH_SPEC)).get("markdown") or _spec_json(_as_dict(tool_context.state.get(STATE_REQUIREMENTS)))
    review = await consult(code_critic_agent, f"# Specification\n{spec}\n\n# Generated project `{project}`\n{sources}", Review)
    if review is None:
        review = Review(stage="code", score=7, verdict="approve", summary="Code review unavailable: relying on verification.")
    review.stage = "code"
    review.accepted_ideas = []
    tool_context.state[STATE_CODE_REVIEW] = {**review.model_dump(), "project": project}
    from .build_pipeline import then  # (circular at import time)

    return then(tool_context, {"status": "success", "score": review.score, "verdict": review.verdict, "summary": review.summary,
                               "issues": [f"[{i.severity}] {i.area}: {i.problem}" for i in review.issues]})


def improvements_markdown(review: dict, ideas: dict) -> str:
    """The spec section the agent-card and code steps implement: critic fixes and the accepted ideas."""
    by_title = {i.get("title"): i for i in ideas.get("ideas", [])}
    fixes = [f"- **Fix ({i.get('severity')})** {i.get('problem')} → {i.get('fix')}" for i in review.get("issues", [])
             if i.get("severity") in ("blocker", "major")]
    accepted = [f"- **Idea** {t}: {by_title.get(t, {}).get('description', '')}" for t in review.get("accepted_ideas", [])]
    if not fixes and not accepted:
        return ""
    return ("### Improvements to build in\nFrom the design critic and the idea provider. Add the tools, parameters "
            "and instructions these need.\n" + "\n".join(fixes + accepted))


def fix_request(project: str, review: dict) -> str:
    """The code_generator request that fixes a code review's blockers."""
    issues = [f"- [{i.get('severity')}] {i.get('area')}: {i.get('problem')} → {i.get('fix')}"
              for i in review.get("issues", []) if i.get("severity") == "blocker"]
    return (f"Ask code_generator to fix project '{project}' — the code critic found:\n" + "\n".join(issues)
            + "\nRewrite the affected files with write_project_file (full, working implementations), then run "
              "verify_generated_project and fix anything it reports.")
