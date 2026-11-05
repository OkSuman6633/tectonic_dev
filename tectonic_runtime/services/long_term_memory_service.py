"""Long-Term Memory module: durable, scoped memory across sessions (modules/long-term-memory core).

Scopes:
  * ``<agent_id>`` (default) — private to that agent.
  * ``shared:<team>`` / ``team:<name>`` — readable by any agent; this is how the Builder hands
    knowledge (requirements, conventions, user preferences) to the workers it generates.
Cross-agent reads are enforced by the module's visibility policy, not by convention.
Items persist to ``generated_agents/_memory/long_term_memory.json`` (override: TECTONIC_LTM_PATH).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .._paths import PROJECT_ROOT, ensure_module_paths
from ..adapters import SHARED_SCOPE_PREFIXES, JsonFileMemoryRepository, ScopeVisibilityPolicy, TfidfVectorIndex, TokenGraph
from ..base import BaseModule, CallContext, operation

ensure_module_paths()

from long_term_memory.config import CrossAgentSharingConfig  # noqa: E402
from long_term_memory.core.domain import MemoryType  # noqa: E402
from long_term_memory.core.memory_service import MemoryService  # noqa: E402


def _store_path() -> Path:
    return Path(os.getenv("TECTONIC_LTM_PATH", str(PROJECT_ROOT / "generated_agents" / "_memory" / "long_term_memory.json")))


class LongTermMemoryModule(BaseModule):
    name = "long_term_memory"
    label = "Long-Term Memory"
    description = "Durable fact/episodic/semantic/procedural memory with private and shared scopes."
    category = "memory"

    async def setup(self) -> None:
        self.repository = JsonFileMemoryRepository(_store_path())
        self.vectors = TfidfVectorIndex()
        self.graph = TokenGraph()
        self.service = MemoryService(
            repository=self.repository,
            vector_db=self.vectors,
            graph_db=self.graph,
            guardrails=ScopeVisibilityPolicy(),
            cross_agent_config=CrossAgentSharingConfig(enabled=True, visibility_policy_ref="scope-prefix"),
        )
        # Rebuild the in-process indexes for items loaded from disk.
        for item in self.repository.items.values():
            if item.memory_type == MemoryType.SEMANTIC:
                await self.vectors.index(content=item.content, tenant_id=item.tenant_id, source_ref=item.id)
            elif item.memory_type == MemoryType.PROCEDURAL:
                await self.graph.create_node(name=item.content[:128], tenant_id=item.tenant_id, source_ref=item.id)

    @operation("Store a memory. memory_type: fact | episodic | semantic | procedural. scope defaults to the caller.")
    async def remember(self, ctx: CallContext, content: str, memory_type: str = "fact", scope: str | None = None,
                       purpose: str = "") -> dict[str, Any]:
        item = await self.service.store(tenant_id=ctx.tenant_id, scope=scope or ctx.agent_id,
                                        memory_type=MemoryType(memory_type), content=content, purpose=purpose)
        return {"item_id": item.id, "scope": item.scope, "memory_type": item.memory_type.value}

    @operation("Retrieve the most relevant memories for a query from a scope (default: the caller's own).")
    async def recall(self, ctx: CallContext, query: str, scope: str | None = None, memory_types: list[str] | None = None,
                     top_k: int = 5) -> dict[str, Any]:
        target = scope or ctx.agent_id
        if target != ctx.agent_id and not target.startswith(SHARED_SCOPE_PREFIXES):
            # The core would silently return nothing; an explicit denial is clearer for an LLM caller.
            raise PermissionError(f"scope '{target}' is private to that agent; use a shared:<team> scope to exchange memories")
        ranked = await self.service.query(
            tenant_id=ctx.tenant_id, scope=target, query=query, top_k=top_k, requesting_agent=ctx.agent_id,
            memory_types=[MemoryType(t) for t in memory_types] if memory_types else None,
        )
        return {
            "scope": target,
            "items": [
                {"item_id": r.item.id, "content": r.item.content, "memory_type": r.item.memory_type.value, "score": round(r.score, 4)}
                for r in ranked
            ],
        }

    @operation("Publish knowledge to a shared team scope so other agents (e.g. generated workers) can recall it.")
    async def share(self, ctx: CallContext, content: str, team: str = "default", memory_type: str = "semantic") -> dict[str, Any]:
        return await self.remember(ctx, content=content, memory_type=memory_type, scope=f"shared:{team}")

    @operation("Delete one memory the caller owns (or one in a shared scope).")
    async def forget(self, ctx: CallContext, item_id: str) -> dict[str, Any]:
        item = await self.repository.get_item(ctx.tenant_id, item_id)
        if item is None:
            return {"item_id": item_id, "deleted": False}
        if item.scope != ctx.agent_id and not item.scope.startswith(SHARED_SCOPE_PREFIXES):
            raise PermissionError(f"agent '{ctx.agent_id}' cannot delete memories in scope '{item.scope}'")
        await self.repository.delete_items(ctx.tenant_id, [item_id])
        if item.vector_ref:
            await self.vectors.delete(item.vector_ref, ctx.tenant_id)
        return {"item_id": item_id, "deleted": True}

    @operation("Count memories per scope visible to the tenant.")
    async def stats(self, ctx: CallContext) -> dict[str, Any]:
        scopes: dict[str, int] = {}
        for item in self.repository.items.values():
            if item.tenant_id == ctx.tenant_id:
                scopes[item.scope] = scopes.get(item.scope, 0) + 1
        return {"total": sum(scopes.values()), "scopes": scopes}

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name in ("remember", "share") and isinstance(data, dict):
            return f"stored {data['memory_type']} → {data['scope']}"
        if op_name == "recall" and isinstance(data, dict):
            return f"{len(data['items'])} hits from {data['scope']}"
        return super().summarize(op_name, data)
