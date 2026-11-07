"""Root Orchestrator Agent: routes a build request through the five specialist sub-agents."""

from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool

from .prompt import ROOT_PROMPT
from .shared_libraries.constants import MODEL
from .sub_agents.agent_card_manager.agent import agent_card_manager_agent
from .sub_agents.code_generator.agent import code_generator_agent
from .sub_agents.guardrails.agent import guardrails
from .sub_agents.intent_detection.agent import intent_detection_agent
from .sub_agents.requirement_understanding.agent import requirement_understanding_agent
from .tools.agent_access import ask_agent, delete_agent, edit_agent, list_agents, undo_agent_edit
from .tools.build_pipeline import (
    apply_decisions,
    build_status,
    compile_specification,
    design_research,
    finalize_build,
    present_decisions,
    start_autopilot,
)
from .tools.file_manager import list_files, read_text_file
from .tools.memory import (
    get_session_summary,
    load_progress,
    persist_progress,
    restore_progress,
    save_progress,
)
from .tools.review import review_code, review_design
from .tools.web_search import web_search
from .tracing import TRACE_CALLBACKS

try:  # shared core-module runtime (tectonic_runtime/); the Builder still runs without it
    from tectonic_runtime.adk_tools import builder_tools
except ImportError as _exc:  # pragma: no cover - runtime package absent
    import logging

    # Loud on purpose: without the runtime every generated agent silently loses its platform modules.
    logging.getLogger(__name__).error("tectonic_runtime unavailable (%s): the Builder and generated agents run "
                                      "without the shared platform modules.", _exc)

    def builder_tools(team: str = "default") -> list:
        return []

MANAGED_PROMPT = "agent_builder.root"


async def managed_instruction(ctx) -> str:
    """The Builder's system prompt, served by PromptOps (versioned, A/B-testable, rollback-able).

    Falls back to the code default (ROOT_PROMPT) if the platform runtime is unavailable.
    """
    try:
        from tectonic_runtime import get_runtime
        from tectonic_runtime.identity import session_id_of

        template, _ = await get_runtime().module("promptops").resolve_template(MANAGED_PROMPT, session_id_of(ctx), ROOT_PROMPT)
        return template
    except Exception:
        return ROOT_PROMPT

root_agent = LlmAgent(
    name="agent_builder",
    model=MODEL,
    description=(
        "Designs and generates runnable local Google ADK agents from a natural-language request: "
        "intent detection, requirements, guardrails, agent cards and code generation."
    ),
    instruction=managed_instruction,
    tools=[
        build_status,
        present_decisions,
        apply_decisions,
        design_research,
        compile_specification,
        finalize_build,
        start_autopilot,
        review_design,
        review_code,
        list_agents,
        ask_agent,
        edit_agent,
        undo_agent_edit,
        delete_agent,
        AgentTool(agent=intent_detection_agent),
        AgentTool(agent=requirement_understanding_agent),
        guardrails,
        AgentTool(agent=agent_card_manager_agent),
        AgentTool(agent=code_generator_agent),
        get_session_summary,
        load_progress,
        save_progress,
        persist_progress,
        restore_progress,
        read_text_file,
        list_files,
        web_search,
        *builder_tools(),
    ],
    **TRACE_CALLBACKS,
)
