"""Short-Term Memory module: token-budgeted working memory per session (modules/short-term-memory core).

When a session exceeds its token budget, low-salience turns are summarised while high-salience
turns (numbers, commitments, "remember…") are kept verbatim.
"""

from __future__ import annotations

import os
from typing import Any

from .._paths import ensure_module_paths
from ..adapters import ExtractiveSummariser, TTLBufferStore
from ..base import BaseModule, CallContext, operation

ensure_module_paths()

from short_term_memory.config import BufferConfig, SalienceConfig  # noqa: E402
from short_term_memory.core.buffer_manager import BufferManager  # noqa: E402


class ShortTermMemoryModule(BaseModule):
    name = "short_term_memory"
    label = "Short-Term Memory"
    description = "Session working memory with salience-aware overflow summarisation."
    category = "memory"

    async def setup(self) -> None:
        self.store = TTLBufferStore()
        self.manager = BufferManager(
            store=self.store,
            llm_gateway=ExtractiveSummariser(),
            buffer_config=BufferConfig(
                default_token_budget=int(os.getenv("TECTONIC_STM_TOKEN_BUDGET", "2000")),
                session_ttl_seconds=int(os.getenv("TECTONIC_STM_TTL_SECONDS", "3600")),
            ),
            salience_config=SalienceConfig(),
        )

    @staticmethod
    def _session(ctx: CallContext, session_id: str | None) -> str:
        return session_id or ctx.session_id or f"agent:{ctx.agent_id}"

    @operation("Append a turn (role: user | agent | tool | system) to the session's working memory.")
    async def append(self, ctx: CallContext, content: str, role: str = "agent", session_id: str | None = None) -> dict[str, Any]:
        result = await self.manager.append(self._session(ctx, session_id), ctx.tenant_id, content, role)
        state = result.state
        return {
            "session_id": state.session_id,
            "messages": len(state.messages),
            "token_count": state.token_count,
            "overflow_triggered": result.overflow_triggered,
            "has_summary": bool(state.summary),
        }

    @operation("Read the session's working memory: rolling summary plus retained turns.")
    async def get_context(self, ctx: CallContext, session_id: str | None = None, last_n: int = 20) -> dict[str, Any]:
        sid = self._session(ctx, session_id)
        state = await self.manager.get(sid)
        if state is None:
            return {"session_id": sid, "summary": None, "messages": [], "token_count": 0}
        return {
            "session_id": sid,
            "summary": state.summary,
            "messages": [
                {"role": m.role, "content": m.content, "salience": round(m.salience_score, 3)}
                for m in state.messages[-last_n:]
            ],
            "token_count": state.token_count,
        }

    @operation("Delete the session's working memory.")
    async def clear(self, ctx: CallContext, session_id: str | None = None) -> dict[str, Any]:
        sid = self._session(ctx, session_id)
        return {"session_id": sid, "deleted": await self.manager.delete(sid)}

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name == "append" and isinstance(data, dict):
            note = " · overflow summarised" if data["overflow_triggered"] else ""
            return f"{data['messages']} turns, {data['token_count']} tok{note}"
        if op_name == "get_context" and isinstance(data, dict):
            return f"{len(data['messages'])} turns{' + summary' if data.get('summary') else ''}"
        return super().summarize(op_name, data)
