"""The contract every external connector implements.

A connector is the bridge between agents and one third-party API (Meta Ads, GA4, later LinkedIn,
HubSpot, ...). It declares, as data:

* ``auth_schemes``  — the credential inputs the user enters in the Studio's External Tools window
  (rendered as a form per connector; values never pass through the LLM),
* ``capabilities``  — what agents may do, each with a JSON Schema for its parameters. Reads are served
  by ``fetch_data``, writes by ``execute_action``; every capability becomes a callable LLM tool.

and implements three methods:

    async authenticate()                      -> non-secret account profile (validates the credentials live)
    async fetch_data(resource, params)        -> JSON-safe dict
    async execute_action(action, params)      -> JSON-safe dict

Adding a connector: subclass ``BaseConnector``, then ``register_connector(MyConnector)``
(see ``registry.py``). Its tools, its credential form and its API endpoints appear automatically.
"""

from __future__ import annotations

import copy
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar

import httpx

from .http import ConnectorHTTP
from .redaction import scrub


# --- errors --------------------------------------------------------------------------------------
class ConnectorError(Exception):
    """A request the connector could not complete (bad parameters, upstream API error, ...).

    Messages are scrubbed of secrets before they reach agents, logs or the audit trail."""

    def __init__(self, message: str, *, code: str = "connector_error", status: int | None = None,
                 retryable: bool = False) -> None:
        super().__init__(scrub(message))
        self.code = code
        self.status = status
        self.retryable = retryable


class CredentialsRequired(ConnectorError):
    """No usable credentials are stored for this connection: the user must provide them."""

    def __init__(self, message: str = "credentials are required") -> None:
        super().__init__(message, code="credentials_required")


class CredentialsInvalid(ConnectorError):
    """The stored credentials were rejected (expired or revoked token, no access to the account).
    The connection is marked invalid and the user is asked again."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message, code="credentials_invalid", status=status)


class UnsupportedOperation(ConnectorError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="unsupported_operation")


# --- declarations --------------------------------------------------------------------------------
@dataclass(frozen=True)
class CredentialField:
    """One input of a credential form.

    ``secret`` values are encrypted in the vault, masked everywhere and never returned by any API.
    Non-secret values (an ad account id, a property id) are shown back to the user and the agent.
    """

    name: str
    label: str
    secret: bool = True
    required: bool = True
    kind: str = "password"  # password | text | textarea | file
    placeholder: str = ""
    help: str = ""
    pattern: str | None = None  # full-match regex a value must satisfy
    accept: str | None = None   # for kind="file", e.g. ".json"

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "label": self.label, "secret": self.secret, "required": self.required,
                "kind": self.kind, "placeholder": self.placeholder, "help": self.help, "pattern": self.pattern,
                "accept": self.accept}


@dataclass(frozen=True)
class AuthScheme:
    """One way to authenticate (e.g. GA4: an OAuth access token *or* a service-account key)."""

    id: str
    label: str
    fields: tuple[CredentialField, ...]
    instructions: str = ""

    def describe(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "instructions": self.instructions,
                "fields": [f.describe() for f in self.fields]}


@dataclass(frozen=True)
class Capability:
    """A read (``fetch_data``) or write (``execute_action``) agents can invoke as a tool.

    ``parameters`` is a JSON Schema object; it is the tool's declared input schema."""

    name: str
    kind: str  # "read" | "write"
    description: str
    parameters: dict[str, Any] = field(default_factory=lambda: {"type": "object", "properties": {}})

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "kind": self.kind, "description": self.description,
                "parameters": copy.deepcopy(self.parameters)}


# --- credentials ---------------------------------------------------------------------------------
class Credentials:
    """Credentials for one connection, as handed to a connector instance.

    Values are only reachable through ``get``/``require``; ``repr``/``str`` never show secrets, so an
    accidental log line or traceback cannot leak them. ``cache`` holds derived short-lived secrets
    (e.g. a GA4 access token minted from a service-account key) that the vault persists alongside.
    """

    __slots__ = ("connector", "scheme", "connection", "_values", "_secret_names", "cache")

    def __init__(self, connector: str, scheme: str, values: dict[str, str], *, connection: str = "default",
                 secret_names: set[str] | frozenset[str] = frozenset(), cache: dict[str, Any] | None = None) -> None:
        self.connector = connector
        self.scheme = scheme
        self.connection = connection
        self._values = {k: v for k, v in values.items() if v not in (None, "")}
        self._secret_names = frozenset(secret_names)
        self.cache: dict[str, Any] = dict(cache or {})

    def get(self, name: str, default: str | None = None) -> str | None:
        return self._values.get(name, default)

    def require(self, name: str) -> str:
        value = self._values.get(name)
        if not value:
            raise CredentialsRequired(f"missing credential field '{name}'")
        return value

    def public(self) -> dict[str, str]:
        """Non-secret values (safe to show), secrets as a short mask."""
        return {k: (mask(v) if k in self._secret_names else v) for k, v in self._values.items()}

    def secret_values(self) -> list[str]:
        values = [v for k, v in self._values.items() if k in self._secret_names]
        values += [v for k, v in self.cache.items() if isinstance(v, str) and k.endswith("token")]
        return values

    def __repr__(self) -> str:
        return f"Credentials(connector={self.connector!r}, scheme={self.scheme!r}, connection={self.connection!r}, fields={sorted(self._values)})"

    __str__ = __repr__


def mask(value: str) -> str:
    value = value or ""
    if len(value) <= 8:
        return "••••"
    return f"{value[:3]}…{value[-4:]}" if len(value) > 24 else f"••••{value[-4:]}"


# --- the connector -------------------------------------------------------------------------------
class BaseConnector(ABC):
    name: ClassVar[str]
    label: ClassVar[str]
    description: ClassVar[str] = ""
    #: Prefix of the LLM tools generated from ``capabilities`` (``<prefix>_<capability>``).
    tool_prefix: ClassVar[str] = ""
    auth_schemes: ClassVar[tuple[AuthScheme, ...]] = ()
    capabilities: ClassVar[tuple[Capability, ...]] = ()
    #: Shown on the credential form above the fields: where to find the inputs.
    docs_url: ClassVar[str] = ""

    def __init__(self, credentials: Credentials, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.credentials = credentials
        self.http = ConnectorHTTP(self.label, transport=transport)

    # --- the three operations every connector implements ---------------------------------------
    @abstractmethod
    async def authenticate(self) -> dict[str, Any]:
        """Validate the credentials against the live API. Returns a non-secret profile of the account
        (name, currency, ...). Raises ``CredentialsInvalid`` when they are rejected."""

    @abstractmethod
    async def fetch_data(self, resource: str, params: dict[str, Any]) -> dict[str, Any]:
        """Read ``resource`` (one of the ``read`` capabilities)."""

    async def execute_action(self, action: str, params: dict[str, Any]) -> dict[str, Any]:
        """Perform ``action`` (one of the ``write`` capabilities). Read-only connectors keep this default."""
        raise UnsupportedOperation(f"{self.label} is read-only: no action '{action}'")

    # --- declarations --------------------------------------------------------------------------
    @classmethod
    def scheme(cls, scheme_id: str) -> AuthScheme:
        for scheme in cls.auth_schemes:
            if scheme.id == scheme_id:
                return scheme
        raise ConnectorError(f"{cls.label} has no auth scheme '{scheme_id}'; use one of "
                             f"{[s.id for s in cls.auth_schemes]}", code="invalid_credentials_input")

    @classmethod
    def capability(cls, name: str, kind: str | None = None) -> Capability:
        for cap in cls.capabilities:
            if cap.name == name and (kind is None or cap.kind == kind):
                return cap
        names = [c.name for c in cls.capabilities if kind is None or c.kind == kind]
        raise UnsupportedOperation(f"{cls.label} has no {kind or ''} capability '{name}'; available: {names}".replace("  ", " "))

    @classmethod
    def describe(cls) -> dict[str, Any]:
        return {"name": cls.name, "label": cls.label, "description": cls.description, "tool_prefix": cls.tool_prefix,
                "docs_url": cls.docs_url, "auth_schemes": [s.describe() for s in cls.auth_schemes],
                "capabilities": [c.describe() for c in cls.capabilities]}

    @classmethod
    def normalize_credentials(cls, scheme_id: str, values: dict[str, Any]) -> dict[str, str]:
        """Check submitted form values against the scheme (required, pattern) and normalise them.
        Subclasses extend this for connector-specific shaping (e.g. ``act_`` prefixes)."""
        scheme = cls.scheme(scheme_id)
        known = {f.name: f for f in scheme.fields}
        clean: dict[str, str] = {}
        problems: list[str] = []
        for name, f in known.items():
            raw = values.get(name)
            text = raw if isinstance(raw, str) else ("" if raw is None else str(raw))
            text = text.strip()
            if not text:
                if f.required:
                    problems.append(f"{f.label} is required")
                continue
            if f.pattern and not re.fullmatch(f.pattern, text):
                problems.append(f"{f.label} has an unexpected format")
                continue
            clean[name] = text
        if problems:
            raise ConnectorError("; ".join(problems), code="invalid_credentials_input")
        return clean

    @classmethod
    def secret_field_names(cls, scheme_id: str) -> set[str]:
        return {f.name for f in cls.scheme(scheme_id).fields if f.secret}


# --- small parameter helpers shared by connectors -------------------------------------------------
def as_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return [str(v).strip() for v in value if str(v).strip()]


def as_int(value: Any, default: int, *, lo: int, hi: int) -> int:
    try:
        number = int(value) if value not in (None, "") else default
    except (TypeError, ValueError):
        raise ConnectorError(f"expected an integer, got {value!r}", code="invalid_parameters") from None
    return max(lo, min(hi, number))


def to_number(value: Any) -> Any:
    """Upstream APIs send numbers as strings: convert when it is lossless, else keep the value."""
    if isinstance(value, (int, float)) or value is None:
        return value
    if isinstance(value, str):
        try:
            return int(value) if re.fullmatch(r"-?\d+", value) else float(value)
        except ValueError:
            return value
    return value
