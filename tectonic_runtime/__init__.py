"""Tectonic shared module runtime.

The core functional modules under ``modules/`` (guardrails, intent detection, short- and long-term
memory, tool orchestration) run in-process behind one standardized API, shared by the Builder
Agent and every worker agent it generates. Each call emits activity events for the Command
Center's Agent Office view.

    Python:  get_runtime().invoke(module, operation, payload, CallContext(agent_id=...)) -> ModuleResult
    ADK:     tools=[*builder_tools()]  or  tools=[*worker_tools()]   (see tectonic_runtime.adk_tools)
"""

from .base import CallContext, ModuleResult
from .events import ModuleEventBus, bus
from .runtime import ModuleRuntime, get_runtime, reset_runtime

__all__ = ["CallContext", "ModuleResult", "ModuleEventBus", "ModuleRuntime", "bus", "get_runtime", "reset_runtime"]
