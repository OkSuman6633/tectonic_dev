"""Llm agent definition: trend_analyst."""

from google.adk.agents import LlmAgent

from ...shared_libraries.constants import MODEL
from ...shared_libraries.core_modules import (
    CORE_MODULE_INSTRUCTIONS,
    CORE_MODULE_TOOLS,
    managed_instruction,
)
from ...tools.apify_client import scrape_instagram_hashtag, scrape_youtube_videos
from ...tools.research_store import load_research_state, save_research_state
from ...tools.web_search import search_web
from . import prompt

trend_analyst = LlmAgent(
    name="trend_analyst",
    description=(
        "Finds formats, hooks, hashtags and audio trending in the wider industry with Apify hashtag and "
        "YouTube scrapes, and labels anything that is general knowledge instead of measured."
    ),
    model=MODEL,
    instruction=managed_instruction(
        "trend_analyst",
        prompt.INSTRUCTION + CORE_MODULE_INSTRUCTIONS,
        prompt.STATE_READS,
    ),
    tools=[
        scrape_instagram_hashtag,
        scrape_youtube_videos,
        search_web,
        save_research_state,
        load_research_state,
        *CORE_MODULE_TOOLS,
    ],
    output_key="trend_report",
)
