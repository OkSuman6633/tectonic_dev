"""Deterministic analysis of harvested social posts.

Every number in the final strategy has to come from here: engagement rates, format lift, hook patterns,
caption lengths, posting windows and audio/trend signals are computed from the stored dataset, so the
model never has to invent a metric.
"""

from __future__ import annotations

import re
from datetime import datetime
from statistics import mean, median
from typing import Any, Iterable

from .research_store import load_social_dataset

HOOK_PATTERNS = {
    "question": [r"\?$", r"^(what|why|how|when|who|which|can|do|does|did|is|are|should|would)\b"],
    "numbered_list": [r"^\d+\s", r"\b\d+\s+(ways|tips|things|steps|reasons|mistakes|secrets|ideas|hacks)\b"],
    "contrarian": [r"\b(stop|don'?t|never|myth|wrong|mistake|truth about|nobody|no one)\b"],
    "how_to": [r"\bhow to\b", r"^how i\b", r"\b(steps|tutorial|guide|framework|blueprint)\b"],
    "story": [r"^(i|we|my|our)\b", r"\b(when i|last week|yesterday|story)\b"],
    "cta": [r"\b(comment|save this|share this|tag someone|link in bio|follow for|dm me)\b"],
    "social_proof": [r"\b(results|clients|customers|case study|reviews?|testimonial)\b"],
}
_COMPILED = {name: [re.compile(p, re.I) for p in patterns] for name, patterns in HOOK_PATTERNS.items()}
_HASHTAG = re.compile(r"#(\w+)")


def _error(message: str) -> dict:
    """Build a standard error response."""
    return {"status": "error", "message": message}


def _avg(values: Iterable[float]) -> float | None:
    """Mean of the values, rounded, or None when empty."""
    clean = [v for v in values if isinstance(v, (int, float))]
    return round(mean(clean), 2) if clean else None


def _median(values: Iterable[float]) -> float | None:
    """Median of the values, rounded, or None when empty."""
    clean = [v for v in values if isinstance(v, (int, float))]
    return round(median(clean), 2) if clean else None


def classify_hook(hook: str) -> str:
    """Classify a caption or title opening into a hook pattern.

    Args:
        hook: The first line of the post.

    Returns:
        One of question, numbered_list, contrarian, how_to, story, cta, social_proof or statement.
    """
    text = (hook or "").strip()
    if not text:
        return "statement"
    for name, patterns in _COMPILED.items():
        if any(p.search(text) for p in patterns):
            return name
    return "statement"


def _caption_bucket(length: int) -> str:
    """Bucket a caption length into a human label."""
    if length <= 0:
        return "no caption"
    if length < 80:
        return "short (<80 chars)"
    if length < 150:
        return "medium (80-149)"
    if length < 300:
        return "long (150-299)"
    return "very long (300+)"


def _posted_parts(posted_at: Any) -> tuple[str, int]:
    """Weekday name and hour of a post timestamp.

    Args:
        posted_at: ISO 8601 timestamp from the scraper.

    Returns:
        Tuple of (weekday, hour); ('unknown', -1) when the timestamp cannot be parsed.
    """
    if not isinstance(posted_at, str) or not posted_at:
        return "unknown", -1
    try:
        stamp = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
    except ValueError:
        return "unknown", -1
    return stamp.strftime("%A"), stamp.hour


def _group(rows: list[dict], key) -> dict[str, list[dict]]:
    """Group posts by a derived key."""
    groups: dict[str, list[dict]] = {}
    for row in rows:
        groups.setdefault(str(key(row)), []).append(row)
    return groups


def _summarize_group(rows: list[dict]) -> dict:
    """Summarize one group of posts: size, average and median engagement, average rate."""
    return {
        "posts": len(rows),
        "avg_engagement": _avg([r.get("engagement") for r in rows]),
        "median_engagement": _median([r.get("engagement") for r in rows]),
        "avg_engagement_rate": _avg([r.get("engagement_rate") for r in rows if r.get("engagement_rate")]),
        "directional_only": len(rows) < 3,
    }


def _pattern_line(kind: str, label: str, rows: dict) -> str:
    """One evidence sentence for a pattern, honest about small samples."""
    if rows.get("posts", 0) < 3:
        return (f"'{label}' {kind} looks strong but is directional only "
                f"(n={rows.get('posts')}, median {rows.get('median_engagement')}).")
    return (f"'{label}' {kind} averages {rows.get('avg_engagement')} engagements "
            f"(n={rows.get('posts')}, median {rows.get('median_engagement')}).")


def _best(rows: list[dict], limit: int = 3) -> list[dict]:
    """The highest-engagement posts in a group, with the fields a strategist needs."""
    ranked = sorted(rows, key=lambda r: (r.get("engagement") or 0), reverse=True)[:limit]
    return [
        {
            "platform": r.get("platform"),
            "author": r.get("author"),
            "url": r.get("url"),
            "hook": r.get("hook"),
            "hook_type": classify_hook(r.get("hook") or ""),
            "media_type": r.get("media_type"),
            "engagement": r.get("engagement"),
            "metrics": r.get("metrics"),
            "audio": r.get("audio"),
            "posted_at": r.get("posted_at"),
            "text_excerpt": (r.get("text") or "")[:280],
        }
        for r in ranked
    ]


def analyze_engagement_patterns(dataset_id: int = 0, platform: str = "all", top_n: int = 10) -> dict:
    """Analyze the harvested posts and report what actually earns engagement, with the evidence.

    Args:
        dataset_id: Stored dataset to analyze. Leave 0 to use the most recent harvest.
        platform: 'all', 'instagram', 'youtube' or 'facebook'.
        top_n: How many top posts per platform to return, between 3 and 20. Defaults to 10.

    Returns:
        dict with status, the dataset analyzed, overall statistics, winners per platform, format lift,
        hook patterns, caption length and posting-window performance, hashtag and audio signals, and
        competitor benchmarks. Every figure is computed from the stored posts. Returns status
        'not_found' when no dataset has been harvested yet.
    """
    try:
        loaded = load_social_dataset(dataset_id)
        if loaded.get("status") != "success":
            return loaded
        posts = loaded.get("posts") or []
        wanted = (platform or "all").strip().lower()
        if wanted != "all":
            posts = [p for p in posts if p.get("platform") == wanted]
        if not posts:
            return {"status": "not_found", "message": f"No {wanted} posts in the stored dataset."}

        capped = max(3, min(int(top_n), 20))
        platforms = sorted({p.get("platform") for p in posts if p.get("platform")})

        overall = {
            "dataset_id": loaded.get("dataset_id"),
            "dataset_label": loaded.get("label"),
            "harvested_at": loaded.get("created_at"),
            "posts": len(posts),
            "platforms": platforms,
            **_summarize_group(posts),
        }

        winners = {
            name: _best([p for p in posts if p.get("platform") == name], limit=min(capped, 5))
            for name in platforms
        }

        format_lift = {
            key: _summarize_group(rows)
            for key, rows in sorted(_group(posts, lambda r: r.get("media_type") or "unknown").items())
        }
        hook_patterns = {
            key: {**_summarize_group(rows), "example": rows[0].get("hook")}
            for key, rows in sorted(_group(posts, lambda r: classify_hook(r.get("hook") or "")).items())
        }
        caption_lengths = {
            key: _summarize_group(rows)
            for key, rows in sorted(_group(posts, lambda r: _caption_bucket(len(r.get("text") or ""))).items())
        }
        posting_windows = {
            key: _summarize_group(rows)
            for key, rows in sorted(
                _group(posts, lambda r: _posted_parts(r.get("posted_at"))[0]).items(),
                key=lambda item: _sort_weekday(item[0]),
            )
        }

        hashtag_rows: dict[str, list[dict]] = {}
        for post in posts:
            tags = post.get("hashtags") or _HASHTAG.findall(post.get("text") or "")
            for tag in {str(t).lstrip("#").lower() for t in tags if t}:
                if not tag.strip("0123456789"):  # "wisdom #26" is a number, not a hashtag
                    continue
                hashtag_rows.setdefault(tag, []).append(post)
        hashtags = [
            {"hashtag": f"#{tag}", **_summarize_group(rows)}
            for tag, rows in sorted(hashtag_rows.items(), key=lambda item: len(item[1]), reverse=True)[:12]
        ]
        with_tags = [p for p in posts if p.get("hashtags") or _HASHTAG.findall(p.get("text") or "")]
        tagged_ids = {id(p) for p in with_tags}
        without_tags = [p for p in posts if id(p) not in tagged_ids]
        hashtag_comparison = {
            "with_hashtags": _summarize_group(with_tags),
            "without_hashtags": _summarize_group(without_tags),
        }

        audio_trends = [
            {"audio": audio, **_summarize_group(rows),
             "avg_views": _avg([r["metrics"].get("views") for r in rows
                                if isinstance(r.get("metrics"), dict) and r["metrics"].get("views")])}
            for audio, rows in sorted(
                _group([p for p in posts if p.get("audio")], lambda r: r.get("audio")).items(),
                key=lambda item: len(item[1]), reverse=True,
            )[:8]
        ]

        benchmarks = {
            author: {**_summarize_group(rows), "best_post": _best(rows, limit=1)[0]["url"] if rows else None}
            for author, rows in sorted(
                _group(posts, lambda r: r.get("author") or "unknown").items(),
                key=lambda item: (_avg([r.get("engagement") for r in item[1]]) or 0), reverse=True,
            )[:12]
        }

        best_format = max(format_lift.items(), key=lambda item: item[1]["avg_engagement"] or 0, default=(None, {}))[0]
        best_hook = max(hook_patterns.items(), key=lambda item: item[1]["avg_engagement"] or 0, default=(None, {}))[0]
        evidence = [
            f"{len(posts)} posts from {len(benchmarks)} accounts across {', '.join(platforms)}.",
            f"Median engagement is {overall['median_engagement']} interactions per post "
            f"(mean {overall['avg_engagement']}).",
        ]
        if best_format:
            evidence.append(_pattern_line("format", best_format, format_lift[best_format]))
        if best_hook:
            evidence.append(_pattern_line("hook", best_hook, hook_patterns[best_hook]))
        if hashtags:
            evidence.append(f"Most used hashtag: {hashtags[0]['hashtag']} on {hashtags[0]['posts']} post(s).")
        if audio_trends:
            evidence.append(f"Most repeated audio: {audio_trends[0]['audio']} on {audio_trends[0]['posts']} reel(s).")
        evidence.append(
            "Treat any group marked directional_only as a hypothesis to test, not a proven rule."
        )

        return {
            "status": "success",
            "overall": overall,
            "winners": winners,
            "top_posts": _best(posts, limit=capped),
            "format_lift": format_lift,
            "hook_patterns": hook_patterns,
            "caption_lengths": caption_lengths,
            "posting_windows": posting_windows,
            "hashtags": hashtags,
            "hashtag_comparison": hashtag_comparison,
            "audio_trends": audio_trends,
            "competitor_benchmarks": benchmarks,
            "evidence": evidence,
        }
    except (TypeError, ValueError, KeyError) as exc:
        return _error(f"Could not analyze the dataset: {exc}")


def _sort_weekday(name: str) -> int:
    """Sort key that orders weekday names Monday-first ('unknown' last)."""
    order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return order.index(name) if name in order else len(order)
