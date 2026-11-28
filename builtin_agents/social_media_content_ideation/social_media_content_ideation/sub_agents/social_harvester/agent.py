"""Llm agent definition: social_harvester."""

from google.adk.agents import LlmAgent

from ...shared_libraries.constants import MODEL
from ...shared_libraries.core_modules import (
    CORE_MODULE_INSTRUCTIONS,
    CORE_MODULE_TOOLS,
    managed_instruction,
)
from ...tools.apify_client import (
    apify_status,
    harvest_social_data,
    scrape_facebook_posts,
    scrape_instagram_hashtag,
    scrape_instagram_posts,
    scrape_youtube_videos,
)
from ...tools.research_store import (
    list_social_datasets,
    load_social_dataset,
    save_research_state,
    save_social_dataset,
)
from . import prompt

social_harvester = LlmAgent(
    name="social_harvester",
    description=(
        "Runs the Apify Instagram, YouTube and Facebook scrapers for a competitor set, normalizes every post "
        "and stores one reusable dataset with metrics, hooks, formats and audio."
    ),
    model=MODEL,
    instruction=managed_instruction(
        "social_harvester",
        prompt.INSTRUCTION + CORE_MODULE_INSTRUCTIONS,
        prompt.STATE_READS,
    ),
    tools=[
        harvest_social_data,
        scrape_instagram_posts,
        scrape_instagram_hashtag,
        scrape_youtube_videos,
        scrape_facebook_posts,
        apify_status,
        save_social_dataset,
        load_social_dataset,
        list_social_datasets,
        save_research_state,
        *CORE_MODULE_TOOLS,
    ],
    output_key="harvested_social_data",
)
