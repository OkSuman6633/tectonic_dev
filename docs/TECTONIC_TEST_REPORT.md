# Tectonic — Unit & Functionality Testing Report

**Scope:** Full-stack automated verification across the Tectonic Agent Builder (`agent_builder/`), Shared Module Runtime (`tectonic_runtime/`), Built-in Starter Agent Tools (`builtin_agents/`), Production API Server (`server_full.py`), and Studio Frontend (`frontend/`).  
**Status:** **302 / 302 tests passing** (`0` failures, `0` errors, `0` skipped) · **0 TypeScript errors**

---

## 1. Execution Summary

| Layer | Runner / Command | Files | Tests | Passed | Failed | Duration |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Backend (Unit + Functional)** | `python -m pytest -v --tb=short` | 22 | 282 | 282 | 0 | 85.41s |
| **Frontend (Unit + Functional)** | `npm test` (`node --test`) | 5 | 20 | 20 | 0 | 0.89s |
| **Frontend Type Check** | `npx tsc --noEmit` | — | — | Pass | 0 | <5s |
| **Total** | | **27** | **302** | **302** | **0** | **~86s** |

> All backend tests execute deterministically in offline/isolated mode (`TECTONIC_OFFLINE=1`, per-test `tmp_path` SQLite/file stores) with no live LLM network calls or shared state mutations.

---

## 2. Unit Testing Report

Unit tests verify individual functions, classes, schemas, parsers, security sanitizers, and state stores in isolation.

### 2.1 Backend Unit Coverage (`tests/`)

| Area | Modules Covered | Key Assertions Verified | Tests |
| :--- | :--- | :--- | :---: |
| **Guardrails & Tracing** | `guardrails/sanitizer.py`, `guardrails/tools.py`, `tracing.py` | Zero-LLM blocking across 7 threat/injection categories; PII/PHI redaction (email, SSN, card, phone, gov ID, IPv4/IPv6, MRN, insurance, condition); output secret/private-key scrubbing; AST checks (`eval`, `exec`, `shell=True`, bare `sqlite3.connect`, hardcoded secrets); JSON schema & verdict enforcement | 13 |
| **Builder Tools & Schemas** | `types.py`, `tools/file_manager.py`, `tools/memory.py`, `agent_card_manager/tools.py` | Identifier slugification & loose JSON extraction; sandboxed path resolution & forbidden infra file rejection; session state save/load/disk snapshots; Agent Card CRUD, single-root constraint, cycle detection, and graph validation | 4 |
| **Entitlements & Plans** | `entitlements.py` | 4-tier plan definitions (`starter`, `pro`, `business`, `enterprise`), model-tier catalog alignment, module/connector/tool lock hints, monthly token quotas, per-run token/iteration caps, agent slot limits, BYOK gates | 29 |
| **Auth & Subscriptions** | `auth.py`, `db.py`, `tools/web_search.py` | Registration validation, bcrypt password hashing & PBKDF2 migration, 7-day Starter trial creation, admin role resolution, brute-force lockout, DuckDuckGo/Google/Tavily/Apify web-search provider selection | 8 |
| **Model Settings & Encryption** | `model_settings.py`, `shared_libraries/studio_model.py` | Live `StudioModel` switching, Claude effort/structured-output fallback, Fernet per-user key encryption at rest, key rotation fallback, provider switch key cleanup, concurrent ContextVar isolation | 15 |
| **Runtime Core & Persistence** | `tectonic_runtime/runtime.py`, `identity.py`, `persist.py`, `events.py` | Module registration/boot lifecycle, error enveloping, shadow-API guard, atomic JSON persistence + corrupt file quarantine, dataclass `from_dict`, event-bus listener isolation | 16 |
| **Media & Image Providers** | `tectonic_runtime/media.py`, `image_generation_service.py`, `svg_image_provider.py` | MIME magic-byte sniffing, path-traversal ID rejection, SVG active-content sanitization & XXE rejection, Gemini/Imagen/Claude provider routing, style & aspect-ratio validation | 37 |
| **Connectors & Vault** | `tectonic_runtime/connectors/*` | Meta Ads pagination/ROAS/paused staging, GA4 JWT signing & OAuth refresh, encrypted per-account credential vault, secret scrubbing from logs/errors | 10 |
| **Discovery & Attachments** | `discovery.py`, `attachments.py` | Semantic agent matching, confidence thresholds, tool-name boosting, DOCX/PPTX/XLSX extraction, native image/PDF pass-through, oversized/corrupt attachment handling | 10 |
| **Built-in Agent Analytics** | `social_media_content_ideation/tools/analytics.py`, `research_store.py` | Hook pattern classification across 8 categories, SQLite brief/research-section/dataset CRUD and validation | 10 |

### 2.2 Frontend Unit Coverage (`frontend/tests/`)

| File | Modules Covered | Key Assertions Verified | Tests |
| :--- | :--- | :--- | :---: |
| `agentStateStyles.test.ts` | `components/command/agentStateStyles.ts` | Runtime state-to-label mapping (`Ready`, `Thinking`, `Running`, `Waiting`, `Failed`, `Disabled`, `Offline`) and duration formatting | 2 |
| `officeLayout.test.ts` | `officeLayout.ts`, `officePathfinding.ts`, `officeCamera.ts`, `employeeWorkflow.ts` | Office zone geometry, A* obstacle-avoiding navigation, module workstation connectivity, focus target coordinate resolution | 10 |
| `studioLayout.test.ts` | `components/studio/studioLayout.ts` | Chat / Split / 3D Office panel proportions and maximize/minimize transitions | 3 |
| `workspaceAndGraph.test.ts` | `graphLayout.ts`, `officeCamera.ts` | Dagre hierarchical agent tree positioning, wrapped module service lane layout, null/stale focus handling | 3 |

---

## 3. Functionality Testing Report

Functionality tests verify end-to-end user journeys, HTTP/WebSocket API contracts, multi-tenant isolation, and multi-module workflows across component boundaries.

| Functional Domain | End-to-End Scenarios Verified | Test File(s) | Tests |
| :--- | :--- | :--- | :---: |
| **Builder Interview, Reviews & Codegen Pipeline** | Deterministic state machine progression (`classify` → 7-step `interview` → `design_research` → parallel `review_design` → `compile_specification` → `finalize_build`), step-plan autopilot, checklist/JSON/letter answer parsing, card-to-scaffold-to-verify pipeline (`scaffold_project` → `write_project_file` guardrail gate → `verify_generated_project`) | `test_builder_pipeline.py`, `test_autopilot_reviews.py`, `test_builder_tools_and_cards.py` | 28 |
| **Agent Directory, Live Editing & Undo** | Direct sub-agent chat & trace capture, cascading deletion of sub-agents/projects (Builder protected), live code edits overriding promoted prompts, automatic rollback + repair rounds on broken edits, SHA/outside-change conflict detection, undo restoration | `test_agent_directory.py`, `test_agent_editor.py` | 16 |
| **Multi-Tenant Auth, Isolation & Workspaces** | End-to-end `AuthMiddleware` request gating, user ID rewriting on `/run` and `/apps/*`, cross-tenant 403 isolation, expired Starter plan 403 blocking, per-user generated-agent folders, `/ws/telemetry` token auth & `REPLAY_END` owner filtering, BYOK HTTP routes | `test_workspaces.py`, `test_auth_and_subscriptions.py`, `test_model_settings.py`, `test_conversations.py` | 14 |
| **Platform Runtime Governance & Security** | Vector DB namespace isolation & alias migration, Agentic-RAG multi-hop retrieval with token budgets & citations, FinOps rate-card metering + hard-cap LLM blocking in `TelemetryPlugin`, PromptOps A/B z-test & rollback, SHA-256 audit hash-chain tamper detection, ADK team/role inheritance | `test_platform_modules.py`, `test_tectonic_runtime.py` | 20 |
| **External Connectors & Media Flows** | Connector credential pause/notice chat flow, secret redaction plugin before LLM calls, `/connectors/*` HTTP lifecycle, `/media/images/{id}` owner-only download with `nosniff` & sandboxed CSP headers, `/api/images/generate` plan gating | `test_connectors.py`, `test_image_generation.py`, `test_execution_and_runtime_core.py`, `test_entitlements.py` | 31 |
| **Built-in Agent Seeding & Ideation Pipeline** | Automatic per-user provisioning of `social_media_content_ideation` on registration/login/cold-start hydration, quota exemption, dataset ingestion → multi-platform engagement & benchmark analysis | `test_builtin_agents.py`, `test_builtin_ideation_tools.py` | 5 |
| **Cloud Storage & Ephemeral Recovery** | Full GCS state sync/restore round-trip (SQLite WAL backup, conversations, 3D telemetry, model configs, generated agents) and stateless token re-hydration | `test_cloud_storage.py` | 2 |
| **Server Deployment & Run Control** | Cloud Run `/health` & `/healthz` probes, `/api/env`, `/modules` tier gating, `/api/plans`, `/directory/agents`, strict API 404 isolation (never falling back to SPA HTML), `/api/run/stop` session cancellation, `/api/system/agents/*` file/env endpoints, `/ws/telemetry` handshake | `test_server_deployment.py`, `test_execution_and_runtime_core.py` | 13 |
| **Pre/Post-Orchestration Tracing Guardrails** | `before_agent_callback` blocking threats inline & sanitizing PII in-place; `after_agent_callback` scrubbing leaked secrets in model output | `test_guardrails_and_tracing.py` | 1 |
| **Frontend Workspace & Telemetry State** | Per-conversation 3D office snapshot reset preserving module catalog; workspace preset switching, maximize/minimize/spotlight, and non-overlapping window restore | `telemetryConversations.test.ts`, `workspaceAndGraph.test.ts` | 2 |

---

## 4. Key Gaps Resolved & Additions Made

1. **Model Catalogue ↔ Entitlements Tier Sync (`agent_builder/entitlements.py`):** Mapped the active Studio model catalogue (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-4-hydrogen`, `gemini-4-neon`, `gemini-4-argon`, `gemini-4-carbon`, `claude-fable-5-2`) in `_MODEL_TIER` alongside legacy aliases so Starter/Pro/Business model filtering resolves accurately.
2. **Stale Suite Alignment (`tests/`):** Updated 5 existing test files (`test_auth_and_subscriptions.py`, `test_connectors.py`, `test_entitlements.py`, `test_model_settings.py`, `test_workspaces.py`) to reflect the admin-account upgrade policy, one-time Starter trial enforcement, `REPLAY_END` WebSocket framing, and `.env`-isolated web search assertions.
3. **New Unit & Functional Coverage Added:**
   - `tests/test_guardrails_and_tracing.py` (14 tests) — Input/output sanitizer, AST safety checks, request/schema guardrails, and tracing callbacks.
   - `tests/test_builder_tools_and_cards.py` (5 tests) — Shared types, sandboxed file manager, session memory snapshots, Agent Card graph validation, and end-to-end codegen verification.
   - `tests/test_execution_and_runtime_core.py` (5 tests) — Runtime identity/persistence/event bus, `ExecutionManager` task abort, `/api/run/stop`, agent file/env APIs, and owner-scoped `/media/images/*` security headers.
   - `tests/test_builtin_ideation_tools.py` (11 tests) — Built-in agent SQLite `research_store` CRUD and deterministic engagement analytics.
   - `frontend/tests/workspaceAndGraph.test.ts` (4 tests) — Dagre graph layout, module lane wrapping, 3D focus targeting, and workspace window store state transitions.
