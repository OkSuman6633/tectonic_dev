"""Module activity events — the hook the Command Center's "Agent Office" listens to.

Every module emits through one process-wide bus. Listeners are plain callables, so the runtime
has no dependency on the web server: ``server.py`` subscribes and forwards events to
``/ws/telemetry``; tests subscribe and assert.

Event types (each carries ``type`` and ``timestamp`` in epoch seconds):
    MODULE_REGISTERED   { module, label, description, category, operations: [{name, summary, params}] }
    MODULE_STATE        { module, state: "offline" | "booting" | "idle" | "busy" | "error",
                          active_calls, total_calls, detail? }
    MODULE_CALL_START   { module, operation, call_id, agent_id, session_id, payload }
    MODULE_CALL_END     { module, operation, call_id, agent_id, session_id, status: "success" | "error",
                          duration_ms, summary, result | error }
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable

Listener = Callable[[dict[str, Any]], None]

_log = logging.getLogger("tectonic_runtime.events")


class ModuleEventBus:
    def __init__(self) -> None:
        self._listeners: list[Listener] = []
        self._lock = threading.Lock()

    def subscribe(self, listener: Listener) -> Callable[[], None]:
        """Register a listener; returns a function that unsubscribes it."""
        with self._lock:
            self._listeners.append(listener)

        def unsubscribe() -> None:
            with self._lock:
                if listener in self._listeners:
                    self._listeners.remove(listener)

        return unsubscribe

    def emit(self, event_type: str, **payload: Any) -> dict[str, Any]:
        event = {"type": event_type, "timestamp": time.time(), **payload}
        with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener(event)
            except Exception:  # a broken listener must never break an agent
                _log.exception("module event listener failed")
        return event


bus = ModuleEventBus()
