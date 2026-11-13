"""Connector capabilities as LLM tools with JSON-Schema declarations.

ADK agents:
    from tectonic_runtime.connectors.tools import connector_tools
    LlmAgent(..., tools=[*my_tools, *connector_tools()])

One tool per capability (``meta_ads_insights``, ``ga4_source_medium``, ...) is declared straight from the
connector's JSON Schema, plus ``connector_status``. The tools add their own usage rules to the system
instruction of any agent that has them, so no prompt change is needed to use them correctly.

Other frameworks (OpenAI / Anthropic function calling, LangGraph, CrewAI):
    specs = tool_specs()                       # [{name, description, parameters (JSON Schema)}]
    result = await dispatch(name, args, CallContext(agent_id=..., tenant_id=<user>, team=<project>))
"""

from __future__ import annotations

import copy
from typing import Any, Optional

from google.adk.tools import ToolContext
from google.adk.tools.base_tool import BaseTool
from google.genai import types

from ..base import CallContext
from ..identity import app_name_of, role_from_app, session_id_of, team_from_app
from .base import BaseConnector, Capability
from .registry import all_connectors, get_connector

MODULE = "external_connectors"
_MARKER = "## External data sources (client accounts)"

CONNECTOR_INSTRUCTIONS = f"""

{_MARKER}
- Tools prefixed meta_ads_* read the client's Meta (Facebook/Instagram) Ads account; ga4_* read their Google Analytics 4 property. Use them for every question about ad performance, spend, ROAS, traffic, sources/mediums or conversions — never estimate or invent these numbers.
- The user connects each data source once in the External Tools window (the plug icon in the Studio's dock); every workflow then uses that connection. connector_status shows what is connected. If the user connected several accounts of one source (e.g. one per client), pass connection="<label>".
- You choose every query detail yourself (dates, levels, metrics, dimensions, filters) from the user's request; only the connection itself comes from the user.
- If a tool returns status "not_connected" or "connection_failed": tell the user to connect (or reconnect) that source in the External Tools window. Never ask for tokens, keys or IDs in the chat. Do not estimate or invent the numbers; continue with the parts of the task that do not need that data and say clearly what is missing. Retry the tool when the user says it is connected.
- If a tool returns "fetch_failed", or "ok" with no_data=true, say plainly that no data came back (and why, if given), then continue with the rest of the workflow.
- meta_ads_create_campaign / meta_ads_create_ad_set only stage PAUSED objects that a human reviews and activates in Ads Manager. Confirm the plan with the user first (dry_run=true previews it), share the review_url, and never say anything is live.
- If the user pastes a token or key into the chat it is removed before you see it: ask them to use the External Tools window instead.
"""

_CONNECTION_PROP = {
    "type": "string",
    "description": "Which connected account to use when the project serves several clients (default 'default').",
}


def connector_context(tool_context: Optional[ToolContext], team: str | None = None) -> CallContext:
    """CallContext for a connector call: owner = the ADK user (the signed-in account), team = the project
    (recorded on data notices so that project's chat shows them)."""
    if tool_context is None:
        return CallContext(team=team)
    app = app_name_of(tool_context)
    return CallContext(
        agent_id=getattr(tool_context, "agent_name", None) or "anonymous",
        tenant_id=getattr(tool_context, "user_id", None) or "default",
        session_id=session_id_of(tool_context),
        role=role_from_app(app) if app else "worker",
        team=team_from_app(app) or team,
    )


def _runtime():
    from ..runtime import get_runtime

    return get_runtime()


def _shape(result: Any) -> dict[str, Any]:
    """What the model sees: the module's data envelope, or a compact error it can act on."""
    if result.ok:
        return result.data
    return {"status": "error", "error": result.error}


def tool_name(cls: type[BaseConnector], cap: Capability) -> str:
    return f"{cls.tool_prefix}_{cap.name}"


def tool_schema(cap: Capability) -> dict[str, Any]:
    schema = copy.deepcopy(cap.parameters) or {"type": "object", "properties": {}}
    schema.setdefault("type", "object")
    schema.setdefault("properties", {})["connection"] = dict(_CONNECTION_PROP)
    return schema


def tool_description(cls: type[BaseConnector], cap: Capability) -> str:
    tail = (" Reads the client's account connected in the External Tools window; if it is not connected, the result "
            "says so and the user is notified.") if cap.kind == "read" else \
        " Writes to the client's connected account (always staged PAUSED for human review)."
    return f"[{cls.label}] {cap.description}{tail}"


async def _invoke_capability(cls: type[BaseConnector], cap: Capability, args: dict[str, Any], ctx: CallContext) -> dict[str, Any]:
    args = dict(args or {})
    connection = str(args.pop("connection", "") or "default")
    if cap.kind == "read":
        op, payload = "fetch_data", {"connector": cls.name, "resource": cap.name, "params": args, "connection": connection}
    else:
        op, payload = "execute_action", {"connector": cls.name, "action": cap.name, "params": args, "connection": connection}
    return _shape(await _runtime().invoke(MODULE, op, payload, ctx))


class _InstructedTool(BaseTool):
    """Adds the connector usage rules to the agent's system instruction (once per request)."""

    async def process_llm_request(self, *, tool_context: ToolContext, llm_request: Any) -> None:
        await super().process_llm_request(tool_context=tool_context, llm_request=llm_request)
        current = getattr(getattr(llm_request, "config", None), "system_instruction", None)
        if _MARKER not in str(current or ""):
            llm_request.append_instructions([CONNECTOR_INSTRUCTIONS.strip()])


class ConnectorTool(_InstructedTool):
    """One connector capability, declared to the model from its JSON Schema."""

    def __init__(self, connector: type[BaseConnector], capability: Capability) -> None:
        super().__init__(name=tool_name(connector, capability), description=tool_description(connector, capability))
        self.connector = connector
        self.capability = capability

    def _get_declaration(self) -> types.FunctionDeclaration:
        return types.FunctionDeclaration(name=self.name, description=self.description,
                                         parameters_json_schema=tool_schema(self.capability))

    async def run_async(self, *, args: dict[str, Any], tool_context: ToolContext) -> Any:
        return await _invoke_capability(self.connector, self.capability, args, connector_context(tool_context))


_STATUS_SCHEMA = {"type": "object", "properties": {}}


class ConnectorStatusTool(_InstructedTool):
    def __init__(self) -> None:
        super().__init__(name="connector_status",
                         description="Which external data sources (Meta Ads, GA4, ...) the user has connected in the "
                                     "External Tools window, and their accounts.")

    def _get_declaration(self) -> types.FunctionDeclaration:
        return types.FunctionDeclaration(name=self.name, description=self.description, parameters_json_schema=_STATUS_SCHEMA)

    async def run_async(self, *, args: dict[str, Any], tool_context: ToolContext) -> Any:
        return _shape(await _runtime().invoke(MODULE, "connections", {}, connector_context(tool_context)))


def connector_tools(connectors: list[str] | tuple[str, ...] | None = None) -> list[BaseTool]:
    """ADK tools for the given connectors (default: every registered connector)."""
    classes = [get_connector(c) for c in connectors] if connectors else all_connectors()
    tools: list[BaseTool] = [ConnectorStatusTool()]
    for cls in classes:
        tools += [ConnectorTool(cls, cap) for cap in cls.capabilities]
    return tools


# --- framework-neutral binding ----------------------------------------------------------------------
def tool_specs(connectors: list[str] | tuple[str, ...] | None = None) -> list[dict[str, Any]]:
    """JSON-Schema function specs for any LLM API (OpenAI ``tools``, Anthropic ``tools``, ...)."""
    specs = [{"name": "connector_status", "description": ConnectorStatusTool().description,
               "parameters": copy.deepcopy(_STATUS_SCHEMA)}]
    for cls in ([get_connector(c) for c in connectors] if connectors else all_connectors()):
        specs += [{"name": tool_name(cls, cap), "description": tool_description(cls, cap), "parameters": tool_schema(cap)}
                  for cap in cls.capabilities]
    return specs


async def dispatch(name: str, args: dict[str, Any], ctx: CallContext) -> dict[str, Any]:
    """Execute a tool call produced from ``tool_specs`` (for non-ADK agent frameworks)."""
    if name == "connector_status":
        return _shape(await _runtime().invoke(MODULE, "connections", {}, ctx))
    for cls in all_connectors():
        for cap in cls.capabilities:
            if tool_name(cls, cap) == name:
                return await _invoke_capability(cls, cap, args, ctx)
    return {"status": "error", "error": f"unknown connector tool {name!r}"}
