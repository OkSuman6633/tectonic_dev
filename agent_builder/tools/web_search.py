"""Web search tool: DuckDuckGo (free, no key), Tavily, and Apify (Google Search Scraper).

The provider is chosen per account in the Studio (default "auto"): Tavily if its key is set,
else Apify if its key is set, else DuckDuckGo. The result always reports which provider ran,
so the user can see and change it.
"""

from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_ACTOR = "apify/google-search-scraper"
PROVIDERS = ("auto", "duckduckgo", "tavily", "apify")
_LABELS = {"duckduckgo": "DuckDuckGo", "tavily": "Tavily", "apify": "Apify", "auto": "Auto"}


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
def _tavily_search(query: str, max_results: int, api_key: str) -> list[dict[str, str]]:
    payload = json.dumps({"api_key": api_key, "query": query, "max_results": max_results}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))
    return [
        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
        for r in data.get("results", [])
    ]


def _apify_search(query: str, max_results: int, api_key: str) -> list[dict[str, str]]:
    actor = os.getenv("APIFY_SEARCH_ACTOR", DEFAULT_ACTOR)
    payload = json.dumps({"queries": query, "resultsPerPage": max_results}).encode("utf-8")
    url = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token={api_key}"
    request = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response:
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
    try:
        from ddgs import DDGS  # newer package name
    except ImportError:
        from duckduckgo_search import DDGS
    with DDGS() as client:
        hits = client.text(query, max_results=max_results)
    return [
        {"title": h.get("title", ""), "url": h.get("href", h.get("url", "")), "snippet": h.get("body", "")}
        for h in hits or []
    ]


def configured() -> dict[str, bool]:
    return {
        "duckduckgo": True,  # free, no key
        "tavily": bool(os.getenv("TAVILY_API_KEY", "").strip()),
        "apify": bool(os.getenv("APIFY_TOKEN", "").strip()),
    }


def providers_status(user_id: str | None) -> dict[str, Any]:
    """What the Studio shows: every provider, which are configured, the choice and what would run now."""
    conf = configured()
    selected = get_provider(user_id)
    effective = selected if (selected == "auto" or conf.get(selected)) else "auto"
    return {
        "providers": [
            {"id": pid, "label": _LABELS[pid], "configured": conf.get(pid, False)}
            for pid in ("duckduckgo", "tavily", "apify")
        ],
        "selected": selected,
        "effective": effective,
        "available": [pid for pid in ("duckduckgo", "tavily", "apify") if conf.get(pid)],
    }


def _run(provider: str, query: str, limit: int) -> list[dict[str, str]]:
    if provider == "tavily":
        return _tavily_search(query, limit, os.getenv("TAVILY_API_KEY", "").strip())
    if provider == "apify":
        return _apify_search(query, limit, os.getenv("APIFY_TOKEN", "").strip())
    return _duckduckgo_search(query, limit)


def web_search(query: str, max_results: int = 5) -> dict:
    """Search the web for live documentation, API references or examples.

    Args:
        query: The search query.
        max_results: Number of results to return (1-10).

    Returns:
        dict with status, the provider that ran, and a list of results (title, url, snippet).
    """
    query = (query or "").strip()
    if not query:
        return {"status": "error", "error": "query must not be empty"}
    limit = max(1, min(int(max_results), 10))
    conf = configured()
    try:
        from ..workspace import current_user  # lazy

        choice = get_provider(current_user())
    except Exception:  # pragma: no cover - workspace unavailable
        choice = "auto"

    # Resolve the choice to the first provider that can actually run.
    order = [choice] if choice != "auto" else ["tavily", "apify", "duckduckgo"]
    order = [p for p in order if conf.get(p)] or ["duckduckgo"]
    provider = order[0]
    note = None
    if choice != "auto" and choice != provider:
        note = f"{_LABELS[choice]} is not configured here; used {_LABELS[provider]} instead."

    try:
        results = _run(provider, query, limit)
        return {"status": "success", "provider": provider, "note": note, "query": query, "results": results}
    except (ImportError, urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        return {"status": "error", "error": f"Web search unavailable ({_LABELS[provider]}): {exc}", "provider": provider, "query": query}
    except Exception as exc:  # search libraries raise their own exception types
        return {"status": "error", "error": f"Web search failed ({_LABELS[provider]}): {exc}", "provider": provider, "query": query}

