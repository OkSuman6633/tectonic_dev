"""Web search tool: Google Search (for Gemini models by default), DuckDuckGo (for non-Gemini models / free), Tavily, and Apify.

The provider is chosen per account in the Studio (default "auto"):
- For Gemini models: Google Search grounding is the default native search tool, falling back to DuckDuckGo.
- For non-Gemini models (e.g. Claude): DuckDuckGo is utilized fully as the working default search tool.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_ACTOR = "apify~google-search-scraper"
PROVIDERS = ("auto", "google", "duckduckgo", "tavily", "apify")
_LABELS = {
    "google": "Google Search",
    "duckduckgo": "DuckDuckGo",
    "tavily": "Tavily",
    "apify": "Apify",
    "auto": "Auto",
}


def is_gemini_active() -> bool:
    """Determine whether the currently active model is a Google Gemini model."""
    try:
        from ..shared_libraries.constants import MODEL
        from ..shared_libraries.studio_model import is_claude

        _, model_name = MODEL.current()
        if model_name:
            return not is_claude(model_name)
    except Exception:
        pass

    model_env = os.getenv("GEMINI_MODEL", os.getenv("BUILDER_MODEL", os.getenv("MODEL_NAME", "")))
    if model_env:
        return "gemini" in model_env.lower()
    return bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))


# --- per-account choice ---------------------------------------------------------------------------
def _data_dir() -> Path:
    from ..auth import data_dir  # lazy: avoids an import cycle at module load

    return data_dir()


def _store_path() -> Path:
    return _data_dir() / "web_search.json"


_store_lock = threading.RLock()


def _read_store() -> dict[str, str]:
    try:
        data = json.loads(_store_path().read_text(encoding="utf-8"))
        return {k: v for k, v in data.items() if v in PROVIDERS} if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_store(store: dict[str, str]) -> None:
    with _store_lock:
        path = _store_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(store, indent=2), encoding="utf-8")
        tmp.replace(path)


def get_provider(user_id: str | None) -> str:
    return _read_store().get(user_id or "local", "auto")


def set_provider(user_id: str | None, provider: str) -> None:
    if provider not in PROVIDERS:
        raise ValueError(f"unknown web search provider {provider!r}; choose one of {', '.join(PROVIDERS)}")
    with _store_lock:
        store = _read_store()
        store[user_id or "local"] = provider
        _write_store(store)


# --- providers ------------------------------------------------------------------------------------
def _google_search(query: str, max_results: int) -> list[dict[str, str]]:
    """Native Google Search grounding for Gemini models."""
    google_key = os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    if not google_key:
        raise ValueError("Google API key is not configured for Google Search")

    from google import genai
    from google.genai import types

    raw_model = os.getenv("GEMINI_MODEL", os.getenv("MODEL_NAME", "gemini-3.6-flash"))
    model_name = raw_model.split("/")[-1] if "/" in raw_model else raw_model

    client = genai.Client(api_key=google_key)
    prompt = f"Search Google and provide the key information and sources for: {query}"
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
        ),
    )

    results: list[dict[str, str]] = []
    text_summary = response.text or ""
    if response.candidates and response.candidates[0].grounding_metadata:
        gm = response.candidates[0].grounding_metadata
        for chunk in gm.grounding_chunks or []:
            if chunk.web:
                results.append(
                    {
                        "title": str(chunk.web.title or query),
                        "url": str(chunk.web.uri or ""),
                        "snippet": str(text_summary[:300]),
                    }
                )
                if len(results) >= max_results:
                    break

    if not results and text_summary:
        results.append(
            {
                "title": f"Google Search: {query}",
                "url": f"https://www.google.com/search?q={urllib.parse.quote_plus(query)}",
                "snippet": text_summary[:300],
            }
        )

    return results


def _tavily_search(query: str, max_results: int, api_key: str) -> list[dict[str, str]]:
    if not api_key:
        raise ValueError("Tavily API key is not configured")
    payload = json.dumps({"api_key": api_key, "query": query, "max_results": max_results}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    return [
        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
        for r in data.get("results", [])
    ]


def _apify_search(query: str, max_results: int, api_key: str) -> list[dict[str, str]]:
    if not api_key:
        raise ValueError("Apify token is not configured")
    actor = os.getenv("APIFY_SEARCH_ACTOR", DEFAULT_ACTOR).replace("/", "~")
    payload = json.dumps({"queries": query, "resultsPerPage": max_results}).encode("utf-8")
    url = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token={api_key}"
    request = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=15) as response:
        items = json.loads(response.read().decode("utf-8"))
    results: list[dict[str, str]] = []
    for r in items or []:
        if not isinstance(r, dict):
            continue
        link = r.get("url", "")
        if not link:
            continue
        snippet = r.get("description") or r.get("text", "")
        results.append({"title": str(r.get("title", "")), "url": str(link), "snippet": str(snippet)})
        if len(results) >= max_results:
            break
    return results


def _duckduckgo_search(query: str, max_results: int) -> list[dict[str, str]]:
    """Fully working DuckDuckGo search implementation with multi-backend fallbacks."""
    try:
        from ddgs import DDGS
    except ImportError:
        from duckduckgo_search import DDGS

    hits = None
    last_err = None

    # Try 'auto', then fallback to 'html', then 'lite' for complete reliability against rate-limiting
    for b in ("auto", "html", "lite"):
        try:
            with DDGS() as client:
                hits = client.text(query, max_results=max_results, backend=b)
                if hits:
                    break
        except Exception as exc:
            last_err = exc
            continue

    if not hits and last_err and not isinstance(hits, list):
        raise last_err

    return [
        {"title": h.get("title", ""), "url": h.get("href", h.get("url", "")), "snippet": h.get("body", "")}
        for h in (hits or [])
    ]


def configured() -> dict[str, bool]:
    has_google = bool(os.getenv("GOOGLE_API_KEY", "").strip() or os.getenv("GEMINI_API_KEY", "").strip())
    return {
        "google": has_google,
        "duckduckgo": True,  # free, no key
        "tavily": bool(os.getenv("TAVILY_API_KEY", "").strip()),
        "apify": bool(os.getenv("APIFY_TOKEN", "").strip()),
    }


def providers_status(user_id: str | None) -> dict[str, Any]:
    """What the Studio shows: every provider, which are configured, the choice and what would run now."""
    conf = configured()
    selected = get_provider(user_id)
    is_gemini = is_gemini_active()

    if selected == "auto":
        # For Gemini models, Google Search is default; for non-Gemini models, DuckDuckGo is default
        if is_gemini and conf.get("google"):
            effective = "google"
        else:
            effective = "duckduckgo"
    else:
        effective = selected if conf.get(selected) else "auto"

    provider_order = ("google", "duckduckgo", "tavily", "apify") if is_gemini else ("duckduckgo", "google", "tavily", "apify")
    return {
        "providers": [
            {"id": pid, "label": _LABELS[pid], "configured": conf.get(pid, False)}
            for pid in provider_order
        ],
        "selected": selected,
        "effective": effective,
        "is_gemini_model": is_gemini,
        "available": [pid for pid in provider_order if conf.get(pid)],
    }


def _run(provider: str, query: str, limit: int) -> list[dict[str, str]]:
    if provider == "google":
        return _google_search(query, limit)
    if provider == "tavily":
        return _tavily_search(query, limit, os.getenv("TAVILY_API_KEY", "").strip())
    if provider == "apify":
        return _apify_search(query, limit, os.getenv("APIFY_TOKEN", "").strip())
    return _duckduckgo_search(query, limit)


def web_search(query: str, max_results: int = 5, provider: str | None = None) -> dict:
    """Search the web for live documentation, API references or examples.

    Args:
        query: The search query.
        max_results: Number of results to return (1-10).
        provider: Optional explicit provider override ('auto', 'google', 'duckduckgo', 'tavily', 'apify').

    Returns:
        dict with status ('success' | 'no_results' | 'error'), provider, query, and results list.
    """
    query = (query or "").strip()
    if not query:
        return {"status": "error", "error": "Query must not be empty", "query": "", "results": []}
    limit = max(1, min(int(max_results), 10))
    conf = configured()
    is_gemini = is_gemini_active()

    choice = provider
    if not choice or choice not in PROVIDERS:
        try:
            from ..workspace import current_user  # lazy

            choice = get_provider(current_user())
        except Exception:  # pragma: no cover - workspace unavailable
            choice = "auto"

    # Build fallback waterfall:
    # - If explicit choice: preferred provider first, then sensible fallbacks
    # - If auto: for Gemini models, Google Search is default tool; for non-Gemini models, DuckDuckGo is default
    candidates: list[str] = []
    if choice != "auto":
        candidates.append(choice)
        fallback_pool = ("google", "duckduckgo", "tavily", "apify") if is_gemini else ("duckduckgo", "tavily", "apify")
        for p in fallback_pool:
            if p != choice and conf.get(p):
                candidates.append(p)
    else:
        if is_gemini and conf.get("google"):
            preferred_auto = ["google", "duckduckgo", "tavily", "apify"]
        else:
            # Non-Gemini model (e.g. Claude) or no Google key: fully utilize DuckDuckGo
            preferred_auto = ["duckduckgo", "tavily", "apify"]
        candidates = [p for p in preferred_auto if conf.get(p)]

    if not candidates:
        candidates = ["duckduckgo"]

    errors: list[str] = []
    fallback_note: str | None = None

    for i, candidate in enumerate(candidates):
        try:
            results = _run(candidate, query, limit)
            if results:
                if i > 0:
                    prev_failed = candidates[0]
                    fallback_note = f"Primary provider ({_LABELS.get(prev_failed, prev_failed)}) was unavailable; fell back to {_LABELS.get(candidate, candidate)}."
                return {
                    "status": "success",
                    "provider": candidate,
                    "note": fallback_note,
                    "query": query,
                    "results": results,
                }
            errors.append(f"{_LABELS.get(candidate, candidate)} returned 0 results")
        except Exception as exc:
            err_msg = f"{_LABELS.get(candidate, candidate)} failed: {exc}"
            errors.append(err_msg)

    # If any provider succeeded with 0 results vs all errored out
    if any("returned 0 results" in e for e in errors):
        return {
            "status": "no_results",
            "provider": candidates[0],
            "query": query,
            "results": [],
            "note": f"No web search results found for '{query}'.",
        }

    return {
        "status": "error",
        "error": f"Web search failed: {'; '.join(errors)}",
        "provider": candidates[0],
        "query": query,
        "results": [],
    }


