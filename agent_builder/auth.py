"""Username + password accounts and the request gate that keeps every user in their own workspace.

* Accounts are stored in a local SQLite database (tectonic.db) using bcrypt password hashing.
* Each registration provisions a 7-day Starter subscription trial out of the box.
* Sign-in returns a signed JWT / bearer token (7 days). Set ``TECTONIC_AUTH_SECRET`` so tokens
  survive restarts and redeploys; without it a secret is generated into the data folder.
* ``AuthMiddleware`` authenticates requests, enforces 7-day subscription expiration,
  binds the current workspace, and scopes execution.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Any

import bcrypt

from .db import SubscriptionRepository, UserRepository, data_dir as _get_data_dir, init_db
from .shared_libraries.constants import PROJECT_ROOT
from .workspace import as_user, is_user_id, owner_of_app

TOKEN_TTL_SECONDS = 7 * 24 * 3600
_PBKDF2_ROUNDS = 240_000
_USERNAME = re.compile(r"^[A-Za-z0-9_.\- ]{3,32}$")
_EMAIL = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
_MAX_FAILURES, _LOCKOUT_SECONDS = 8, 300
BUILDER_APP = "agent_builder"


class AuthError(ValueError):
    """A sign-in / registration the server refuses (the message is safe to show the user)."""


# --- account store --------------------------------------------------------------------------------
def data_dir() -> Path:
    return _get_data_dir()


_lock = threading.Lock()
_failures: dict[str, list[float]] = {}


def _users_file() -> Path:
    return data_dir() / "users.json"


def _hash_pbkdf2(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS).hex()


def _hash_bcrypt(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _sync_legacy_users_json(user: dict) -> None:
    """Keep legacy users.json synchronized for backward compatibility with external tools/tests."""
    try:
        path = _users_file()
        current: dict[str, Any] = {}
        if path.exists():
            try:
                current = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                current = {}
        uname = user["username"].lower()
        current[uname] = {
            "id": user["id"],
            "username": user["username"],
            "email": user.get("email", ""),
            "salt": user.get("salt", ""),
            "hash": user.get("password_hash", ""),
            "created": user.get("created_at", time.time()),
            "first": bool(user.get("is_admin")),
        }
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(current, indent=2), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        pass


def _public(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user.get("email", ""),
        "admin": is_admin(user),
    }


def is_admin_username(username: str | None) -> bool:
    """True when the username contains the word 'admin' (case-insensitive),
    e.g. 'data admin', 'admin portal', 'admin account'.
    """
    if not username:
        return False
    return "admin" in username.strip().lower()


def is_admin(user: dict) -> bool:
    """Admins (username containing 'admin', TECTONIC_ADMINS=alice,bob, or first account)."""
    uname = (user.get("username") or "").strip()
    if is_admin_username(uname):
        return True
    admins = {u.strip().lower() for u in os.getenv("TECTONIC_ADMINS", "").split(",") if u.strip()}
    if admins and uname.lower() in admins:
        return True
    return bool(user.get("is_admin") or user.get("admin") or user.get("first"))


def register(username: str, password: str, email: str | None = None) -> dict:
    clean_username = " ".join((username or "").strip().split())
    if not _USERNAME.match(clean_username) or len(clean_username) < 3 or len(clean_username) > 32:
        raise AuthError("Username must be 3-32 characters: letters, digits, spaces, '_', '.' or '-'.")
    if len(password or "") < 8:
        raise AuthError("Password must be at least 8 characters.")

    clean_email = (email or "").strip()
    if clean_email:
        if not _EMAIL.match(clean_email):
            raise AuthError("Please provide a valid email address.")
    else:
        email_prefix = re.sub(r"[^a-zA-Z0-9_.-]", "_", clean_username.lower())
        clean_email = f"{email_prefix}@tectonic.local"

    init_db()
    with _lock:
        if UserRepository.get_by_username(clean_username):
            raise AuthError("That username is taken.")
        if UserRepository.get_by_email(clean_email):
            raise AuthError("An account with that email already exists.")

        is_first = UserRepository.count() == 0
        is_admin_user = is_first or is_admin_username(clean_username)
        pw_hash = _hash_bcrypt(password)
        salt = secrets.token_bytes(16).hex()
        user_id = f"u_{secrets.token_hex(6)}"

        user = UserRepository.create(
            user_id=user_id,
            username=clean_username,
            email=clean_email,
            password_hash=pw_hash,
            salt=salt,
            is_admin=is_admin_user,
        )

        # Automatic 7-Day Starter Trial assignment
        SubscriptionRepository.create_starter(user_id)

        _sync_legacy_users_json(user)

    return _public(user)


def login(identifier: str, password: str) -> dict:
    key = (identifier or "").strip().lower()
    now = time.time()
    recent = [t for t in _failures.get(key, []) if now - t < _LOCKOUT_SECONDS]
    if len(recent) >= _MAX_FAILURES:
        raise AuthError("Too many failed attempts. Try again in a few minutes.")

    init_db()
    user = UserRepository.get_by_login(key)

    if user is None:
        _failures[key] = [*recent, now]
        raise AuthError("Wrong username or password.")

    stored_hash = user.get("password_hash", "")
    salt = user.get("salt", "")
    verified = False

    # Check bcrypt first
    if stored_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            verified = bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            verified = False
    elif salt and len(stored_hash) == 64:
        # Legacy PBKDF2 hash verification
        legacy_hash = _hash_pbkdf2(password, bytes.fromhex(salt))
        verified = hmac.compare_digest(legacy_hash, stored_hash)
        if verified:
            # Transparently upgrade to bcrypt
            new_hash = _hash_bcrypt(password)
            UserRepository.update_password(user["id"], new_hash, salt)
            user["password_hash"] = new_hash

    if not verified:
        _failures[key] = [*recent, now]
        raise AuthError("Wrong username or password.")

    _failures.pop(key, None)
    return _public(user)


def get_user(user_id: str) -> dict | None:
    init_db()
    u = UserRepository.get_by_id(user_id)
    return _public(u) if u else None


# --- tokens ---------------------------------------------------------------------------------------
_secret_cache: bytes | None = None


def _secret() -> bytes:
    global _secret_cache
    if _secret_cache is None:
        configured = os.getenv("TECTONIC_AUTH_SECRET", "").strip()
        if configured:
            _secret_cache = configured.encode()
        else:
            path = data_dir() / "auth_secret"
            if not path.exists():
                path.write_text(secrets.token_hex(32), encoding="utf-8")
            _secret_cache = path.read_text(encoding="utf-8").strip().encode()
    return _secret_cache


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(user: dict) -> str:
    """Issue a secure signed bearer token carrying user details and expiration."""
    body = _b64(
        json.dumps(
            {
                "u": user["id"],
                "sub": user["id"],
                "username": user["username"],
                "admin": is_admin(user),
                "exp": int(time.time()) + TOKEN_TTL_SECONDS,
                "iat": int(time.time()),
            }
        ).encode()
    )
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_token(token: str | None) -> str | None:
    """The user id a token was issued to, or None if it is missing, forged or expired."""
    if not token or not isinstance(token, str):
        return None

    parts = token.split(".")
    # Support 2-part signed bearer token (body.signature)
    if len(parts) == 2:
        body, sig = parts
        try:
            expected_sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
            if not hmac.compare_digest(sig, expected_sig):
                return None
            claims = json.loads(_unb64(body))
            if claims.get("exp", 0) <= time.time():
                return None
            user_id = claims.get("u") or claims.get("sub")
            if user_id and is_user_id(user_id):
                return user_id
        except Exception:
            return None

    # Support 3-part standard JWT (header.payload.signature)
    elif len(parts) == 3:
        try:
            import jwt
            claims = jwt.decode(token, _secret().decode("utf-8", errors="ignore"), algorithms=["HS256"])
            user_id = claims.get("u") or claims.get("sub")
            if user_id and is_user_id(user_id):
                return user_id
        except Exception:
            return None

    return None


# --- request gate ---------------------------------------------------------------------------------
# Paths that need a signed-in user; everything else is the public SPA, its assets and /auth/*.
_PROTECTED = (
    "/api/", "/modules", "/directory", "/studio", "/connectors", "/media/",
    "/run", "/apps/", "/list-apps", "/ws/", "/auth/me",
    "/dev-ui", "/debug", "/builder", "/agent-identity", "/eval", "/version",
)
_ADK_PREFIXES = (
    "/run", "/apps/", "/list-apps", "/dev-ui", "/debug", "/builder",
    "/agent-identity", "/eval", "/version",
)
_SESSION_PATH = re.compile(r"^/apps/([^/]+)/users/([^/]+)(/.*)?$")
_APP_INFO_PATH = re.compile(r"^/apps/([^/]+)/app-info$")

# Routes permitted even when the account's subscription is expired (so the user can view & choose a plan)
_EXPIRED_ALLOWED_PATHS = (
    "/api/plans", "/api/plan", "/auth/me", "/auth/config",
    "/api/env", "/health", "/healthz", "/api/web-search",
)


def _adk_allowed(path: str) -> bool:
    """ADK routes a user may call (their own sessions and runs); the rest of ADK's dev surface is closed."""
    return path in ("/run", "/run_sse", "/list-apps") or path.startswith("/apps/")


def may_use_app(app_name: str, user_id: str) -> bool:
    return app_name == BUILDER_APP or owner_of_app(app_name) == user_id


def _token_from(scope: dict) -> str | None:
    for name, value in scope.get("headers") or []:
        if name == b"authorization" and value.lower().startswith(b"bearer "):
            return value[7:].decode("latin-1").strip()
    query = (scope.get("query_string") or b"").decode("latin-1")
    match = re.search(r"(?:^|&)token=([^&]+)", query)
    return match.group(1) if match else None


async def _send_json(send, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


async def _read_body(receive) -> bytes:
    chunks = []
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            break
        chunks.append(message.get("body", b""))
        if not message.get("more_body"):
            break
    return b"".join(chunks)


class AuthMiddleware:
    """Authenticates API calls and confines each one to the caller's workspace.

    Enforces 7-day Starter subscription expiration across all protected execution endpoints.
    """

    def __init__(self, app, list_apps) -> None:
        self.app = app
        self.list_apps = list_apps

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        if not path.startswith(_PROTECTED):
            return await self.app(scope, receive, send)
        if scope["type"] == "http" and scope.get("method") == "OPTIONS":
            return await self.app(scope, receive, send)

        user_id = verify_token(_token_from(scope))
        if user_id is None or get_user(user_id) is None:
            if scope["type"] == "websocket":
                await receive()
                return await send({"type": "websocket.close", "code": 4401})
            return await _send_json(send, 401, {"detail": "Sign in required"})

        # Check subscription expiration
        sub = SubscriptionRepository.get_by_user_id(user_id)
        if sub:
            now = time.time()
            is_expired = sub["status"] == "expired" or now >= sub["expires_at"]
            if is_expired:
                is_allowed_path = any(
                    path == p or path.startswith(p + "/") or path.startswith(p + "?")
                    for p in _EXPIRED_ALLOWED_PATHS
                )
                if not is_allowed_path:
                    if scope["type"] == "websocket":
                        await receive()
                        return await send({"type": "websocket.close", "code": 4403})
                    return await _send_json(
                        send,
                        403,
                        {
                            "code": "PLAN_EXPIRED",
                            "detail": (
                                "Your 7-day Starter plan has expired. To create another starter plan, "
                                "please register a new account. Other plans are available for accounts "
                                "with username containing 'admin'."
                            ),
                            "plan_id": sub.get("plan_id", "starter"),
                            "expires_at": sub.get("expires_at"),
                        },
                    )

        if path.startswith(_ADK_PREFIXES) and not _adk_allowed(path):
            return await _send_json(send, 404, {"detail": "Not found"})

        with as_user(user_id):
            if path == "/list-apps":
                return await _send_json(send, 200, [BUILDER_APP, *self.list_apps()])

            match = _SESSION_PATH.match(path) or _APP_INFO_PATH.match(path)
            if match:
                app_name = match.group(1)
                if not may_use_app(app_name, user_id) or "/trigger/" in path:
                    return await _send_json(send, 403, {"detail": "Not your agent"})
                if _SESSION_PATH.match(path) and match.group(2) != user_id:
                    new_path = f"/apps/{app_name}/users/{user_id}{match.group(3) or ''}"
                    scope = {**scope, "path": new_path, "raw_path": new_path.encode()}

            if path in ("/run", "/run_sse") and scope.get("method") == "POST":
                raw = await _read_body(receive)
                try:
                    payload: Any = json.loads(raw or b"{}")
                except ValueError:
                    return await _send_json(send, 400, {"detail": "Invalid JSON body"})
                app_name = str(payload.get("appName") or payload.get("app_name") or "")
                if not may_use_app(app_name, user_id):
                    return await _send_json(send, 403, {"detail": "Not your agent"})
                for key in ("userId", "user_id"):
                    if key in payload:
                        payload[key] = user_id
                if "userId" not in payload and "user_id" not in payload:
                    payload["userId"] = user_id
                body = json.dumps(payload).encode()
                headers = [(k, v) for k, v in scope.get("headers") or [] if k != b"content-length"]
                scope = {**scope, "headers": [*headers, (b"content-length", str(len(body)).encode())]}
                sent = False

                async def replay():
                    nonlocal sent
                    if not sent:
                        sent = True
                        return {"type": "http.request", "body": body, "more_body": False}
                    return await receive()

                return await self.app(scope, replay, send)

            return await self.app(scope, receive, send)
