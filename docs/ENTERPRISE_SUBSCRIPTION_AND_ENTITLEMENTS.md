# Tectonic — Enterprise Subscription & Entitlements Architecture

| | |
|---|---|
| **Status** | Draft for review — no production code has been changed |
| **Audience** | Product & business stakeholders (Sections 0–2), Engineering (Sections 3–5) |
| **Prepared by** | Principal AI Platform Architect / SaaS Packaging Strategist |
| **Date** | 2026-11-20 |
| **Scope** | 4-tier subscription blueprint + runtime entitlement enforcement design |
| **Cost constraint** | No dollar prices are proposed. All numeric limits are *relative* technical defaults marked `[Proposed Default - Tune After Cost Modeling]`. |

---

## 0. Current-State Audit (basis for every `[Implemented]` / `[Roadmap]` tag)

This document is grounded in the repository as it exists today. The single most important
architectural fact: **Tectonic already has a metering backbone and a budget guardrail in the agent
loop.** It has no *plan* concept, no *tier* concept, and no *per-tenant entitlement* object — those
are what this proposal adds. The inventory below is the source of truth for the tags used in the
entitlement matrix (Section 2).

### 0.1 Integrated LLM providers & model selection

| What | Where | Status |
|---|---|---|
| **Google Gemini** (native `google-genai` SDK via `google.adk.models.google_llm.Gemini`) | [`agent_builder/shared_libraries/constants.py`](agent_builder/shared_libraries/constants.py) → `build_model()` | ✅ Implemented |
| **Anthropic Claude** (native `anthropic` SDK via `google.adk.models.anthropic_llm.AnthropicLlm`) | `build_model()` + [`agent_builder/shared_libraries/studio_model.py`](agent_builder/shared_libraries/studio_model.py) → `build_claude()` | ✅ Implemented |
| **LiteLLM** (fallback router only) | `build_model()` last-resort branch, `resolve_litellm_model_name()` | ✅ Implemented (fallback) |
| **Studio model catalogue** (7 curated models: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`, `gemini-3.6-flash`, `gemini-2.5-pro`, `gemini-2.5-flash`; arbitrary ids allowed) | [`agent_builder/model_settings.py`](agent_builder/model_settings.py) → `CATALOGUE` | ✅ Implemented |
| **Per-account model override ("BYOK-lite")** — one custom `{model, provider, encrypted key}` slot per account, `default`/`custom` mode switch | `model_settings.py` → `save_custom()`, `set_mode()`; keys Fernet-encrypted (HKDF of `TECTONIC_AUTH_SECRET`) | ✅ Implemented |
| **Platform model roles** — `reasoning` (`gemini-3.6-flash`), `utility` (`gemini-3.5-flash-lite`), `embeddings` (`gemini-embedding-2`, dim 768) | [`tectonic_runtime/models.py`](tectonic_runtime/models.py) → `reasoning_model()` / `utility_model()` / `embedding_model()` | ✅ Implemented |

### 0.2 Agent execution pipeline & orchestration loop

* **Root orchestrator agent** — [`agent_builder/agent.py`](agent_builder/agent.py): a single `LlmAgent`
  (`name="agent_builder"`) routes a build request through five specialist sub-agents wired as
  `AgentTool`s: `intent_detection`, `requirement_understanding`, `guardrails`,
  `agent_card_manager`, `code_generator` (plus `design_review` and `agent_editor` under
  [`agent_builder/sub_agents/`](agent_builder/sub_agents/)).
* **Builder tools** — [`agent_builder/tools/`](agent_builder/tools/): `agent_access`, `build_pipeline`,
  `file_manager`, `interview`, `memory`, `review`, `web_search`.
* **Pipeline state machine** — session state keys (`STATE_INTENT`, `STATE_REQUIREMENTS`,
  `STATE_GUARDRAIL_REPORT`, `STATE_AGENT_CARDS`, `STATE_ARCH_SPEC`, `STATE_AUTOPILOT`, …) in
  `constants.py` drive the guided-interview → architecture-spec → code-generation flow.
* **Generated-agent model binding** — [`agent_builder/workflow_model.py`](agent_builder/workflow_model.py)
  `WorkflowModelPlugin.before_run_callback` rebinds every generated agent (and its sub-agents and
  `AgentTool`s) to the signed-in user's Studio model before each run.
* **API surface** — [`server.py`](server.py) wraps the ADK FastAPI app (`/run`, `/run_sse`, `/apps/*`)
  and adds `/ws/telemetry`, `/modules/{module}/{operation}`, `/directory/*`, `/api/env`; user-facing
  auth + agent-file APIs live in [`agent_builder/studio_api.py`](agent_builder/studio_api.py).
  [`server_full.py`](server_full.py) is the Cloud Run production variant that also serves `frontend/dist`.

### 0.3 Token / usage tracking hooks (already in the loop)

This is the most important discovery for this proposal — Tectonic is closer to commercial
entitlements than the rest of the codebase suggests:

1. **In-loop budget guardrail** — [`agent_builder/telemetry.py`](agent_builder/telemetry.py)
   `TelemetryPlugin.before_model_callback` calls `finops.is_blocked(team)` and, when blocked,
   returns a synthetic `LlmResponse` ("budget exhausted") so the agent degrades gracefully instead
   of spending. ✅ *The exact hook this proposal generalizes into a full entitlement gatekeeper.*
2. **Post-call metering** — `TelemetryPlugin.after_model_callback` reads
   `llm_response.usage_metadata` (`prompt_token_count`, `candidates_token_count`,
   `total_token_count`) and calls `finops.meter(team, agent_id, model, input_tokens,
   output_tokens, kind="agent")`, also emitting `AGENT_METRICS` events.
3. **Platform-model metering** — [`tectonic_runtime/models.py`](tectonic_runtime/models.py)
   `set_usage_hook()` routes every platform LLM call (RAG critic, PromptOps reflection, audit
   NL queries, embeddings) through [`tectonic_runtime/runtime.py`](tectonic_runtime/runtime.py)
   `ModuleRuntime._meter_platform_usage()` into FinOps (`kind="platform"` / `"embedding"`).
4. **FinOps module** — [`tectonic_runtime/services/finops_service.py`](tectonic_runtime/services/finops_service.py):
   per-team budgets (`period`, `limit_usd`, `alert_threshold_pct`, `enforcement: alert|block`),
   a USD/1M-token rate card (Gemini + Claude list prices, all flagged `estimate`), period reports,
   run-rate forecasting, and a cost-optimisation agent.
5. **Invoice-grade metering (standalone)** — [`modules/billing-and-metering`](modules/billing-and-metering)
   ("Module 33") is a separate FastAPI service that reads **FinOps cost reports + Auditability
   events** as its metering source of truth, produces `draft → finalized` invoices, and syncs a
   tenant plan's entitlements to the Multi-tenancy feature-flag store. It fails *open* by design.
   ✅ Implemented as a service; ⚠️ **not yet wired into the agent runtime**.

### 0.4 Identity, configuration & secrets

* **AuthN** — [`agent_builder/auth.py`](agent_builder/auth.py): username/password (PBKDF2-SHA256,
  240k rounds), HMAC-SHA256 bearer tokens (7-day TTL), `TECTONIC_ADMINS`, first-account-is-admin.
  `AuthMiddleware` is a pure-ASGI gate that authenticates every API/ADK/WebSocket request and
  rewrites ADK user ids so users can only drive their own sessions/agents. ✅
* **Secret management** — platform keys come from environment / GCP Secret Manager (Cloud Run);
  per-user custom model keys are Fernet-encrypted at rest (`model_settings.py`). Connector
  credentials are validated live, encrypted in the platform vault, and scrubbed from telemetry —
  [`tectonic_runtime/connectors/`](tectonic_runtime/connectors/) (`vault.py`, `redaction.py`). ✅
* **Deployment** — `Dockerfile`, `cloudbuild.yaml`, `deploy.ps1`, `gcloud` (GCP Cloud Run). ✅

### 0.5 Platform modules & connectors

`tectonic_runtime` runs **12 modules in-process** (`MODULE_CLASSES` in
[`tectonic_runtime/runtime.py`](tectonic_runtime/runtime.py)):

`guardrails`, `intent_detection`, `short_term_memory`, `long_term_memory`, `tool_orchestration`,
`agentic_rag`, `vector_db`, `finops`, `promptops`, `auditability`, `external_connectors`,
`image_generation`.

Their `core/` packages ship under [`modules/*/src`](modules) and are made importable by
[`tectonic_runtime/_paths.py`](tectonic_runtime/_paths.py). The `modules/` tree additionally
contains **~22 implemented standalone services** (FastAPI + Helm + OTel/Prometheus scaffolding)
that are *not* yet wired into the runtime — `billing-and-metering`, `multi-tenancy`, `llm-gateway`,
`identity-and-access`, `control-plane`, `workflow-engine`, `conversational-engine`, `observability`,
`mcp`, `evaluation-framework`, `human-oversight`, `sentinel-agents`, `knowledge-base`,
`context-engineering`, `a2a`, `agent-cards`, `agent-marketplace`, `sdk-and-developer-portal`,
`data-source-plugins`, `graph-db`, `multi-modality`, `llmops`, `regulatory-compliance`,
`deployment-strategy`, `secrets-and-credential-management`.

**External connectors today** — [`tectonic_runtime/connectors/registry.py`](tectonic_runtime/connectors/registry.py)
registers `GoogleAnalyticsConnector`, `MetaAdsConnector`, and a generic `HTTP` connector; each
becomes LLM tools + an External Tools card automatically.

### 0.6 Observability & audit

* `TelemetryPlugin` emits `AGENT_CREATED`, `AGENT_STATE_CHANGE`, `TOOL_CALL_START/END`,
  `TOKEN_STREAM`, `AGENT_METRICS`, `RUN_STARTED/COMPLETED`; the module bus emits `MODULE_REGISTERED`,
  `MODULE_STATE`, `MODULE_CALL_START/END` ([`tectonic_runtime/events.py`](tectonic_runtime/events.py)).
* The **Auditability** module observes every telemetry event ([`server.py`](server.py)
  `hub.add_listener(...)`), and OpenTelemetry callbacks are attached via
  [`agent_builder/tracing.py`](agent_builder/tracing.py). ✅

> **Net assessment:** compute metering, budget blocking, per-user model isolation, audit event
> capture, and a module permission system (`worker`/`admin`) already exist. What is missing is a
> **declarative, per-tenant entitlement plane** that turns those primitives into *subscription
> tiers*, plus enforcement at the two places that matter: the **API entry** (what a user may see and
> start) and the **orchestration loop** (what a run may spend and call).

---

## 1. Executive Summary & Tiering Philosophy

### 1.1 The problem

Tectonic monetizes three different resources, and treating them as one price breaks margins:

1. **Compute** — LLM tokens (and image/embedding calls) are variable, third-party, per-call cost.
2. **Platform capability** — modules, connectors, agents, memory, observability, collaboration.
3. **Governance & trust** — audit, SSO, data residency, SLAs, human oversight.

A flat price over-allocates compute to cheap plan (margin loss) and under-delivers governance to
expensive plans (churn). A pure metered price is unpredictable and creates a poor Builder
experience. The answer is a **hybrid entitlement model**.

### 1.2 The hybrid entitlement model

> **Predictable tier access + compute guardrails + feature/governance gating.**

* **Tier access (what you may *use*)** — a declarative `PlanEntitlement` object (Section 3) that
  gates model catalogue access, module/connector visibility, orchestration depth, memory caps, and
  collaboration features. Checked at the **API entry** and rendered in the builder UI.
* **Compute guardrails (how much you may *spend*)** — monthly token quotas, per-run/turn token caps,
  RPM/TPM rate limits, and iteration caps enforced **in the orchestration loop**; overage behavior
  is tier-specific (hard cap → throttle → credit top-up). Reuses the existing FinOps budget
  guardrail rather than inventing a second ledger.
* **Feature/governance gating (what you may *trust*)** — RBAC, human-in-the-loop, audit export,
  SSO/SAML, private/VPC deployment, retention and SLAs. This is what makes Enterprise an
  Enterprise tier, not just "more tokens".

Every entitlement is **configuration, not code**: limits live in the `PlanEntitlement` schema and
are enforced by three checkpoints (Section 4), never hardcoded into agent logic.

### 1.3 The four tiers

| Tier | Positioning | Primary buyer | Core promise |
|---|---|---|---|
| **Starter** | Sandbox / taste | Individual experimenters | Safely try building & running one agent on economy models with a hard monthly cap. |
| **Pro** | Individual Builder | Power users / solo consultants | Full model catalogue (incl. flagships), BYOK, multi-agent, memory, and a predictable "top-up" path — no surprise bills. |
| **Business** | Team Scale | SMBs → mid-market teams | Pooled team quota, seats + RBAC, shared knowledge, priority queues, audit trails, and governance basics. |
| **Enterprise** | Custom | Regulated / large orgs | Negotiated limits, SSO/SCIM, private/VPC deployment, dedicated queues, custom retention & SLAs, BYOK endpoints at scale. |

### 1.4 Tiering principles (the guardrails for the blueprint)

1. **Compute is the margin line.** Economy models are cheap; flagship/reasoning models are not.
   Tier access is deliberately asymmetrical — a Pro user gets *Sonnet-class*, not *Opus-class* by
   default, so every tier's token quota maps to a predictable worst-case COGS.
2. **Tokens are soft-capped, features are hard-gated.** Running out of tokens degrades
   gracefully (`LIMIT_TOKENS_EXCEEDED` with a top-up prompt); trying to use a locked module is a
   hard deny (`MODULE_LOCKED`) and is hidden from the UI entirely.
3. **BYOK shifts cost, not control.** A user-supplied key (already implemented per-account) changes
   whose bill is charged but still respects the platform's RPM/TPM, model-tier, and governance
   limits — so BYOK is a *Pro+* differentiator, never a compute-escape hatch.
4. **Teams pool, individuals meter.** Business/Enterprise get pooled quotas and rate limits at the
   tenant level; Starter/Pro are per-account.
5. **Everything is overridable per tenant.** Enterprise (and only Enterprise) gets
   `tenant_overrides` so a single schema serves every contract without code changes.

---

## 2. Comprehensive Tier Entitlement Matrix

Legend:
* ✅ **`[Implemented in Repo]`** — capability exists in code today.
* 🛣️ **`[Roadmap / Proposed]`** — proposed here and/or present as an unwired standalone module.
* 🔢 Numbers are **`[Proposed Default - Tune After Cost Modeling]`** — relative, not priced.

### Dimension 1 — Compute & Token Limits

| Entitlement | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Monthly token quota 🔢 | 500k | 5M | 50M (pooled) | Negotiated (unlimited) |
| Max tokens per run / turn 🔢 | 50k | 200k | 500k | Negotiated |
| Rate limit (RPM) 🔢 | 5 | 60 | 300 | Negotiated |
| Rate limit (TPM) 🔢 | 50k | 500k | 2M | Negotiated |
| Overage behavior 🔢 | Hard cap (stop + upgrade prompt) | Throttle, then credit top-up | Pooled alerts + credit top-up | Contract (never hard-block) |
| Budget guardrail (per-team spend) | ✅ `finops.is_blocked` | ✅ | ✅ | ✅ + contract overrides |
| Token metering (prompt/completion) | ✅ `TelemetryPlugin.after_model_callback` | ✅ | ✅ | ✅ |
| Platform-model metering (RAG/audit/embeds) | ✅ `runtime._meter_platform_usage` | ✅ | ✅ | ✅ |
| Invoice-grade metering | 🛣️ | 🛣️ | 🛣️ `billing-and-metering` | 🛣️ |
| Cost/run-rate forecasting | 🛣️ UI | 🛣️ UI | ✅ `finops` | ✅ |

### Dimension 2 — Model Catalog Access

| Entitlement | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Economy models (Gemini Flash / Claude Haiku class) | ✅ | ✅ | ✅ | ✅ |
| Balanced models (Sonnet / Flash-Pro class) | 🛣️ gated | ✅ | ✅ | ✅ |
| Flagship models (Opus / Fable / reasoning) | — | ✅ | ✅ | ✅ |
| Reasoning / long-horizon models (Gemini 2.5 Pro) | — | ✅ | ✅ | ✅ |
| Early-access / ongoing model previews | — | 🛣️ | ✅ | ✅ |
| BYOK custom model + key (per account) | — | ✅ `model_settings.save_custom` | ✅ | ✅ |
| BYOK custom *endpoints* (Azure/AWS Bedrock/Vertex) | — | — | 🛣️ | ✅ 🛣️ |
| Admin-locked platform default model | ✅ `apply_default` | ✅ | ✅ | ✅ |
| Model allowlist enforcement | 🛣️ | 🛣️ | 🛣️ | 🛣️ `MODEL_NOT_IN_PLAN` |

### Dimension 3 — Agent & Orchestration Depth

| Entitlement | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Max agents (per account/tenant) 🔢 | 1 | 10 | 500 | Negotiated |
| Single-agent build | ✅ | ✅ | ✅ | ✅ |
| Multi-agent / sub-agent orchestration | — | ✅ `AgentTool` | ✅ | ✅ |
| Max sub-agents per run 🔢 | 3 | 8 | 15 | Negotiated |
| Max tool-call / reasoning iterations 🔢 | 30 | 80 | 200 | Negotiated |
| Concurrent runs 🔢 | 2 | 10 | 50 | Negotiated |
| Conversational agent editing | ✅ `editor.edit_agent` | ✅ | ✅ | ✅ |
| Agent versioning / rollback | 🛣️ | 🛣️ | 🛣️ | 🛣️ |
| Autopilot / guided-interview builder | ✅ `build_pipeline` | ✅ | ✅ | ✅ |

### Dimension 4 — Modules, Tools & Connectors

Tag key: `ga` = wired into `tectonic_runtime` today · `beta` = standalone service with `src/`, not
wired · `coming_soon` = scaffold only.

| Capability | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| **Builder tools** (web_search, file mgr, memory, review, interview, build pipeline, agent access) — `ga` | ✅ | ✅ | ✅ | ✅ |
| **Guardrails** — `ga` | ✅ | ✅ | ✅ | ✅ |
| **Intent detection** — `ga` | ✅ | ✅ | ✅ | ✅ |
| **Short-term memory** — `ga` | ✅ | ✅ | ✅ | ✅ |
| **Long-term memory** — `ga` | — | ✅ | ✅ | ✅ |
| **Tool orchestration** — `ga` | ✅ | ✅ | ✅ | ✅ |
| **Agentic RAG** — `ga` | — | ✅ | ✅ | ✅ |
| **Vector DB** — `ga` | — | ✅ | ✅ | ✅ |
| **PromptOps** — `ga` | — | ✅ | ✅ | ✅ |
| **Auditability** — `ga` | ✅ (self) | ✅ | ✅ | ✅ |
| **FinOps dashboards** — `ga` | — | ✅ | ✅ | ✅ |
| **Image generation** — `ga` | — | ✅ | ✅ | ✅ |
| **External connectors (GA4, Meta Ads, HTTP)** — `ga` | — | ✅ | ✅ | ✅ |
| **Custom connector SDK** | — | — | 🛣️ `beta` | ✅ 🛣️ |
| **Billing & metering** | — | — | ✅ `beta` | ✅ |
| **Multi-tenancy / entitlements** | — | — | ✅ `beta` | ✅ |
| **LLM gateway** | — | — | ✅ `beta` | ✅ |
| **Identity & access (SSO/RBAC)** | — | — | 🛣️ `beta` | ✅ |
| **Secrets & credential management** | — | — | ✅ `beta` | ✅ |
| **Control plane / workflow engine / conversational engine** | — | — | ✅ `beta` | ✅ |
| **Observability / LLMOps / evaluation framework** | — | — | ✅ `beta` | ✅ |
| **MCP / data-source plugins / knowledge base / context engineering** | — | — | ✅ `beta` | ✅ |
| **Human oversight / sentinel agents** | — | — | ✅ `beta` | ✅ |
| **Agent cards / A2A / marketplace / SDK portal** | — | — | ✅ `beta` | ✅ |
| **Graph DB / multi-modality / regulatory compliance / deployment strategy** | — | — | ✅ `beta` | ✅ |
| **Workflow-engine Control-Plane (legacy)** | — | — | — | 🛣️ `coming_soon` |

> Module *visibility* in the builder UI is gated by the same `PlanEntitlement.modules` map —
> a locked module is hidden from the UI and rejected at the API (`MODULE_LOCKED`).

### Dimension 5 — Memory, Context & Knowledge

| Entitlement | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Max context window 🔢 | 128k | 256k | 512k | Negotiated |
| Session (short-term) memory | ✅ `short_term_memory` | ✅ | ✅ | ✅ |
| Persistent (long-term) memory | — | ✅ `long_term_memory` | ✅ | ✅ |
| Vector DB storage cap 🔢 | 10 MB | 1 GB | 50 GB | Negotiated |
| Shared team knowledge base | — | — | ✅ `knowledge-base` | ✅ |
| Memory retention window 🔢 | 30 days | 90 days | 12 months | Configurable |
| Embedding budget (platform `gemini-embedding-2`) | Shared | Shared | Shared | Dedicated |

### Dimension 6 — Interactive Session & Collaboration

| Entitlement | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Seats | 1 | 1 | 5–100 (tiered) | Negotiated |
| Editing in Studio | ✅ | ✅ | ✅ | ✅ |
| Concurrent sessions per seat 🔢 | 1 | 3 | 10 | Negotiated |
| Agent versioning / rollback | — | 🛣️ | 🛣️ | ✅ |
| RBAC (roles/permissions) | — | — | ✅ 🛣️ | ✅ (SSO/SCIM) |
| Human-in-the-loop approvals | — | — | ✅ `human-oversight` | ✅ |
| Team workspace / shared agents | — | — | ✅ | ✅ |
| Session isolation per user | ✅ `AuthMiddleware` | ✅ | ✅ | ✅ |

### Dimension 7 — Observability & Reliability

| Entitlement | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Live trace (`/ws/telemetry`) | ✅ | ✅ | ✅ | ✅ |
| Token/cost dashboard | — | ✅ `finops.report` | ✅ | ✅ |
| Trace retention 🔢 | 7 days | 30 days | 90 days | 1 year+ |
| Audit log export | — | — | ✅ 🛣️ | ✅ |
| Execution queue priority 🔢 | Standard | Standard | Priority | Dedicated |
| SLA 🔢 | Best-effort | 99.5% | 99.9% | Custom |
| Structured error codes | ✅ (below) | ✅ | ✅ | ✅ |

### Dimension 8 — Security & Enterprise Governance

| Entitlement | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Email/password auth (PBKDF2 + HMAC bearer) | ✅ | ✅ | ✅ | ✅ |
| Content/PII guardrails | ✅ `guardrails` | ✅ | ✅ | ✅ |
| Custom model keys encrypted at rest | ✅ | ✅ | ✅ | ✅ |
| Connector secret vault + redaction | ✅ | ✅ | ✅ | ✅ |
| Audit trail (in-process) | ✅ | ✅ | ✅ | ✅ |
| Audit log export / retention | — | — | 🛣️ | ✅ |
| SSO / SAML | — | — | — | ✅ 🛣️ |
| SCIM provisioning | — | — | — | ✅ 🛣️ |
| Private / VPC deployment | — | — | — | ✅ (`Dockerfile`/Cloud Run today) |
| Data residency controls | — | — | — | ✅ 🛣️ `regulatory-compliance` |
| DPA / custom retention / DSR | — | — | — | ✅ 🛣️ |

---

## 3. Declarative Entitlement Schema

Entitlements are **configuration-driven**. A single `PlanEntitlement` Pydantic model is the source of
truth; JSON files (or a future `plans` table served by `multi-tenancy` / `billing-and-metering`) hold
the tier defaults and per-tenant Enterprise overrides. Nothing in agent logic reads a hardcoded tier.

> **Implemented since the first draft:** the per-plan lock/unlock files now exist at
> [`plans/{starter,pro,business,enterprise}.json`](plans) and are loaded by
> [`agent_builder/entitlements.py`](agent_builder/entitlements.py) at import time (see
> [`docs/orchrestation limit to broden.md`](orchrestation%20limit%20to%20broden.md) for the full
> broadened orchestration-limits PRD). Orchestration-depth defaults below have been broadened
> accordingly (sub-agents 3/8/15, iterations 30/80/200, concurrent runs 2/10/50).

### 3.1 Pydantic model (Pydantic v2, matching the project's `pydantic>=2.0`)

```python
# tectonic_runtime/entitlements.py  (proposed new module)
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class OverageMode(str, Enum):
    hard_cap = "hard_cap"          # stop at quota; structured LIMIT_TOKENS_EXCEEDED
    throttle = "throttle"          # slow down (rate-limit) but keep serving
    credit_top_up = "credit_top_up"  # allow paid top-up beyond quota
    contract = "contract"          # Enterprise: never hard-block


class ModelTier(str, Enum):
    economy = "economy"
    balanced = "balanced"
    flagship = "flagship"
    reasoning = "reasoning"
    preview = "preview"


class RateLimit(BaseModel):
    rpm: int = 60                 # requests per minute
    tpm: int = 500_000            # tokens per minute


class TokenQuota(BaseModel):
    monthly_tokens: int = Field(default=5_000_000, gt=0)
    max_tokens_per_run: int = Field(default=200_000, gt=0)
    max_iterations: int = Field(default=80, gt=0)
    max_sub_agents: int = Field(default=8, ge=0)
    rate_limit: RateLimit = RateLimit()
    overage: OverageMode = OverageMode.throttle


class ModuleAccess(BaseModel):
    status: str = "ga"            # ga | beta | coming_soon
    gated: bool = True            # False → visible to all tiers regardless of plan map


class PlanEntitlement(BaseModel):
    """One subscription plan. ``tenant_overrides`` is honored for Enterprise tenants only."""

    plan_id: str                  # "starter" | "pro" | "business" | "enterprise" | "custom:<uuid>"
    plan_name: str
    tier: int = Field(ge=0, le=3)  # 0=Starter 1=Pro 2=Business 3=Enterprise
    status: str = "active"        # active | suspended | cancelled | trial

    # Dimension 1 — compute
    compute: TokenQuota

    # Dimension 2 — models
    model_tiers: list[ModelTier] = [ModelTier.economy]
    model_allowlist: list[str] | None = None      # None → allow all in `model_tiers`
    model_denylist: list[str] = []
    allow_byok: bool = False                      # custom model + key (per account)
    allow_custom_endpoints: bool = False          # Azure/Bedrock/Vertex BYOK endpoints

    # Dimension 3 — orchestration depth
    max_agents: int = Field(default=10, gt=0)
    max_concurrent_runs: int = Field(default=10, gt=0)
    allow_multi_agent: bool = True

    # Dimension 4 — modules, tools & connectors
    modules: dict[str, ModuleAccess] = {}         # module name → access; absent → locked
    connectors: list[str] = []                    # allowed connector names
    builder_tools: list[str] = []                 # allowed builder tools

    # Dimension 5 — memory / context / knowledge
    context_window_tokens: int = Field(default=256_000, gt=0)
    vector_store_bytes: int = Field(default=1_073_741_824, ge=0)  # 1 GiB
    persistent_memory: bool = True
    memory_retention_days: int = Field(default=90, gt=0)

    # Dimension 6 — collaboration
    max_seats: int = Field(default=1, ge=1)
    rbac_enabled: bool = False
    human_in_the_loop: bool = False

    # Dimension 7 — observability
    trace_retention_days: int = Field(default=30, gt=0)
    queue_priority: str = "standard"  # standard | priority | dedicated
    sla: str = "best_effort"

    # Dimension 8 — governance
    sso_saml: bool = False
    scim: bool = False
    audit_export: bool = False
    private_deployment: bool = False
    data_retention_policy: str = "platform-default"

    # Enterprise-only per-tenant override (ignored for non-Enterprise tiers)
    tenant_overrides: dict[str, Any] = {}

    # --- runtime helpers (the only code agent logic calls) -------------------
    def model_allowed(self, model_id: str) -> bool:
        from agent_builder.model_settings import CATALOGUE  # catalogue entries carry `provider`
        if model_id in self.model_denylist:
            return False
        if self.model_allowlist is not None:
            return model_id in self.model_allowlist
        # map model id → tier via the Studio catalogue; unknown ids require allowlist
        return any(m["id"] == model_id and m.get("tag") in self.model_tiers for m in CATALOGUE)

    def module_allowed(self, module_name: str) -> bool:
        return module_name in self.modules and self.modules[module_name].status in ("ga", "beta")
```

> **Design note:** the plan map is keyed by `plan_id` and resolved per request from the signed-in
> user (`agent_builder.workspace.current_user`) → tenant → plan. Resolution caches for the request
> lifetime. Enterprise `tenant_overrides` are merged on top of the `enterprise` default at load time
> (deep-merge), so a contract change is a config edit, not a release.

### 3.2 Example configs

```jsonc
// plans/starter.json
{
  "plan_id": "starter", "plan_name": "Starter", "tier": 0,
  "compute": {
    "monthly_tokens": 500000, "max_tokens_per_run": 50000, "max_iterations": 30,
    "max_sub_agents": 3,
    "rate_limit": { "rpm": 5, "tpm": 50000 },
    "overage": "hard_cap"
  },
  "model_tiers": ["economy"],
  "allow_byok": false,
  "max_agents": 1, "max_concurrent_runs": 2, "allow_multi_agent": false,
  "modules": {
    "guardrails": {"status": "ga"},
    "intent_detection": {"status": "ga"},
    "short_term_memory": {"status": "ga"},
    "tool_orchestration": {"status": "ga"},
    "auditability": {"status": "ga"}
  },
  "connectors": [],
  "context_window_tokens": 128000, "vector_store_bytes": 10485760,
  "persistent_memory": false, "memory_retention_days": 30,
  "max_seats": 1,
  "trace_retention_days": 7, "queue_priority": "standard", "sla": "best_effort"
}
```

```jsonc
// plans/pro.json
{
  "plan_id": "pro", "plan_name": "Pro", "tier": 1,
  "compute": {
    "monthly_tokens": 5000000, "max_tokens_per_run": 200000, "max_iterations": 80,
    "max_sub_agents": 8,
    "rate_limit": { "rpm": 60, "tpm": 500000 },
    "overage": "credit_top_up"
  },
  "model_tiers": ["economy", "balanced", "flagship", "reasoning"],
  "allow_byok": true,
  "max_agents": 10, "max_concurrent_runs": 10, "allow_multi_agent": true,
  "modules": {
    "guardrails": {"status": "ga"}, "intent_detection": {"status": "ga"},
    "short_term_memory": {"status": "ga"}, "long_term_memory": {"status": "ga"},
    "tool_orchestration": {"status": "ga"}, "agentic_rag": {"status": "ga"},
    "vector_db": {"status": "ga"}, "promptops": {"status": "ga"},
    "auditability": {"status": "ga"}, "finops": {"status": "ga"},
    "image_generation": {"status": "ga"}, "external_connectors": {"status": "ga"}
  },
  "connectors": ["google_analytics", "meta_ads", "http"],
  "context_window_tokens": 256000, "vector_store_bytes": 1073741824,
  "persistent_memory": true, "memory_retention_days": 90,
  "max_seats": 1,
  "trace_retention_days": 30, "queue_priority": "standard", "sla": "99.5%"
}
```

```jsonc
// plans/business.json
{
  "plan_id": "business", "plan_name": "Business", "tier": 2,
  "compute": {
    "monthly_tokens": 50000000, "max_tokens_per_run": 500000, "max_iterations": 200,
    "max_sub_agents": 15,
    "rate_limit": { "rpm": 300, "tpm": 2000000 },
    "overage": "credit_top_up"
  },
  "model_tiers": ["economy", "balanced", "flagship", "reasoning", "preview"],
  "allow_byok": true,
  "max_agents": 500, "max_concurrent_runs": 50, "allow_multi_agent": true,
  "modules": {
    "guardrails": {"status": "ga"}, "intent_detection": {"status": "ga"},
    "short_term_memory": {"status": "ga"}, "long_term_memory": {"status": "ga"},
    "tool_orchestration": {"status": "ga"}, "agentic_rag": {"status": "ga"},
    "vector_db": {"status": "ga"}, "promptops": {"status": "ga"},
    "auditability": {"status": "ga"}, "finops": {"status": "ga"},
    "image_generation": {"status": "ga"}, "external_connectors": {"status": "ga"},
    "billing_and_metering": {"status": "beta"}, "multi_tenancy": {"status": "beta"},
    "identity_and_access": {"status": "beta"}, "control_plane": {"status": "beta"},
    "workflow_engine": {"status": "beta"}, "conversational_engine": {"status": "beta"},
    "observability": {"status": "beta"}, "human_oversight": {"status": "beta"},
    "knowledge_base": {"status": "beta"}, "context_engineering": {"status": "beta"},
    "evaluation_framework": {"status": "beta"}, "sentinel_agents": {"status": "beta"},
    "mcp": {"status": "beta"}, "data_source_plugins": {"status": "beta"}
  },
  "connectors": ["google_analytics", "meta_ads", "http"],
  "context_window_tokens": 512000, "vector_store_bytes": 53687091200,
  "persistent_memory": true, "memory_retention_days": 365,
  "max_seats": 100, "rbac_enabled": true, "human_in_the_loop": true,
  "trace_retention_days": 90, "queue_priority": "priority", "sla": "99.9%",
  "audit_export": true
}
```

```jsonc
// plans/enterprise.json — base defaults; per-tenant overrides merge on top
{
  "plan_id": "enterprise", "plan_name": "Enterprise", "tier": 3,
  "compute": {
    "monthly_tokens": 0, "max_tokens_per_run": 0, "max_iterations": 0,
    "max_sub_agents": 0,
    "rate_limit": { "rpm": 0, "tpm": 0 },
    "overage": "contract"
  },
  "model_tiers": ["economy", "balanced", "flagship", "reasoning", "preview"],
  "allow_byok": true, "allow_custom_endpoints": true,
  "max_agents": 0, "max_concurrent_runs": 0, "allow_multi_agent": true,
  "modules": { "/* every ga + beta module */": {"status": "beta"} },
  "connectors": ["google_analytics", "meta_ads", "http"],
  "context_window_tokens": 0, "vector_store_bytes": 0,
  "persistent_memory": true, "memory_retention_days": 0,
  "max_seats": 0, "rbac_enabled": true, "human_in_the_loop": true,
  "trace_retention_days": 365, "queue_priority": "dedicated", "sla": "custom",
  "sso_saml": true, "scim": true, "audit_export": true, "private_deployment": true,
  "data_retention_policy": "negotiated",
  "tenant_overrides": {}
}
```

> `0` in Enterprise defaults means **"negotiated"** — the resolver treats `0` as unlimited for
> quotas and as "contract-defined" for retention windows. Enterprise tenants are created via
> `tenant_overrides`, e.g. `{"compute": {"monthly_tokens": 2_000_000_000}, "sla": "99.99%"}`.

---

## 4. Agent Pipeline Enforcement Architecture

Three checkpoints wrap the existing pipeline. They reuse the hooks already present (the FinOps
guardrail in `TelemetryPlugin`) and add a **request-scoped entitlement context** resolved once per
call and threaded through ADK callbacks.

```
                      ┌────────────────────────────────────────────┐
   /run  /run_sse     │  1. SESSION / API ENTRY GATEKEEPER          │
   /apps/*  /api/*  ─▶│     plan status · monthly quota · model     │
                      │     allowlist · module visibility (UI)      │
                      └───────────────┬────────────────────────────┘
                                      │ request EntitlementContext
                                      ▼
                      ┌────────────────────────────────────────────┐
   ADK orchestrator   │  2. IN-LOOP ORCHESTRATOR GUARDRAILS         │
   (agent_builder /   │     max_tokens_per_run · max_iterations ·  │
    generated agent)  │     allowed tool bindings · rate limits    │
                      └───────────────┬────────────────────────────┘
                                      │ per-call usage events
                                      ▼
                      ┌────────────────────────────────────────────┐
   FinOps + telemetry │  3. POST-RUN METERING & THRESHOLD ALERTS    │
                      │     record prompt/completion tokens ·      │
                      │     80%/100% alerts · structured errors    │
                      └────────────────────────────────────────────┘
```

### 4.1 Request-scoped entitlement context (new)

```python
# tectonic_runtime/entitlements.py  (proposed)
@dataclass(frozen=True)
class EntitlementContext:
    plan: PlanEntitlement
    tenant_id: str
    account_id: str
    run_tokens: int = 0            # accumulated this run (in-loop guardrail updates it)
```

Resolution order: `current_user()` ([`agent_builder/workspace.py`](agent_builder/workspace.py)) →
account → tenant → `PlanEntitlement` (with Enterprise `tenant_overrides` deep-merged). The context is
stored in a `contextvars.ContextVar` so the ADK callback plugins (`TelemetryPlugin`,
`WorkflowModelPlugin`) can read it without signature changes.

### 4.2 Checkpoint 1 — Session / API Entry Gatekeeper

**Where:** [`agent_builder/auth.py`](agent_builder/auth.py) `AuthMiddleware` (already the single
choke point for every API/ADK/WebSocket request) + [`agent_builder/studio_api.py`](agent_builder/studio_api.py)
route handlers + the UI-facing settings/status endpoints.

**What it enforces:**

| Check | Mechanism | Error |
|---|---|---|
| Plan status active/trial | `EntitlementContext` resolution in middleware | `PLAN_INACTIVE` (402) |
| Monthly quota not exhausted | `finops.is_blocked(tenant)` — already returns `(blocked, reason)` | `QUOTA_EXCEEDED` |
| Model is in the plan | `PlanEntitlement.model_allowed(model_id)` against `model_settings.CATALOGUE` | `MODEL_NOT_IN_PLAN` |
| Module/connector visibility | `PlanEntitlement.module_allowed(name)` — filtered out of `/studio/settings`, `/modules`, `/connectors/catalog`, and the `directory/agents` payloads | `MODULE_LOCKED` |
| Builder-UI gating | `/api/env` and `model_settings.status()` return the *plan-filtered* catalogue so locked models/modules never render | (hidden in UI) |

**Why here:** `AuthMiddleware` already rewrites ADK user ids and owns the authenticated principal;
attaching the entitlement lookup at the same place guarantees no path bypasses it (including
`/run`, `/run_sse`, `/apps/*`, and `/ws/telemetry`).

### 4.3 Checkpoint 2 — In-Loop Orchestrator Guardrails

**Where:** [`agent_builder/telemetry.py`](agent_builder/telemetry.py) `TelemetryPlugin`
`before_model_callback` (today's FinOps budget hook) + `before_tool_callback`, and
[`agent_builder/workflow_model.py`](agent_builder/workflow_model.py) `WorkflowModelPlugin.before_run_callback`.

**What it enforces, dynamically per request:**

1. **`max_tokens_per_run`** — `before_model_callback` inspects `llm_request` and the
   `EntitlementContext.run_tokens` accumulator; if the request would push the run over the cap,
   return the synthetic `LlmResponse` short-circuit (the exact pattern already used for budget
   exhaustion) with error text `LIMIT_TOKENS_EXCEEDED`.
2. **`max_iterations`** — count `before_agent_callback` / `before_tool_callback` invocations per
   `invocation_id`; once the plan's `max_iterations` is reached, short-circuit the next model call
   with `LIMIT_ITERATIONS_EXCEEDED` (prevents runaway reasoning loops).
3. **`max_sub_agents`** — `before_agent_callback` already sees every agent; count distinct
   sub-agent ids per run and deny (or degrade to the root agent) beyond the cap.
4. **Allowed tool bindings** — `before_tool_callback` already receives `tool.name`; consult
   `PlanEntitlement.builder_tools` / `connectors` and return a denied result for locked tools
   (`TOOL_LOCKED`) *without* dropping the whole run (the orchestrator degrades gracefully).
5. **Model allowlist (in-loop defense)** — `WorkflowModelPlugin.before_run_callback` re-binds the
   generated agent's model to the user's choice today; extend it to substitute the **nearest
   allowed model** when the resolved model is `MODEL_NOT_IN_PLAN` (so a generated agent can never
   silently run a flagship model on a Starter account).
6. **Rate limits (RPM/TPM)** — a lightweight token-bucket per tenant, consulted in
   `before_model_callback`, returns `RATE_LIMIT_EXCEEDED` (HTTP 429) for the API entry and a
   backoff-retry hint in-loop.

### 4.4 Checkpoint 3 — Post-Run Metering & Threshold Alerts

**Where:** [`agent_builder/telemetry.py`](agent_builder/telemetry.py) `after_model_callback` (already
meters via `finops.meter`), [`tectonic_runtime/models.py`](tectonic_runtime/models.py) `_report()`
(platform-model usage), [`tectonic_runtime/services/finops_service.py`](tectonic_runtime/services/finops_service.py)
(`meter`, `report`, `set_budget`), and the standalone
[`modules/billing-and-metering`](modules/billing-and-metering) service for invoice-grade records.

**What it does:**

* **Record** prompt/completion tokens per call (existing) and accumulate into the
  `EntitlementContext.run_tokens` per-run ledger (new).
* **Emit 80% / 100% usage alerts** — when `finops._team_report()` utilisation crosses
  `alert_threshold_pct` (default 0.8) or hits the limit, emit a telemetry event
  (`USAGE_THRESHOLD`) that the UI surfaces as a top-up/upgrade prompt, and (Business+) write an
  audit record. The FinOps `CostOptimisationAgent` already tightens thresholds on overrun forecasts;
  wire the same signal to the plan's monthly quota, not only USD budgets.
* **Graceful degradation with structured error codes** — all three checkpoints return the same
  machine-readable envelope so the UI can act on it:

| Error code | HTTP | Where raised | User action |
|---|---|---|---|
| `PLAN_INACTIVE` | 402 | Entry gatekeeper | Reactivate / contact admin |
| `QUOTA_EXCEEDED` | 402 | Entry gatekeeper (`finops.is_blocked`) | Upgrade or top-up |
| `LIMIT_TOKENS_EXCEEDED` | 429 | In-loop guardrail | Split request / upgrade |
| `LIMIT_ITERATIONS_EXCEEDED` | 429 | In-loop guardrail | Simplify task / upgrade |
| `RATE_LIMIT_EXCEEDED` | 429 | Entry + in-loop | Retry with backoff |
| `MODEL_NOT_IN_PLAN` | 403 | Entry + in-loop | Choose allowed model / upgrade |
| `MODULE_LOCKED` | 403 | Entry (UI hides it) | Upgrade |
| `TOOL_LOCKED` | 403 | In-loop (`before_tool_callback`) | Upgrade |
| `CONNECTOR_LOCKED` | 403 | Entry (`/connectors/catalog`) | Upgrade |
| `SEAT_LIMIT_EXCEEDED` | 403 | Entry (`AuthMiddleware`) | Add seats |

**Graceful degradation contract:** enforcement failures (e.g., entitlement lookup errors) **fail
open** for serving but log loudly — mirroring the `billing-and-metering` module's documented
fail-open posture, so a governance outage never turns into a compute outage. The *only* exception is
compute overage (`QUOTA_EXCEEDED`, `LIMIT_TOKENS_EXCEEDED`), which fails closed because it directly
protects margin.

### 4.5 File-by-file change map (engineering reference)

| File | Today | Add for entitlements |
|---|---|---|
| [`agent_builder/auth.py`](agent_builder/auth.py) `AuthMiddleware` | AuthN + user-id rewrite | Resolve `EntitlementContext`; enforce `PLAN_INACTIVE`, `QUOTA_EXCEEDED`, `SEAT_LIMIT_EXCEEDED` |
| [`agent_builder/studio_api.py`](agent_builder/studio_api.py) | `/auth/*`, `/studio/settings`, agent files | Plan-filter `/studio/settings` catalogue, `/api/system/agents` counts, error envelopes |
| [`agent_builder/model_settings.py`](agent_builder/model_settings.py) | `CATALOGUE`, `status()`, `save_custom()` | `PlanEntitlement.model_allowed()`; filter `status()["catalogue"]` by plan |
| [`agent_builder/telemetry.py`](agent_builder/telemetry.py) `TelemetryPlugin` | `is_blocked` before call; `meter` after call | Add run-token accumulator, `max_iterations`/`max_sub_agents`/tool-binding checks, `USAGE_THRESHOLD` events |
| [`agent_builder/workflow_model.py`](agent_builder/workflow_model.py) | Rebind model to user choice | Rebind to nearest **plan-allowed** model |
| [`agent_builder/agent.py`](agent_builder/agent.py) | Static `tools=[...]` list | Filter `builder_tools()` by plan at request time |
| [`tectonic_runtime/runtime.py`](tectonic_runtime/runtime.py) | 12 modules, usage hook | Add `entitlements` resolver; gate `invoke()` by plan for module ops |
| [`tectonic_runtime/base.py`](tectonic_runtime/base.py) `CallContext` | `agent_id/tenant_id/role/team` | Carry `plan_id`/`entitlement` (or read the ContextVar) for module-level gating |
| [`tectonic_runtime/services/finops_service.py`](tectonic_runtime/services/finops_service.py) | USD budgets, rates, `is_blocked` | Add token-quota enforcement alongside USD budgets; emit `USAGE_THRESHOLD` |
| [`modules/billing-and-metering`](modules/billing-and-metering) | Standalone metering/invoicing | Wire its entitlement sync (`pricing_plan_service`) into the runtime resolver |
| [`tectonic_runtime/entitlements.py`](tectonic_runtime/entitlements.py) (new) | — | `PlanEntitlement` model, `EntitlementContext`, resolver, error codes |

---

## 5. Phased Implementation Roadmap

### Phase 1 — MVP Guardrails (token caps, model allowlist, module gating)

**Goal:** protect compute margin and prove the declarative model end-to-end without touching the
payments stack.

1. Add `tectonic_runtime/entitlements.py` (schema + resolver + error codes) and ship
   `plans/{starter,pro,business,enterprise}.json` from Section 3.
2. Resolve `EntitlementContext` in `AuthMiddleware`; enforce `PLAN_INACTIVE`, `QUOTA_EXCEEDED`,
   `SEAT_LIMIT_EXCEEDED`.
3. Generalize the existing `TelemetryPlugin.before_model_callback` FinOps check into the in-loop
   guardrail: `max_tokens_per_run`, `max_iterations`, `max_sub_agents`, `TOOL_LOCKED`.
4. Filter `model_settings.status()` and the `/modules` + `/connectors/catalog` payloads by plan so
   the builder UI hides locked capability (`MODEL_NOT_IN_PLAN`, `MODULE_LOCKED`).
5. Extend `WorkflowModelPlugin` to substitute the nearest plan-allowed model for generated agents.
6. **Exit criteria:** a Starter account cannot select/run a flagship model, cannot call a locked
   module, and hits `LIMIT_TOKENS_EXCEEDED` at 50k run tokens — all verified by new tests alongside
   [`tests/test_tectonic_runtime.py`](tests/test_tectonic_runtime.py) and the telemetry tests.

### Phase 2 — Metering, UI upgrade prompts, team/RBAC

**Goal:** make the tier *visible and manageable*, and wire the existing metering services together.

1. Surface per-plan token/cost dashboards from `finops.report` (already implemented) with the plan's
   monthly quota as the budget line; emit `USAGE_THRESHOLD` at 80%/100%.
2. Add top-up / upgrade prompts driven by structured error codes (Phase 1 envelope) in the Studio UI.
3. Wire `billing-and-metering` → `multi-tenancy` entitlement sync so the plan map becomes the
   single source of truth (replace local JSON with the plan store).
4. Introduce Business features: seats, `rbac_enabled` (roles: admin/builder/viewer), team workspace,
   `human_in_the_loop` approvals, and `audit_export`.
5. **Exit criteria:** a Business admin can add seats, see pooled spend, and a team member sees only
   their plan's modules/models; invoices reconcile from real FinOps usage.

### Phase 3 — Enterprise overrides, BYOK endpoints, audit logs, dedicated queues

**Goal:** Enterprise readiness and contract configurability.

1. `tenant_overrides` deep-merge for Enterprise tenants (SSO/SAML, SCIM, custom SLA/retention,
   negotiated quotas).
2. BYOK custom *endpoints* (Azure OpenAI, AWS Bedrock, Vertex) behind `allow_custom_endpoints`.
3. Audit log export + long-term retention via the `auditability` module; dedicated execution queues
   (`queue_priority: dedicated`).
4. Private/VPC deployment packaging (`regulatory-compliance`, `deployment-strategy` modules) and
   data-residency controls.
5. **Exit criteria:** an Enterprise tenant runs with contract-specific overrides, dedicated queues,
   and exported audit logs — with zero code changes to agent or module logic.

---

## Appendix A — Repository inventory quick reference

**Entry points:** [`server.py`](server.py) (dev/ADK), [`server_full.py`](server_full.py)
(production, serves frontend), [`server_production.py`](server_production.py).

**Core packages:** [`agent_builder/`](agent_builder) (studio, auth, model settings, pipeline,
tools, sub-agents) · [`tectonic_runtime/`](tectonic_runtime) (in-process module runtime, services,
connectors) · [`modules/`](modules) (35 module services; 10 wired in-process via `_paths.py`).

**Key enforcement primitives that already exist and are reused by this design:**

| Primitive | Location |
|---|---|
| Per-user model + encrypted BYOK key | [`agent_builder/model_settings.py`](agent_builder/model_settings.py) |
| Budget guardrail before each LLM call | [`agent_builder/telemetry.py`](agent_builder/telemetry.py) `before_model_callback` |
| Token metering after each LLM call | [`agent_builder/telemetry.py`](agent_builder/telemetry.py) `after_model_callback` |
| Platform-model usage hook | [`tectonic_runtime/models.py`](tectonic_runtime/models.py) `set_usage_hook` |
| USD rate card + budgets + forecasting | [`tectonic_runtime/services/finops_service.py`](tectonic_runtime/services/finops_service.py) |
| Module operation permissions (`worker`/`admin`) | [`tectonic_runtime/base.py`](tectonic_runtime/base.py) `operation()` |
| Invoice-grade metering + entitlement sync | [`modules/billing-and-metering`](modules/billing-and-metering) |
| Connector vault + secret redaction | [`tectonic_runtime/connectors/`](tectonic_runtime/connectors) |
| Audit observer on every telemetry event | [`server.py`](server.py) `hub.add_listener` |
| Multi-tenant gate (feature flags) | [`modules/multi-tenancy`](modules/multi-tenancy) (standalone) |
