"""Llm agent definition: insight_analyst."""

from google.adk.agents import LlmAgent

from ...shared_libraries.constants import MODEL
from ...shared_libraries.core_modules import (
    CORE_MODULE_INSTRUCTIONS,
    CORE_MODULE_TOOLS,
    managed_instruction,
)
from ...tools.analytics import analyze_engagement_patterns
from ...tools.research_store import list_social_datasets, load_social_dataset, save_research_state
from . import prompt

insight_analyst = LlmAgent(
    name="insight_analyst",
    description=(
        "Computes what earns engagement in the harvested posts - format lift, hook patterns, caption lengths, "
        "posting windows, hashtags, audio and competitor benchmarks - as the evidence base for the strategy."
    ),
    model=MODEL,
    instruction=managed_instruction(
        "insight_analyst",
        prompt.INSTRUCTION + CORE_MODULE_INSTRUCTIONS,
        prompt.STATE_READS,
    ),
    tools=[
        analyze_engagement_patterns,
        load_social_dataset,
        list_social_datasets,
        save_research_state,
        *CORE_MODULE_TOOLS,
    ],
    output_key="engagement_insights",
)
