"""Llm agent definition: content_strategist."""

from google.adk.agents import LlmAgent

from ...shared_libraries.constants import MODEL
from ...shared_libraries.core_modules import (
    CORE_MODULE_INSTRUCTIONS,
    CORE_MODULE_TOOLS,
    managed_instruction,
)
from ...tools.research_store import load_research_state, save_research_state
from . import prompt

content_strategist = LlmAgent(
    name="content_strategist",
    description=(
        "Turns the measured engagement insights and trend report into a multi-platform content strategy with "
        "ready-to-post ideas: hook, caption, visual direction, audio, CTA, posting window and evidence per idea."
    ),
    model=MODEL,
    instruction=managed_instruction(
        "content_strategist",
        prompt.INSTRUCTION + CORE_MODULE_INSTRUCTIONS,
        prompt.STATE_READS,
    ),
    tools=[
        load_research_state,
        save_research_state,
        *CORE_MODULE_TOOLS,
    ],
    output_key="content_strategy",
)
