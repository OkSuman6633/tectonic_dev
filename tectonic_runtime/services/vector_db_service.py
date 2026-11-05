"""Vector DB module: embedding storage and hybrid similarity search (modules/vector-db core).

Backed by Qdrant through the module's own VectorService / MigrationManager:
  * embedded, persistent Qdrant by default (generated_agents/_platform/qdrant), or a Qdrant
    server/cluster when QDRANT_URL is set — same code path, so it scales out without changes;
  * dense (Gemini embeddings) + sparse (BM25-style hashing) vectors fused with reciprocal-rank
    fusion;
  * namespaces are tenants: each generated project's team gets its own namespace, plus "shared";
  * zero-downtime re-embedding migrations (alias cut-over) when the embedding model changes.
"""

from __future__ import annotations

import os
from typing import Any

from .._paths import ensure_module_paths
from ..base import BaseModule, CallContext, operation
from ..models import embedding_task, get_embedding_service
from ..persist import read_json, state_path, write_json

ensure_module_paths()

from qdrant_client import AsyncQdrantClient, models  # noqa: E402
from vector_db.core import sparse_encoder  # noqa: E402
from vector_db.config import IsolationConfig, QueryConfig  # noqa: E402
from vector_db.core.fakes import InMemoryMigrationRepository  # noqa: E402
from vector_db.core.migration_manager import MigrationManager  # noqa: E402
from vector_db.core.qdrant_ops import DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME, build_filter, resolve_alias  # noqa: E402
from vector_db.core.vector_service import VectorService  # noqa: E402

BASE_ALIAS = "tectonic_knowledge"
SHARED_NAMESPACE = "shared"


def readable_namespaces(ctx: CallContext, requested: list[str] | None, known: list[str] | None = None) -> list[str]:
    """Workers read their own team namespace plus 'shared'; admins/operators read anything,
    defaulting to every known namespace (the operator UI and the Builder see the whole corpus)."""
    if ctx.is_admin:
        if requested:
            return requested
        return sorted({SHARED_NAMESPACE, *(known or []), *([ctx.team] if ctx.team else [])})
    allowed = {SHARED_NAMESPACE} | ({ctx.team} if ctx.team else set())
    if requested:
        denied = [n for n in requested if n not in allowed]
        if denied:
            raise PermissionError(f"namespace(s) {denied} are outside team {ctx.team!r}")
        return requested
    return sorted(allowed)


def writable_namespace(ctx: CallContext, requested: str | None) -> str:
    """Workers may only write into their own team namespace."""
    if ctx.is_admin:
        return requested or SHARED_NAMESPACE
    if not ctx.team:
        raise PermissionError("worker has no team; cannot write to the vector store")
    if requested and requested != ctx.team:
        raise PermissionError(f"workers can only write to their team namespace {ctx.team!r}")
    return ctx.team


class VectorDBModule(BaseModule):
    name = "vector_db"
    label = "Vector DB"
    description = "Qdrant-backed embedding store with hybrid dense+sparse search, namespaces and model migrations."
    category = "knowledge"

    async def setup(self) -> None:
        url = os.getenv("QDRANT_URL")
        path = state_path("qdrant", "TECTONIC_VECTOR_PATH")
        if url:
            self.client = AsyncQdrantClient(url=url, api_key=os.getenv("QDRANT_API_KEY") or None)
            self.backend = f"qdrant-server ({url})"
        elif path is None:
            self.client = AsyncQdrantClient(location=":memory:")
            self.backend = "qdrant-embedded (memory)"
        else:
            path.mkdir(parents=True, exist_ok=True)
            self.client = AsyncQdrantClient(path=str(path))
            self.backend = f"qdrant-embedded ({path})"
        self.embeddings = get_embedding_service()
        self.isolation = IsolationConfig(tenancy_model="shared_collection_with_filter")
        self.service = VectorService(
            self.client, self.embeddings, BASE_ALIAS, self.isolation,
            QueryConfig(default_top_k=8, hybrid_search_default=True), self.embeddings.model_name,
        )
        self.migrations = MigrationManager(
            self.client, self.embeddings, InMemoryMigrationRepository(), BASE_ALIAS,
            self.isolation.tenancy_model, batch_size=256, verification_sample_rate=0.1,
        )
        self._ns_path = state_path("vector_namespaces.json", "TECTONIC_VECTOR_NS_PATH")
        self.namespaces: dict[str, dict[str, Any]] = read_json(self._ns_path) or {}

    def _touch_namespace(self, ns: str, delta: int) -> None:
        meta = self.namespaces.setdefault(ns, {"points": 0})
        meta["points"] = max(0, meta["points"] + delta)
        write_json(self._ns_path, self.namespaces)

    # --- Python API used by Agentic-RAG (no per-chunk module events) ------------------------
    async def index_text(self, *, namespace: str, text: str, source_ref: str, source_module: str = "vector_db",
                         metadata: dict[str, Any] | None = None) -> str:
        await self.boot()
        token = embedding_task.set("RETRIEVAL_DOCUMENT")
        try:
            point_id = await self.service.index_point(
                tenant_id=namespace, source_module=source_module, source_ref=source_ref, content=text,
                payload_extra=metadata or {}, embedding_model_version=self.embeddings.model_name,
            )
        finally:
            embedding_task.reset(token)
        self._touch_namespace(namespace, +1)
        return point_id

    async def search_texts(self, *, namespaces: list[str], query: str, top_k: int = 8, hybrid: bool = True,
                           filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        await self.boot()
        if len(namespaces) == 1:
            token = embedding_task.set("RETRIEVAL_QUERY")
            try:
                points = await self.service.query(tenant_id=namespaces[0], text=query, filters=filters, top_k=top_k, hybrid=hybrid)
            finally:
                embedding_task.reset(token)
            return [{"point_id": p.id, "score": round(p.score, 4), "namespace": namespaces[0], **p.payload} for p in points]
        return await self._search_many(namespaces, query, top_k, hybrid, filters or {})

    async def _search_many(self, namespaces: list[str], query: str, top_k: int, hybrid: bool,
                           filters: dict[str, Any]) -> list[dict[str, Any]]:
        """One fused query over several namespaces (tenant_id IN [...]), so scores are comparable.

        VectorService.query filters on a single tenant; this mirrors its hybrid query exactly
        (same vector names, sparse encoder and RRF fusion) with a MatchAny tenant condition.
        """
        physical = await resolve_alias(self.client, BASE_ALIAS)
        if physical is None:
            return []
        token = embedding_task.set("RETRIEVAL_QUERY")
        try:
            dense = await self.embeddings.embed(query)
        finally:
            embedding_task.reset(token)
        must = [models.FieldCondition(key="tenant_id", match=models.MatchAny(any=namespaces))]
        must += [models.FieldCondition(key=k, match=models.MatchValue(value=v)) for k, v in filters.items()]
        flt = models.Filter(must=must)
        if hybrid:
            sparse = sparse_encoder.encode(query)
            res = await self.client.query_points(
                physical,
                prefetch=[
                    models.Prefetch(query=dense, using=DENSE_VECTOR_NAME, limit=top_k * 4, filter=flt),
                    models.Prefetch(query=models.SparseVector(indices=sparse.indices, values=sparse.values),
                                    using=SPARSE_VECTOR_NAME, limit=top_k * 4, filter=flt),
                ],
                query=models.FusionQuery(fusion=models.Fusion.RRF), limit=top_k, query_filter=flt, with_payload=True,
            )
        else:
            res = await self.client.query_points(physical, query=dense, using=DENSE_VECTOR_NAME, limit=top_k,
                                                 query_filter=flt, with_payload=True)
        return [{"point_id": str(p.id), "score": round(p.score, 4), "namespace": (p.payload or {}).get("tenant_id"), **(p.payload or {})}
                for p in res.points]

    async def delete_point(self, namespace: str, point_id: str) -> None:
        await self.boot()
        await self.service.delete_point(namespace, point_id)
        self._touch_namespace(namespace, -1)

    # --- operations -----------------------------------------------------------------------------
    @operation("Embed and store a text in a namespace (workers: their team namespace only).")
    async def index(self, ctx: CallContext, text: str, source_ref: str = "", namespace: str | None = None,
                    metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        ns = writable_namespace(ctx, namespace)
        point_id = await self.index_text(namespace=ns, text=text, source_ref=source_ref or "manual",
                                         source_module=ctx.agent_id, metadata=metadata)
        return {"point_id": point_id, "namespace": ns, "embedding_model": self.embeddings.model_name}

    @operation("Hybrid (dense + sparse, RRF-fused) similarity search across readable namespaces.")
    async def search(self, ctx: CallContext, query: str, top_k: int = 8, hybrid: bool = True,
                     namespaces: list[str] | None = None, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        targets = readable_namespaces(ctx, namespaces, list(self.namespaces))
        hits = await self.search_texts(namespaces=targets, query=query, top_k=top_k, hybrid=hybrid, filters=filters)
        return {"namespaces": targets, "mode": "hybrid" if hybrid else "dense", "hits": hits}

    @operation("Delete one point from a namespace you can write to.")
    async def delete(self, ctx: CallContext, point_id: str, namespace: str | None = None) -> dict[str, Any]:
        ns = writable_namespace(ctx, namespace)
        await self.delete_point(ns, point_id)
        return {"deleted": point_id, "namespace": ns}

    @operation("Store backend, embedding model and per-namespace point counts.")
    async def stats(self, ctx: CallContext) -> dict[str, Any]:
        physical = await resolve_alias(self.client, BASE_ALIAS)
        counts: dict[str, int] = {}
        if physical:
            for ns in self.namespaces:
                if ctx.is_admin or ns in (SHARED_NAMESPACE, ctx.team):
                    res = await self.client.count(physical, count_filter=build_filter(ns, None), exact=True)
                    counts[ns] = res.count
        return {
            "backend": self.backend,
            "collection": physical,
            "alias": BASE_ALIAS,
            "embedding_model": self.embeddings.model_name,
            "embedding_mode": self.embeddings.last_mode,
            "namespaces": counts,
            "total_points": sum(counts.values()),
        }

    @operation("Re-embed every point with the current embedding model (alias cut-over, zero downtime).", permission="admin")
    async def migrate_embeddings(self, ctx: CallContext, namespace: str = SHARED_NAMESPACE) -> dict[str, Any]:
        record = await self.migrations.start(namespace, self.embeddings.model_name)
        record = await self.migrations.run(record.id)
        return {
            "migration_id": record.id, "status": record.status.value, "target_model": record.target_embedding_model,
            "points_migrated": record.points_migrated, "points_total": record.points_total,
            "target_collection": record.target_collection,
        }

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name == "search" and isinstance(data, dict):
            top = data["hits"][0]["score"] if data["hits"] else 0
            return f"{len(data['hits'])} hits ({data['mode']}, top {top})"
        if op_name == "index" and isinstance(data, dict):
            return f"indexed → {data['namespace']}"
        return super().summarize(op_name, data)
