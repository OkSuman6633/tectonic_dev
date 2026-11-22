"""Generated-agent discovery for the root orchestrator (PRD: Intelligent Agent Discovery & Dynamic Routing).

The orchestrator's registry is :mod:`agent_builder.directory`: generated code is the source of
truth, so a newly built agent is discoverable immediately with no orchestrator change. This module
adds the matching layer on top of it — a fast, offline character-ngram similarity over each agent's
name, description and tool names. It can be swapped for vector embeddings later without changing
callers; the orchestrator only ever sees ``discover(query)``.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

from . import directory
from .tracing import logger

# Entries eligible for reuse: generated projects and their sub-agents, never the Builder itself.
_KINDS = ("project", "sub_agent")

# Below this similarity the orchestrator treats the query as unmatched (answer itself / build).
DEFAULT_MIN_SCORE = 0.2

# How many candidate matches the orchestrator sees.
TOP_K = 5

_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "for", "to", "of", "in", "on", "at", "by", "with",
    "this", "that", "these", "those", "is", "are", "was", "were", "be", "been", "it", "its",
    "my", "our", "your", "me", "you", "we", "they", "he", "she", "can", "could", "do", "does",
    "did", "will", "would", "should", "may", "might", "i", "have", "has", "had", "not", "no",
}


def _text_ngrams(text: str, n: int = 3) -> set[str]:
    """Character n-grams of ``text`` (morphology-tolerant: 'analyze' ≈ 'analyzes')."""
    s = re.sub(r"\s+", " ", "".join(ch.lower() if ch.isalnum() else " " for ch in (text or ""))).strip()
    if not s:
        return set()
    if len(s) <= n:
        return {s}
    return {s[i:i + n] for i in range(len(s) - n + 1)}


def similarity(query: str, text: str) -> float:
    """0..1 character-n-gram Jaccard between the query and one text field."""
    a, b = _text_ngrams(query), _text_ngrams(text)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _query_tokens(query: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (query or "").lower()) if t not in _STOPWORDS and len(t) > 1}


def score_agent(query: str, entry: dict[str, Any]) -> float:
    """How well ``entry`` can handle ``query``: best field similarity + a tool-name bonus."""
    description = similarity(query, entry.get("description") or "")
    name = similarity(query, entry.get("name") or "")
    q = (query or "").lower()
    tokens = _query_tokens(query)
    tools = entry.get("tools") or []
    tool_hits = any(t and (str(t).lower() in q or any(tok in str(t).lower() for tok in tokens)) for t in tools)
    return min(max(description, name) + (0.2 if tool_hits else 0.0), 1.0)


def generated_agents(entries: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """The reusable agents in the registry (generated projects + sub-agents)."""
    entries = entries if entries is not None else directory.list_entries()
    return [e for e in entries if e.get("kind") in _KINDS]


def discover(query: str, entries: list[dict[str, Any]] | None = None,
             min_score: float = DEFAULT_MIN_SCORE) -> dict[str, Any]:
    """Rank generated agents for ``query`` and recommend a route.

    Returns ``route="existing"`` with the best match when its score is at or above ``min_score``,
    otherwise ``route="none"`` (the orchestrator answers itself or falls back to the Agent Builder).
    """
    scored: list[dict[str, Any]] = []
    for entry in generated_agents(entries):
        score = score_agent(query, entry)
        if score <= 0:
            continue
        scored.append({
            "id": entry["id"], "name": entry["name"], "kind": entry["kind"],
            "score": round(score, 3),
            "description": (entry.get("description") or "")[:160],
            "tools": entry.get("tools") or [],
        })
    scored.sort(key=lambda m: m["score"], reverse=True)
    best = scored[0] if scored and scored[0]["score"] >= min_score else None
    # Privacy-safe logging: never record the user's query verbatim.
    query_hash = hashlib.sha256((query or "").encode("utf-8")).hexdigest()[:8]
    logger.info("agent discovery: query=%s candidates=%d route=%s",
                query_hash, len(scored), "existing" if best else "none")
    return {
        "query": query,
        "matches": scored[:TOP_K],
        "best": best,
        "route": "existing" if best else "none",
        "min_score": min_score,
    }
