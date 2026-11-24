"""Central execution manager: tracks running agent tasks and immediately stops backend execution flows."""

from __future__ import annotations

import asyncio
import gc
import logging
from typing import Any, Optional

logger = logging.getLogger("agent_builder.execution_manager")


class ExecutionManager:
    def __init__(self) -> None:
        # Map: session_id -> set of asyncio.Task
        self._active_tasks: dict[str, set[asyncio.Task[Any]]] = {}
        # Global set of all currently running agent tasks
        self._all_tasks: set[asyncio.Task[Any]] = set()

    def register_task(self, session_id: Optional[str], task: Optional[asyncio.Task[Any]] = None) -> None:
        """Register an active task for immediate cancellation on user stop."""
        if task is None:
            task = asyncio.current_task()
        if task is None:
            return

        self._all_tasks.add(task)
        if session_id:
            sid_str = str(session_id).strip()
            if sid_str:
                self._active_tasks.setdefault(sid_str, set()).add(task)

        def _cleanup(t: asyncio.Task[Any]) -> None:
            self._all_tasks.discard(t)
            if session_id:
                sid_str = str(session_id).strip()
                if sid_str in self._active_tasks:
                    self._active_tasks[sid_str].discard(t)
                    if not self._active_tasks[sid_str]:
                        self._active_tasks.pop(sid_str, None)

        task.add_done_callback(_cleanup)

    def unregister_task(self, session_id: Optional[str], task: Optional[asyncio.Task[Any]] = None) -> None:
        """Unregister a completed task."""
        if task is None:
            task = asyncio.current_task()
        if task is None:
            return

        self._all_tasks.discard(task)
        if session_id:
            sid_str = str(session_id).strip()
            if sid_str in self._active_tasks:
                self._active_tasks[sid_str].discard(task)
                if not self._active_tasks[sid_str]:
                    self._active_tasks.pop(sid_str, None)

    async def abort_execution(self, session_id: Optional[str] = None, app_name: Optional[str] = None) -> int:
        """Immediately abort all active execution flows matching session_id, or all active runs if none specified."""
        cancelled_count = 0
        tasks_to_cancel: set[asyncio.Task[Any]] = set()
        current = asyncio.current_task()

        sid_str = str(session_id).strip() if session_id else ""
        if sid_str and sid_str in self._active_tasks:
            tasks_to_cancel.update(self._active_tasks[sid_str])
        else:
            tasks_to_cancel.update(self._all_tasks)

        # Cancel all identified asyncio tasks immediately
        for task in tasks_to_cancel:
            if task != current and not task.done():
                logger.info("Cancelling active agent task: %s (session: %s)", task.get_name(), session_id)
                task.cancel()
                cancelled_count += 1

        # Also trip ADK ApiServer live session runs so ADK runners break out immediately
        try:
            from google.adk.cli.api_server import ApiServer

            for server in (o for o in gc.get_objects() if isinstance(o, ApiServer)):
                live_runs_dict = getattr(server, "_live_session_runs", {})
                for (live_app, live_user, live_sess), runs in list(live_runs_dict.items()):
                    should_trip = (
                        not sid_str
                        or live_sess == sid_str
                        or (app_name and live_app == app_name)
                    )
                    if should_trip:
                        for live_run in runs:
                            live_run.abort_signal.set()
                            if live_run.next_step_event is not None:
                                live_run.next_step_event.set()
                            live_run.finished.set()
                            cancelled_count += 1
        except Exception as exc:
            logger.warning("Error tripping ADK live session runs: %s", exc)

        # Notify telemetry hub to set agents back to idle immediately
        try:
            from agent_builder.telemetry import hub

            if hub is not None:
                for agent_id in (
                    "agent_builder",
                    "code_generator",
                    "intent_detection",
                    "guardrails",
                    "requirement_understanding",
                    "agent_card_manager",
                    "agent_editor",
                ):
                    hub.emit("AGENT_STATE_CHANGE", id=agent_id, state="idle", detail="Execution stopped by user")
                hub.emit("RUN_COMPLETED", invocation_id="", app_name=app_name or "agent_builder", root_id="agent_builder", team=None)
        except Exception as exc:
            logger.debug("Telemetry notification on abort: %s", exc)

        logger.info("Aborted %d active execution tasks/runs (session: %s)", cancelled_count, session_id)
        return cancelled_count


manager = ExecutionManager()
