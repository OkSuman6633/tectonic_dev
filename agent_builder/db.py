"""Local persistence layer: SQLite database and repository pattern.

Replaces loose json files with a thread-safe local SQLite database (tectonic.db),
providing a clean repository abstraction layer ready for PostgreSQL/cloud migration.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent

_db_lock = threading.RLock()
_local = threading.local()


def data_dir() -> Path:
    raw = os.getenv("TECTONIC_DATA_DIR")
    path = Path(raw) if raw else PROJECT_ROOT / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_db_path() -> Path:
    return data_dir() / "tectonic.db"


def get_connection() -> sqlite3.Connection:
    """Thread-local SQLite connection with WAL mode and foreign keys enabled."""
    db_file = str(get_db_path())
    conn = getattr(_local, "connection", None)
    conn_path = getattr(_local, "connection_path", None)

    if conn is None or conn_path != db_file:
        conn = sqlite3.connect(db_file, timeout=20.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        _local.connection = conn
        _local.connection_path = db_file

    return conn


def close_connections() -> None:
    """Close the current thread's cached SQLite connection (used before DB restore/teardown)."""
    conn = getattr(_local, "connection", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
    _local.connection = None
    _local.connection_path = None


def init_db() -> None:
    """Initialize schema tables and run legacy file migrations."""
    with _db_lock:
        conn = get_connection()
        with conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL DEFAULT '',
                    is_admin INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL UNIQUE,
                    plan_id TEXT NOT NULL DEFAULT 'starter',
                    status TEXT NOT NULL DEFAULT 'active',
                    started_at REAL NOT NULL,
                    expires_at REAL NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'local',
                    title TEXT NOT NULL DEFAULT 'New Conversation',
                    builder_session_id TEXT,
                    chat_target TEXT,
                    messages_json TEXT NOT NULL DEFAULT '[]',
                    spec_json TEXT NOT NULL DEFAULT '{}',
                    journey_json TEXT,
                    decision_group_json TEXT,
                    telemetry_json TEXT NOT NULL DEFAULT '{}',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);")

        _migrate_legacy_data(conn)


def _migrate_legacy_data(conn: sqlite3.Connection) -> None:
    """Migrate legacy users.json and plans.json to SQLite if present."""
    users_json_path = data_dir() / "users.json"
    plans_json_path = data_dir() / "plans.json"

    plans_data: dict[str, str] = {}
    if plans_json_path.exists():
        try:
            plans_data = json.loads(plans_json_path.read_text(encoding="utf-8"))
        except Exception:
            plans_data = {}

    if users_json_path.exists():
        try:
            users_dict = json.loads(users_json_path.read_text(encoding="utf-8"))
            if isinstance(users_dict, dict):
                now = time.time()
                for key, u in users_dict.items():
                    if not isinstance(u, dict) or "id" not in u:
                        continue
                    user_id = u["id"]
                    username = u.get("username", key)
                    email = u.get("email") or f"{username.lower()}@tectonic.local"
                    pw_hash = u.get("hash", "")
                    salt = u.get("salt", "")
                    is_admin = 1 if u.get("first") else 0
                    created_at = float(u.get("created", now))

                    # Check if user already in DB
                    cur = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,))
                    if not cur.fetchone():
                        with conn:
                            conn.execute(
                                """
                                INSERT INTO users (id, username, email, password_hash, salt, is_admin, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (user_id, username, email, pw_hash, salt, is_admin, created_at, now),
                            )

                            # Assign subscription: existing plan from plans.json, else Starter
                            user_plan = plans_data.get(user_id, "starter")
                            # If plan is starter, grant 7 days from created_at or now
                            expires_at = created_at + 7 * 86400 if user_plan == "starter" else now + 30 * 86400
                            sub_status = "active" if expires_at > now else "expired"
                            sub_id = f"sub_{user_id}"

                            conn.execute(
                                """
                                INSERT OR IGNORE INTO subscriptions
                                (id, user_id, plan_id, status, started_at, expires_at, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (sub_id, user_id, user_plan, sub_status, created_at, expires_at, created_at, now),
                            )
        except Exception:
            pass  # Fail-safe: don't crash on corrupted legacy json


def _cloud_sync(*, immediate: bool = False) -> None:
    """Persist SQLite snapshots to GCS when TECTONIC_GCS_BUCKET is configured."""
    try:
        from .cloud_storage import sync_db

        sync_db(immediate=immediate)
    except Exception:
        pass


# --- UserRepository -------------------------------------------------------------------------------
class UserRepository:
    @staticmethod
    def get_by_id(user_id: str) -> dict[str, Any] | None:
        init_db()
        conn = get_connection()
        cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    @staticmethod
    def get_by_username(username: str) -> dict[str, Any] | None:
        init_db()
        conn = get_connection()
        cur = conn.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username.strip(),))
        row = cur.fetchone()
        return dict(row) if row else None

    @staticmethod
    def get_by_email(email: str) -> dict[str, Any] | None:
        init_db()
        conn = get_connection()
        cur = conn.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),))
        row = cur.fetchone()
        return dict(row) if row else None

    @staticmethod
    def get_by_login(identifier: str) -> dict[str, Any] | None:
        """Finds user by either username or email."""
        clean = (identifier or "").strip()
        if "@" in clean:
            user = UserRepository.get_by_email(clean)
            if user:
                return user
        return UserRepository.get_by_username(clean)

    @staticmethod
    def count() -> int:
        init_db()
        conn = get_connection()
        cur = conn.execute("SELECT COUNT(*) AS total FROM users")
        row = cur.fetchone()
        return int(row["total"]) if row else 0

    @staticmethod
    def create(
        user_id: str,
        username: str,
        email: str,
        password_hash: str,
        salt: str = "",
        is_admin: bool = False,
        created_at: float | None = None,
    ) -> dict[str, Any]:
        init_db()
        now = time.time()
        created = created_at if created_at is not None else now
        conn = get_connection()
        with _db_lock:
            with conn:
                conn.execute(
                    """
                    INSERT INTO users (id, username, email, password_hash, salt, is_admin, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, username.strip(), email.strip(), password_hash, salt, 1 if is_admin else 0, created, now),
                )
        user = UserRepository.get_by_id(user_id)
        if user is None:
            raise RuntimeError(f"Failed to create user record for {user_id}")
        _cloud_sync(immediate=True)
        return user

    @staticmethod
    def update_password(user_id: str, password_hash: str, salt: str = "") -> None:
        init_db()
        conn = get_connection()
        now = time.time()
        with _db_lock:
            with conn:
                conn.execute(
                    "UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?",
                    (password_hash, salt, now, user_id),
                )
        _cloud_sync(immediate=True)

    @staticmethod
    def list_all() -> list[dict[str, Any]]:
        init_db()
        conn = get_connection()
        cur = conn.execute("SELECT * FROM users ORDER BY created_at ASC")
        return [dict(r) for r in cur.fetchall()]


# --- SubscriptionRepository -----------------------------------------------------------------------
class SubscriptionRepository:
    STARTER_TRIAL_DAYS = 7
    STANDARD_PLAN_DAYS = 30

    @staticmethod
    def get_by_user_id(user_id: str | None) -> dict[str, Any] | None:
        if not user_id:
            return None
        init_db()
        conn = get_connection()
        cur = conn.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        sub = dict(row)

        # Check for automatic expiration
        now = time.time()
        if sub["status"] == "active" and now >= sub["expires_at"]:
            SubscriptionRepository.update_status(user_id, "expired")
            sub["status"] = "expired"

        return sub

    @staticmethod
    def create_starter(user_id: str, started_at: float | None = None, duration_days: int = STARTER_TRIAL_DAYS) -> dict[str, Any]:
        """Provisions the default 7-day Starter subscription for newly registered accounts."""
        init_db()
        if UserRepository.get_by_id(user_id) is None:
            UserRepository.create(
                user_id=user_id,
                username=user_id,
                email=f"{user_id}@tectonic.local",
                password_hash="",
            )
        now = time.time()
        start = started_at if started_at is not None else now
        expires = start + duration_days * 86400
        sub_id = f"sub_{user_id}"

        conn = get_connection()
        with _db_lock:
            with conn:
                conn.execute(
                    """
                    INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at, created_at, updated_at)
                    VALUES (?, ?, 'starter', 'active', ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO NOTHING
                    """,
                    (sub_id, user_id, start, expires, now, now),
                )
        sub = SubscriptionRepository.get_by_user_id(user_id)
        if sub is None:
            raise RuntimeError(f"Failed to create subscription record for {user_id}")
        _cloud_sync(immediate=True)
        return sub

    @staticmethod
    def set_plan(
        user_id: str,
        plan_id: str,
        duration_days: int = STANDARD_PLAN_DAYS,
        status: str = "active",
    ) -> dict[str, Any]:
        """Modular plan upgrade handler.

        Enforces plan availability rules:
        - Starter plan cannot be re-selected/renewed on an existing account (one-time 7-day trial;
          users must create a new account for another Starter plan).
        - Other plans (Pro, Business, Enterprise) are only available for accounts with username
          containing the word 'admin' (e.g. 'data admin', 'admin portal', 'admin account').
        """
        init_db()
        user = UserRepository.get_by_id(user_id)
        if user is None:
            user = UserRepository.create(
                user_id=user_id,
                username=user_id,
                email=f"{user_id}@tectonic.local",
                password_hash="",
            )

        target_plan = plan_id.strip().lower()
        uname = (user.get("username") if user else "") or ""
        is_admin_user = "admin" in uname.lower()

        if target_plan == "starter":
            existing = SubscriptionRepository.get_by_user_id(user_id)
            if existing is not None:
                raise ValueError(
                    "The Starter plan is a one-time 7-day trial. To create another starter plan, "
                    "please create another account."
                )
        else:
            if not is_admin_user:
                raise ValueError(
                    "Plans other than Starter are only available for admin accounts whose username contains 'admin' "
                    "(e.g., 'data admin', 'admin portal', 'admin account')."
                )

        now = time.time()
        expires = now + duration_days * 86400
        sub_id = f"sub_{user_id}"

        conn = get_connection()
        with _db_lock:
            with conn:
                conn.execute(
                    """
                    INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        plan_id = excluded.plan_id,
                        status = excluded.status,
                        started_at = excluded.started_at,
                        expires_at = excluded.expires_at,
                        updated_at = excluded.updated_at
                    """,
                    (sub_id, user_id, target_plan, status, now, expires, now, now),
                )
        sub = SubscriptionRepository.get_by_user_id(user_id)
        if sub is None:
            raise RuntimeError(f"Failed to update subscription record for {user_id}")
        _cloud_sync(immediate=True)
        return sub

    @staticmethod
    def update_status(user_id: str, status: str) -> None:
        init_db()
        conn = get_connection()
        now = time.time()
        with _db_lock:
            with conn:
                conn.execute(
                    "UPDATE subscriptions SET status = ?, updated_at = ? WHERE user_id = ?",
                    (status, now, user_id),
                )
        _cloud_sync(immediate=True)


def _loads_json(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except Exception:
        return fallback


# --- ConversationRepository -----------------------------------------------------------------------
class ConversationRepository:
    """Stores per-user chat conversations together with their 3D telemetry snapshots."""

    @staticmethod
    def _summary_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        messages = _loads_json(row["messages_json"], [])
        telemetry = _loads_json(row["telemetry_json"], {})
        if not isinstance(messages, list):
            messages = []
        if not isinstance(telemetry, dict):
            telemetry = {}

        user_msgs = [m for m in messages if isinstance(m, dict) and m.get("sender") == "user"]
        last_msg = messages[-1] if messages and isinstance(messages[-1], dict) else None
        preview = ""
        if last_msg and isinstance(last_msg.get("content"), str):
            preview = " ".join(last_msg["content"].split())[:120]

        agent_order = telemetry.get("agentOrder")
        module_order = telemetry.get("moduleOrder")
        return {
            "id": row["id"],
            "title": row["title"] or "New Conversation",
            "builderSessionId": row["builder_session_id"],
            "chatTarget": row["chat_target"],
            "messageCount": len(messages),
            "userMessageCount": len(user_msgs),
            "agentCount": len(agent_order) if isinstance(agent_order, list) else 0,
            "moduleCount": len(module_order) if isinstance(module_order, list) else 0,
            "preview": preview,
            "createdAt": float(row["created_at"]),
            "updatedAt": float(row["updated_at"]),
        }

    @staticmethod
    def _record_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        summary = ConversationRepository._summary_from_row(row)
        return {
            **summary,
            "messages": _loads_json(row["messages_json"], []),
            "spec": _loads_json(row["spec_json"], {}),
            "journey": _loads_json(row["journey_json"], None),
            "decisionGroup": _loads_json(row["decision_group_json"], None),
            "telemetry": _loads_json(row["telemetry_json"], {}),
        }

    @staticmethod
    def list_by_user(user_id: str) -> list[dict[str, Any]]:
        init_db()
        conn = get_connection()
        cur = conn.execute(
            """
            SELECT id, title, builder_session_id, chat_target, messages_json, telemetry_json, created_at, updated_at
            FROM conversations
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,),
        )
        return [ConversationRepository._summary_from_row(r) for r in cur.fetchall()]

    @staticmethod
    def get(user_id: str, conv_id: str) -> dict[str, Any] | None:
        init_db()
        conn = get_connection()
        cur = conn.execute(
            "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
            (conv_id, user_id),
        )
        row = cur.fetchone()
        return ConversationRepository._record_from_row(row) if row else None

    @staticmethod
    def upsert(user_id: str, conv_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        init_db()
        conn = get_connection()
        now = time.time()
        title = str(payload.get("title") or "New Conversation").strip()[:160] or "New Conversation"
        builder_session_id = payload.get("builderSessionId") or payload.get("builder_session_id")
        chat_target = payload.get("chatTarget") if "chatTarget" in payload else payload.get("chat_target")
        messages_json = json.dumps(payload.get("messages") or [], default=str)
        spec_json = json.dumps(payload.get("spec") or {}, default=str)
        journey_val = payload.get("journey")
        journey_json = json.dumps(journey_val, default=str) if journey_val is not None else None
        decision_val = payload.get("decisionGroup") if "decisionGroup" in payload else payload.get("decision_group")
        decision_group_json = json.dumps(decision_val, default=str) if decision_val is not None else None
        telemetry_json = json.dumps(payload.get("telemetry") or {}, default=str)
        created_at = float(payload.get("createdAt") or payload.get("created_at") or now)
        updated_at = float(payload.get("updatedAt") or payload.get("updated_at") or now)

        with _db_lock:
            existing = conn.execute("SELECT user_id FROM conversations WHERE id = ?", (conv_id,)).fetchone()
            if existing is not None and existing["user_id"] != user_id:
                raise PermissionError("Conversation belongs to another user")
            with conn:
                conn.execute(
                    """
                    INSERT INTO conversations (
                        id, user_id, title, builder_session_id, chat_target,
                        messages_json, spec_json, journey_json, decision_group_json,
                        telemetry_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        builder_session_id = excluded.builder_session_id,
                        chat_target = excluded.chat_target,
                        messages_json = excluded.messages_json,
                        spec_json = excluded.spec_json,
                        journey_json = excluded.journey_json,
                        decision_group_json = excluded.decision_group_json,
                        telemetry_json = excluded.telemetry_json,
                        updated_at = excluded.updated_at
                    """,
                    (
                        conv_id, user_id, title, builder_session_id, chat_target,
                        messages_json, spec_json, journey_json, decision_group_json,
                        telemetry_json, created_at, updated_at,
                    ),
                )
        row = conn.execute(
            "SELECT id, title, builder_session_id, chat_target, messages_json, telemetry_json, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?",
            (conv_id, user_id),
        ).fetchone()
        if row is None:
            raise RuntimeError(f"Failed to save conversation {conv_id}")
        _cloud_sync(immediate=False)
        return ConversationRepository._summary_from_row(row)

    @staticmethod
    def rename(user_id: str, conv_id: str, title: str) -> dict[str, Any] | None:
        init_db()
        clean = (title or "").strip()[:160]
        if not clean:
            raise ValueError("Title cannot be empty")
        conn = get_connection()
        now = time.time()
        with _db_lock:
            with conn:
                cur = conn.execute(
                    "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                    (clean, now, conv_id, user_id),
                )
            if cur.rowcount == 0:
                return None
        row = conn.execute(
            "SELECT id, title, builder_session_id, chat_target, messages_json, telemetry_json, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?",
            (conv_id, user_id),
        ).fetchone()
        _cloud_sync(immediate=False)
        return ConversationRepository._summary_from_row(row) if row else None

    @staticmethod
    def delete(user_id: str, conv_id: str) -> bool:
        init_db()
        conn = get_connection()
        with _db_lock:
            with conn:
                cur = conn.execute(
                    "DELETE FROM conversations WHERE id = ? AND user_id = ?",
                    (conv_id, user_id),
                )
        if cur.rowcount > 0:
            _cloud_sync(immediate=False)
            return True
        return False
