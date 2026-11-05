"""ModuleRuntime: the one entry point the Builder Agent and every worker agent use.

    from tectonic_runtime import get_runtime, CallContext
    rt = get_runtime()
    result = await rt.invoke("guardrails", "check_input", {"text": msg}, CallContext(agent_id="billing_worker"))
    if result.ok: ...
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

from .base import BaseModule, CallContext, ModuleResult
from .events import ModuleEventBus, bus as default_bus
from .services.guardrails_service import GuardrailsModule
from .services.intent_service import IntentDetectionModule
from .services.long_term_memory_service import LongTermMemoryModule
from .services.short_term_memory_service import ShortTermMemoryModule
from .services.tool_orchestration_service import ToolOrchestrationModule
from .services.agentic_rag_service import AgenticRAGModule
from .services.auditability_service import AuditabilityModule
from .services.finops_service import FinOpsModule
from .services.promptops_service import PromptOpsModule
from .services.vector_db_service import VectorDBModule
from . import models

MODULE_CLASSES: tuple[type[BaseModule], ...] = (
    GuardrailsModule,
    IntentDetectionModule,
    ShortTermMemoryModule,
    LongTermMemoryModule,
    ToolOrchestrationModule,
    AgenticRAGModule,
    VectorDBModule,
    FinOpsModule,
    PromptOpsModule,
    AuditabilityModule,
)


class ModuleRuntime:
    def __init__(self, bus: ModuleEventBus | None = None) -> None:
        self.bus = bus or default_bus
        self.modules: dict[str, BaseModule] = {cls.name: cls(self.bus) for cls in MODULE_CLASSES}
        for module in self.modules.values():
            module.runtime = self
        # Platform-internal model calls (RAG critic, PromptOps reflection, audit NL queries) are
        # metered into FinOps just like agent LLM calls.
        models.set_usage_hook(self._meter_platform_usage)
        self.announce()

    async def _meter_platform_usage(self, event: dict[str, Any]) -> None:
        finops = self.modules.get("finops")
        if finops is not None:
            await finops.meter(team=event.get("team"), agent_id=event.get("agent_id") or "runtime", model=event["model"],  # type: ignore[attr-defined]
                               input_tokens=int(event["input_tokens"]), output_tokens=int(event["output_tokens"]),
                               kind="embedding" if event.get("kind") == "embed" else "platform")

    def announce(self) -> None:
        """(Re-)emit registration + current state for every module, e.g. when a dashboard attaches."""
        for module in self.modules.values():
            self.bus.emit("MODULE_REGISTERED", **module.describe())
            module._set_state(module.state)

    def module(self, name: str) -> BaseModule:
        try:
            return self.modules[name]
        except KeyError:
            raise KeyError(f"unknown module '{name}'; available: {sorted(self.modules)}") from None

    async def invoke(self, module: str, operation: str, payload: dict[str, Any] | None = None,
                     ctx: CallContext | None = None) -> ModuleResult:
        if module not in self.modules:
            return ModuleResult(False, module, operation, "-", 0.0, error=f"unknown module '{module}'; available: {sorted(self.modules)}")
        return await self.modules[module].invoke(operation, payload, ctx)

    def invoke_sync(self, module: str, operation: str, payload: dict[str, Any] | None = None,
                    ctx: CallContext | None = None) -> ModuleResult:
        """Blocking variant for scripts and sync tools. Not for use inside a running event loop."""
        return asyncio.run(self.invoke(module, operation, payload, ctx))

    async def boot_all(self) -> None:
        await asyncio.gather(*(m.boot() for m in self.modules.values()))

    def describe(self) -> list[dict[str, Any]]:
        return [{**m.describe(), "state": m.state} for m in self.modules.values()]


_runtime: ModuleRuntime | None = None
_lock = threading.Lock()


def get_runtime() -> ModuleRuntime:
    """Process-wide runtime shared by the Builder and all generated workers."""
    global _runtime
    if _runtime is None:
        with _lock:
            if _runtime is None:
                _runtime = ModuleRuntime()
    return _runtime


def reset_runtime(bus: ModuleEventBus | None = None) -> ModuleRuntime:
    """Replace the singleton (tests, or re-initialising after config changes)."""
    global _runtime
    with _lock:
        _runtime = ModuleRuntime(bus)
    return _runtime
