"""Guardrails module: input/output safety for every agent (modules/guardrails core)."""

from __future__ import annotations

import time
from typing import Any

from .._paths import ensure_module_paths
from ..adapters import HeuristicGuardrailsArbiter
from ..base import BaseModule, CallContext, operation

ensure_module_paths()

from guardrails.core import pii_detector  # noqa: E402
from guardrails.core.domain import CheckStage, InterventionLogRecord, PolicyProfileRecord, new_id  # noqa: E402
from guardrails.core.fakes import InMemoryGuardrailsRepository  # noqa: E402
from guardrails.core.policy_engine import PolicyEngine  # noqa: E402

# The module's PERSON detector is a capitalised-words heuristic; in agent traffic it redacts names
# like "Code Generator", so the runtime default profile leaves it opt-in via configure_profile.
DEFAULT_PII_TYPES = ["EMAIL", "PHONE_NUMBER", "CREDIT_CARD", "SSN"]


class GuardrailsModule(BaseModule):
    name = "guardrails"
    label = "Guardrails"
    description = "Jailbreak detection, denied topics, PII redaction and groundedness checks on agent I/O."
    category = "safety"

    async def setup(self) -> None:
        self.repository = InMemoryGuardrailsRepository()
        self.engine = PolicyEngine(HeuristicGuardrailsArbiter())

    async def _profile(self, tenant_id: str) -> PolicyProfileRecord:
        profile = await self.repository.get_default_policy_profile(tenant_id)
        if profile is None:
            profile = await self.repository.create_policy_profile(
                PolicyProfileRecord(id=new_id(), tenant_id=tenant_id, name="default", pii_entity_types=list(DEFAULT_PII_TYPES))
            )
        return profile

    async def _check(self, ctx: CallContext, text: str, stage: CheckStage, context: str | None) -> dict[str, Any]:
        started = time.perf_counter()
        profile = await self._profile(ctx.tenant_id)
        result = await self.engine.evaluate(text, stage, profile, ctx.tenant_id, context=context)
        await self.repository.create_intervention_log(
            InterventionLogRecord(
                id=new_id(), tenant_id=ctx.tenant_id, policy_profile_id=profile.id, stage=stage,
                check_type=",".join(result.checks_run), decision=result.decision,
                violation_category=result.violation_category, latency_ms=(time.perf_counter() - started) * 1000,
            )
        )
        return {
            "decision": result.decision.value,
            "allowed": result.decision.value != "block",
            "violation": result.violation_category,
            "text": result.redacted_text if result.redacted_text is not None else text,
            "checks_run": result.checks_run,
        }

    @operation("Screen user/agent input: blocks jailbreaks and denied topics, redacts PII.")
    async def check_input(self, ctx: CallContext, text: str) -> dict[str, Any]:
        return await self._check(ctx, text, CheckStage.INPUT, None)

    @operation("Screen agent output before it is shown: PII redaction and optional groundedness vs context.")
    async def check_output(self, ctx: CallContext, text: str, context: str | None = None) -> dict[str, Any]:
        return await self._check(ctx, text, CheckStage.OUTPUT, context)

    @operation("Redact PII entities from text without a full policy check.")
    async def redact_pii(self, ctx: CallContext, text: str, entity_types: list[str] | None = None) -> dict[str, Any]:
        redacted, found = pii_detector.detect_and_redact(text, entity_types or DEFAULT_PII_TYPES)
        return {"text": redacted, "entities": found}

    @operation("Replace the tenant's active policy profile (denied topics, enabled checks, PII types).", permission="admin")
    async def configure_profile(
        self, ctx: CallContext, denied_topics: list[str] | None = None, enabled_checks: list[str] | None = None,
        pii_entity_types: list[str] | None = None, groundedness_threshold: float = 0.85,
    ) -> dict[str, Any]:
        for profile in self.repository.profiles.values():
            if profile.tenant_id == ctx.tenant_id:
                profile.status = "superseded"
        record = PolicyProfileRecord(
            id=new_id(), tenant_id=ctx.tenant_id, name=f"profile-by-{ctx.agent_id}",
            denied_topics=list(denied_topics or []),
            pii_entity_types=list(pii_entity_types or DEFAULT_PII_TYPES),
            groundedness_threshold=groundedness_threshold,
            **({"enabled_checks": list(enabled_checks)} if enabled_checks else {}),
        )
        await self.repository.create_policy_profile(record)
        return {"profile_id": record.id, "enabled_checks": record.enabled_checks, "denied_topics": record.denied_topics}

    @operation("Recent intervention statistics for the tenant.")
    async def stats(self, ctx: CallContext) -> dict[str, Any]:
        logs = [log for log in self.repository.intervention_logs if log.tenant_id == ctx.tenant_id]
        by_decision: dict[str, int] = {}
        for log in logs:
            by_decision[log.decision.value] = by_decision.get(log.decision.value, 0) + 1
        return {"checks": len(logs), "by_decision": by_decision}

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name in ("check_input", "check_output") and isinstance(data, dict):
            verdict = data["decision"].upper()
            return f"{verdict}{f' ({data['violation']})' if data.get('violation') else ''}"
        if op_name == "redact_pii" and isinstance(data, dict):
            return f"redacted {', '.join(data['entities']) or 'nothing'}"
        return super().summarize(op_name, data)
