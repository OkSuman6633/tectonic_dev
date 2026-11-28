"""Unit and functional tests for the built-in social_media_content_ideation tools (research_store & analytics)."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

_BUILTIN_ROOT = Path(__file__).resolve().parent.parent / "builtin_agents" / "social_media_content_ideation"


@pytest.fixture
def ideation_tools(tmp_path, monkeypatch):
    """Import the built-in ideation tools with an isolated SQLite DB under tmp_path."""
    if str(_BUILTIN_ROOT) not in sys.path:
        sys.path.insert(0, str(_BUILTIN_ROOT))
    from social_media_content_ideation.shared_libraries import constants as ideation_constants
    from social_media_content_ideation.tools import analytics, research_store

    # Keep any writes strictly inside tmp_path (and clean up any eager dirs created on first import)
    db_file = tmp_path / "ideation.db"
    monkeypatch.setattr(ideation_constants, "DB_PATH", db_file)
    monkeypatch.setattr(research_store, "DB_PATH", db_file)
    yield research_store, analytics
    eager_data = _BUILTIN_ROOT / "data"
    if eager_data.exists():
        shutil.rmtree(eager_data, ignore_errors=True)


# --- Unit tests: hook classification & helpers ----------------------------------------------------
@pytest.mark.parametrize(
    ("hook", "expected"),
    [
        ("How do top creators double retention?", "question"),
        ("5 ways to film better reels", "numbered_list"),
        ("Stop making this costly mistake", "contrarian"),
        ("Step-by-step tutorial on batching content", "how_to"),
        ("I tested 10 hooks yesterday", "story"),
        ("Save this for your next launch", "cta"),
        ("Real results from our client case study", "social_proof"),
        ("Morning studio routine", "statement"),
        ("", "statement"),
    ],
)
def test_classify_hook_patterns(ideation_tools, hook, expected):
    _, analytics = ideation_tools
    assert analytics.classify_hook(hook) == expected


# --- Unit tests: SQLite research_store CRUD -------------------------------------------------------
def test_research_store_briefs_sections_and_datasets(ideation_tools):
    rs, _ = ideation_tools

    assert rs.load_client_brief()["status"] == "not_found"
    assert rs.save_client_brief("", "saas")["status"] == "error"
    saved = rs.save_client_brief("Acme", "B2B SaaS", {"tone": "bold"})
    assert saved["status"] == "success"
    brief = rs.load_client_brief()
    assert brief["status"] == "success" and brief["company"] == "Acme" and brief["industry"] == "B2B SaaS"

    assert rs.save_research_state("", "text")["status"] == "error"
    assert rs.save_research_state("competitors", {"names": ["RivalA"]}, company="Acme")["status"] == "success"
    assert rs.save_research_state("trends", "Short-form video wins", company="Acme")["status"] == "success"
    one = rs.load_research_state("competitors")
    assert one["status"] == "success" and "RivalA" in one["content"]
    all_sec = rs.load_research_state()
    assert set(all_sec["sections"]) == {"competitors", "trends"}
    assert rs.load_research_state("missing")["status"] == "not_found"

    assert rs.save_social_dataset("bad", "{not json")["status"] == "error"
    assert rs.save_social_dataset("bad", '{"not": "a list"}')["status"] == "error"


# --- Functional test: dataset ingestion -> deterministic engagement pattern analysis --------------
def test_analyze_engagement_patterns_end_to_end(ideation_tools):
    rs, analytics = ideation_tools

    assert analytics.analyze_engagement_patterns()["status"] == "not_found"

    posts = [
        {
            "platform": "instagram",
            "author": "@brand_a",
            "url": "https://ig.test/1",
            "hook": "5 ways to grow fast",
            "media_type": "reel",
            "engagement": 1200,
            "engagement_rate": 4.5,
            "metrics": {"views": 20000},
            "audio": "Original Beat",
            "posted_at": "2026-11-23T14:00:00Z",
            "text": "5 ways to grow fast #growth #reels",
        },
        {
            "platform": "instagram",
            "author": "@brand_a",
            "url": "https://ig.test/2",
            "hook": "Stop doing boring intros",
            "media_type": "reel",
            "engagement": 900,
            "engagement_rate": 3.8,
            "metrics": {"views": 15000},
            "audio": "Original Beat",
            "posted_at": "2026-11-24T10:00:00Z",
            "text": "Stop doing boring intros #growth",
        },
        {
            "platform": "instagram",
            "author": "@brand_b",
            "url": "https://ig.test/3",
            "hook": "Why do carousels convert?",
            "media_type": "carousel",
            "engagement": 600,
            "engagement_rate": 2.1,
            "posted_at": "2026-11-25T09:00:00Z",
            "text": "Why do carousels convert? Detailed breakdown " + "x" * 100,
        },
        {
            "platform": "youtube",
            "author": "BrandYT",
            "url": "https://yt.test/1",
            "hook": "How to automate reporting",
            "media_type": "video",
            "engagement": 1500,
            "engagement_rate": 5.0,
            "posted_at": "2026-11-26T16:00:00Z",
            "text": "How to automate reporting #automation",
        },
    ]
    ds = rs.save_social_dataset("Q4 Competitor Harvest", json.dumps(posts))
    assert ds["status"] == "success" and ds["post_count"] == 4
    listed = rs.list_social_datasets()
    assert listed["count"] == 1

    report = analytics.analyze_engagement_patterns()
    assert report["status"] == "success"
    assert report["overall"]["posts"] == 4
    assert set(report["overall"]["platforms"]) == {"instagram", "youtube"}
    assert "reel" in report["format_lift"] and "carousel" in report["format_lift"]
    assert "numbered_list" in report["hook_patterns"]
    assert report["hashtags"][0]["hashtag"] == "#growth"
    assert report["audio_trends"][0]["audio"] == "Original Beat"
    assert "@brand_a" in report["competitor_benchmarks"]
    assert len(report["evidence"]) >= 4

    yt_only = analytics.analyze_engagement_patterns(platform="youtube")
    assert yt_only["overall"]["posts"] == 1
    assert analytics.analyze_engagement_patterns(platform="facebook")["status"] == "not_found"
