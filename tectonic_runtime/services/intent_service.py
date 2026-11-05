"""Intent Detection module: routes requests to the right behaviour (modules/intent-detection core).

Taxonomies are per agent: a worker calls ``define_taxonomy`` with its own intents; any agent that
has not defined one classifies against the tenant default (seeded below for builder-style traffic).
"""

from __future__ import annotations

from typing import Any

from .._paths import ensure_module_paths
from ..adapters import ClauseIntentResolver
from ..base import BaseModule, CallContext, operation

ensure_module_paths()

from intent_detection.config import ClassificationConfig  # noqa: E402
from intent_detection.core.classification_service import ClassificationService  # noqa: E402
from intent_detection.core.compositional_decomposer import CompositionalDecomposer  # noqa: E402
from intent_detection.core.domain import IntentDefinition, IntentTaxonomyRecord, TaxonomyStatus, new_id  # noqa: E402
from intent_detection.core.fakes import InMemoryIntentRepository  # noqa: E402
from intent_detection.core.llm_fallback import LLMFallbackHandler  # noqa: E402
from intent_detection.core.primary_classifier import PrimaryClassifier  # noqa: E402

DEFAULT_TAXONOMY = [
    IntentDefinition("build_agent", "Create a new agent", [
        "build me an agent", "create a new agent that", "generate an agent for", "I need an assistant that",
    ]),
    IntentDefinition("modify_agent", "Change an existing agent", [
        "add a tool to the agent", "update the agent prompt", "change how the agent works", "fix the generated agent",
    ]),
    IntentDefinition("run_task", "Execute work", [
        "run the report", "process these records", "execute the task", "do this for me now",
    ]),
    IntentDefinition("ask_question", "Information request", [
        "what is", "how does this work", "can you explain", "why did it", "where can I find",
    ]),
    IntentDefinition("report_status", "Progress or status request", [
        "what is the status", "show progress", "is it done yet", "summarize what happened",
    ]),
    IntentDefinition("greeting", "Small talk", ["hi", "hello there", "good morning", "thanks a lot"]),
]


class IntentDetectionModule(BaseModule):
    name = "intent_detection"
    label = "Intent Detection"
    description = "Classifies requests against an intent taxonomy, with multi-intent decomposition."
    category = "understanding"

    async def setup(self) -> None:
        self.repository = InMemoryIntentRepository()
        self.config = ClassificationConfig(confidence_threshold=0.45)
        self.service = ClassificationService(
            repository=self.repository,
            primary_classifier=PrimaryClassifier(),
            decomposer=CompositionalDecomposer(),
            fallback_handler=LLMFallbackHandler(ClauseIntentResolver()),
            config=self.config,
        )
        self._default_tenants: set[str] = set()

    @staticmethod
    def _agent_key(ctx: CallContext) -> str:
        return f"{ctx.tenant_id}::{ctx.agent_id}"

    async def _publish(self, key: str, intents: list[IntentDefinition]) -> IntentTaxonomyRecord:
        versions = [t.version for t in self.repository.taxonomies.values() if t.tenant_id == key]
        record = await self.repository.create_taxonomy(
            IntentTaxonomyRecord(id=new_id(), tenant_id=key, version=max(versions, default=0) + 1, intents=intents)
        )
        for t in self.repository.taxonomies.values():
            if t.tenant_id == key and t.status == TaxonomyStatus.ACTIVE:
                t.status = TaxonomyStatus.DEPRECATED
        return await self.repository.activate_taxonomy(record.id)

    async def _resolve_key(self, ctx: CallContext) -> str:
        key = self._agent_key(ctx)
        if await self.repository.get_active_taxonomy(key):
            return key
        if ctx.tenant_id not in self._default_tenants:
            await self._publish(ctx.tenant_id, DEFAULT_TAXONOMY)
            self._default_tenants.add(ctx.tenant_id)
        return ctx.tenant_id

    @operation("Classify text into one or more intents from the caller's active taxonomy.")
    async def classify(self, ctx: CallContext, text: str) -> dict[str, Any]:
        key = await self._resolve_key(ctx)
        result = await self.service.classify(text, key)
        intents = [{"name": i.name, "confidence": round(i.confidence, 4)} for i in result.intents]
        return {
            "primary": intents[0]["name"] if intents else None,
            "intents": intents,
            "multi_intent": len(intents) > 1,
            "fallback_used": result.fallback_used,
            "taxonomy": "agent" if key != ctx.tenant_id else "default",
            "taxonomy_version": result.taxonomy_version,
        }

    @operation("Publish a new taxonomy version for the calling agent: [{name, description, examples[]}].")
    async def define_taxonomy(self, ctx: CallContext, intents: list[dict[str, Any]]) -> dict[str, Any]:
        defs = [IntentDefinition(name=str(i["name"]), description=str(i.get("description", "")),
                                 examples=[str(e) for e in i.get("examples", [])]) for i in intents]
        if not defs or any(not d.examples for d in defs):
            raise ValueError("every intent needs a name and at least one example")
        record = await self._publish(self._agent_key(ctx), defs)
        return {"version": record.version, "intents": [d.name for d in defs]}

    @operation("Show the taxonomy the calling agent classifies against.")
    async def get_taxonomy(self, ctx: CallContext) -> dict[str, Any]:
        key = await self._resolve_key(ctx)
        record = await self.repository.get_active_taxonomy(key)
        return {
            "scope": "agent" if key != ctx.tenant_id else "default",
            "version": record.version if record else None,
            "intents": [{"name": i.name, "description": i.description, "examples": i.examples} for i in (record.intents if record else [])],
        }

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name == "classify" and isinstance(data, dict) and data.get("intents"):
            return " + ".join(f"{i['name']} ({i['confidence']:.2f})" for i in data["intents"])
        return super().summarize(op_name, data)
