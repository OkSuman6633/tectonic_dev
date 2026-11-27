"""Llm agent definition: competitor_scout."""

from google.adk.agents import LlmAgent

from ...shared_libraries.constants import MODEL
from ...shared_libraries.core_modules import (
    CORE_MODULE_INSTRUCTIONS,
    CORE_MODULE_TOOLS,
    managed_instruction,
)
from ...tools.research_store import save_research_state
from ...tools.web_search import discover_competitors, find_brand_profiles, search_web
from . import prompt

competitor_scout = LlmAgent(
    name="competitor_scout",
    description=(
        "Finds 3-5 direct competitors for a company and resolves their Instagram, YouTube and Facebook "
        "profiles from live web search, with the evidence and a confidence flag per handle."
    ),
    model=MODEL,
    instruction=managed_instruction(
        "competitor_scout",
        prompt.INSTRUCTION + CORE_MODULE_INSTRUCTIONS,
        prompt.STATE_READS,
    ),
    tools=[
        discover_competitors,
        find_brand_profiles,
        search_web,
        save_research_state,
        *CORE_MODULE_TOOLS,
    ],
    output_key="competitor_set",
)
