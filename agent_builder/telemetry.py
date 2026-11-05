"""Live telemetry for the Command Center UI.

A global ADK plugin instruments every agent run (the builder and any generated agent served by
the same API server) and broadcasts standardized JSON events over the ``/ws/telemetry`` WebSocket.

Event contract (every event also carries ``type``, ``seq`` and ``timestamp`` in epoch seconds):
    AGENT_CREATED       { id, role, parent_id, system_prompt, description }
    AGENT_DELETED       { ids, project }  (agents removed from the Studio; their code is gone)
    AGENT_STATE_CHANGE  { id, state: "idle" | "thinking" | "tool_execution" | "error", detail? }
    TOOL_CALL_START     { id, call_id, tool_name, payload }
    TOOL_CALL_END       { id, call_id, tool_name, payload, result, duration_ms, status }
    A2A_MESSAGE         { from_id, to_id, message_summary }
    TOKEN_STREAM        { id, chunk }
    AGENT_METRICS       { id, prompt_tokens, completion_tokens, total_tokens }
    RUN_STARTED / RUN_COMPLETED { invocation_id, app_name, root_id }
    HELLO               { server_id }  (seq 0, first frame on every connection)
    MODULE_*            shared core-module activity, see tectonic_runtime/events.py

TOOL_CALL_END also carries ``state_delta``: the session-state keys the tool wrote (agent memory).
Agent events carry ``team`` (derived from the ADK app: the Builder, or the generated project).

Platform hooks (shared tectonic_runtime modules):
  * FinOps meters every model response's token usage and enforces blocking budgets before calls.
  * PromptOps receives the Builder's run outcomes for the prompt version each session was served.
  * Auditability chains these events (wired in server.py through ``hub.add_listener``).
"""

from __future__ import annotations

import asyncio
import itertools
import json
import time
import uuid
from collections import deque
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.agent_tool import AgentTool

from .tracing import logger
from .workspace import current_user

_MAX_STRING = 6_000
_REPLAY_EVENTS = 500
_CHUNK_SIZE = 48


def _jsonable(value: Any, depth: int = 0) -> Any:
    """Convert arbitrary tool/model payloads into bounded, JSON-serializable data."""
    if depth > 8:
        return "…"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value if len(value) <= _MAX_STRING else value[:_MAX_STRING] + f"… [+{len(value) - _MAX_STRING} chars]"
    if isinstance(value, dict):
        return {str(k): _jsonable(v, depth + 1) for k, v in list(value.items())[:200]}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v, depth + 1) for v in list(value)[:200]]
    if hasattr(value, "model_dump"):
        try:
            return _jsonable(value.model_dump(exclude_none=True, mode="json"), depth + 1)
        except Exception:  # pragma: no cover - defensive
            pass
    return _jsonable(str(value), depth + 1)


def _summarize(args: dict) -> str:
    """One-line summary of the request a parent hands to a sub-agent."""
    for key in ("request", "query", "input", "prompt", "message", "result"):
        if isinstance(args.get(key), str) and args[key].strip():
            text = args[key].strip()
            break
    else:
        text = json.dumps(_jsonable(args), default=str)
    text = " ".join(text.split())
    return text if len(text) <= 160 else text[:157] + "..."


def _system_prompt(agent: Any) -> str:
    instruction = getattr(agent, "instruction", "")
    if callable(instruction):
        return "<dynamic instruction provider>"
    return str(instruction or "")


def _model_name(agent: Any) -> str:
    model = getattr(agent, "model", "") or ""
    return model if isinstance(model, str) else str(getattr(model, "model", "") or type(model).__name__)


_STICKY = {"AGENT_CREATED": "id", "MODULE_REGISTERED": "module", "MODULE_STATE": "module"}


class TelemetryHub:
    """Fan-out of telemetry events to connected WebSocket clients.

    Every event carries the ``owner`` (signed-in user) whose run produced it; a client only receives its
    own user's events plus unowned ones (platform modules, runs without a signed-in user)."""

    def __init__(self) -> None:
        self._subscribers: dict[asyncio.Queue, Optional[str]] = {}
        self._recent: deque[dict] = deque(maxlen=_REPLAY_EVENTS)
        # Latest event per entity for state that late joiners must see (agents, module registry/state).
        self._sticky: dict[tuple[str, str], dict] = {}
        self._seq = itertools.count(1)
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._listeners: list = []
        self.server_id = uuid.uuid4().hex

    def add_listener(self, listener) -> None:
        """In-process consumers (e.g. the audit trail) receive every event synchronously."""
        self._listeners.append(listener)

    def emit(self, event_type: str, **payload: Any) -> None:
        event = {"type": event_type, "seq": next(self._seq), "timestamp": time.time(), "owner": current_user(), **payload}
        sticky_key = _STICKY.get(event_type)
        if sticky_key:
            self._sticky[(event_type, event["owner"], str(event.get(sticky_key)))] = event
        else:
            self._recent.append(event)
        for listener in self._listeners:
            try:
                listener(event)
            except Exception:  # a broken consumer must never break an agent
                logger.exception("telemetry listener failed")
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            self._fan_out(event)
        else:  # emitted from a worker thread (e.g. a sync tool)
            loop.call_soon_threadsafe(self._fan_out, event)

    @staticmethod
    def _visible(event: dict, owner: Optional[str]) -> bool:
        return event.get("owner") in (None, owner)

    def _fan_out(self, event: dict) -> None:
        for queue, owner in list(self._subscribers.items()):
            if not self._visible(event, owner):
                continue
            if queue.full():  # slow client: drop its oldest event rather than block agents
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(event)

    def knows(self, agent_id: str) -> bool:
        return ("AGENT_CREATED", current_user(), agent_id) in self._sticky

    def forget(self, agent_ids: list[str], **payload: Any) -> None:
        """Agents were deleted: drop them from the late-joiner replay and tell live clients."""
        for agent_id in agent_ids:
            self._sticky.pop(("AGENT_CREATED", current_user(), agent_id), None)
        self.emit("AGENT_DELETED", ids=list(agent_ids), **payload)

    def subscribe(self, owner: Optional[str] = None) -> asyncio.Queue:
        self._loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue(maxsize=5_000)
        queue.put_nowait({"type": "HELLO", "seq": 0, "timestamp": time.time(), "server_id": self.server_id})
        # Snapshot first: every known agent, then recent activity, in original order.
        for event in sorted([*self._sticky.values(), *self._recent], key=lambda e: e["seq"]):
            if self._visible(event, owner):
                queue.put_nowait(event)
        self._subscribers[queue] = owner
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.pop(queue, None)


hub = TelemetryHub()


def _runtime():
    """The shared module runtime, if available (the server always has it)."""
    try:
        from tectonic_runtime import get_runtime

        return get_runtime()
    except Exception:  # pragma: no cover - runtime package absent
        return None


def _team(context: Any) -> Optional[str]:
    try:
        from tectonic_runtime.identity import app_name_of, team_from_app

        return team_from_app(app_name_of(context))
    except Exception:
        return None


def _response_model(callback_context: Any, llm_response: Any) -> str:
    version = getattr(llm_response, "model_version", None)
    if isinstance(version, str) and version:
        return version
    inv = getattr(callback_context, "_invocation_context", None)
    return _model_name(getattr(inv, "agent", None)) or "unknown"


BUILDER_PROMPT = "agent_builder.root"


class TelemetryPlugin(BasePlugin):
    """Translates ADK lifecycle callbacks into Command Center events."""

    def __init__(self, name: str = "command_center_telemetry") -> None:
        super().__init__(name=name)
        self._parent_hint: dict[str, str] = {}
        self._tool_started: dict[str, float] = {}
        self._streamed: set[tuple[str, str]] = set()

    # --- runs -------------------------------------------------------------------------------
    async def before_run_callback(self, *, invocation_context: Any) -> None:
        hub._loop = asyncio.get_running_loop()
        hub.emit(
            "RUN_STARTED",
            invocation_id=invocation_context.invocation_id,
            app_name=getattr(invocation_context, "app_name", ""),
            root_id=getattr(invocation_context.agent, "name", ""),
            team=_team(invocation_context),
        )
        return None

    async def after_run_callback(self, *, invocation_context: Any) -> None:
        hub.emit(
            "RUN_COMPLETED",
            invocation_id=invocation_context.invocation_id,
            app_name=getattr(invocation_context, "app_name", ""),
            root_id=getattr(invocation_context.agent, "name", ""),
            team=_team(invocation_context),
        )
        await self._record_prompt_outcome(invocation_context, passed=True)

    async def on_run_error_callback(self, *, invocation_context: Any, error: Exception) -> None:
        await self._record_prompt_outcome(invocation_context, passed=False)

    async def _record_prompt_outcome(self, invocation_context: Any, passed: bool) -> None:
        """Coarse automatic signal for PromptOps A/B tests: did the Builder's run finish cleanly?"""
        if getattr(invocation_context, "app_name", None) != "agent_builder":
            return
        if getattr(invocation_context.agent, "name", None) != "agent_builder":  # a sub-agent run directly from the chat
            return
        rt = _runtime()
        session = getattr(invocation_context, "session", None)
        if rt is None or session is None:
            return
        try:
            await rt.module("promptops").record(BUILDER_PROMPT, passed, session_id=session.id, metric="run_completed")
        except Exception as exc:
            logger.warning("PromptOps outcome not recorded: %s", exc)

    # --- agents -----------------------------------------------------------------------------
    async def before_agent_callback(self, *, agent: Any, callback_context: Any) -> None:
        agent_id = agent.name
        if not hub.knows(agent_id):
            parent = getattr(agent, "parent_agent", None)
            parent_id = self._parent_hint.get(agent_id) or (parent.name if parent else None)
            hub.emit(
                "AGENT_CREATED",
                id=agent_id,
                role=agent_id,
                parent_id=parent_id,
                description=getattr(agent, "description", "") or "",
                system_prompt=_jsonable(_system_prompt(agent)),
                model=_model_name(agent),
                team=_team(callback_context),
            )
        hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="thinking")
        return None

    async def after_agent_callback(self, *, agent: Any, callback_context: Any) -> None:
        self._streamed.discard((callback_context.invocation_id, agent.name))
        hub.emit("AGENT_STATE_CHANGE", id=agent.name, state="idle")
        return None

    async def on_agent_error_callback(self, *, agent: Any, callback_context: Any, error: Exception) -> None:
        hub.emit("AGENT_STATE_CHANGE", id=agent.name, state="error", detail=str(error)[:500])

    # --- model ------------------------------------------------------------------------------
    async def before_model_callback(self, *, callback_context: Any, llm_request: Any) -> Any:
        agent_id = callback_context.agent_name
        rt = _runtime()
        if rt is not None:
            try:
                blocked, reason = await rt.module("finops").is_blocked(_team(callback_context))
            except Exception as exc:  # guardrail failures must not take agents down
                logger.warning("FinOps budget check failed: %s", exc)
                blocked, reason = False, ""
            if blocked:
                from google.adk.models.llm_response import LlmResponse
                from google.genai import types as genai_types

                hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="error", detail="budget exhausted")
                return LlmResponse(content=genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=reason)]))
        hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="thinking")
        return None

    async def after_model_callback(self, *, callback_context: Any, llm_response: Any) -> None:
        agent_id = callback_context.agent_name
        key = (callback_context.invocation_id, agent_id)
        partial = bool(getattr(llm_response, "partial", False))
        content = getattr(llm_response, "content", None)
        texts = [
            ("thought" if getattr(p, "thought", False) else "text", p.text)
            for p in (getattr(content, "parts", None) or [])
            if isinstance(getattr(p, "text", None), str) and p.text
        ]
        if partial:
            self._streamed.add(key)
            for kind, text in texts:
                hub.emit("TOKEN_STREAM", id=agent_id, chunk=text, kind=kind)
        elif key not in self._streamed:
            # Non-streaming run: replay the final text as chunks so the trace still "types".
            for kind, text in texts:
                for i in range(0, len(text), _CHUNK_SIZE):
                    hub.emit("TOKEN_STREAM", id=agent_id, chunk=text[i : i + _CHUNK_SIZE], kind=kind)
                hub.emit("TOKEN_STREAM", id=agent_id, chunk="\n", kind=kind)

        usage = getattr(llm_response, "usage_metadata", None)
        if usage is not None and not partial:
            prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
            completion_tokens = getattr(usage, "candidates_token_count", 0) or 0
            model = _response_model(callback_context, llm_response)
            team = _team(callback_context)
            hub.emit(
                "AGENT_METRICS",
                id=agent_id,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=getattr(usage, "total_token_count", 0) or 0,
                model=model,
                team=team,
            )
            rt = _runtime()
            if rt is not None:
                try:
                    await rt.module("finops").meter(team=team, agent_id=agent_id, model=model, input_tokens=prompt_tokens,
                                                    output_tokens=completion_tokens, kind="agent")
                except Exception as exc:
                    logger.warning("FinOps metering failed: %s", exc)
        error = getattr(llm_response, "error_message", None)
        if error:
            hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="error", detail=str(error)[:500])
        return None

    async def on_model_error_callback(self, *, callback_context: Any, llm_request: Any, error: Exception) -> None:
        hub.emit("AGENT_STATE_CHANGE", id=callback_context.agent_name, state="error", detail=str(error)[:500])
        return None

    # --- tools ------------------------------------------------------------------------------
    async def before_tool_callback(self, *, tool: Any, tool_args: dict, tool_context: Any) -> None:
        agent_id = tool_context.agent_name
        call_id = tool_context.function_call_id or f"{agent_id}:{tool.name}:{time.time_ns()}"
        self._tool_started[call_id] = time.perf_counter()
        hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="tool_execution", detail=tool.name)
        hub.emit("TOOL_CALL_START", id=agent_id, call_id=call_id, tool_name=tool.name, payload=_jsonable(tool_args),
                 team=_team(tool_context))
        if isinstance(tool, AgentTool):
            child = tool.agent.name
            self._parent_hint[child] = agent_id
            hub.emit("A2A_MESSAGE", from_id=agent_id, to_id=child, message_summary=_summarize(tool_args), team=_team(tool_context))
        return None

    async def after_tool_callback(self, *, tool: Any, tool_args: dict, tool_context: Any, result: Any) -> None:
        self._end_tool(tool, tool_args, tool_context, result, None)
        if isinstance(tool, AgentTool):
            hub.emit(
                "A2A_MESSAGE",
                from_id=tool.agent.name,
                to_id=tool_context.agent_name,
                message_summary=_summarize({"result": result if isinstance(result, str) else json.dumps(_jsonable(result), default=str)}),
            )
        return None

    async def on_tool_error_callback(self, *, tool: Any, tool_args: dict, tool_context: Any, error: Exception) -> None:
        self._end_tool(tool, tool_args, tool_context, {"error": str(error)}, error)
        return None

    def _end_tool(self, tool: Any, tool_args: dict, tool_context: Any, result: Any, error: Optional[Exception]) -> None:
        agent_id = tool_context.agent_name
        call_id = tool_context.function_call_id or ""
        started = self._tool_started.pop(call_id, None)
        actions = getattr(tool_context, "actions", None)
        state_delta = dict(getattr(actions, "state_delta", None) or {})
        status = "error" if error or (isinstance(result, dict) and result.get("status") == "error") else "success"
        hub.emit(
            "TOOL_CALL_END",
            id=agent_id,
            call_id=call_id,
            tool_name=tool.name,
            payload=_jsonable(tool_args),
            result=_jsonable(result),
            status=status,
            state_delta=_jsonable(state_delta),
            duration_ms=round((time.perf_counter() - started) * 1000, 1) if started else None,
        )
        if error:
            hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="error", detail=str(error)[:500])
        else:
            hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="thinking")


telemetry_plugin = TelemetryPlugin()

router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = hub.subscribe(owner=current_user())  # only this user's events (see TelemetryHub)
    logger.info("TELEMETRY client connected (%d total)", len(hub._subscribers))
    try:
        while True:
            event = await queue.get()
            await websocket.send_text(json.dumps(event, default=str))
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.unsubscribe(queue)
        logger.info("TELEMETRY client disconnected")
