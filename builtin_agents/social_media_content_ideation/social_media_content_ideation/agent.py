"""Llm agent definition: social_media_content_ideation."""

from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool

from . import prompt
from .shared_libraries.constants import MODEL
from .shared_libraries.core_modules import (
    CORE_MODULE_INSTRUCTIONS,
    CORE_MODULE_TOOLS,
    managed_instruction,
)
from .tools.apify_client import apify_status
from .tools.creative import batch_generate_image, post_generate_image
from .tools.research_store import (
    load_client_brief,
    load_research_state,
    load_social_dataset,
    save_client_brief,
    save_research_state,
)
from .sub_agents.competitor_scout.agent import competitor_scout
from .sub_agents.social_harvester.agent import social_harvester
from .sub_agents.trend_analyst.agent import trend_analyst
from .sub_agents.insight_analyst.agent import insight_analyst
from .sub_agents.content_strategist.agent import content_strategist


def _as_tool(agent: LlmAgent) -> AgentTool:
    """Run a specialist as a tool so the coordinator keeps control between workflow states.

    The specialist is copied with its parent link removed: inside the tool run it must return its result
    instead of handing control to another agent.
    """
    return AgentTool(
        agent=agent.model_copy(
            update={
                "parent_agent": None,
                "disallow_transfer_to_parent": True,
                "disallow_transfer_to_peers": True,
            }
        )
    )


root_agent = LlmAgent(
    name="social_media_content_ideation",
    description=(
        "Generates data-backed social media content ideas: discovers 3-5 competitors, scrapes their recent "
        "Instagram, YouTube and Facebook posts with Apify, analyses viral trends and engagement patterns, and "
        "returns a multi-platform content strategy with ready-to-post ideas and sample visuals."
    ),
    model=MODEL,
    instruction=managed_instruction(
        "social_media_content_ideation",
        prompt.INSTRUCTION + CORE_MODULE_INSTRUCTIONS,
        prompt.STATE_READS,
    ),
    tools=[
        _as_tool(competitor_scout),
        _as_tool(social_harvester),
        _as_tool(trend_analyst),
        _as_tool(insight_analyst),
        _as_tool(content_strategist),
        batch_generate_image,
        post_generate_image,
        save_client_brief,
        load_client_brief,
        save_research_state,
        load_research_state,
        load_social_dataset,
        apify_status,
        *CORE_MODULE_TOOLS,
    ],
    output_key="content_plan",
    sub_agents=[
        competitor_scout,
        social_harvester,
        trend_analyst,
        insight_analyst,
        content_strategist,
    ],
)
