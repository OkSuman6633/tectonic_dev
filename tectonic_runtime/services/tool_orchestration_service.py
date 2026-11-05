"""Tool Orchestration module: reliable tool execution (modules/tool-orchestration core).

Every call goes through the module's circuit breaker, retry manager (with backoff) and rolling
reliability scorer. Tools are Python callables registered in-process by the Builder or by any
worker agent; a few safe built-ins are always available.
"""

from __future__ import annotations

import ast
import operator
from datetime import UTC, datetime
from typing import Any, Callable

from .._paths import ensure_module_paths
from ..adapters import LOCAL_SERVER_REF, LocalToolExecutor
from ..base import BaseModule, CallContext, operation

ensure_module_paths()

from tool_orchestration.config import CircuitBreakerConfig, RetryConfig  # noqa: E402
from tool_orchestration.core.circuit_breaker import CircuitBreaker  # noqa: E402
from tool_orchestration.core.domain import CircuitOpenError, ToolDefinitionRecord, ToolStatus  # noqa: E402
from tool_orchestration.core.fakes import InMemoryCircuitBreakerStore, InMemoryToolRepository  # noqa: E402
from tool_orchestration.core.orchestration_service import ToolOrchestrationService  # noqa: E402
from tool_orchestration.core.reliability_scorer import ReliabilityScorer  # noqa: E402
from tool_orchestration.core.retry_manager import RetryManager  # noqa: E402

_ARITH = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
          ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv, ast.USub: operator.neg, ast.UAdd: operator.pos}


def _calculate(expression: str) -> dict[str, Any]:
    """Safely evaluate an arithmetic expression (numbers and + - * / // % ** only)."""

    def ev(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _ARITH:
            if isinstance(node.op, ast.Pow) and abs(ev(node.right)) > 100:
                raise ValueError("exponent too large")
            return _ARITH[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _ARITH:
            return _ARITH[type(node.op)](ev(node.operand))
        raise ValueError(f"unsupported expression element: {type(node).__name__}")

    return {"expression": expression, "value": ev(ast.parse(expression, mode="eval"))}


def _current_time(timezone: str = "UTC") -> dict[str, Any]:
    """Current date/time in UTC (ISO-8601)."""
    return {"timezone": "UTC", "iso": datetime.now(UTC).isoformat(timespec="seconds")}


def _text_stats(text: str) -> dict[str, Any]:
    """Word, character and line counts for a piece of text."""
    return {"words": len(text.split()), "characters": len(text), "lines": text.count("\n") + 1 if text else 0}


BUILTIN_TOOLS: dict[str, Callable[..., Any]] = {"calculate": _calculate, "current_time": _current_time, "text_stats": _text_stats}


class ToolOrchestrationModule(BaseModule):
    name = "tool_orchestration"
    label = "Tool Orchestration"
    description = "Executes registered tools with retries, circuit breaking and reliability scoring."
    category = "execution"

    async def setup(self) -> None:
        self.executor = LocalToolExecutor()
        self.repository = InMemoryToolRepository()
        self.cb_store = InMemoryCircuitBreakerStore()
        self.service = ToolOrchestrationService(
            repository=self.repository,
            circuit_breaker_store=self.cb_store,
            circuit_breaker=CircuitBreaker(CircuitBreakerConfig(failure_threshold=0.5, open_duration_seconds=30)),
            retry_manager=RetryManager(self.executor, RetryConfig(default_max_retries=2), backoff_base_seconds=0.1),
            reliability_scorer=ReliabilityScorer(),
        )
        self._owners: dict[str, str] = {}
        for name, fn in BUILTIN_TOOLS.items():
            self._register(name, fn, owner="runtime", description=(fn.__doc__ or "").strip())

    def _register(self, name: str, fn: Callable[..., Any], *, owner: str, description: str = "",
                  max_retries: int | None = None, backoff: str | None = None, timeout_s: float | None = None) -> None:
        policy = {k: v for k, v in {"max_retries": max_retries, "backoff_strategy": backoff}.items() if v is not None}
        self.executor.register(name, fn, timeout_s)
        self.repository.seed_tool(ToolDefinitionRecord(
            id=name, tenant_id="*", name=name, mcp_server_ref=LOCAL_SERVER_REF,
            schema={"description": description, **({"retry_policy": policy} if policy else {})},
            status=ToolStatus.ACTIVE,
        ))
        self._owners[name] = owner

    async def register_callable(self, name: str, fn: Callable[..., Any], *, owner: str = "anonymous", description: str = "",
                                max_retries: int | None = None, backoff: str | None = None, timeout_s: float | None = None) -> None:
        """Python API (not an operation — callables can't travel through a JSON payload)."""
        await self.boot()
        self._register(name, fn, owner=owner, description=description or (fn.__doc__ or "").strip(),
                       max_retries=max_retries, backoff=backoff, timeout_s=timeout_s)
        self._set_state(self.state if self.state != "offline" else "idle", f"registered tool {name}")

    @operation("Invoke a registered tool through the circuit breaker and retry manager.")
    async def call_tool(self, ctx: CallContext, tool: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            outcome = await self.service.invoke(tool_id=tool, arguments=dict(arguments or {}),
                                                agent_ref=ctx.agent_id, tenant_id=ctx.tenant_id)
        except CircuitOpenError as exc:
            retry = exc.retry_after.isoformat() if exc.retry_after else "later"
            raise RuntimeError(f"circuit open for '{tool}' — failing fast, retry after {retry}") from None
        return {"tool": tool, "output": outcome.output, "retries": outcome.retry_count, "latency_ms": round(outcome.latency_ms, 2)}

    @operation("List tools available to agents, with their reliability and circuit state.")
    async def list_tools(self, ctx: CallContext) -> dict[str, Any]:
        return {"tools": [await self._health(tool_id) for tool_id in list(self.repository.tools)]}

    @operation("Reliability score and circuit-breaker state for one tool.")
    async def health(self, ctx: CallContext, tool: str) -> dict[str, Any]:
        return await self._health(tool)

    async def _health(self, tool_id: str) -> dict[str, Any]:
        record = await self.repository.get_tool_definition(tool_id)
        if record is None:
            raise KeyError(f"unknown tool '{tool_id}'")
        score = await self.repository.get_reliability_score(tool_id)
        cb = await self.cb_store.get_state(tool_id)
        return {
            "tool": tool_id,
            "owner": self._owners.get(tool_id, "unknown"),
            "description": record.schema.get("description", ""),
            "success_rate": round(score.rolling_success_rate, 3) if score else None,
            "avg_latency_ms": round(score.rolling_avg_latency_ms, 2) if score else None,
            "circuit": cb.state.value,
        }

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name == "call_tool" and isinstance(data, dict):
            retries = f" after {data['retries']} retries" if data["retries"] else ""
            return f"{data['tool']} ok in {data['latency_ms']}ms{retries}"
        if op_name == "list_tools" and isinstance(data, dict):
            return f"{len(data['tools'])} tools"
        return super().summarize(op_name, data)
