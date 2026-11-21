"""Secure, temporary credential storage for external connectors.

**Scope.** A connection belongs to an account, not to one project: the user connects a data source once
in the Studio's External Tools window and every agentic workflow they own can use it. It is identified
by ``(owner, connector, connection)``:

* ``owner``      the signed-in account (``u_<12 hex>``), or ``local`` for a single-user Studio,
* ``connector``  e.g. ``meta_ads``,
* ``connection`` a label, ``default`` unless the user connects several accounts of one source
                 (e.g. one Meta ad account per client).

**Storage.** Entries are serialised and Fernet-encrypted with a key generated per process; nothing is
written to disk and everything expires after ``TECTONIC_CONNECTOR_TTL_HOURS`` (default 12). A server
restart therefore asks users to reconnect. ``SecretStore`` is the seam for a managed secret manager
(GCP Secret Manager, Vault): implement its four methods and pass it to ``CredentialVault``.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from cryptography.fernet import Fernet, InvalidToken

from .base import Credentials
from .redaction import register_secret

LOCAL_OWNER = "local"
_USER_ID = re.compile(r"^u_[0-9a-f]{12}$")
_LABEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,63}$")


def owner_of(user_id: str | None) -> str:
    """Vault owner for an ADK user id / signed-in account: the account, or ``local`` without sign-in."""
    return user_id if isinstance(user_id, str) and _USER_ID.match(user_id) else LOCAL_OWNER


def clean_label(value: str | None, default: str = "default") -> str:
    value = (value or "").strip() or default
    if not _LABEL.match(value):
        raise ValueError(f"invalid connection label {value!r}: use letters, digits, '_', '-', '.' (max 64)")
    return value


@dataclass(frozen=True)
class ConnectionKey:
    owner: str
    connector: str
    connection: str = "default"

    def storage_key(self) -> str:
        return f"{self.owner}/{self.connector}/{self.connection}"


# --- pluggable secret storage ---------------------------------------------------------------------
class SecretStore(Protocol):
    def put(self, key: str, blob: bytes) -> None: ...
    def get(self, key: str) -> bytes | None: ...
    def delete(self, key: str) -> None: ...
    def keys(self, prefix: str = "") -> list[str]: ...


class InMemoryEncryptedStore:
    """Default store: ciphertext in process memory, key never leaves the process."""

    def __init__(self) -> None:
        self._fernet = Fernet(Fernet.generate_key())
        self._data: dict[str, bytes] = {}
        self._lock = threading.Lock()

    def put(self, key: str, blob: bytes) -> None:
        token = self._fernet.encrypt(blob)
        with self._lock:
            self._data[key] = token

    def get(self, key: str) -> bytes | None:
        with self._lock:
            token = self._data.get(key)
        if token is None:
            return None
        try:
            return self._fernet.decrypt(token)
        except InvalidToken:  # pragma: no cover - the key never changes within a process
            return None

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def keys(self, prefix: str = "") -> list[str]:
        with self._lock:
            return [k for k in self._data if k.startswith(prefix)]


def _ttl_seconds() -> float:
    try:
        return max(60.0, float(os.getenv("TECTONIC_CONNECTOR_TTL_HOURS", "12")) * 3600)
    except ValueError:
        return 12 * 3600


class CredentialVault:
    def __init__(self, store: SecretStore | None = None, *, ttl_seconds: float | None = None,
                 clock: Callable[[], float] = time.time) -> None:
        self.store: SecretStore = store or InMemoryEncryptedStore()
        self.ttl_seconds = ttl_seconds if ttl_seconds is not None else _ttl_seconds()
        self.clock = clock
        self._lock = threading.RLock()

    def put(self, key: ConnectionKey, *, scheme: str, values: dict[str, str], secret_names: set[str],
            profile: dict[str, Any] | None = None, cache: dict[str, Any] | None = None) -> dict[str, Any]:
        now = self.clock()
        entry = {"scheme": scheme, "values": values, "secret_names": sorted(secret_names), "profile": profile or {},
                 "cache": cache or {}, "created_at": now, "updated_at": now, "expires_at": now + self.ttl_seconds,
                 "status": "active", "error": None}
        register_secret(*(values[n] for n in secret_names if n in values))
        register_secret(*(v for k, v in (cache or {}).items() if isinstance(v, str) and k.endswith("token")))
        self.store.put(key.storage_key(), json.dumps(entry).encode("utf-8"))
        return self._summary(key, entry)

    def _load(self, key: ConnectionKey) -> dict[str, Any] | None:
        blob = self.store.get(key.storage_key())
        if blob is None:
            return None
        entry = json.loads(blob)
        if entry["expires_at"] <= self.clock():
            self.store.delete(key.storage_key())
            return None
        return entry

    def credentials(self, key: ConnectionKey) -> Credentials | None:
        """Usable credentials for ``key`` (None when missing, expired or marked invalid)."""
        entry = self._load(key)
        if entry is None or entry["status"] != "active":
            return None
        return Credentials(key.connector, entry["scheme"], entry["values"], connection=key.connection,
                           secret_names=set(entry["secret_names"]), cache=entry.get("cache"))

    def profile(self, key: ConnectionKey) -> dict[str, Any]:
        entry = self._load(key)
        return dict(entry["profile"]) if entry else {}

    def save_cache(self, key: ConnectionKey, cache: dict[str, Any]) -> None:
        """Persist derived short-lived secrets (e.g. a refreshed access token) for the next call."""
        with self._lock:
            entry = self._load(key)
            if entry is None or entry.get("cache") == cache:
                return
            register_secret(*(v for k, v in cache.items() if isinstance(v, str) and k.endswith("token")))
            entry["cache"], entry["updated_at"] = dict(cache), self.clock()
            self.store.put(key.storage_key(), json.dumps(entry).encode("utf-8"))

    def mark_invalid(self, key: ConnectionKey, error: str) -> None:
        with self._lock:
            entry = self._load(key)
            if entry is None:
                return
            entry["status"], entry["error"], entry["updated_at"] = "invalid", error, self.clock()
            self.store.put(key.storage_key(), json.dumps(entry).encode("utf-8"))

    def delete(self, key: ConnectionKey) -> bool:
        existed = self.store.get(key.storage_key()) is not None
        self.store.delete(key.storage_key())
        return existed

    def connections(self, owner: str) -> list[dict[str, Any]]:
        """Non-secret summaries of an account's connections."""
        out = []
        for storage_key in sorted(self.store.keys(f"{owner}/")):
            _owner, connector, connection = storage_key.split("/", 2)
            key = ConnectionKey(owner, connector, connection)
            entry = self._load(key)
            if entry is not None:
                out.append(self._summary(key, entry))
        return out

    def status(self, key: ConnectionKey) -> dict[str, Any]:
        entry = self._load(key)
        if entry is None:
            return {"connector": key.connector, "connection": key.connection, "status": "not_connected"}
        return self._summary(key, entry)

    @staticmethod
    def _summary(key: ConnectionKey, entry: dict[str, Any]) -> dict[str, Any]:
        secret = set(entry["secret_names"])
        return {
            "connector": key.connector, "connection": key.connection,
            "status": entry["status"], "scheme": entry["scheme"],
            # Non-secret inputs (ad account / property id) are shown; secrets only by field name.
            "fields": {k: v for k, v in entry["values"].items() if k not in secret},
            "secret_fields": sorted(k for k in entry["values"] if k in secret),
            "profile": entry["profile"], "error": entry.get("error"),
            "connected_at": entry["created_at"], "expires_at": entry["expires_at"],
        }
