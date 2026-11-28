"""Durable research state for the content-ideation workflow.

Everything the agent learns is written to a SQLite database inside the project's own ``data/`` folder, so a
follow-up message ("make these ideas shorter", "add LinkedIn", "regenerate the images") can reuse the research
instead of paying for the same Apify runs and web searches again.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from ..shared_libraries.constants import DB_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS briefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    industry TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    source TEXT NOT NULL,
    post_count INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    """Open the project's SQLite database and make sure the research tables exist.

    Returns:
        An open sqlite3 connection with row access by column name.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


def _error(message: str) -> dict:
    """Build a standard error response.

    Args:
        message: Human-readable description of the problem.

    Returns:
        dict with status 'error' and the message.
    """
    return {"status": "error", "message": message}


def _as_text(content: Any) -> str:
    """Serialize tool input so a dict, list or plain string is stored the same way.

    Args:
        content: The value the model passed.

    Returns:
        A JSON string for structured input, or the stripped text itself.
    """
    if isinstance(content, str):
        return content.strip()
    return json.dumps(content, ensure_ascii=False, indent=2)


def save_client_brief(company: str, industry: str, details: dict | str = "") -> dict:
    """Store the client brief (company name, industry and any extra context the user gave).

    Args:
        company: The user's company name, for example 'Oatly'.
        industry: The primary industry or niche, for example 'plant-based dairy alternatives'.
        details: Optional extra context such as region, target audience, main platforms or tone of voice.

    Returns:
        dict with status and the stored brief id.
    """
    try:
        name = (company or "").strip()
        niche = (industry or "").strip()
        if not name or not niche:
            return _error("company and industry are both required.")
        conn = _connect()
        try:
            cursor = conn.execute(
                "INSERT INTO briefs (company, industry, details, created_at) VALUES (?, ?, ?, ?)",
                (name, niche, json.dumps(details, ensure_ascii=False) if not isinstance(details, str) else details,
                 _now_iso()),
            )
            conn.commit()
            return {"status": "success", "brief_id": cursor.lastrowid, "company": name, "industry": niche}
        finally:
            conn.close()
    except (sqlite3.Error, TypeError) as exc:
        return _error(f"Could not store the client brief: {exc}")


def load_client_brief() -> dict:
    """Read the most recent client brief so a follow-up message keeps the same company and niche.

    Returns:
        dict with status and the latest brief (company, industry, details, created_at),
        or status 'not_found' when nothing has been stored yet.
    """
    try:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT company, industry, details, created_at FROM briefs ORDER BY id DESC LIMIT 1"
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return {"status": "not_found", "message": "No client brief stored yet."}
        return {"status": "success", **dict(row)}
    except sqlite3.Error as exc:
        return _error(f"Could not read the client brief: {exc}")


def save_research_state(section: str, content: str, company: str = "") -> dict:
    """Persist one section of the research (competitors, trends, insights, strategy) for later follow-ups.

    Args:
        section: Section name, for example 'competitors', 'trends', 'insights' or 'strategy'.
        content: The section content, as text or JSON supplied by the agent.
        company: Optional company name the section belongs to.

    Returns:
        dict with status, the snapshot id and the section name.
    """
    try:
        key = (section or "").strip().lower()
        if not key:
            return _error("section is required.")
        text = _as_text(content)
        if not text:
            return _error("content is required.")
        conn = _connect()
        try:
            cursor = conn.execute(
                "INSERT INTO research_state (section, company, content, created_at) VALUES (?, ?, ?, ?)",
                (key, (company or "").strip(), text, _now_iso()),
            )
            conn.commit()
            return {"status": "success", "snapshot_id": cursor.lastrowid, "section": key}
        finally:
            conn.close()
    except (sqlite3.Error, TypeError) as exc:
        return _error(f"Could not store research state: {exc}")


def load_research_state(section: str = "") -> dict:
    """Read the latest stored research, either one section or every section at once.

    Args:
        section: Section name to load ('competitors', 'trends', 'insights', 'strategy'). Leave empty for all.

    Returns:
        dict with status and either 'section'/'content' or a 'sections' map of the newest snapshot per section.
        Returns status 'not_found' when nothing matches.
    """
    try:
        conn = _connect()
        try:
            if section and section.strip():
                key = section.strip().lower()
                row = conn.execute(
                    "SELECT section, company, content, created_at FROM research_state "
                    "WHERE section = ? ORDER BY id DESC LIMIT 1",
                    (key,),
                ).fetchone()
                if row is None:
                    return {"status": "not_found", "message": f"No stored '{key}' research yet."}
                return {"status": "success", **dict(row)}
            rows = conn.execute(
                "SELECT section, company, content, created_at FROM research_state ORDER BY id ASC"
            ).fetchall()
        finally:
            conn.close()
        if not rows:
            return {"status": "not_found", "message": "No research stored yet."}
        sections: dict[str, Any] = {}
        for row in rows:  # ordered ascending, so the newest snapshot per section wins
            sections[row["section"]] = {
                "content": row["content"],
                "company": row["company"],
                "created_at": row["created_at"],
            }
        return {"status": "success", "sections": sections}
    except sqlite3.Error as exc:
        return _error(f"Could not read research state: {exc}")


def save_social_dataset(label: str, posts: str, source: str = "apify") -> dict:
    """Store a normalized batch of social posts so the analysis and later follow-ups can reuse it.

    Args:
        label: Short description of the batch, for example 'Oatly +4 competitors, IG/YT/FB'.
        posts: JSON list of normalized post objects returned by the scrapers.
        source: Where the batch came from, for example 'apify'.

    Returns:
        dict with status, dataset_id and post_count.
    """
    try:
        if isinstance(posts, str):
            try:
                parsed = json.loads(posts)
            except json.JSONDecodeError as exc:
                return _error(f"posts must be a JSON list: {exc}")
        else:
            parsed = posts
        if not isinstance(parsed, list):
            return _error("posts must be a JSON list of post objects.")
        conn = _connect()
        try:
            cursor = conn.execute(
                "INSERT INTO datasets (label, source, post_count, payload, created_at) VALUES (?, ?, ?, ?, ?)",
                ((label or "social dataset").strip(), (source or "apify").strip(), len(parsed),
                 json.dumps(parsed, ensure_ascii=False), _now_iso()),
            )
            conn.commit()
            return {"status": "success", "dataset_id": cursor.lastrowid, "post_count": len(parsed)}
        finally:
            conn.close()
    except (sqlite3.Error, TypeError) as exc:
        return _error(f"Could not store the social dataset: {exc}")


def _dataset_key(dataset_id: Any) -> int:
    """Coerce a dataset id argument to an int (0 means "the newest dataset")."""
    if isinstance(dataset_id, bool):
        return 0
    if isinstance(dataset_id, int):
        return max(dataset_id, 0)
    text = str(dataset_id or "").strip()
    return int(text) if text.isdigit() else 0


def load_social_dataset(dataset_id: int = 0) -> dict:
    """Load a stored social dataset (the newest one when no id is given).

    Args:
        dataset_id: Dataset id from save_social_dataset. Leave 0 to load the most recent dataset.

    Returns:
        dict with status and dataset_id, label, source, created_at and posts (list).
        Returns status 'not_found' when there is no dataset.
    """
    try:
        wanted = _dataset_key(dataset_id)
        conn = _connect()
        try:
            if wanted > 0:
                row = conn.execute(
                    "SELECT id, label, source, payload, created_at FROM datasets WHERE id = ?",
                    (wanted,),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT id, label, source, payload, created_at FROM datasets ORDER BY id DESC LIMIT 1"
                ).fetchone()
        finally:
            conn.close()
        if row is None:
            return {"status": "not_found", "message": "No social dataset stored yet."}
        try:
            posts = json.loads(row["payload"])
        except json.JSONDecodeError:
            return _error("The stored dataset is not valid JSON.")
        return {
            "status": "success",
            "dataset_id": row["id"],
            "label": row["label"],
            "source": row["source"],
            "created_at": row["created_at"],
            "post_count": len(posts),
            "posts": posts,
        }
    except (sqlite3.Error, TypeError, ValueError) as exc:
        return _error(f"Could not load the social dataset: {exc}")


def list_social_datasets(limit: int = 10) -> dict:
    """List the stored social datasets, newest first, with their ids and post counts.

    Args:
        limit: Maximum number of datasets to return, between 1 and 50. Defaults to 10.

    Returns:
        dict with status and a list of datasets (dataset_id, label, source, post_count, created_at).
    """
    try:
        capped = max(1, min(int(limit), 50))
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT id, label, source, post_count, created_at FROM datasets ORDER BY id DESC LIMIT ?",
                (capped,),
            ).fetchall()
        finally:
            conn.close()
        return {"status": "success", "count": len(rows), "datasets": [dict(row) for row in rows]}
    except (sqlite3.Error, TypeError, ValueError) as exc:
        return _error(f"Could not list the datasets: {exc}")
