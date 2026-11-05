"""Auditability module: tamper-evident trace of agent reasoning, state changes and tool execution
(modules/auditability core).

Module core: a per-tenant SHA-256 hash chain (each entry hashes its canonical content plus the
previous hash), chain verification that pinpoints the first broken sequence number, natural-
language → filter translation, and JSON audit packs.

This wrapper makes it observe the whole platform:
  * Ingestion — every telemetry event (agent lifecycle, state changes, tool calls, A2A messages,
    token metrics, runs) and every module event (calls, results, permission denials) is queued
    and chained. Token streams are folded into one AGENT_REASONING entry per agent turn, so the
    chain-of-thought is preserved without one entry per token.
  * Privacy — string values are PII-redacted (guardrails detector) *before* hashing.
  * Persistence — append-only JSONL; on restart the chain is replayed, so any edit to the file
    is detected by verify().
  * Access — workers query only their own team's entries; export is admin-only.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
from collections import defaultdict
from datetime import datetime
from typing import Any

from .._paths import ensure_module_paths
from ..base import BaseModule, CallContext, operation
from ..models import current_caller, generate_json, online, utility_model
from ..persist import from_dict, state_path

ensure_module_paths()

from auditability.core.audit_pack_generator import AuditPackGenerator  # noqa: E402
from auditability.core.chain_verifier import verify_chain  # noqa: E402
from auditability.core.domain import AuditEventFilter, AuditEventRecord, AuditPackRecord, AuditPackStatus, InvalidNLQueryFilterError, new_id  # noqa: E402
from auditability.core.fakes import InMemoryAuditabilityRepository  # noqa: E402
from auditability.core.ingestion_service import IngestionService  # noqa: E402
from auditability.core.nl_query_translator import NLQueryTranslator  # noqa: E402
from guardrails.core import pii_detector  # noqa: E402

TENANT = "platform"
PII_TYPES = ["EMAIL", "PHONE_NUMBER", "CREDIT_CARD", "SSN"]

AGENT_EVENTS = {"AGENT_CREATED", "AGENT_STATE_CHANGE", "TOOL_CALL_START", "TOOL_CALL_END", "A2A_MESSAGE", "AGENT_METRICS",
                "RUN_STARTED", "RUN_COMPLETED"}
MODULE_EVENTS = {"MODULE_CALL_END", "MODULE_ACCESS_DENIED"}
# Read-only operations the operator UI polls; recording each refresh would bury real activity.
# Operator writes and every agent call (reads included — they are part of an agent's reasoning) stay audited.
OPERATOR_READS = {"report", "rates", "recommendations", "check", "stats", "list_prompts", "versions", "get_version",
                  "ab_status", "query", "verify", "documents_list", "recent", "search", "resolve"}


_IDENTIFIER_RE = re.compile(r"^[0-9a-fA-F][0-9a-fA-F-]{15,}$")  # hex digests, UUIDs
_IDENTIFIER_KEYS = re.compile(r"(^id$|_id$|hash|sha\d*|digest|call_id|invocation)", re.I)


def redact(value: Any, key: str = "") -> Any:
    """PII-redact free text. Identifiers (hashes, UUIDs, *_id fields) are left intact: the phone/card
    patterns would otherwise mangle digit runs inside digests and break traceability."""
    if isinstance(value, str):
        if (key and _IDENTIFIER_KEYS.search(key)) or _IDENTIFIER_RE.match(value):
            return value
        return pii_detector.detect_and_redact(value, PII_TYPES)[0] if len(value) < 20_000 else value[:20_000]
    if isinstance(value, dict):
        return {k: redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, key) for v in value[:200]]
    return value


class JsonlAuditRepository(InMemoryAuditabilityRepository):
    """The module's repository with append-only JSONL persistence. Stored hashes are replayed
    verbatim, so verify_chain() detects any modification of the file."""

    def __init__(self, path) -> None:
        super().__init__()
        self._path = path
        if path is not None and path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    rec = from_dict(AuditEventRecord, json.loads(line))
                except (ValueError, TypeError, KeyError):
                    continue  # a mangled line is itself evidence: verify() will report the gap
                self.events.append(rec)
                self._next_sequence[rec.tenant_id] = max(self._next_sequence.get(rec.tenant_id, 1), rec.sequence_number + 1)

    async def append_event(self, **kwargs: Any) -> AuditEventRecord:  # type: ignore[override]
        rec = await super().append_event(**kwargs)
        if self._path is not None:
            from ..base import to_jsonable

            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(to_jsonable(rec), default=str) + "\n")
        return rec


class GeminiAuditGateway:
    """auditability LLMGatewayClient port: natural-language question → filter proposal (JSON)."""

    async def complete(self, *, prompt_context: dict[str, Any], tenant_id: str) -> dict[str, Any]:
        question = prompt_context.get("question") or prompt_context.get("query") or json.dumps(prompt_context)
        if online():
            token = current_caller.set({"agent_id": "auditability", "team": None, "purpose": "auditability.nl_query"})
            try:
                proposal = await generate_json(
                    "Translate the audit question into a filter. Allowed keys (omit unknown ones): "
                    "event_type (one of AGENT_CREATED, AGENT_STATE_CHANGE, AGENT_REASONING, TOOL_CALL_START, TOOL_CALL_END, "
                    "A2A_MESSAGE, AGENT_METRICS, RUN_STARTED, RUN_COMPLETED, MODULE_CALL_END, MODULE_ACCESS_DENIED), "
                    "source_module (e.g. 'agent:billing_worker' or 'module:finops'), control_name, "
                    f"occurred_after, occurred_before (ISO-8601). Current time: {datetime.now().isoformat(timespec='seconds')}.\n"
                    f"Question: {question}\nReply with a JSON object only.",
                    model=utility_model(), max_output_tokens=160,
                )
            finally:
                current_caller.reset(token)
            if proposal is not None:
                return {k: v for k, v in proposal.items() if isinstance(v, str) and v}
        return heuristic_filter(question)


def heuristic_filter(question: str) -> dict[str, Any]:
    q = question.lower()
    out: dict[str, Any] = {}
    table = [("denied", "MODULE_ACCESS_DENIED"), ("permission", "MODULE_ACCESS_DENIED"), ("reasoning", "AGENT_REASONING"),
             ("thought", "AGENT_REASONING"), ("tool", "TOOL_CALL_END"), ("delegat", "A2A_MESSAGE"), ("message", "A2A_MESSAGE"),
             ("error", "AGENT_STATE_CHANGE"), ("spawn", "AGENT_CREATED"), ("created", "AGENT_CREATED"), ("module", "MODULE_CALL_END"),
             ("token", "AGENT_METRICS"), ("cost", "AGENT_METRICS"), ("run", "RUN_COMPLETED")]
    for needle, etype in table:
        if needle in q:
            out["event_type"] = etype
            break
    agent = re.search(r"\b([a-z]+_[a-z_]+)\b", q)
    if agent:
        out["source_module"] = f"agent:{agent.group(1)}"
    return out


class AuditabilityModule(BaseModule):
    name = "auditability"
    label = "Auditability"
    description = "Hash-chained, PII-redacted trace of reasoning, state changes, tool calls and module access."
    category = "governance"

    def __init__(self, bus) -> None:
        super().__init__(bus)
        self._queue: list[tuple[str, str, dict[str, Any]]] = []
        self._reasoning: dict[str, list[str]] = defaultdict(list)
        self._call_payloads: dict[str, Any] = {}
        self._agent_team: dict[str, str | None] = {}
        self._drain_task: asyncio.Task | None = None
        self._wake: asyncio.Event | None = None
        # Module events come straight off the runtime bus; agent telemetry is fed via observe().
        bus.subscribe(self._on_module_event)

    async def setup(self) -> None:
        self.repository = JsonlAuditRepository(state_path("audit.jsonl", "TECTONIC_AUDIT_PATH"))
        self.ingestion = IngestionService(self.repository)
        self.translator = NLQueryTranslator(GeminiAuditGateway())
        self.packs = AuditPackGenerator(self.repository, "json")

    # --- intake -----------------------------------------------------------------------------
    def _enqueue(self, source: str, event_type: str, payload: dict[str, Any]) -> None:
        self._queue.append((source, event_type, payload))
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # drained later by flush()
        if self._drain_task is None or self._drain_task.done():
            self._wake = asyncio.Event()
            self._drain_task = loop.create_task(self._drain_forever())
        if self._wake:
            self._wake.set()

    def _flush_reasoning(self, agent_id: str, cause: str) -> None:
        chunks = self._reasoning.pop(agent_id, None)
        if chunks:
            text = "".join(chunks).strip()
            if text:
                self._enqueue(f"agent:{agent_id}", "AGENT_REASONING",
                              {"agent_id": agent_id, "team": self._agent_team.get(agent_id), "text": text[:8000], "flushed_on": cause})

    def observe(self, event: dict[str, Any]) -> None:
        """Telemetry hub listener (agent lifecycle, tools, A2A, runs, token streams)."""
        etype = event.get("type", "")
        agent = event.get("id") or event.get("from_id") or event.get("root_id")
        if event.get("team") and agent:
            self._agent_team[agent] = event["team"]
        if etype == "TOKEN_STREAM":
            if event.get("id"):
                self._reasoning[event["id"]].append(str(event.get("chunk", "")))
            return
        if etype not in AGENT_EVENTS:
            return
        if agent and etype in ("AGENT_STATE_CHANGE", "TOOL_CALL_START", "A2A_MESSAGE", "RUN_COMPLETED"):
            self._flush_reasoning(agent, etype)
        payload = {k: v for k, v in event.items() if k not in ("type", "seq")}
        payload.setdefault("team", self._agent_team.get(agent) if agent else None)
        self._enqueue("runtime" if etype.startswith("RUN_") else f"agent:{agent}", etype, payload)

    def _on_module_event(self, event: dict[str, Any]) -> None:
        etype = event.get("type")
        if etype == "MODULE_CALL_START":
            self._call_payloads[event["call_id"]] = event.get("payload")
            return
        if etype not in MODULE_EVENTS:
            return
        if etype == "MODULE_CALL_END" and event.get("role") == "operator" and event.get("operation") in OPERATOR_READS:
            self._call_payloads.pop(event.get("call_id"), None)
            return
        payload = {k: v for k, v in event.items() if k != "type"}
        if etype == "MODULE_CALL_END":
            payload["request"] = self._call_payloads.pop(event.get("call_id"), None)
            if isinstance(payload.get("result"), (dict, list)) and len(json.dumps(payload["result"], default=str)) > 6000:
                payload["result"] = {"truncated": True, "summary": event.get("summary")}
        self._enqueue(f"module:{event.get('module')}", etype, payload)

    async def _drain_forever(self) -> None:
        while True:
            await self.flush()
            assert self._wake is not None
            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                if not self._queue:
                    return  # idle: the next event restarts the drainer

    async def flush(self) -> int:
        """Chain everything queued so far (tests and exports call this for a consistent view)."""
        await self.boot()
        n = 0
        while self._queue:
            source, etype, payload = self._queue.pop(0)
            await self.ingestion.ingest(tenant_id=TENANT, source_module=source, payload={"event_type": etype, **redact(payload)})
            n += 1
        return n

    # --- queries ------------------------------------------------------------------------------
    def _visible(self, ctx: CallContext, rec: AuditEventRecord) -> bool:
        if ctx.is_admin:
            return True
        team = rec.payload.get("team")
        return team is not None and team == ctx.team

    @staticmethod
    def _view(rec: AuditEventRecord) -> dict[str, Any]:
        return {"sequence": rec.sequence_number, "event_type": rec.event_type, "source": rec.source_module,
                "occurred_at": rec.occurred_at.isoformat(), "team": rec.payload.get("team"),
                "agent_id": rec.payload.get("agent_id") or rec.payload.get("id"), "payload": rec.payload,
                "entry_hash": rec.entry_hash, "prev_hash": rec.prev_hash}

    async def _query(self, ctx: CallContext, flt: AuditEventFilter, agent_id: str | None, team: str | None) -> dict[str, Any]:
        await self.flush()
        page_size, offset = flt.limit, flt.offset
        flt.limit, flt.offset = 100_000, 0
        events, _ = await self.repository.list_events(flt)
        rows = [e for e in events if self._visible(ctx, e)
                and (not agent_id or agent_id in (e.payload.get("agent_id"), e.payload.get("id"), e.payload.get("from_id")))
                and (not team or e.payload.get("team") == team)]
        return {"total": len(rows), "events": [self._view(e) for e in rows[offset: offset + page_size]]}

    @operation("Query the audit trail (newest first) by type, source, agent, team and time (workers: own team).")
    async def query(self, ctx: CallContext, event_type: str | None = None, source: str | None = None, agent_id: str | None = None,
                    team: str | None = None, since: str | None = None, until: str | None = None, limit: int = 50,
                    offset: int = 0) -> dict[str, Any]:
        flt = AuditEventFilter(tenant_id=TENANT, event_type=event_type, source_module=source,
                               occurred_after=datetime.fromisoformat(since) if since else None,
                               occurred_before=datetime.fromisoformat(until) if until else None,
                               limit=max(1, min(limit, 500)), offset=max(0, offset))
        return await self._query(ctx, flt, agent_id, team)

    @operation("Ask the audit trail a question in plain language (translated to a validated filter).")
    async def ask(self, ctx: CallContext, question: str, limit: int = 50) -> dict[str, Any]:
        try:
            flt = await self.translator.translate(question, TENANT)
        except InvalidNLQueryFilterError as exc:
            flt = AuditEventFilter(tenant_id=TENANT, **heuristic_filter(question))
            note = f"model proposal rejected ({exc}); used keyword filter"
        else:
            note = "translated"
        flt.limit = max(1, min(limit, 500))
        result = await self._query(ctx, flt, None, None)
        applied = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in vars(flt).items()
                   if k not in ("tenant_id", "limit", "offset") and v is not None}
        return {"question": question, "filter": applied, "note": note, **result}

    @operation("Verify the hash chain end-to-end; reports the first broken sequence number if tampered.")
    async def verify(self, ctx: CallContext) -> dict[str, Any]:
        await self.flush()
        events = await self.repository.list_events_for_chain(TENANT)
        r = verify_chain(events)
        return {"valid": r.valid, "verified_count": r.verified_count, "break_at_sequence": r.break_at_sequence,
                "head_hash": events[-1].entry_hash if events else None, "algorithm": "sha256 hash chain"}

    @operation("Export an audit pack (JSON, base64) for a filter, with chain-validity attestation.", permission="admin")
    async def export(self, ctx: CallContext, event_type: str | None = None, source: str | None = None) -> dict[str, Any]:
        await self.flush()
        pack = await self.repository.create_audit_pack(AuditPackRecord(
            id=new_id(), tenant_id=TENANT, status=AuditPackStatus.GENERATING, filter_event_type=event_type,
            filter_source_module=source, document_format="json"))
        pack = await self.packs.generate(pack.id, TENANT)
        if pack.status != AuditPackStatus.COMPLETED:
            raise RuntimeError(pack.last_error or "audit pack generation failed")
        return {"pack_id": pack.id, "event_count": pack.event_count, "chain_valid": pack.chain_valid,
                "document_ref": pack.document_ref, "format": "json", "document_b64": pack.document_bytes_b64,
                "bytes": len(base64.b64decode(pack.document_bytes_b64 or ""))}

    @operation("Record a governance event (e.g. DESIGN_DECISIONS, BUILD_COMPLETED) in the hash chain.", permission="admin")
    async def record_event(self, ctx: CallContext, event_type: str, payload: dict[str, Any] | None = None,
                           team: str | None = None) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,40}", event_type or ""):
            raise ValueError("event_type must be UPPER_SNAKE_CASE (3-41 chars)")
        body = {"agent_id": ctx.agent_id, "team": team or ctx.team, **(payload or {})}
        self._enqueue(f"agent:{ctx.agent_id}", event_type, body)
        await self.flush()
        last = self.repository.events[-1] if self.repository.events else None
        return {"recorded": event_type, "sequence": last.sequence_number if last else None,
                "entry_hash": last.entry_hash if last else None}

    @operation("Counts by event type and source.")
    async def stats(self, ctx: CallContext) -> dict[str, Any]:
        await self.flush()
        by_type: dict[str, int] = defaultdict(int)
        by_source: dict[str, int] = defaultdict(int)
        for e in self.repository.events:
            if self._visible(ctx, e):
                by_type[e.event_type] += 1
                by_source[e.source_module] += 1
        return {"total": sum(by_type.values()), "by_type": dict(by_type),
                "top_sources": sorted(by_source.items(), key=lambda kv: -kv[1])[:12]}

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name == "verify" and isinstance(data, dict):
            return f"chain {'VALID' if data['valid'] else 'BROKEN @' + str(data['break_at_sequence'])} ({data['verified_count']})"
        if op_name in ("query", "ask") and isinstance(data, dict):
            return f"{data['total']} entries"
        return super().summarize(op_name, data)
