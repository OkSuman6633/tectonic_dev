"""External Connectors: the platform module agents use to read (and safely stage) clients' own data in
third-party APIs — Meta Ads and Google Analytics 4 today, any registered ``BaseConnector`` tomorrow.

Users connect each data source once, in the Studio's **External Tools** window (``/connectors`` API →
``connect``); every agentic workflow of that account then uses the established connection. Agents call
``fetch_data`` / ``execute_action``. Whenever data cannot be delivered — the source is not connected, its
credentials were rejected, the provider failed, or the query found no data — the module returns a clear
status the agent relays (never invented numbers) and records a **data notice** that the chat shows the user.

Secrets never enter an operation's payload or result — every operation call is broadcast on the event
bus and lands in the audit trail — so credential submission is the plain Python method ``connect``,
called by the HTTP API, not an ``@operation``.
"""

from __future__ import annotations

import itertools
import threading
import time
from collections import deque
from typing import Any

import httpx

from ..base import BaseModule, CallContext, operation
from ..connectors.base import BaseConnector, ConnectorError, Credentials, CredentialsInvalid, CredentialsRequired
from ..connectors.redaction import install_log_redaction, register_secret, scrub
from ..connectors.registry import all_connectors, get_connector
from ..connectors.vault import ConnectionKey, CredentialVault, clean_label, owner_of

WHERE = "the External Tools window (the plug icon in the Studio's dock)"
# Provider-side failures the user should hear about. Parameter mistakes are the agent's to fix, not notices.
_FETCH_FAILURES = {"upstream_error", "rate_limited", "upstream_unreachable", "connector_error"}
_NOTICE_KINDS = ("not_connected", "connection_failed", "fetch_failed", "no_data")


def _inputs(cls: type[BaseConnector]) -> list[str]:
    labels: list[str] = []
    for scheme in cls.auth_schemes:
        for field in scheme.fields:
            if field.required and field.label not in labels:
                labels.append(field.label)
    return labels


def _is_empty(data: Any) -> bool:
    """A read that succeeded but found nothing (no rows / no campaigns) for the requested scope."""
    if not isinstance(data, dict):
        return False
    for key in ("row_count", "count"):
        if key in data and not data[key]:
            return True
    return False


class ExternalConnectorsModule(BaseModule):
    name = "external_connectors"
    label = "External Connectors"
    description = ("Secure bridge to clients' own third-party data (Meta Ads, Google Analytics 4): connected once "
                   "in the External Tools window, used by every workflow, credentials never shown to the model.")
    category = "integration"

    def __init__(self, bus) -> None:
        super().__init__(bus)
        self.vault = CredentialVault()
        # Tests inject an httpx.MockTransport here; None uses the network.
        self.transport: httpx.AsyncBaseTransport | None = None
        self._notices: deque[dict[str, Any]] = deque(maxlen=1000)
        self._notice_seq = itertools.count(1)
        self._notice_lock = threading.Lock()
        self._last_seq = 0

    async def setup(self) -> None:
        install_log_redaction()

    def key(self, ctx: CallContext, connector: str, connection: str = "default") -> ConnectionKey:
        return ConnectionKey(owner_of(ctx.tenant_id), get_connector(connector).name, clean_label(connection))

    # --- data notices (shown in the chat) ---------------------------------------------------------
    def _notice(self, ctx: CallContext, kind: str, cls: type[BaseConnector], connection: str, what: str,
                message: str) -> dict[str, Any]:
        with self._notice_lock:
            seq = next(self._notice_seq)
            self._last_seq = seq
            notice = {"seq": seq, "kind": kind, "owner": owner_of(ctx.tenant_id), "team": ctx.team,
                      "agent": ctx.agent_id, "connector": cls.name, "label": cls.label, "connection": connection,
                      "what": what, "message": scrub(message), "at": time.time()}
            self._notices.append(notice)
        public = {k: v for k, v in notice.items() if k != "owner"}
        self._bus.emit("CONNECTOR_NOTICE", module=self.name, **public)
        return public

    def notices(self, owner: str, *, after_seq: int = 0, team: str | None = None) -> list[dict[str, Any]]:
        with self._notice_lock:
            items = [n for n in self._notices if n["owner"] == owner and n["seq"] > after_seq
                     and (team is None or n["team"] == team)]
        return [{k: v for k, v in n.items() if k != "owner"} for n in items]

    def latest_notice_seq(self) -> int:
        return self._last_seq

    # --- operations agents use -------------------------------------------------------------------
    @operation("Connector catalogue: data sources, their credential inputs and tool capabilities")
    async def catalog(self, ctx: CallContext) -> list[dict[str, Any]]:
        return [cls.describe() for cls in all_connectors()]

    @operation("Which external data sources the account has connected (and which it has not)")
    async def connections(self, ctx: CallContext) -> dict[str, Any]:
        stored = self.vault.connections(owner_of(ctx.tenant_id))
        connected = {(c["connector"], c["connection"]) for c in stored}
        missing = [{"connector": cls.name, "label": cls.label, "connection": "default", "status": "not_connected",
                    "how_to_connect": f"The user connects {cls.label} in {WHERE}."}
                   for cls in all_connectors() if (cls.name, "default") not in connected]
        return {"connections": stored + missing}

    @operation("Read data from an external source (e.g. meta_ads insights, google_analytics report)")
    async def fetch_data(self, ctx: CallContext, connector: str, resource: str, params: dict[str, Any] | None = None,
                         connection: str = "default") -> dict[str, Any]:
        return await self._run(ctx, connector, "read", resource, params or {}, connection)

    @operation("Perform a write on an external source (Meta Ads: stage PAUSED campaigns / ad sets)")
    async def execute_action(self, ctx: CallContext, connector: str, action: str, params: dict[str, Any] | None = None,
                             connection: str = "default") -> dict[str, Any]:
        return await self._run(ctx, connector, "write", action, params or {}, connection)

    @operation("Disconnect a data source: delete its stored credentials")
    async def disconnect(self, ctx: CallContext, connector: str, connection: str = "default") -> dict[str, Any]:
        key = self.key(ctx, connector, connection)
        removed = self.vault.delete(key)
        self._bus.emit("CONNECTOR_DISCONNECTED", module=self.name, connector=key.connector, connection=key.connection)
        return {"connector": key.connector, "connection": key.connection, "removed": removed}

    # --- credential submission (HTTP API only; deliberately NOT an @operation) ---------------------
    async def connect(self, *, owner: str, connector: str, scheme: str, values: dict[str, Any],
                      connection: str = "default") -> dict[str, Any]:
        """Validate submitted credentials against the live API, then vault them for the account.

        Raises ``ConnectorError`` (scrubbed message) when the input is malformed or the API rejects it;
        nothing is stored in that case."""
        cls = get_connector(connector)
        key = ConnectionKey(owner, cls.name, clean_label(connection))
        clean = cls.normalize_credentials(scheme, values)
        secret_names = cls.secret_field_names(scheme)
        register_secret(*(clean[n] for n in secret_names if n in clean))
        creds = Credentials(cls.name, scheme, clean, connection=key.connection, secret_names=secret_names)
        try:
            profile = await cls(creds, transport=self.transport).authenticate()
        except ConnectorError:
            raise
        except Exception as exc:  # never let an unexpected upstream error carry a secret outward
            raise ConnectorError(f"could not verify the credentials: {type(exc).__name__}: {scrub(str(exc))}") from None
        summary = self.vault.put(key, scheme=scheme, values=clean, secret_names=secret_names, profile=profile,
                                 cache=creds.cache)
        self._bus.emit("CONNECTOR_CONNECTED", module=self.name, connector=cls.name, connection=key.connection,
                       profile=profile)
        return summary

    # --- internals -------------------------------------------------------------------------------
    def _unavailable(self, ctx: CallContext, cls: type[BaseConnector], key: ConnectionKey, what: str,
                     status: str, reason: str) -> dict[str, Any]:
        label = cls.label + ("" if key.connection == "default" else f" (connection '{key.connection}')")
        notice = self._notice(ctx, status, cls, key.connection, what, reason)
        return {
            "status": status,
            "connector": cls.name,
            "connection": key.connection,
            "notice_id": notice["seq"],
            "message": (
                f"NO DATA — {reason} The user has been notified in the chat. Tell them to connect {label} in {WHERE} "
                f"(inputs: {', '.join(_inputs(cls))}). Never ask for credentials in the chat and never estimate or "
                f"invent the missing numbers. Continue with any parts of the task that do not need {label} data, state "
                "clearly what is missing, and retry this tool when the user says it is connected."),
        }

    async def _run(self, ctx: CallContext, connector: str, kind: str, name: str, params: dict[str, Any],
                   connection: str) -> dict[str, Any]:
        cls = get_connector(connector)
        cls.capability(name, kind)  # validate before touching credentials
        key = self.key(ctx, cls.name, connection)
        what = f"{cls.tool_prefix}_{name}"
        creds = self.vault.credentials(key)
        if creds is None:
            status = self.vault.status(key)
            if status.get("status") == "invalid":
                return self._unavailable(ctx, cls, key, what, "connection_failed",
                                         f"The {cls.label} connection failed: {status.get('error')}")
            return self._unavailable(ctx, cls, key, what, "not_connected", f"{cls.label} is not connected.")
        instance = cls(creds, transport=self.transport)
        try:
            data = await (instance.fetch_data(name, params) if kind == "read" else instance.execute_action(name, params))
        except CredentialsRequired as exc:
            return self._unavailable(ctx, cls, key, what, "not_connected", str(exc))
        except CredentialsInvalid as exc:
            self.vault.mark_invalid(key, str(exc))
            return self._unavailable(ctx, cls, key, what, "connection_failed",
                                     f"{cls.label} rejected the stored credentials: {exc}")
        except ConnectorError as exc:
            if exc.code not in _FETCH_FAILURES:
                raise  # bad parameters: the agent fixes its call
            notice = self._notice(ctx, "fetch_failed", cls, key.connection, what, f"{cls.label}: {exc}")
            return {"status": "fetch_failed", "connector": cls.name, "connection": key.connection,
                    "notice_id": notice["seq"], "retryable": exc.retryable,
                    "message": (f"NO DATA — the {cls.label} request failed: {exc} The user has been notified in the "
                                "chat. Do not invent the numbers; continue with what you can and say what is missing.")}
        except Exception as exc:
            raise ConnectorError(f"{cls.label} call failed: {type(exc).__name__}: {scrub(str(exc))}") from None
        finally:
            self.vault.save_cache(key, instance.credentials.cache)
        result = {"status": "ok", "connector": cls.name, "connection": key.connection,
                  ("resource" if kind == "read" else "action"): name,
                  "account": self.vault.profile(key), "data": scrub(data)}
        if kind == "read" and _is_empty(data):
            notice = self._notice(ctx, "no_data", cls, key.connection, what,
                                  f"{cls.label} returned no data for {what} with these filters/dates.")
            result.update(no_data=True, notice_id=notice["seq"],
                          message=f"{cls.label} returned no data for this query (the user has been notified in the "
                                  "chat). Say so plainly, suggest a wider date range or other filters if useful, and "
                                  "continue with the rest of the task.")
        return result

    def summarize(self, op_name: str, data: Any) -> str:
        if isinstance(data, dict) and data.get("status") in _NOTICE_KINDS:
            return f"{data['connector']}: {data['status'].replace('_', ' ')}"
        if isinstance(data, dict) and data.get("status") == "ok":
            inner = data.get("data") or {}
            count = inner.get("row_count", inner.get("count")) if isinstance(inner, dict) else None
            what = data.get("resource") or data.get("action")
            return f"{data['connector']}.{what} ok" + (f" · {count} rows" if count is not None else "")
        return super().summarize(op_name, data)
