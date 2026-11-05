"""Web search tool for looking up live documentation (DuckDuckGo by default, Tavily if configured)."""

import json
import os
import urllib.error
import urllib.request


def _tavily_search(query: str, max_results: int, api_key: str) -> list:
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


def _duckduckgo_search(query: str, max_results: int) -> list:
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


def web_search(query: str, max_results: int = 5) -> dict:
    """Search the web for live documentation, API references or examples.

    Use this for Google ADK, LiteLLM or library details that may have changed recently.

    Args:
        query: The search query.
        max_results: Number of results to return (1-10).

    Returns:
        dict with status and a list of results (title, url, snippet).
    """
    query = (query or "").strip()
    if not query:
        return {"status": "error", "error": "query must not be empty"}
    limit = max(1, min(int(max_results), 10))
    tavily_key = os.getenv("TAVILY_API_KEY", "").strip()
    try:
        if tavily_key:
            results = _tavily_search(query, limit, tavily_key)
            provider = "tavily"
        else:
            results = _duckduckgo_search(query, limit)
            provider = "duckduckgo"
        return {"status": "success", "provider": provider, "query": query, "results": results}
    except (ImportError, urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        return {"status": "error", "error": f"Web search unavailable: {exc}", "query": query}
    except Exception as exc:  # search libraries raise their own exception types
        return {"status": "error", "error": f"Web search failed: {exc}", "query": query}
