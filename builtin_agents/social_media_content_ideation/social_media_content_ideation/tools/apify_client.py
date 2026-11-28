"""Apify integration for Instagram, YouTube and Facebook competitor research.

Every scraper is an Apify Actor run over the REST API. A run is started, polled to completion (or to the
time budget) and its dataset items are normalized into one common post shape, so the analyst agents can compare
platforms without knowing each Actor's schema.

Configuration: ``APIFY_TOKEN`` (or ``APIFY_API_TOKEN`` / ``APIFY_API_KEY``) in the project's ``.env``.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from ..shared_libraries.constants import (
    APIFY_ACTORS,
    APIFY_API_BASE,
    APIFY_MAX_POSTS_PER_RUN,
    APIFY_MEMORY_MBYTES,
    APIFY_POLL_SECONDS,
    APIFY_TOKEN_ENVS,
    APIFY_WAIT_SECONDS,
)
from .research_store import save_social_dataset

_TERMINAL = {"SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"}
_IG_NOISE = {
    "p", "reel", "reels", "stories", "story", "tv", "explore", "popular", "accounts", "about",
    "directory", "developer", "legal", "web", "challenge", "reelsaudio", "audio", "tags",
}


class ApifyError(RuntimeError):
    """An Apify call failed; the message is safe to show to the user."""


# --- low-level client ---------------------------------------------------------------------------
def _token() -> str:
    """Read the Apify API token from the environment.

    Returns:
        The token, or an empty string when none is configured.
    """
    for name in APIFY_TOKEN_ENVS:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _request(method: str, path: str, payload: dict | None = None, query: dict | None = None,
             timeout: int = 60) -> Any:
    """Call one Apify REST endpoint with bearer authentication.

    Args:
        method: HTTP method, for example 'GET' or 'POST'.
        path: Endpoint path below the API base, for example '/acts/x/runs'.
        payload: Optional JSON body.
        query: Optional query-string parameters (never used for the token).
        timeout: Request timeout in seconds.

    Returns:
        The decoded JSON response body.

    Raises:
        ApifyError: when no token is configured or Apify answers with an error.
    """
    token = _token()
    if not token:
        raise ApifyError(
            "Apify is not configured: add APIFY_TOKEN to the project's .env file (Apify Console -> Settings -> Integrations)."
        )
    url = f"{APIFY_API_BASE}{path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, '')})}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method=method.upper(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        if exc.code in (401, 403):
            raise ApifyError("Apify rejected the API token. Check APIFY_TOKEN in the project's .env file.") from exc
        if exc.code == 402:
            raise ApifyError("The Apify account is out of credits for this run. Top up the plan or lower the limits.") from exc
        if exc.code == 429:
            raise ApifyError("Apify rate limit reached. Wait a moment and run the harvest again.") from exc
        if exc.code == 404:
            raise ApifyError(f"Apify resource not found ({path}). Check the actor name in APIFY_*_ACTOR.") from exc
        raise ApifyError(f"Apify call failed ({exc.code}): {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ApifyError(f"Could not reach Apify: {exc}") from exc
    if not body.strip():
        return {}
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ApifyError(f"Apify returned an unreadable response: {body[:200]}") from exc


def _actor_path(platform: str) -> str:
    """Build the API path of a configured actor.

    Args:
        platform: 'instagram', 'youtube' or 'facebook'.

    Returns:
        Path fragment such as '/acts/apify~instagram-scraper'.
    """
    actor = APIFY_ACTORS.get(platform, "")
    if not actor:
        raise ApifyError(f"No Apify actor is configured for {platform}.")
    # actor names use a tilde ('user~name'); a numeric actor id is passed through unchanged
    return "/acts/" + urllib.parse.quote(actor, safe="~")


def _run_actor(platform: str, run_input: dict, wait_seconds: int = 0, limit: int = 0,
               memory_mbytes: int = 0) -> dict:
    """Start an actor, wait for it and return its dataset items.

    Args:
        platform: 'instagram', 'youtube', 'facebook' or 'google_search'.
        run_input: The actor's input object.
        wait_seconds: Time budget in seconds (defaults to APIFY_WAIT_SECONDS).
        limit: Maximum dataset items to read (defaults to APIFY_MAX_POSTS_PER_RUN).
        memory_mbytes: Run memory in MB (defaults to APIFY_MEMORY_MBYTES).

    Returns:
        dict with items, run_id, run_status, dataset_id, usage_usd, partial and elapsed_seconds.
        A run that outlives the budget returns partial=True with whatever items already exist.
    """
    budget = wait_seconds or APIFY_WAIT_SECONDS
    started = time.monotonic()
    run = _request(
        "POST",
        f"{_actor_path(platform)}/runs",
        payload=run_input,
        query={"memory": memory_mbytes or APIFY_MEMORY_MBYTES},
        timeout=90,
    ).get("data") or {}
    run_id = run.get("id")
    if not run_id:
        raise ApifyError("Apify did not return a run id.")

    status = str(run.get("status") or "")
    while status not in _TERMINAL:
        remaining = budget - (time.monotonic() - started)
        if remaining <= 0:
            break
        wait_for = int(min(max(remaining, 1), 45))
        try:
            polled = _request(
                "GET", f"/actor-runs/{run_id}", query={"waitForFinish": wait_for}, timeout=wait_for + 30
            ).get("data") or {}
        except ApifyError:
            polled = {}
        if polled:
            run = polled
            status = str(run.get("status") or status)
            if status in _TERMINAL:
                break
        time.sleep(APIFY_POLL_SECONDS)

    dataset_id = run.get("defaultDatasetId") or ""
    item_limit = limit or APIFY_MAX_POSTS_PER_RUN
    items: list[dict] = []
    if dataset_id:
        try:
            raw = _request(
                "GET",
                f"/datasets/{dataset_id}/items",
                query={"clean": "true", "limit": item_limit},
                timeout=120,
            )
            if isinstance(raw, list):
                items = raw
            elif isinstance(raw, dict) and isinstance(raw.get("items"), list):
                items = raw["items"]
        except ApifyError:
            items = []

    usage = run.get("usageTotalUsd")
    return {
        "items": items,
        "run_id": run_id,
        "run_status": status or "UNKNOWN",
        "dataset_id": dataset_id,
        "usage_usd": round(float(usage), 5) if isinstance(usage, (int, float)) else None,
        "partial": status != "SUCCEEDED",
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }


# --- helpers ------------------------------------------------------------------------------------
def _int(value: Any) -> int | None:
    """Convert a metric to a non-negative integer, or None when it is missing."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return max(int(value), 0)
    if isinstance(value, str):
        digits = "".join(ch for ch in value if ch.isdigit())
        return int(digits) if digits else None
    return None


def _clean_list(values: Any) -> list[str]:
    """Return a de-duplicated list of non-empty strings."""
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, (list, tuple, set)):
        return []
    out: list[str] = []
    for value in values:
        text = str(value).strip()
        if text and text not in out:
            out.append(text)
    return out


def _split(value: Any) -> list[str]:
    """Split a comma/newline separated argument into clean values.

    Args:
        value: A list, or a string such as '@oatly, oatly, https://instagram.com/oatly'.

    Returns:
        The individual non-empty values.
    """
    if isinstance(value, (list, tuple)):
        return _clean_list(value)
    text = str(value or "").replace("\n", ",")
    return [part.strip() for part in text.split(",") if part.strip()]


def _instagram_username(value: str) -> str:
    """Reduce a handle, '@handle' or profile URL to a bare Instagram username.

    Args:
        value: Raw user input.

    Returns:
        The username, or an empty string when the value is a reserved Instagram path.
    """
    text = (value or "").strip()
    if "instagram.com" in text:
        path = urllib.parse.urlparse(text if "//" in text else f"https://{text}").path
        text = path.strip("/").split("/")[0]
    text = text.lstrip("@").strip().strip("/")
    lowered = text.lower()
    if not text or lowered in _IG_NOISE:
        return ""
    return text


def _youtube_target(value: str) -> tuple[str, str]:
    """Classify a YouTube input as a channel URL or a search query.

    Args:
        value: A URL/handle, or a plain search phrase.

    Returns:
        Tuple of ('channel', url) or ('query', phrase).
    """
    text = (value or "").strip()
    if text.startswith("http") and "youtube.com" in text:
        return "channel", text
    if text.startswith("@"):
        return "channel", f"https://www.youtube.com/{text}"
    return "query", text


def _facebook_url(value: str) -> str:
    """Turn a page name or URL into a full Facebook page URL.

    Args:
        value: A page name such as 'oatly' or a full URL.

    Returns:
        The page URL, or an empty string when the value is unusable.
    """
    text = (value or "").strip()
    if not text:
        return ""
    if text.startswith("http"):
        return text
    slug = text.lstrip("@").strip("/")
    return f"https://www.facebook.com/{slug}" if slug else ""


def _relative_date(value: str, days: int = 30) -> str:
    """Convert a relative window such as '30 days' into a YYYY-MM-DD date.

    Args:
        value: Relative text ('30 days', '2 weeks', '3 months') or an ISO date.
        days: Fallback number of days when the text cannot be parsed.

    Returns:
        A YYYY-MM-DD date string.
    """
    text = (value or "").strip().lower()
    if text[:4].isdigit() and "-" in text:
        return text[:10]
    amount, unit = days, "day"
    parts = text.split()
    if parts and parts[0].isdigit():
        amount = int(parts[0])
        if len(parts) > 1:
            unit = parts[1]
    if unit.startswith("week"):
        amount *= 7
    elif unit.startswith("month"):
        amount *= 30
    elif unit.startswith("year"):
        amount *= 365
    return (datetime.now(timezone.utc) - timedelta(days=amount)).strftime("%Y-%m-%d")


def _first_line(text: str, limit: int = 120) -> str:
    """Return the opening line of a caption or title, capped for the analysis."""
    for line in (text or "").splitlines():
        clean = " ".join(line.split())
        if clean:
            return clean[:limit]
    return ""


def _parse_duration(value: Any) -> int | None:
    """Convert a 'HH:MM:SS' or 'MM:SS' duration into seconds."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    if not isinstance(value, str) or ":" not in value:
        return None
    total = 0
    for part in value.split(":"):
        if not part.strip().isdigit():
            return None
        total = total * 60 + int(part)
    return total


def _engagement(likes: int | None, comments: int | None, shares: int | None) -> int | None:
    """Sum the available interaction counts, or None when every metric is missing."""
    values = [v for v in (likes, comments, shares) if isinstance(v, int)]
    return sum(values) if values else None


def _rate(engagement: int | None, views: int | None) -> float | None:
    """Engagement as a fraction of views (None when views are unknown)."""
    if not isinstance(engagement, int) or not isinstance(views, int) or views <= 0:
        return None
    return round(engagement / views, 5)


def _music(item: dict) -> str | None:
    """Read the audio track of a reel from the actor's musicInfo field."""
    info = item.get("musicInfo")
    if isinstance(info, str) and info.strip():
        return info.strip()
    if not isinstance(info, dict):
        return None
    song = info.get("song_name") or info.get("songName") or info.get("title")
    artist = info.get("artist_name") or info.get("artistName") or info.get("artist")
    if song and artist:
        return f"{song} - {artist}"
    return str(song or artist or "").strip() or None


def _normalize_instagram(item: dict, target: str) -> dict | None:
    """Map one Instagram scraper item to the common post shape."""
    if not isinstance(item, dict) or item.get("error"):
        return None
    url = str(item.get("url") or "").strip()
    if not url:
        return None
    likes = _int(item.get("likesCount"))
    comments = _int(item.get("commentsCount"))
    views = _int(item.get("videoViewCount")) or _int(item.get("videoPlayCount"))
    kind = str(item.get("type") or "").lower()
    product = str(item.get("productType") or "").lower()
    if "reel" in product:
        media_type = "reel"
    elif kind == "sidecar":
        media_type = "carousel"
    elif kind == "video":
        media_type = "video"
    else:
        media_type = "image"
    caption = str(item.get("caption") or "")
    engagement = _engagement(likes, comments, None)
    return {
        "platform": "instagram",
        "target": target,
        "author": str(item.get("ownerUsername") or target),
        "url": url,
        "posted_at": item.get("timestamp"),
        "text": caption,
        "hook": _first_line(caption),
        "media_type": media_type,
        "metrics": {"likes": likes, "comments": comments, "views": views, "shares": None},
        "engagement": engagement,
        "engagement_rate": _rate(engagement, views),
        "hashtags": _clean_list(item.get("hashtags")),
        "audio": _music(item),
        "duration_seconds": None,
    }


def _normalize_youtube(item: dict, target: str) -> dict | None:
    """Map one YouTube scraper item to the common post shape."""
    if not isinstance(item, dict) or item.get("error"):
        return None
    url = str(item.get("url") or "").strip()
    if not url:
        return None
    likes = _int(item.get("likes"))
    comments = _int(item.get("commentsCount"))
    views = _int(item.get("viewCount"))
    duration = _parse_duration(item.get("duration"))
    kind = str(item.get("type") or "").lower()
    media_type = "short" if ("short" in kind or (duration is not None and duration <= 61)) else "video"
    title = str(item.get("title") or "")
    description = str(item.get("text") or "")
    engagement = _engagement(likes, comments, None)
    return {
        "platform": "youtube",
        "target": target,
        "author": str(item.get("channelName") or item.get("channelUsername") or target),
        "url": url,
        "posted_at": item.get("date"),
        "text": (title + ("\n\n" + description if description else "")).strip(),
        "hook": _first_line(title),
        "media_type": media_type,
        "metrics": {"likes": likes, "comments": comments, "views": views, "shares": None},
        "engagement": engagement,
        "engagement_rate": _rate(engagement, views),
        "hashtags": _clean_list(item.get("hashtags")),
        "audio": None,
        "duration_seconds": duration,
    }


def _normalize_facebook(item: dict, target: str) -> dict | None:
    """Map one Facebook posts scraper item to the common post shape."""
    if not isinstance(item, dict) or item.get("error"):
        return None
    url = str(item.get("url") or item.get("topLevelUrl") or "").strip()
    if not url:
        return None
    reactions = 0
    for key, value in item.items():
        if isinstance(key, str) and key.startswith("reaction") and key.endswith("Count"):
            reactions += _int(value) or 0
    likes = max(_int(item.get("likes")) or 0, reactions, _int(item.get("topReactionsCount")) or 0)
    comments = _int(item.get("comments"))
    shares = _int(item.get("shares"))
    views = _int(item.get("viewsCount")) or _int(item.get("videoPostViewCount"))
    text = str(item.get("text") or "")
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    engagement = _engagement(likes if likes else None, comments, shares)
    return {
        "platform": "facebook",
        "target": target,
        "author": str(user.get("name") or item.get("pageName") or target),
        "url": url,
        "posted_at": item.get("time") or (datetime.fromtimestamp(item["timestamp"], timezone.utc).isoformat()
                                          if isinstance(item.get("timestamp"), (int, float)) else None),
        "text": text,
        "hook": _first_line(text),
        "media_type": "video" if item.get("isVideo") else "image",
        "metrics": {"likes": likes if likes else None, "comments": comments, "views": views, "shares": shares},
        "engagement": engagement,
        "engagement_rate": _rate(engagement, views),
        "hashtags": [],
        "audio": None,
        "duration_seconds": None,
    }


_NORMALIZERS = {
    "instagram": _normalize_instagram,
    "youtube": _normalize_youtube,
    "facebook": _normalize_facebook,
}


def _normalize(platform: str, items: Iterable[dict], target: str) -> list[dict]:
    """Normalize raw actor items, dropping unreadable ones."""
    normalizer = _NORMALIZERS[platform]
    posts = []
    for item in items or []:
        post = normalizer(item, target)
        if post:
            posts.append(post)
    return posts


def _result(platform: str, posts: list[dict], run: dict, targets: list[str], notes: list[str]) -> dict:
    """Assemble the tool result for one platform."""
    seen = {p["url"] for p in posts}
    return {
        "status": "success" if posts else "empty",
        "platform": platform,
        "targets": targets,
        "post_count": len(posts),
        "posts": posts,
        "unique_posts": len(seen),
        "run": {
            "run_id": run.get("run_id"),
            "run_status": run.get("run_status"),
            "dataset_id": run.get("dataset_id"),
            "elapsed_seconds": run.get("elapsed_seconds"),
            "usage_usd": run.get("usage_usd"),
            "partial": run.get("partial"),
        },
        "notes": notes,
    }


# --- public helpers used by the other tool modules ------------------------------------------------
def run_actor(platform: str, run_input: dict, wait_seconds: int = 0, limit: int = 0,
              memory_mbytes: int = 0) -> dict:
    """Run one Apify actor and return its items (shared entry point for the other tool modules)."""
    return _run_actor(platform, run_input, wait_seconds=wait_seconds, limit=limit,
                      memory_mbytes=memory_mbytes)


# --- ADK tools ----------------------------------------------------------------------------------
def apify_status() -> dict:
    """Check the Apify connection and the configured scrapers before a harvest.

    Returns:
        dict with status, the Apify account (username and plan), the actor names that will be used,
        and the time budget. On failure it explains what to fix (missing or rejected token).
    """
    try:
        data = _request("GET", "/users/me", timeout=30).get("data") or {}
        plan = (data.get("plan") or {}).get("id") or "unknown"
        return {
            "status": "success",
            "account": data.get("username"),
            "plan": plan,
            "actors": dict(APIFY_ACTORS),
            "wait_seconds": APIFY_WAIT_SECONDS,
            "max_posts_per_run": APIFY_MAX_POSTS_PER_RUN,
            "message": f"Apify is connected as {data.get('username')} ({plan} plan).",
        }
    except ApifyError as exc:
        return {"status": "error", "message": str(exc)}


def scrape_instagram_posts(usernames: str, posts_per_profile: int = 6, only_newer_than: str = "30 days") -> dict:
    """Scrape the most recent, most engaging posts of one or more Instagram profiles.

    Args:
        usernames: Instagram handles, '@handles' or profile URLs, comma separated (max 8).
        posts_per_profile: Posts to fetch per profile, between 1 and 12. Defaults to 6.
        only_newer_than: Recency window such as '30 days' or an ISO date. Defaults to '30 days'.

    Returns:
        dict with status ('success' or 'empty'), platform, targets, post_count and posts (normalized
        posts with metrics, hook, media_type, hashtags and audio), plus the Apify run details.
    """
    try:
        handles = [h for h in (_instagram_username(v) for v in _split(usernames)) if h][:8]
        if not handles:
            return {"status": "error", "message": "Give at least one Instagram handle, for example 'oatly'."}
        limit = max(1, min(int(posts_per_profile), 12))
        run_input = {
            "resultsType": "posts",
            "directUrls": [f"https://www.instagram.com/{h}/" for h in handles],
            "resultsLimit": limit,
            "onlyPostsNewerThan": only_newer_than or "30 days",
        }
        run = _run_actor("instagram", run_input, limit=limit * len(handles) + 5)
        posts = _normalize("instagram", run["items"], ", ".join(handles))
        notes = []
        if not posts:
            notes.append(
                "Instagram returned no posts: the profile may be private, renamed or invisible to the scraper. "
                "Confirm the handle or pick another competitor."
            )
        if run["partial"]:
            notes.append(f"Partial data: the run status was {run['run_status']} (time budget reached).")
        return _result("instagram", posts, run, handles, notes)
    except (ApifyError, TypeError, ValueError) as exc:
        return {"status": "error", "message": str(exc)}


def scrape_instagram_hashtag(hashtag: str, posts_limit: int = 15, only_newer_than: str = "14 days") -> dict:
    """Scrape a public Instagram hashtag feed to see which posts are winning right now.

    Args:
        hashtag: Hashtag with or without '#' (one tag only).
        posts_limit: Posts to fetch, between 1 and 30. Defaults to 15.
        only_newer_than: Recency window such as '14 days'. Defaults to '14 days'.

    Returns:
        dict with status, platform, the hashtag, post_count and normalized posts.
    """
    try:
        tag = (hashtag or "").strip().lstrip("#").strip()
        if not tag:
            return {"status": "error", "message": "Give a hashtag, for example 'contentmarketing'."}
        limit = max(1, min(int(posts_limit), 30))
        run_input = {
            "resultsType": "posts",
            "directUrls": [f"https://www.instagram.com/explore/tags/{urllib.parse.quote(tag)}/"],
            "resultsLimit": limit,
            "onlyPostsNewerThan": only_newer_than or "14 days",
        }
        run = _run_actor("instagram", run_input, limit=limit + 5)
        posts = _normalize("instagram", run["items"], f"#{tag}")
        notes = [] if posts else [f"The hashtag #{tag} returned no public posts; try a broader or related tag."]
        result = _result("instagram", posts, run, [f"#{tag}"], notes)
        result["hashtag"] = f"#{tag}"
        return result
    except (ApifyError, TypeError, ValueError) as exc:
        return {"status": "error", "message": str(exc)}


_YOUTUBE_SORTS = {
    "relevance": "relevance", "rating": "rating", "upload_date": "date", "date": "date",
    "view_count": "views", "views": "views", "view": "views", "recent": "date",
}


def scrape_youtube_videos(queries: str, videos_per_query: int = 5, date_filter: str = "month",
                          sort_by: str = "relevance") -> dict:
    """Search YouTube for the most relevant recent videos (and Shorts) in a niche.

    Args:
        queries: Search phrases, comma separated (max 5), for example 'plant based milk recipes'.
        videos_per_query: Videos per query, between 1 and 10. Defaults to 5.
        date_filter: 'hour', 'today', 'week', 'month' or 'year'. Defaults to 'month'.
        sort_by: 'relevance', 'rating', 'date' (newest first) or 'views' (most viewed). Defaults to 'relevance'.

    Returns:
        dict with status, platform, post_count and normalized posts (title used as the hook,
        views/likes/comments, duration and media_type short/video).
    """
    try:
        targets = _split(queries)[:5]
        if not targets:
            return {"status": "error", "message": "Give at least one YouTube search phrase."}
        limit = max(1, min(int(videos_per_query), 10))
        channels = [t for t in targets if _youtube_target(t)[0] == "channel"]
        keyword_queries = [t for t in targets if _youtube_target(t)[0] == "query"]
        run_input: dict[str, Any] = {"maxResults": limit, "maxResultsShorts": limit, "maxResultStreams": 0}
        if keyword_queries:
            run_input["searchQueries"] = keyword_queries
            run_input["dateFilter"] = (date_filter or "month").strip().lower()
            run_input["sortingOrder"] = _YOUTUBE_SORTS.get((sort_by or "relevance").strip().lower(), "relevance")
        if channels:
            run_input["startUrls"] = [{"url": url} for url in channels]
        run = _run_actor("youtube", run_input, limit=limit * len(targets) + 5)
        posts = _normalize("youtube", run["items"], ", ".join(targets))
        notes = [] if posts else ["YouTube returned no videos for these queries; widen the window or rephrase them."]
        if run["partial"]:
            notes.append(f"Partial data: the run status was {run['run_status']} (time budget reached).")
        return _result("youtube", posts, run, targets, notes)
    except (ApifyError, TypeError, ValueError) as exc:
        return {"status": "error", "message": str(exc)}


def scrape_facebook_posts(page_urls: str, posts_per_page: int = 6, only_newer_than: str = "30 days") -> dict:
    """Scrape recent Facebook page posts with reactions, comments and shares.

    Args:
        page_urls: Facebook page names or URLs, comma separated (max 6), for example 'oatly' or a full URL.
        posts_per_page: Posts per page, between 1 and 12. Defaults to 6.
        only_newer_than: Recency window such as '30 days'. Defaults to '30 days'.

    Returns:
        dict with status, platform, post_count and normalized posts with reaction, comment and share counts.
    """
    try:
        urls = [u for u in (_facebook_url(v) for v in _split(page_urls)) if u][:6]
        if not urls:
            return {"status": "error", "message": "Give at least one Facebook page name or URL."}
        limit = max(1, min(int(posts_per_page), 12))
        run_input = {
            "startUrls": [{"url": url} for url in urls],
            "resultsLimit": limit,
            "onlyPostsNewerThan": _relative_date(only_newer_than, days=30),
        }
        run = _run_actor("facebook", run_input, limit=limit * len(urls) + 5)
        posts = _normalize("facebook", run["items"], ", ".join(urls))
        notes = [] if posts else [
            "Facebook returned no posts for these pages: they may be private, region-restricted or renamed."
        ]
        if run["partial"]:
            notes.append(f"Partial data: the run status was {run['run_status']} (time budget reached).")
        return _result("facebook", posts, run, urls, notes)
    except (ApifyError, TypeError, ValueError) as exc:
        return {"status": "error", "message": str(exc)}


def _harvest_one(platform: str, job: dict, limit: int, window: str) -> dict:
    """Run one platform's scrape inside the harvest thread pool."""
    if platform == "instagram":
        return scrape_instagram_posts(job["targets"], limit, window)
    if platform == "youtube":
        return scrape_youtube_videos(job["targets"], limit, "month", "views")
    return scrape_facebook_posts(job["targets"], limit, window)


def harvest_social_data(instagram_profiles: str = "", youtube_queries: str = "", facebook_pages: str = "",
                        posts_per_profile: int = 6, only_newer_than: str = "30 days") -> dict:
    """Run the Instagram, YouTube and Facebook scrapers for a competitor set and save one dataset.

    This is the main data-extraction tool: it runs the platforms in parallel, merges the normalized posts,
    ranks them by engagement and stores the batch so the analysts and later follow-ups can reuse it.

    Args:
        instagram_profiles: Instagram handles or profile URLs, comma separated (max 8).
        youtube_queries: YouTube search phrases (or channel URLs), comma separated (max 5).
        facebook_pages: Facebook page names or URLs, comma separated (max 6).
        posts_per_profile: Posts (or videos) per target, between 1 and 12. Defaults to 6.
        only_newer_than: Recency window for Instagram and Facebook, such as '30 days'.

    Returns:
        dict with status, dataset_id, platform_summary (post counts and totals), top_posts (the best
        posts overall) and notes. Returns status 'error' when no platform is configured or every call fails.
    """
    try:
        limit = max(1, min(int(posts_per_profile), 12))
        window = only_newer_than or "30 days"
        jobs = {
            "instagram": {"targets": instagram_profiles},
            "youtube": {"targets": youtube_queries},
            "facebook": {"targets": facebook_pages},
        }
        active = {name: job for name, job in jobs.items() if _split(job["targets"])}
        if not active:
            return {"status": "error", "message": "Give at least one Instagram handle, YouTube query or Facebook page."}
        results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=len(active)) as pool:
            futures = {pool.submit(_harvest_one, name, job, limit, window): name for name, job in active.items()}
            for future, name in futures.items():
                try:
                    results[name] = future.result()
                except Exception as exc:  # one platform failing must not lose the others
                    results[name] = {"status": "error", "message": str(exc), "posts": [], "platform": name}

        posts: list[dict] = []
        summary: dict[str, dict] = {}
        notes: list[str] = []
        failures: list[str] = []
        for name, result in results.items():
            platform_posts = result.get("posts") or []
            posts.extend(platform_posts)
            summary[name] = {
                "status": result.get("status"),
                "post_count": len(platform_posts),
                "run": result.get("run"),
            }
            notes.extend(result.get("notes") or [])
            if result.get("status") == "error":
                failures.append(f"{name}: {result.get('message')}")

        if not posts:
            return {
                "status": "error",
                "message": "No posts were collected. " + (" | ".join(failures) if failures else "Try different handles."),
                "platform_summary": summary,
                "notes": notes,
            }

        posts.sort(key=lambda p: (p.get("engagement") or 0), reverse=True)
        saved = save_social_dataset(
            label=f"{len(posts)} posts across {', '.join(sorted(summary))}",
            posts=posts,
            source="apify",
        )
        top_posts = [
            {
                "platform": p["platform"],
                "author": p["author"],
                "url": p["url"],
                "hook": p["hook"],
                "media_type": p["media_type"],
                "engagement": p["engagement"],
                "metrics": p["metrics"],
                "audio": p.get("audio"),
                "posted_at": p.get("posted_at"),
            }
            for p in posts[:12]
        ]
        return {
            "status": "success",
            "dataset_id": saved.get("dataset_id"),
            "post_count": len(posts),
            "platform_summary": summary,
            "top_posts": top_posts,
            "failures": failures,
            "notes": notes,
            "message": (
                f"Collected {len(posts)} posts. Dataset id {saved.get('dataset_id')} is stored for reuse."
            ),
        }
    except (ApifyError, TypeError, ValueError) as exc:
        return {"status": "error", "message": str(exc)}
