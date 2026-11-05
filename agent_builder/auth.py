"""Username + password accounts and the request gate that keeps every user in their own workspace.

* Accounts live in ``<TECTONIC_DATA_DIR>/users.json`` (PBKDF2-SHA256 password hashes, never plain text).
* A sign-in returns a signed bearer token (HMAC-SHA256, 7 days). Set ``TECTONIC_AUTH_SECRET`` so tokens
  survive restarts and redeploys; without it a secret is generated into the data folder.
* ``AuthMiddleware`` (pure ASGI) authenticates every API / ADK / WebSocket request, binds the user as the
  current workspace (see workspace.py) and *rewrites* the ADK user id in ``/run`` bodies and
  ``/apps/<app>/users/<user>/...`` paths to the signed-in user, so nobody can read or drive another
  user's sessions, and only their own generated apps can be run.
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

from .shared_libraries.constants import PROJECT_ROOT
from .workspace import as_user, is_user_id, owner_of_app

TOKEN_TTL_SECONDS = 7 * 24 * 3600
_PBKDF2_ROUNDS = 240_000
_USERNAME = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
_MAX_FAILURES, _LOCKOUT_SECONDS = 8, 300
BUILDER_APP = "agent_builder"


class AuthError(ValueError):
    """A sign-in / registration the server refuses (the message is safe to show the user)."""


# --- account store --------------------------------------------------------------------------------
def data_dir() -> Path:
    raw = os.getenv("TECTONIC_DATA_DIR")
    path = Path(raw) if raw else PROJECT_ROOT / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


_lock = threading.Lock()
_failures: dict[str, list[float]] = {}


def _users_file() -> Path:
    return data_dir() / "users.json"


def _load() -> dict[str, dict]:
    try:
        return json.loads(_users_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(users: dict[str, dict]) -> None:
    tmp = _users_file().with_suffix(".tmp")
    tmp.write_text(json.dumps(users, indent=2), encoding="utf-8")
    tmp.replace(_users_file())


def _hash(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS).hex()


def _public(user: dict) -> dict:
    return {"id": user["id"], "username": user["username"], "admin": is_admin(user)}


def is_admin(user: dict) -> bool:
    """Admins (TECTONIC_ADMINS=alice,bob; by default the first account) may change server-wide settings."""
    admins = {u.strip().lower() for u in os.getenv("TECTONIC_ADMINS", "").split(",") if u.strip()}
    return user["username"].lower() in admins if admins else bool(user.get("first"))


def register(username: str, password: str) -> dict:
    username = (username or "").strip()
    if not _USERNAME.match(username):
        raise AuthError("Username must be 3-32 characters: letters, digits, '_', '.' or '-'.")
    if len(password or "") < 8:
        raise AuthError("Password must be at least 8 characters.")
    with _lock:
        users = _load()
        if username.lower() in users:
            raise AuthError("That username is taken.")
        salt = secrets.token_bytes(16)
        user = {"id": f"u_{secrets.token_hex(6)}", "username": username, "salt": salt.hex(), "hash": _hash(password, salt),
                "created": time.time(), "first": not users}
        users[username.lower()] = user
        _save(users)
    return _public(user)


def login(username: str, password: str) -> dict:
    key = (username or "").strip().lower()
    now = time.time()
    recent = [t for t in _failures.get(key, []) if now - t < _LOCKOUT_SECONDS]
    if len(recent) >= _MAX_FAILURES:
        raise AuthError("Too many failed attempts. Try again in a few minutes.")
    user = _load().get(key)
    if user is None or not hmac.compare_digest(_hash(password or "", bytes.fromhex(user["salt"])), user["hash"]):
        _failures[key] = [*recent, now]
        raise AuthError("Wrong username or password.")
    _failures.pop(key, None)
    return _public(user)


def get_user(user_id: str) -> dict | None:
    return next((_public(u) for u in _load().values() if u["id"] == user_id), None)


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
    body = _b64(json.dumps({"u": user["id"], "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    return f"{body}.{_b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())}"


def verify_token(token: str | None) -> str | None:
    """The user id a token was issued to, or None if it is missing, forged or expired."""
    try:
        body, sig = (token or "").split(".", 1)
        if not hmac.compare_digest(_unb64(sig), hmac.new(_secret(), body.encode(), hashlib.sha256).digest()):
            return None
        claims = json.loads(_unb64(body))
    except (ValueError, TypeError):
        return None
    user_id = claims.get("u")
    return user_id if is_user_id(user_id) and claims.get("exp", 0) > time.time() else None


# --- request gate ---------------------------------------------------------------------------------
# Paths that need a signed-in user; everything else is the public SPA, its assets and /auth/*.
_PROTECTED = ("/api/", "/modules", "/directory", "/studio", "/run", "/apps/", "/list-apps", "/ws/", "/auth/me",
              "/dev-ui", "/debug", "/builder", "/agent-identity", "/eval", "/version")
_ADK_PREFIXES = ("/run", "/apps/", "/list-apps", "/dev-ui", "/debug", "/builder", "/agent-identity", "/eval", "/version")
_SESSION_PATH = re.compile(r"^/apps/([^/]+)/users/([^/]+)(/.*)?$")
_APP_INFO_PATH = re.compile(r"^/apps/([^/]+)/app-info$")


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
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
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
    """Authenticates API calls and confines each one to the caller's workspace (see module docstring).

    ``list_apps`` returns the caller's own generated app names (for ``/list-apps``)."""

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
            return await self.app(scope, receive, send)  # CORS preflight carries no credentials

        user_id = verify_token(_token_from(scope))
        if user_id is None or get_user(user_id) is None:
            if scope["type"] == "websocket":
                await receive()  # websocket.connect
                return await send({"type": "websocket.close", "code": 4401})
            return await _send_json(send, 401, {"detail": "Sign in required"})

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
                    # Whatever user id the browser asked for, the session store only ever sees the signed-in one.
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
