"""HTTP API behind the Studio's **External Tools** window (and the chat's data notices).

Each data source is connected once per account, in the External Tools window; every agentic workflow of
that account then uses the connection. Credentials reach the server only through
``POST /connectors/connect`` — never through a chat message or an agent tool — are validated live
against the provider, then encrypted in the platform vault. No endpoint ever returns a secret value.

    GET    /connectors/catalog                                every data source and its credential form
    GET    /connectors/connections                            the account's connections (status, account, expiry)
    POST   /connectors/connect                                {connector, scheme, values, connection?}
    DELETE /connectors/connections/{connector}?connection=default
    GET    /connectors/notices?after=<seq>&project=<name>     data problems agents hit (not connected, failed,
                                                              no data), shown as pop-ups in the chat
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Body, HTTPException

from tectonic_runtime import CallContext, get_runtime
from tectonic_runtime.connectors import ConnectorError, all_connectors, owner_of
from tectonic_runtime.connectors.vault import clean_label

from .workspace import current_user

router = APIRouter(prefix="/connectors", tags=["connectors"])
_MAX_VALUES_BYTES = 64_000


def _module():
    return get_runtime().module("external_connectors")


def _owner() -> str:
    return owner_of(current_user())


def _ctx() -> CallContext:
    return CallContext(agent_id="studio_user", tenant_id=current_user() or "local", session_id="external-tools",
                       role="worker")


def _allowed_connectors() -> set[str]:
    """Connector names the signed-in user's plan entitles them to (fail open)."""
    try:
        from agent_builder import entitlements

        return set(entitlements.allowed_connectors(entitlements.effective_plan_id(current_user())))
    except Exception:  # pragma: no cover - entitlements unavailable
        return {cls.name for cls in all_connectors()}


@router.get("/catalog")
async def catalog() -> dict:
    allowed = _allowed_connectors()
    return {"connectors": [cls.describe() for cls in all_connectors() if cls.name in allowed]}


@router.get("/connections")
async def connections() -> dict:
    return {"connections": _module().vault.connections(_owner())}


@router.post("/connect")
async def connect(body: dict = Body(...)) -> dict:
    values = body.get("values")
    if not isinstance(values, dict):
        raise HTTPException(400, "values must be an object of credential fields")
    if len(json.dumps(values)) > _MAX_VALUES_BYTES:
        raise HTTPException(413, "credential payload too large")
    connector = str(body.get("connector") or "")
    if connector not in _allowed_connectors():
        raise HTTPException(403, {"code": "CONNECTOR_LOCKED", "detail": f"Connector '{connector}' is not included in your plan."})
    try:
        connection = clean_label(body.get("connection"))
        result = await _module().connect(owner=_owner(), connector=connector,
                                         scheme=str(body.get("scheme") or ""), values=values, connection=connection)
    except ConnectorError as exc:  # message already scrubbed of secrets
        raise HTTPException(400, {"code": exc.code, "message": str(exc)}) from None
    except ValueError as exc:
        raise HTTPException(400, {"code": "invalid_input", "message": str(exc)}) from None
    return {"status": "connected", "connection": result}


@router.delete("/connections/{connector}")
async def disconnect(connector: str, connection: str = "default") -> dict:
    result = await get_runtime().invoke("external_connectors", "disconnect",
                                        {"connector": connector, "connection": connection}, _ctx())
    if not result.ok:
        raise HTTPException(400, result.error)
    return result.data


@router.get("/notices")
async def notices(after: int = 0, project: str | None = None) -> dict:
    """Data notices newer than ``after`` (``latest`` is the cursor to send next time)."""
    module = _module()
    return {"notices": module.notices(_owner(), after_seq=after, team=project or None),
            "latest": module.latest_notice_seq()}
