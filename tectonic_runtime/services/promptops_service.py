"""PromptOps module: version control, A/B testing and lifecycle for system prompts (modules/promptops core).

Module core: immutable prompt versions, the DRAFT → TESTING → ACTIVE → ARCHIVED state machine,
A/B tests decided by a two-proportion z-test with an evaluation gate, drift detection against the
promoted baseline, and reflection-based improvement proposals.

This wrapper adds the runtime half the core leaves to other services:
  * Serving — ``resolve`` returns the live template for a prompt; while an A/B test runs each
    session is deterministically hashed to an arm (sticky per session) and the exposure recorded.
  * Outcomes — runs and explicit feedback are recorded per prompt version and exposed to the
    core through its EvaluationFrameworkClient port, so significance, drift and the gate work on
    real data.
  * Admin lifecycle — promote and rollback that respect the core's legal transitions (rollback
    clones the archived template into a new version; history is never mutated).
  * Builder integration — the Builder's own system prompt is a managed prompt
    ("agent_builder.root"), bootstrapped from the code default.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any

from .._paths import ensure_module_paths
from ..base import BaseModule, CallContext, operation
from ..models import current_caller, generate, online, reasoning_model
from ..persist import from_dict, read_json, state_path, write_json

ensure_module_paths()

from promptops.core.ab_testing_service import ABTestingService, evaluation_ref  # noqa: E402
from promptops.core.domain import (  # noqa: E402
    ABTestRecord, ABTestStatus, InvalidTransitionError, PromptVersionRecord, PromptVersionStatus, is_legal_transition, new_id, now,
)
from promptops.core.drift_detection_service import DriftDetectionService  # noqa: E402
from promptops.core.fakes import InMemoryPromptOpsRepository  # noqa: E402
from promptops.core.prompt_registry_service import PromptRegistryService  # noqa: E402
from promptops.core.reflection_optimiser import ReflectionOptimiser  # noqa: E402

TENANT = "platform"
GATE_WINDOW = 20
GATE_MIN_PASS_RATE = 0.5


class PersistentPromptRepository(InMemoryPromptOpsRepository):
    def __init__(self, path) -> None:
        super().__init__()
        self._path = path
        raw = read_json(path) or {}
        self.prompt_versions = {r["id"]: from_dict(PromptVersionRecord, r) for r in raw.get("prompt_versions", [])}
        self.ab_tests = {r["id"]: from_dict(ABTestRecord, r) for r in raw.get("ab_tests", [])}
        self.outcomes: dict[str, list[dict[str, Any]]] = raw.get("outcomes", {})
        self.exposures: dict[str, str] = raw.get("exposures", {})  # f"{prompt}|{session}" -> version_id
        self.code_defaults: dict[str, str] = raw.get("code_defaults", {})  # prompt -> sha256 of its code default

    def flush(self) -> None:
        if len(self.exposures) > 20_000:  # keep the most recent session assignments
            self.exposures = dict(list(self.exposures.items())[-10_000:])
        write_json(self._path, {"prompt_versions": list(self.prompt_versions.values()), "ab_tests": list(self.ab_tests.values()),
                                "outcomes": self.outcomes, "exposures": self.exposures, "code_defaults": self.code_defaults})

    async def create_prompt_version(self, record):  # type: ignore[override]
        r = await super().create_prompt_version(record)
        self.flush()
        return r

    async def update_prompt_version(self, record):  # type: ignore[override]
        r = await super().update_prompt_version(record)
        self.flush()
        return r

    async def create_ab_test(self, record):  # type: ignore[override]
        r = await super().create_ab_test(record)
        self.flush()
        return r

    async def update_ab_test(self, record):  # type: ignore[override]
        r = await super().update_ab_test(record)
        self.flush()
        return r


class OutcomeEvaluationClient:
    """EvaluationFrameworkClient port backed by outcomes recorded in-process."""

    def __init__(self, repo: PersistentPromptRepository) -> None:
        self.repo = repo

    async def list_scores(self, *, tenant_id: str, agent_ref: str) -> list[dict[str, Any]]:
        return list(self.repo.outcomes.get(agent_ref, []))

    async def gate_latest_run(self, *, tenant_id: str, agent_ref: str) -> dict[str, Any] | None:
        recent = self.repo.outcomes.get(agent_ref, [])[-GATE_WINDOW:]
        if not recent:
            return None
        rate = sum(1 for s in recent if s["passed"]) / len(recent)
        passed = rate >= GATE_MIN_PASS_RATE
        return {"overall_passed": passed,
                "blocking_failures": [] if passed else [f"recent pass rate {rate:.0%} < {GATE_MIN_PASS_RATE:.0%}"]}


class GeminiPromptGateway:
    """LLMGatewayClient port for the reflection optimiser."""

    async def generate(self, *, tenant_id: str, model: str, prompt: str) -> str:
        if not online():
            raise RuntimeError("reflection needs an LLM: set GOOGLE_API_KEY (offline mode has no generator)")
        token = current_caller.set({"agent_id": "promptops", "team": None, "purpose": "promptops.reflection"})
        try:
            gen = await generate(prompt, model=model, max_output_tokens=2048, temperature=0.4)
        finally:
            current_caller.reset(token)
        if gen is None or not gen.text:
            raise RuntimeError("reflection model returned no text")
        return gen.text


def _view(v: PromptVersionRecord) -> dict[str, Any]:
    return {"version_id": v.id, "prompt_name": v.prompt_name, "version": v.version, "status": v.status.value,
            "parent_version_id": v.parent_version_id, "promoted_pass_rate": v.promoted_pass_rate,
            "promoted_sample_size": v.promoted_sample_size, "created_at": v.created_at.isoformat(),
            "chars": len(v.template)}


class PromptOpsModule(BaseModule):
    name = "promptops"
    label = "PromptOps"
    description = "Versioned system prompts with lifecycle, sticky A/B tests, significance testing, drift and rollback."
    category = "governance"

    async def setup(self) -> None:
        self.repository = PersistentPromptRepository(state_path("promptops.json", "TECTONIC_PROMPTOPS_PATH"))
        evals = OutcomeEvaluationClient(self.repository)
        self.registry = PromptRegistryService(self.repository)
        self.ab = ABTestingService(self.repository, evals, min_sample_size_per_arm=10, significance_level=0.05)
        self.drift = DriftDetectionService(self.repository, evals, significance_level=0.05)
        self.reflection = ReflectionOptimiser(self.repository, evals, GeminiPromptGateway(), reflection_model=reasoning_model())

    # --- helpers ------------------------------------------------------------------------------
    def _versions(self, prompt_name: str) -> list[PromptVersionRecord]:
        return sorted((v for v in self.repository.prompt_versions.values() if v.prompt_name == prompt_name), key=lambda v: v.created_at)

    def _next_version(self, prompt_name: str) -> str:
        nums = [int(v.version[1:]) for v in self._versions(prompt_name) if v.version[:1] == "v" and v.version[1:].isdigit()]
        return f"v{max(nums, default=0) + 1}"

    def _running_test(self, prompt_name: str) -> ABTestRecord | None:
        return next((t for t in self.repository.ab_tests.values() if t.prompt_name == prompt_name and t.status == ABTestStatus.RUNNING), None)

    async def _transition(self, v: PromptVersionRecord, to: PromptVersionStatus) -> None:
        if not is_legal_transition(v.status, to):
            raise InvalidTransitionError(v.status, to)
        v.status = to
        v.updated_at = now()
        await self.repository.update_prompt_version(v)

    async def _activate(self, v: PromptVersionRecord) -> None:
        """Legal path to ACTIVE (DRAFT → TESTING → ACTIVE), archiving the previously active version."""
        if self._running_test(v.prompt_name):
            raise RuntimeError(f"an A/B test is running for {v.prompt_name}; conclude it first")
        if v.status == PromptVersionStatus.DRAFT:
            await self._transition(v, PromptVersionStatus.TESTING)
        current = await self.repository.get_active_prompt_version(tenant_id=TENANT, prompt_name=v.prompt_name)
        await self._transition(v, PromptVersionStatus.ACTIVE)
        if current and current.id != v.id:
            await self._transition(current, PromptVersionStatus.ARCHIVED)

    async def ensure_prompt(self, prompt_name: str, default_template: str) -> PromptVersionRecord:
        """Bootstrap a managed prompt from its code default, and keep following the code default.

        If the live version is still the last code default (nobody promoted a different version)
        and the code default has changed, the new text is published and activated automatically.
        A version an admin promoted is never overridden.
        """
        await self.boot()
        digest = hashlib.sha256(default_template.encode("utf-8")).hexdigest()
        active = await self.repository.get_active_prompt_version(tenant_id=TENANT, prompt_name=prompt_name)
        if active:
            last = self.repository.code_defaults.get(prompt_name)
            active_is_code = hashlib.sha256(active.template.encode("utf-8")).hexdigest() == last
            if last == digest or not active_is_code or self._running_test(prompt_name):
                return active
        v = await self.registry.register(tenant_id=TENANT, prompt_name=prompt_name, version=self._next_version(prompt_name),
                                         template=default_template)
        await self._activate(v)
        self.repository.code_defaults[prompt_name] = digest
        self.repository.flush()
        return v

    async def publish_code_default(self, prompt_name: str, template: str) -> tuple[PromptVersionRecord, bool]:
        """Make an explicitly edited code default live, even over a version an admin promoted.

        Used when the user changes an agent's prompt in the Studio: that edit is the intent, so it must
        not be shadowed by an older managed version. Returns (version, published). Refuses (raises)
        while an A/B test runs for the prompt.
        """
        await self.boot()
        digest = hashlib.sha256(template.encode("utf-8")).hexdigest()
        active = await self.repository.get_active_prompt_version(tenant_id=TENANT, prompt_name=prompt_name)
        if active and hashlib.sha256(active.template.encode("utf-8")).hexdigest() == digest:
            self.repository.code_defaults[prompt_name] = digest
            self.repository.flush()
            return active, False
        if self._running_test(prompt_name):
            raise RuntimeError(f"an A/B test is running for {prompt_name}; conclude it first")
        v = await self.registry.register(tenant_id=TENANT, prompt_name=prompt_name, version=self._next_version(prompt_name),
                                         template=template)
        await self._activate(v)
        self.repository.code_defaults[prompt_name] = digest
        self.repository.flush()
        return v, True

    async def resolve_template(self, prompt_name: str, session_id: str | None, default: str) -> tuple[str, str | None]:
        """Python API for instruction providers: (template, version_id). Never raises."""
        try:
            await self.ensure_prompt(prompt_name, default)
            test = self._running_test(prompt_name)
            key = f"{prompt_name}|{session_id or 'anonymous'}"
            if test:
                vid = self.repository.exposures.get(key)
                if vid not in (test.version_a_id, test.version_b_id):
                    bucket = int(hashlib.sha256(f"{test.id}:{session_id}".encode()).hexdigest(), 16) % 2
                    vid = test.version_a_id if bucket == 0 else test.version_b_id
                    self.repository.exposures[key] = vid
                    self.repository.flush()
            else:
                active = await self.repository.get_active_prompt_version(tenant_id=TENANT, prompt_name=prompt_name)
                vid = active.id if active else None
                if vid and self.repository.exposures.get(key) != vid:
                    self.repository.exposures[key] = vid
            v = self.repository.prompt_versions.get(vid) if vid else None
            return (v.template, v.id) if v else (default, None)
        except Exception:
            return default, None

    async def record(self, prompt_name: str, passed: bool, *, session_id: str | None = None, version_id: str | None = None,
                     metric: str = "task_success", score: float | None = None) -> dict[str, Any] | None:
        await self.boot()
        vid = version_id or self.repository.exposures.get(f"{prompt_name}|{session_id or 'anonymous'}")
        v = self.repository.prompt_versions.get(vid) if vid else None
        if v is None:
            return None
        ref = evaluation_ref(v.prompt_name, v.version)
        self.repository.outcomes.setdefault(ref, []).append({
            "passed": bool(passed), "score": float(score if score is not None else (1.0 if passed else 0.0)),
            "threshold": 0.5, "metric_name": metric, "at": now().isoformat(),
        })
        self.repository.flush()
        return {"version_id": v.id, "version": v.version, "samples": len(self.repository.outcomes[ref])}

    # --- operations ---------------------------------------------------------------------------
    @operation("List managed prompts with active version, version count and running A/B test.")
    async def list_prompts(self, ctx: CallContext) -> dict[str, Any]:
        by_name: dict[str, list[PromptVersionRecord]] = defaultdict(list)
        for v in self.repository.prompt_versions.values():
            by_name[v.prompt_name].append(v)
        out = []
        for name, versions in sorted(by_name.items()):
            active = next((v for v in versions if v.status == PromptVersionStatus.ACTIVE), None)
            test = self._running_test(name)
            out.append({"prompt_name": name, "versions": len(versions), "active_version": active.version if active else None,
                        "active_version_id": active.id if active else None, "ab_test_id": test.id if test else None})
        return {"prompts": out}

    @operation("All versions of a prompt with lifecycle status and outcome stats.")
    async def versions(self, ctx: CallContext, prompt_name: str) -> dict[str, Any]:
        rows = []
        for v in self._versions(prompt_name):
            scores = self.repository.outcomes.get(evaluation_ref(v.prompt_name, v.version), [])
            passed = sum(1 for s in scores if s["passed"])
            rows.append({**_view(v), "samples": len(scores), "pass_rate": round(passed / len(scores), 4) if scores else None})
        tests = [t for t in self.repository.ab_tests.values() if t.prompt_name == prompt_name]
        return {"prompt_name": prompt_name, "versions": rows,
                "ab_tests": [{"ab_test_id": t.id, "status": t.status.value, "version_a_id": t.version_a_id, "version_b_id": t.version_b_id,
                              "winner_version_id": t.winner_version_id, "p_value": t.p_value} for t in sorted(tests, key=lambda t: t.started_at)]}

    @operation("Full template text of one version.")
    async def get_version(self, ctx: CallContext, version_id: str) -> dict[str, Any]:
        v = await self.registry.get(version_id)
        return {**_view(v), "template": v.template}

    @operation("Register a new DRAFT version of a prompt (version label auto-increments when omitted).", permission="admin")
    async def register(self, ctx: CallContext, prompt_name: str, template: str, version: str | None = None) -> dict[str, Any]:
        if not template.strip():
            raise ValueError("template is empty")
        v = await self.registry.register(tenant_id=TENANT, prompt_name=prompt_name, version=version or self._next_version(prompt_name),
                                         template=template)
        return _view(v)

    @operation("Promote a DRAFT/TESTING version to ACTIVE (archives the current active version).", permission="admin")
    async def promote(self, ctx: CallContext, version_id: str) -> dict[str, Any]:
        v = await self.registry.get(version_id)
        await self._activate(v)
        return _view(v)

    @operation("Roll back to an earlier version: clones its template as a new version and activates it.", permission="admin")
    async def rollback(self, ctx: CallContext, version_id: str) -> dict[str, Any]:
        old = await self.registry.get(version_id)
        clone = await self.registry.register(tenant_id=TENANT, prompt_name=old.prompt_name, version=self._next_version(old.prompt_name),
                                             template=old.template)
        clone.parent_version_id = old.id
        await self.repository.update_prompt_version(clone)
        await self._activate(clone)
        return {**_view(clone), "rolled_back_to": old.version}

    @operation("Start an A/B test: current ACTIVE (cloned as control) vs a DRAFT candidate.", permission="admin")
    async def start_ab_test(self, ctx: CallContext, candidate_version_id: str) -> dict[str, Any]:
        cand = await self.registry.get(candidate_version_id)
        active = await self.repository.get_active_prompt_version(tenant_id=TENANT, prompt_name=cand.prompt_name)
        if active is None:
            raise RuntimeError(f"{cand.prompt_name} has no ACTIVE version to test against")
        control = await self.registry.register(tenant_id=TENANT, prompt_name=cand.prompt_name,
                                               version=f"{active.version}-control-{new_id()[:4]}", template=active.template)
        control.parent_version_id = active.id
        await self.repository.update_prompt_version(control)
        test = await self.ab.start(tenant_id=TENANT, prompt_name=cand.prompt_name, version_a_id=control.id, version_b_id=cand.id)
        return {"ab_test_id": test.id, "prompt_name": test.prompt_name, "control": control.version, "candidate": cand.version}

    @operation("Current A/B statistics: samples, pass rates, p-value, significance.")
    async def ab_status(self, ctx: CallContext, ab_test_id: str) -> dict[str, Any]:
        result = await self.ab.evaluate(ab_test_id)
        test = self.repository.ab_tests[ab_test_id]
        return {"ab_test_id": ab_test_id, "status": test.status.value, "sample_size_a": result.sample_size_a,
                "sample_size_b": result.sample_size_b, "pass_rate_a": result.pass_rate_a, "pass_rate_b": result.pass_rate_b,
                "p_value": result.p_value, "significant": result.significant, "winner_version_id": result.winner_version_id,
                "reason": result.reason}

    @operation("Conclude a significant A/B test: winner → ACTIVE (after the evaluation gate), loser archived.", permission="admin")
    async def conclude_ab_test(self, ctx: CallContext, ab_test_id: str) -> dict[str, Any]:
        test = await self.ab.conclude(ab_test_id)
        winner = self.repository.prompt_versions[test.winner_version_id]
        return {"ab_test_id": test.id, "winner": winner.version, "winner_version_id": winner.id, "p_value": test.p_value}

    @operation("Record an outcome (pass/fail) for the version a session was served, or an explicit version.")
    async def record_outcome(self, ctx: CallContext, prompt_name: str, passed: bool, session_id: str | None = None,
                             version_id: str | None = None, metric: str = "task_success") -> dict[str, Any]:
        result = await self.record(prompt_name, passed, session_id=session_id or ctx.session_id, version_id=version_id, metric=metric)
        if result is None:
            raise LookupError(f"no served version found for {prompt_name!r} (session {session_id or ctx.session_id!r})")
        return result

    @operation("Serve the live template for a prompt (sticky A/B arm per session).")
    async def resolve(self, ctx: CallContext, prompt_name: str, default: str = "") -> dict[str, Any]:
        template, vid = await self.resolve_template(prompt_name, ctx.session_id, default)
        v = self.repository.prompt_versions.get(vid) if vid else None
        return {"prompt_name": prompt_name, "version_id": vid, "version": v.version if v else None, "template": template}

    @operation("Drift check: current pass rate vs the promoted baseline (z-test).", permission="admin")
    async def check_drift(self, ctx: CallContext, version_id: str) -> dict[str, Any]:
        r = await self.drift.check(version_id)
        return {"baseline_pass_rate": r.baseline_pass_rate, "current_pass_rate": r.current_pass_rate,
                "current_sample_size": r.current_sample_size, "p_value": r.p_value, "drifted": r.drifted, "reason": r.reason}

    @operation("Reflection: ask the reasoning model to rewrite an under-performing prompt as a new DRAFT.", permission="admin")
    async def propose_improvement(self, ctx: CallContext, version_id: str) -> dict[str, Any]:
        proposal = await self.reflection.propose(version_id)
        if proposal is None:
            return {"proposed": False, "reason": "not enough samples or pass rate already above the reflection threshold"}
        return {"proposed": True, **_view(proposal)}

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name == "resolve" and isinstance(data, dict):
            return f"{data['prompt_name']} → {data['version'] or 'default'}"
        if op_name == "ab_status" and isinstance(data, dict):
            return f"A {data['pass_rate_a']} vs B {data['pass_rate_b']} (p={data['p_value']})"
        return super().summarize(op_name, data)
