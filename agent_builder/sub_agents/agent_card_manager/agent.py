"""Sub-Agent 4: manages Agent Cards, the tool registry and sub-agent links."""

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext

from ...shared_libraries.constants import MODEL, STATE_AGENT_CARDS, STATE_DECISIONS, STATE_PROJECT_NAME, STATE_REQUIREMENTS, STATE_RESEARCH
from ...tools.memory import load_profile, render_state_block
from ...tracing import TRACE_CALLBACKS
from . import prompt
from .tools import (
    create_agent_card,
    get_agent_card,
    link_sub_agent,
    list_agent_cards,
    register_tool,
    update_agent_card,
    validate_agent_registry,
)


def _instruction(context: ReadonlyContext) -> str:
    return prompt.AGENT_CARD_PROMPT + render_state_block(
        context, (STATE_PROJECT_NAME, STATE_REQUIREMENTS, STATE_DECISIONS, STATE_RESEARCH, STATE_AGENT_CARDS)
    )


agent_card_manager_agent = LlmAgent(
    name="agent_card_manager",
    model=MODEL,
    description="Creates, updates and links Agent Cards (metadata, tool registry, sub-agent links) from approved requirements.",
    instruction=_instruction,
    tools=[
        load_profile,
        create_agent_card,
        get_agent_card,
        list_agent_cards,
        update_agent_card,
        link_sub_agent,
        register_tool,
        validate_agent_registry,
    ],
    **TRACE_CALLBACKS,
)
