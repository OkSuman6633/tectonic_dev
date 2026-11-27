# Social Media Content Ideation Agent (SMCIA)

Generates data-backed social media content ideas for a company. It discovers 3-5 direct competitors, scrapes their
recent Instagram, YouTube and Facebook posts with Apify, analyses what earns engagement in the wider industry, and
returns a multi-platform strategy with ready-to-post ideas plus sample visuals drawn by Google's image model.

## Workflow

| State | Agent | What happens | State key |
| --- | --- | --- | --- |
| 1. Elicitation | `social_media_content_ideation` | Asks "What is the name of your company, and what is your primary industry/niche?" | `client_brief` (SQLite) |
| 2. Competitor discovery | `competitor_scout` | Live web research, 3-5 direct competitors, verified handles | `competitor_set` |
| 3. Data extraction | `social_harvester` | Apify runs for Instagram, YouTube and Facebook; one normalized dataset | `harvested_social_data` |
| 4. Viral trend analysis | `trend_analyst` | Hashtag and YouTube trend scrapes, audio and hook signals | `trend_report` |
| 5. Synthesis | `insight_analyst` → `content_strategist` | Engagement patterns, then the strategy and the ideas | `engagement_insights`, `content_strategy` |
| Visuals (on request) | `social_media_content_ideation` | Google image generation at the right aspect ratio | — |

The coordinator runs the specialists as tools, so it keeps control between states and always produces the final
answer itself. Follow-ups ("shorter ideas", "add LinkedIn", "show me samples") reuse the stored research instead of
scraping again.

## Tools

| Module | Tools |
| --- | --- |
| `tools/apify_client.py` | `apify_status`, `scrape_instagram_posts`, `scrape_instagram_hashtag`, `scrape_youtube_videos`, `scrape_facebook_posts`, `harvest_social_data` |
| `tools/web_search.py` | `search_web`, `discover_competitors`, `find_brand_profiles` |
| `tools/analytics.py` | `analyze_engagement_patterns` |
| `tools/research_store.py` | `save_client_brief`, `load_client_brief`, `save_research_state`, `load_research_state`, `save_social_dataset`, `load_social_dataset`, `list_social_datasets` |
| `tools/creative.py` | `post_generate_image`, `batch_generate_image` (Google `gemini-2.5-flash-image`, called by the coordinator) |

Every scraper normalizes to one post shape: `platform`, `author`, `url`, `posted_at`, `text`, `hook`, `media_type`,
`metrics {likes, comments, views, shares}`, `engagement`, `engagement_rate`, `hashtags`, `audio`, `duration_seconds`.

## Apify actors

| Platform | Actor | Notes |
| --- | --- | --- |
| Instagram | `apify/instagram-scraper` | profile posts/reels and hashtag feeds |
| YouTube | `streamers/youtube-scraper` | search results, channels, Shorts |
| Facebook | `apify/facebook-posts-scraper` | page posts with reactions, comments and shares |
| (search) | `apify/google-search-scraper` | used by `search_web` when no Tavily key is set |

Actor names are overridable: `APIFY_INSTAGRAM_ACTOR`, `APIFY_YOUTUBE_ACTOR`, `APIFY_FACEBOOK_ACTOR`,
`APIFY_GOOGLE_SEARCH_ACTOR`.

## Configuration (`.env`)

```bash
GOOGLE_API_KEY=            # reasoning + Google image generation (blank inside Tectonic: the platform key is used)
APIFY_TOKEN=               # required for scraping and web search
TECTONIC_IMAGE_MODEL=gemini-2.5-flash-image   # optional
APIFY_WAIT_SECONDS=300     # optional per-run time budget
APIFY_MAX_POSTS_PER_RUN=60 # optional cap
TAVILY_API_KEY=            # optional: preferred search provider when set
SMCIA_SEARCH_PROVIDER=auto # optional: auto | tavily | apify | duckduckgo | bing
```

## Run it

Inside Tectonic Studio the agent appears under **Agents** for its owner and can be chatted with directly.

Standalone (Google ADK):

```bash
cd generated_agents/<workspace>/social_media_content_ideation
pip install -r requirements.txt
copy .env.example .env      # then fill in GOOGLE_API_KEY and APIFY_TOKEN
adk web                     # or: adk run social_media_content_ideation
```

## Local data

Everything stays inside this folder:

```
data/social_media_content_ideation.db   # brief, research snapshots and harvested datasets
data/creative/                          # generated sample visuals (PNG)
```

## Cost and limits

- Apify runs are metered by the Apify plan; a 5-competitor, 3-platform harvest costs a few cents on the free tier.
- Image generation is billed by Google per image; the coordinator draws at most three samples per request unless asked.
- Every number in the strategy comes from a tool result. Missing data is reported, never estimated.
