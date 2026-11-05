"""Agentic-RAG module: autonomous, self-correcting retrieval (modules/agentic-rag core).

The module core runs a multi-hop loop: retrieve → critique groundedness → reformulate the query
from the critic's gaps → retry, keeping the best hop (Self-RAG / CRAG-style corrective
retrieval). This wrapper adds what the core leaves as ports or omits:

  * Autonomous routing — per hop, a router picks which backends to query: dense+sparse vector
    search (semantic), the knowledge-base symbolic index (exact identifiers, quoted phrases) and
    team long-term memory (relational / historical questions). Gemini decides when online; a
    rule router otherwise. Results are fused with the core's reciprocal-rank fusion.
  * Gemini-backed critic and reformulator (utility model, JSON), with the core's heuristic
    critic as the offline fallback.
  * Dynamic context assembly — items from *all* hops are de-duplicated, ranked, packed into a
    token budget and numbered as citations, then a grounded answer is generated from them.
  * Ingestion — documents are chunked (paragraph-aware, overlapping) into Vector DB and the
    symbolic index.
"""

from __future__ import annotations

import contextvars
import re
import uuid
from collections import deque
from typing import Any

from .._paths import ensure_module_paths
from ..base import BaseModule, CallContext, operation
from ..models import current_caller, estimate_tokens, generate, generate_json, online, reasoning_model, utility_model
from ..persist import read_json, state_path, write_json
from .vector_db_service import SHARED_NAMESPACE, readable_namespaces, writable_namespace

ensure_module_paths()

from agentic_rag.core.domain import GroundednessAssessment, Provenance, RetrievalSource, RetrievedItem  # noqa: E402
from agentic_rag.core.fakes import InMemoryRAGRepository  # noqa: E402
from agentic_rag.core.groundedness_critic import HeuristicGroundednessCritic  # noqa: E402
from agentic_rag.core.hybrid_retriever import HybridRetriever, reciprocal_rank_fusion  # noqa: E402
from agentic_rag.core.query_reformulator import QueryReformulator  # noqa: E402
from agentic_rag.core.rag_service import RAGService  # noqa: E402
from agentic_rag.core.retrieval_loop import RetrievalLoop  # noqa: E402

# Per-request trace collected while the core loop runs (routes and critic notes per hop).
_trace: contextvars.ContextVar[list[dict[str, Any]] | None] = contextvars.ContextVar("rag_trace", default=None)
_caller: contextvars.ContextVar[CallContext | None] = contextvars.ContextVar("rag_caller", default=None)

BACKENDS = ("vector", "knowledge_base", "memory")
_ID_LIKE = re.compile(r'"[^"]{3,}"|\b[A-Z]{2,}[-_]?\d+\b|\b\d{3,}\b|\b[a-z]+_[a-z_]+\b')
_RELATIONAL = re.compile(r"\b(relat\w*|depend\w*|connect\w*|history|previous\w*|before|remember\w*|who|decid\w*|why|policy|convention\w*)\b", re.I)
_STOP = frozenset("the a an of to in on for and or is are was were what which how who why when where does do with by from".split())


def _terms(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9_]+", text.lower()) if t not in _STOP and len(t) > 1]


def chunk_text(text: str, max_chars: int = 900, overlap: int = 150) -> list[str]:
    """Paragraph-aware chunking with character overlap between consecutive chunks."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paras:
        while len(para) > max_chars:  # hard-wrap very long paragraphs on sentence boundaries
            cut = para.rfind(". ", 0, max_chars)
            cut = cut + 1 if cut > max_chars // 2 else max_chars
            pieces, para = para[:cut].strip(), para[cut:].strip()
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.append(pieces)
        if len(buf) + len(para) + 2 <= max_chars:
            buf = f"{buf}\n\n{para}" if buf else para
        else:
            if buf:
                chunks.append(buf)
            buf = para
    if buf:
        chunks.append(buf)
    if overlap and len(chunks) > 1:
        chunks = [chunks[0]] + [f"{chunks[i - 1][-overlap:]} {chunks[i]}" for i in range(1, len(chunks))]
    return chunks


# --- backends (agentic_rag ports) -------------------------------------------------------------
class VectorBackend:
    """VectorDBClient port → the Vector DB module (hybrid search over readable namespaces)."""

    def __init__(self, module: "AgenticRAGModule") -> None:
        self.m = module

    async def search(self, *, query: str, scope: list[str], tenant_id: str) -> list[RetrievedItem]:
        vdb = self.m.runtime.module("vector_db")
        hits = await vdb.search_texts(namespaces=scope, query=query, top_k=self.m.top_k)
        return [
            RetrievedItem(
                content=h.get("content", ""),
                source=RetrievalSource.VECTOR_DB,
                provenance=Provenance(source_document=h.get("title") or h.get("source_ref", "?"),
                                      version=h.get("doc_id", "latest"), location=f"chunk {h.get('chunk', '?')} · {h.get('namespace')}"),
                retrieval_score=float(h.get("score", 0.0)),
            )
            for h in hits if h.get("content")
        ]


class SymbolicBackend:
    """KnowledgeBaseClient port → exact-term index over ingested chunks (identifiers, phrases)."""

    def __init__(self, module: "AgenticRAGModule") -> None:
        self.m = module

    async def symbolic_lookup(self, *, query: str, scope: list[str], tenant_id: str) -> list[RetrievedItem]:
        phrases = [p.strip('"').lower() for p in re.findall(r'"[^"]+"', query)]
        terms = set(_terms(query))
        if not terms and not phrases:
            return []
        scored = []
        for doc in self.m.documents.values():
            if doc["namespace"] not in scope:
                continue
            for i, chunk in enumerate(doc["chunks"]):
                low = chunk["text"].lower()
                if phrases and not all(p in low for p in phrases):
                    continue
                words = set(_terms(low))
                hit = len(terms & words)
                if hit == 0 and not phrases:
                    continue
                coverage = (hit + 2 * len(phrases)) / (len(terms) + 2 * len(phrases) or 1)
                scored.append((coverage, doc, i, chunk))
        scored.sort(key=lambda s: s[0], reverse=True)
        return [
            RetrievedItem(content=c["text"], source=RetrievalSource.KNOWLEDGE_BASE,
                          provenance=Provenance(source_document=d["title"], version=d["id"], location=f"chunk {i} · {d['namespace']}"),
                          retrieval_score=round(score, 4))
            for score, d, i, c in scored[: self.m.top_k]
        ]


class MemoryBackend:
    """GraphDBClient port → team long-term memory (shared:<namespace> scopes): decisions, conventions."""

    def __init__(self, module: "AgenticRAGModule") -> None:
        self.m = module

    async def search(self, *, query: str, scope: list[str], tenant_id: str) -> list[RetrievedItem]:
        ltm = self.m.runtime.module("long_term_memory")
        await ltm.boot()
        items: list[RetrievedItem] = []
        for ns in scope:
            mem_scope = f"shared:{ns}" if ns != SHARED_NAMESPACE else "shared:default"
            ranked = await ltm.service.query(tenant_id="default", scope=mem_scope, query=query, top_k=4)
            items += [
                RetrievedItem(content=r.item.content, source=RetrievalSource.GRAPH_DB,
                              provenance=Provenance(source_document=f"memory:{mem_scope}", version=r.item.id, location=r.item.memory_type.value),
                              retrieval_score=round(r.score, 4))
                for r in ranked
            ]
        return items


class RoutedRetriever(HybridRetriever):
    """Autonomous routing: choose backends per (re)formulated query, then RRF-fuse."""

    def __init__(self, module: "AgenticRAGModule", vector: VectorBackend, memory: MemoryBackend, symbolic: SymbolicBackend) -> None:
        super().__init__(vector, memory, symbolic, hybrid_enabled=True)
        self.m = module

    async def route(self, query: str) -> tuple[list[str], str, str]:
        if online():
            decision = await generate_json(
                "You route retrieval for an agent platform. Backends:\n"
                "- vector: semantic search over document chunks (default for natural-language questions)\n"
                "- knowledge_base: exact lookup for identifiers, codes, names, quoted phrases\n"
                "- memory: team decisions, conventions, preferences, history\n"
                f'Question: "{query}"\n'
                'Reply JSON: {"backends": [one or more of "vector","knowledge_base","memory"], "reason": "<short>"}',
                model=utility_model(), max_output_tokens=120,
            )
            if decision:
                chosen = [b for b in decision.get("backends", []) if b in BACKENDS]
                if chosen:
                    return chosen, str(decision.get("reason", ""))[:160], "llm"
        chosen = ["vector"]
        reasons = ["semantic search"]
        if _ID_LIKE.search(query):
            chosen.append("knowledge_base")
            reasons.append("identifier/phrase → exact lookup")
        if _RELATIONAL.search(query):
            chosen.append("memory")
            reasons.append("relational/history → team memory")
        return chosen, "; ".join(reasons), "rules"

    async def retrieve(self, query: str, scope: list[str], tenant_id: str) -> list[RetrievedItem]:
        backends, reason, method = await self.route(query)
        lists = []
        if "vector" in backends:
            lists.append(await self.vector_db.search(query=query, scope=scope, tenant_id=tenant_id))
        if "knowledge_base" in backends:
            lists.append(await self.knowledge_base.symbolic_lookup(query=query, scope=scope, tenant_id=tenant_id))
        if "memory" in backends:
            lists.append(await self.graph_db.search(query=query, scope=scope, tenant_id=tenant_id))
        fused = reciprocal_rank_fusion(lists) if len(lists) > 1 else (lists[0] if lists else [])
        trace = _trace.get()
        if trace is not None:
            trace.append({"query": query, "backends": backends, "route_reason": reason, "route_method": method,
                          "items": len(fused)})
        return fused


class GeminiRAGGateway:
    """agentic_rag LLMGatewayClient port: groundedness critique + query reformulation via Gemini."""

    def __init__(self) -> None:
        self._heuristic = HeuristicGroundednessCritic()

    async def assess_groundedness(self, *, query: str, items: list[RetrievedItem], tenant_id: str) -> GroundednessAssessment:
        if items and online():
            context = "\n\n".join(f"[{i + 1}] {it.content[:700]}" for i, it in enumerate(items[:8]))
            verdict = await generate_json(
                "Rate how well the CONTEXT supports a complete, correct answer to the QUESTION.\n"
                f"QUESTION: {query}\n\nCONTEXT:\n{context}\n\n"
                'Reply JSON: {"score": <0.0-1.0>, "gaps": "<what information is missing, or empty>"}',
                model=utility_model(), max_output_tokens=200,
            )
            if verdict and isinstance(verdict.get("score"), (int, float)):
                assessment = GroundednessAssessment(score=max(0.0, min(1.0, float(verdict["score"]))), gaps=str(verdict.get("gaps", "")))
                self._note(assessment, "llm")
                return assessment
        assessment = await self._heuristic.assess(query, items, tenant_id)
        self._note(assessment, "heuristic")
        return assessment

    @staticmethod
    def _note(a: GroundednessAssessment, method: str) -> None:
        trace = _trace.get()
        if trace:
            trace[-1].update({"groundedness": round(a.score, 3), "gaps": a.gaps, "critic": method})

    async def reformulate(self, *, query: str, gaps: str, tenant_id: str) -> str:
        if online():
            gen = await generate(
                "Rewrite the search query to retrieve the missing information. Return only the new query.\n"
                f"Original query: {query}\nMissing: {gaps or 'more specific supporting detail'}",
                model=utility_model(), max_output_tokens=60, temperature=0.3,
            )
            if gen and gen.text:
                return gen.text.strip().strip('"')[:300]
        extra = " ".join(t for t in _terms(gaps) if t not in _terms(query))[:120]
        return f"{query} {extra}".strip() if extra else f"{query} details"


class _BoundCritic:
    def __init__(self, gateway: GeminiRAGGateway) -> None:
        self.gateway = gateway

    async def assess(self, query: str, items: list[RetrievedItem], tenant_id: str) -> GroundednessAssessment:
        return await self.gateway.assess_groundedness(query=query, items=items, tenant_id=tenant_id)


def assemble_context(hops: list[Any], budget_tokens: int) -> tuple[str, list[dict[str, Any]]]:
    """Dynamic context assembly: de-dupe across hops, rank, pack to budget, number citations."""
    best: dict[tuple[str, str], RetrievedItem] = {}
    for hop in hops:
        for it in hop.retrieved_items:
            key = (it.provenance.source_document, it.provenance.location or it.content[:60])
            if key not in best or it.retrieval_score > best[key].retrieval_score:
                best[key] = it
    ranked = sorted(best.values(), key=lambda it: it.retrieval_score, reverse=True)
    parts, citations, used = [], [], 0
    for it in ranked:
        cost = estimate_tokens(it.content) + 12
        if used + cost > budget_tokens and citations:
            continue
        n = len(citations) + 1
        parts.append(f"[{n}] {it.content}")
        citations.append({"n": n, "source": it.provenance.source_document, "location": it.provenance.location,
                          "backend": it.source.value, "score": round(it.retrieval_score, 4), "excerpt": it.content[:240]})
        used += cost
    return "\n\n".join(parts), citations


class AgenticRAGModule(BaseModule):
    name = "agentic_rag"
    label = "Agentic RAG"
    description = "Routed, self-correcting multi-hop retrieval with dynamic context assembly and cited answers."
    category = "knowledge"

    top_k = 6

    async def setup(self) -> None:
        self.repository = InMemoryRAGRepository()
        gateway = GeminiRAGGateway()
        retriever = RoutedRetriever(self, VectorBackend(self), MemoryBackend(self), SymbolicBackend(self))
        self.service = RAGService(self.repository, RetrievalLoop(retriever, _BoundCritic(gateway), QueryReformulator(gateway)))
        self._docs_path = state_path("rag_documents.json", "TECTONIC_RAG_DOCS_PATH")
        self.documents: dict[str, dict[str, Any]] = read_json(self._docs_path) or {}
        self.history: deque[dict[str, Any]] = deque(maxlen=50)

    @operation("Chunk and index a document into a knowledge namespace (workers: their team only).")
    async def ingest(self, ctx: CallContext, title: str, text: str, namespace: str | None = None, source: str = "") -> dict[str, Any]:
        ns = writable_namespace(ctx, namespace)
        vdb = self.runtime.module("vector_db")
        doc_id = uuid.uuid4().hex[:12]
        chunks = []
        for i, chunk in enumerate(chunk_text(text)):
            point_id = await vdb.index_text(namespace=ns, text=chunk, source_ref=f"{doc_id}#{i}", source_module="agentic_rag",
                                            metadata={"doc_id": doc_id, "title": title, "chunk": i})
            chunks.append({"point_id": point_id, "text": chunk})
        self.documents[doc_id] = {"id": doc_id, "title": title, "namespace": ns, "source": source, "owner": ctx.agent_id, "chunks": chunks}
        write_json(self._docs_path, self.documents)
        return {"doc_id": doc_id, "namespace": ns, "chunks": len(chunks), "embedding_model": vdb.embeddings.model_name}

    @operation("List ingested documents in readable namespaces.")
    async def documents_list(self, ctx: CallContext, namespace: str | None = None) -> dict[str, Any]:
        readable = set(readable_namespaces(ctx, [namespace] if namespace else None))
        docs = [
            {"doc_id": d["id"], "title": d["title"], "namespace": d["namespace"], "chunks": len(d["chunks"]), "owner": d.get("owner")}
            for d in self.documents.values() if d["namespace"] in readable or (ctx.is_admin and not namespace)
        ]
        return {"documents": docs}

    @operation("Delete a document and its vectors (admins, or workers in their own team).")
    async def delete_document(self, ctx: CallContext, doc_id: str) -> dict[str, Any]:
        doc = self.documents.get(doc_id)
        if doc is None:
            raise KeyError(f"unknown document {doc_id}")
        writable_namespace(ctx, doc["namespace"])
        vdb = self.runtime.module("vector_db")
        for chunk in doc["chunks"]:
            await vdb.delete_point(doc["namespace"], chunk["point_id"])
        del self.documents[doc_id]
        write_json(self._docs_path, self.documents)
        return {"deleted": doc_id, "chunks": len(doc["chunks"])}

    async def _run(self, ctx: CallContext, query: str, namespaces: list[str] | None, max_hops: int,
                   threshold: float | None, budget_tokens: int) -> dict[str, Any]:
        vdb = self.runtime.module("vector_db")
        await vdb.boot()
        scope = readable_namespaces(ctx, namespaces, list(vdb.namespaces))
        threshold = threshold if threshold is not None else (0.75 if online() else 0.3)
        trace: list[dict[str, Any]] = []
        t1 = _trace.set(trace)
        t2 = current_caller.set({"agent_id": ctx.agent_id, "team": ctx.team, "purpose": "agentic_rag"})
        try:
            result = await self.service.retrieve(query=query, scope=scope, tenant_id=ctx.team or "platform",
                                                 max_hops=max_hops, groundedness_threshold=threshold)
            hops = await self.repository.list_hops(result.request_id)
        finally:
            _trace.reset(t1)
            current_caller.reset(t2)
        context, citations = assemble_context(hops, budget_tokens)
        hop_view = []
        for hop, t in zip(hops, trace):
            hop_view.append({
                "hop": hop.hop_number, "query": t["query"], "backends": t["backends"], "route": t["route_reason"],
                "route_method": t["route_method"], "items": len(hop.retrieved_items), "groundedness": round(hop.groundedness_score, 3),
                # The core records, per hop, the rewritten query that hop ran on (None for the original query).
                "gaps": t.get("gaps", ""), "critic": t.get("critic", ""), "reformulated": hop.reformulated_query is not None,
            })
        return {
            "request_id": result.request_id, "query": query, "namespaces": scope, "outcome": result.outcome.value,
            "hops": hop_view, "groundedness": round(result.final_groundedness_score, 3), "threshold": threshold,
            "context": context, "context_tokens": estimate_tokens(context), "citations": citations,
        }

    @operation("Agentic retrieval: routed, self-correcting multi-hop search returning assembled, cited context.")
    async def retrieve(self, ctx: CallContext, query: str, namespaces: list[str] | None = None, max_hops: int = 3,
                       threshold: float | None = None, budget_tokens: int = 1800) -> dict[str, Any]:
        out = await self._run(ctx, query, namespaces, max_hops, threshold, budget_tokens)
        self.history.appendleft({k: out[k] for k in ("request_id", "query", "outcome", "groundedness")} | {"agent": ctx.agent_id})
        return out

    @operation("Answer a question from the knowledge base with inline citations (retrieve → assemble → generate).")
    async def ask(self, ctx: CallContext, question: str, namespaces: list[str] | None = None, max_hops: int = 3,
                  threshold: float | None = None, budget_tokens: int = 1800) -> dict[str, Any]:
        out = await self._run(ctx, question, namespaces, max_hops, threshold, budget_tokens)
        answer, model = None, "extractive"
        if out["citations"] and online():
            token = current_caller.set({"agent_id": ctx.agent_id, "team": ctx.team, "purpose": "agentic_rag.answer"})
            try:
                gen = await generate(
                    "Answer the question using ONLY the numbered context. Cite sources inline like [1]. "
                    "If the context is insufficient, say what is missing.\n\n"
                    f"CONTEXT:\n{out['context']}\n\nQUESTION: {question}",
                    model=reasoning_model(), max_output_tokens=700, temperature=0.1,
                )
            finally:
                current_caller.reset(token)
            if gen and gen.text:
                answer, model = gen.text, gen.model
        if answer is None:
            if out["citations"]:
                q = set(_terms(question))
                sentences = [(s.strip(), c["n"]) for c in out["citations"] for s in re.split(r"(?<=[.!?])\s+", c["excerpt"]) if s.strip()]
                sentences.sort(key=lambda sc: len(q & set(_terms(sc[0]))), reverse=True)
                answer = " ".join(f"{s} [{n}]" for s, n in sentences[:3])
            else:
                answer = "No relevant knowledge found in the accessible namespaces."
        out.update({"answer": answer, "answer_model": model,
                    "confidence": "high" if out["groundedness"] >= out["threshold"] else "low"})
        self.history.appendleft({k: out[k] for k in ("request_id", "query", "outcome", "groundedness")} | {"agent": ctx.agent_id})
        return out

    @operation("Recent retrieval requests (for the Knowledge window).")
    async def recent(self, ctx: CallContext) -> dict[str, Any]:
        return {"requests": list(self.history) if ctx.is_admin else [h for h in self.history if h["agent"] == ctx.agent_id]}

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name in ("retrieve", "ask") and isinstance(data, dict):
            routes = "+".join(sorted({b for h in data["hops"] for b in h["backends"]}))
            return f"{len(data['hops'])} hop(s) via {routes} · grounded {data['groundedness']} · {len(data['citations'])} cites"
        if op_name == "ingest" and isinstance(data, dict):
            return f"{data['chunks']} chunks → {data['namespace']}"
        return super().summarize(op_name, data)

