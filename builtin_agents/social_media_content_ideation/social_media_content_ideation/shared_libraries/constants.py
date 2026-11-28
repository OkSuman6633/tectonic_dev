"""Shared constants for this generated agent project (single source of truth for the model and paths)."""

import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv
from google.adk.models.lite_llm import LiteLlm

os.environ["ADK_SUPPRESS_GEMINI_LITELLM_WARNINGS"] = "true"

# Define project layout and dedicated local data storage
PACKAGE_DIR = Path(__file__).resolve().parent.parent  # The inner <project> package directory
PROJECT_DIR = PACKAGE_DIR.parent                      # The agent root directory (generated_agents/<project>)
DATA_DIR = PROJECT_DIR / "data"                       # Dedicated local data directory for databases/files
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / f"{PROJECT_DIR.name}.db"         # Default SQLite database path strictly inside this agent's folder
CREATIVE_DIR = DATA_DIR / "creative"                  # Sample visuals generated for the user
CREATIVE_DIR.mkdir(parents=True, exist_ok=True)


def _load_env_files() -> None:
    """Load this project's .env and any .env above it, without letting a blank value mask a real key.

    Inside the Tectonic server the platform's keys are already in the environment and win. Standalone, the
    project's own .env is used first, then the enclosing workspace .env (which holds the shared Google key).
    Only non-empty values are copied, so a `GOOGLE_API_KEY=` placeholder never hides a real key.
    """
    for directory in (PROJECT_DIR, *PROJECT_DIR.parents):
        candidate = directory / ".env"
        if not candidate.is_file():
            continue
        for name, value in dotenv_values(candidate).items():
            if value and not (os.getenv(name) or "").strip():
                os.environ[name] = value


_load_env_files()
load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
if GOOGLE_API_KEY:
    os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY
    os.environ["GEMINI_API_KEY"] = GOOGLE_API_KEY

import litellm

# Resilience against temporary high-demand spikes
litellm.num_retries = 5
litellm.request_timeout = 90

RAW_MODEL = os.getenv("GEMINI_MODEL", os.getenv("MODEL_NAME", "gemini-3.6-flash"))


def resolve_model(name: str) -> str:
    clean = (name or "gemini-3.6-flash").strip()
    if "/" in clean:
        return clean
    if clean.startswith("gemini"):
        return f"gemini/{clean}"
    return clean


MODEL_NAME = resolve_model(RAW_MODEL)
_kwargs = {"model": MODEL_NAME, "num_retries": 5}
if GOOGLE_API_KEY and "gemini" in MODEL_NAME:
    _kwargs["api_key"] = GOOGLE_API_KEY

# Placeholder. Inside the Tectonic Studio every agent of this project runs on the model the Agent Builder
# currently uses (the platform default or the user's custom model, switched live in the Builder settings).
# This GEMINI_MODEL-based model only applies when the project runs standalone (plain `adk run`).
MODEL = LiteLlm(**_kwargs)


def render_instruction(template, state_keys=()):
    """Return an instruction provider that substitutes {key} placeholders from session state."""

    def provider(context):
        text = template
        for key in state_keys:
            value = context.state.get(key)
            if value is None:
                value = ""
            elif not isinstance(value, str):
                value = str(value)
            text = text.replace("{" + key + "}", value)
        return text

    return provider


def _env_int(name: str, default: int) -> int:
    """Read a positive integer from the environment, falling back to the default."""
    try:
        value = int(str(os.getenv(name, "")).strip())
    except ValueError:
        return default
    return value if value > 0 else default


def _env_float(name: str, default: float) -> float:
    """Read a positive float from the environment, falling back to the default."""
    try:
        value = float(str(os.getenv(name, "")).strip())
    except ValueError:
        return default
    return value if value > 0 else default


# --- Apify (Instagram / YouTube / Facebook scraping) -------------------------------------------
# The API token is read at call time (tools/apify_client.py) so a key added to .env is picked up
# without a restart; only the non-secret settings live here.
APIFY_API_BASE = os.getenv("APIFY_API_BASE", "https://api.apify.com/v2").rstrip("/")
APIFY_TOKEN_ENVS = ("APIFY_TOKEN", "APIFY_API_TOKEN", "APIFY_API_KEY")

# Store actors used by the harvester:
#   apify/instagram-scraper        -> profile posts, reels and hashtag feeds
#   streamers/youtube-scraper      -> search results, channel videos and Shorts
#   apify/facebook-posts-scraper   -> page posts with reactions, comments and shares
APIFY_ACTORS = {
    "instagram": os.getenv("APIFY_INSTAGRAM_ACTOR", "apify~instagram-scraper"),
    "youtube": os.getenv("APIFY_YOUTUBE_ACTOR", "streamers~youtube-scraper"),
    "facebook": os.getenv("APIFY_FACEBOOK_ACTOR", "apify~facebook-posts-scraper"),
    "google_search": os.getenv("APIFY_GOOGLE_SEARCH_ACTOR", "apify~google-search-scraper"),
}

# One harvest can run three actors; the budget keeps a chat turn responsive while still letting the
# free Apify plan finish a 5-profile / 3-platform run.
APIFY_WAIT_SECONDS = _env_int("APIFY_WAIT_SECONDS", 300)
APIFY_MEMORY_MBYTES = _env_int("APIFY_MEMORY_MBYTES", 1024)
APIFY_POLL_SECONDS = _env_float("APIFY_POLL_SECONDS", 4.0)
APIFY_MAX_POSTS_PER_RUN = _env_int("APIFY_MAX_POSTS_PER_RUN", 60)

# --- Image generation (Google) ------------------------------------------------------------------
# Every sample visual is drawn by Google's image models with GOOGLE_API_KEY / GEMINI_API_KEY from
# .env. TECTONIC_IMAGE_MODEL is shared with the platform image module, so one setting covers both.
IMAGE_MODEL = (
    os.getenv("TECTONIC_IMAGE_MODEL")
    or os.getenv("SMCIA_IMAGE_MODEL")
    or "gemini-2.5-flash-image"
)
IMAGE_TIMEOUT_SECONDS = _env_int("SMCIA_IMAGE_TIMEOUT_SECONDS", 180)

# --- Web research -------------------------------------------------------------------------------
# Tavily is used when a key exists; otherwise the DuckDuckGo HTML endpoint (no key) is used.
SEARCH_TIMEOUT_SECONDS = _env_int("SMCIA_SEARCH_TIMEOUT_SECONDS", 25)

# Spend guardrail reported by core_spend_status and used by the tools' own cost notes.
SPEND_LIMIT_USD = _env_float("SMCIA_SPEND_LIMIT_USD", 15.0)
