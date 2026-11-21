# tectonic_runtime: shared core modules

The Builder Agent and every worker agent it generates share one runtime. It runs twelve core
functional modules from `modules/` in-process, behind one standardized API, and streams their
activity to the Command Center's Agent Office view.

| Module | Operations | Backed by |
| --- | --- | --- |
| `guardrails` | `check_input`, `check_output`, `redact_pii`, `configure_profile`, `stats` | `modules/guardrails` PolicyEngine |
| `intent_detection` | `classify`, `define_taxonomy`, `get_taxonomy` | `modules/intent-detection` ClassificationService |
| `short_term_memory` | `append`, `get_context`, `clear` | `modules/short-term-memory` BufferManager |
| `long_term_memory` | `remember`, `recall`, `share`, `forget`, `stats` | `modules/long-term-memory` MemoryService |
| `tool_orchestration` | `call_tool`, `list_tools`, `health` (+ Python `register_callable`) | `modules/tool-orchestration` ToolOrchestrationService |
| `agentic_rag` | `ask`, `retrieve`, `ingest`, `documents_list`, `delete_document`, `recent` | `modules/agentic-rag` RAGService + RetrievalLoop |
| `vector_db` | `search`, `index`, `delete`, `stats`, `migrate_embeddings`* | `modules/vector-db` VectorService + MigrationManager (Qdrant) |
| `finops` | `report`, `check`, `recommendations`, `rates`, `set_budget`*, `set_rate`*, `optimise`* | `modules/finops` budgets, aggregation, forecasting, optimiser |
| `promptops` | `resolve`, `record_outcome`, `list_prompts`, `versions`, `get_version`, `ab_status`, `register`*, `promote`*, `rollback`*, `start_ab_test`*, `conclude_ab_test`*, `check_drift`*, `propose_improvement`* | `modules/promptops` registry, A/B (z-test), drift, reflection |
| `auditability` | `query`, `ask`, `verify`, `stats`, `export`* | `modules/auditability` SHA-256 hash chain, NL query, audit packs |
| `external_connectors` | `catalog`, `connections`, `fetch_data`, `execute_action`, `request_credentials`, `disconnect` | `connectors/` — Meta Ads + Google Analytics 4 (see below) |
| `image_generation` | `generate`, `recent`, `status` | `services/image_generation_service.py` — Gemini image models / Imagen, and Claude vector drawings (see below) |

`*` = admin-only (`@operation(..., permission="admin")`).

## Permissions and inheritance

Every call carries a `CallContext(role, team)`. Roles come from the ADK app the agent runs in (`identity.py`):

| App | Role | Team |
| --- | --- | --- |
| `agent_builder` (Builder + its specialists) | `admin` | `agent_builder` |
| `generated_agents.<project>.<project>` (every agent of a generated project) | `worker` | `<project>` |
| Command Center UI (`POST /modules/{module}/{op}`) | `operator` (admin-equivalent, attributed separately) | — |

Workers therefore inherit their project's scope with no configuration: its FinOps budget, its knowledge namespace
(plus `shared`), `shared:<team>` memory and audit visibility. Admin-only calls by workers are refused and recorded
as `MODULE_ACCESS_DENIED`.

## Models

`models.py` is the single Gemini integration (all overridable by env):

| Role | Default | Used for |
| --- | --- | --- |
| reasoning | `GEMINI_MODEL` (gemini-3.6-flash) | grounded RAG answers, prompt reflection |
| utility | `TECTONIC_UTILITY_MODEL` (gemini-3.5-flash-lite) | RAG routing, groundedness critique, query reformulation, audit NL → filter |
| embeddings | `TECTONIC_EMBEDDING_MODEL` (gemini-embedding-2, `TECTONIC_EMBEDDING_DIM`=768) | Vector DB (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY task types) |

Every model call is metered into FinOps. With no key or `TECTONIC_OFFLINE=1`, deterministic fallbacks keep everything working (tests run this way).

## Platform wiring

- **FinOps:** the telemetry plugin meters every agent LLM response and blocks calls when a team's `block` budget is exhausted.
- **PromptOps:** the Builder's own system prompt is the managed prompt `agent_builder.root`. It follows the code default until an admin promotes a different version, and runs report outcomes to it.
- **Auditability:** every agent, tool, A2A, module and run event is PII-redacted and appended to a JSONL hash chain. Streamed thinking becomes one `AGENT_REASONING` entry per turn.

## State and configuration

State lives under `generated_agents/_platform/` (git-ignored). Each store can be overridden: `TECTONIC_VECTOR_PATH`
(or `QDRANT_URL` / `QDRANT_API_KEY` for a Qdrant server), `TECTONIC_RAG_DOCS_PATH`, `TECTONIC_FINOPS_PATH`,
`TECTONIC_PROMPTOPS_PATH`, `TECTONIC_AUDIT_PATH`. The value `:memory:` disables persistence.

The modules' `core/` code runs unmodified. `adapters.py` replaces the ports that only had test stubs
(LLM gateway, vector DB, MCP servers, Redis, Postgres) with real zero-LLM, in-process
implementations. Any adapter can later be swapped for a network client without changing agent code.

## Using it

**Python** (any agent, script or tool):

```python
from tectonic_runtime import get_runtime, CallContext

rt = get_runtime()
res = await rt.invoke("guardrails", "check_input", {"text": msg}, CallContext(agent_id="billing_worker"))
if res.ok and res.data["allowed"]:
    safe_text = res.data["text"]
```

Every call returns a `ModuleResult` (`ok, module, operation, call_id, duration_ms, data | error`).
Operations never raise to the caller.

**ADK agents:**

```python
from tectonic_runtime.adk_tools import worker_tools, CORE_MODULE_INSTRUCTIONS
LlmAgent(..., instruction=MY_PROMPT + CORE_MODULE_INSTRUCTIONS, tools=[*my_tools, *worker_tools(team="my_project")])
```

- **Builder:** `agent_builder/agent.py` mounts `builder_tools()`, i.e. durable memory plus
  `core_share_with_project`, which hands requirements to a generated project's workers.
- **Workers:** the code generator emits `shared_libraries/core_modules.py` in every new project and
  mounts the core tools on each `LlmAgent`. Run standalone (plain `adk run`), the import falls back
  to no core tools.
- **Team memory:** memory scopes are private per agent. `shared:<team>` scopes are the hand-off
  channel between agents, enforced by the long-term-memory visibility policy.

## Office events

`events.bus` emits `MODULE_REGISTERED`, `MODULE_STATE` (offline → booting → idle/busy/error),
`MODULE_CALL_START` and `MODULE_CALL_END`. `server.py` forwards them to `/ws/telemetry`.
`POST /modules/simulate` runs a real shift: the Builder spins up four workers who use every module
concurrently, including retries on a flaky tool and a blocked jailbreak. `GET /modules` lists the
registry.

## Image generation

`core_generate_image` (Builder and every worker; gate it per project with `image_generation` in `ENABLED_MODULES`)
creates images from a prompt, edits the images attached to the user's message (`use_attached_images=true`) or
changes an image generated earlier (`edit_image_ids`). The chat shows the images inside the agent's message: the
Builder chat, `@agent` chats and the Live Sandbox all read them from the tool result.

- **Photos and raster art (Google):** via `google-genai`. `TECTONIC_IMAGE_MODEL` picks the model: Gemini image
  models (default `gemini-2.5-flash-image`, can edit) or Imagen (`imagen-4.0-*`, prompt only, up to 4 per call). The
  key is `TECTONIC_IMAGE_API_KEY`, else `GOOGLE_API_KEY`; `GOOGLE_GENAI_USE_VERTEXAI=true` switches to Vertex AI.
- **Vector drawings (Claude):** with `ANTHROPIC_API_KEY`, Claude writes SVG: logos, icons, diagrams, infographics,
  flat illustrations (`TECTONIC_SVG_MODEL`, default `claude-opus-5-5`). Claude cannot output pixels, so it never
  makes photographs. Agents pick `style`: `photo` (Google only), `vector` (Claude first), `auto` (Google; if Google
  cannot serve at all, such as a missing or rejected key or an outage, Claude draws a vector version and the result
  says so). A safety refusal never switches provider. Every SVG, generated or uploaded, is sanitized when stored (no
  scripts, event handlers, foreignObject or external references) and served under a no-script CSP.
- **Never faked:** no key, offline mode, a rejected key, quota, a safety block or a provider error fail with the
  reason, which the agent passes on to the user.
- **Governed like everything else:** prompts pass Guardrails first, usage is metered into FinOps (per image token),
  and calls show in the Agent Office and audit trail with ids only, never image bytes.
- **Storage and access:** images live in `generated_agents/_platform/media/images/` (`TECTONIC_MEDIA_PATH`),
  served by `GET /media/images/<id>` to their owner only (other accounts get 404).

## External connectors (clients' own data)

`connectors/` lets generated agents read a client's third-party data and, for Meta, stage paused campaigns.

| Connector | Connection inputs (External Tools window) | Agent tools |
| --- | --- | --- |
| Meta Ads (Marketing API) | Graph API access token, ad account id (`act_…`), optional app secret | `meta_ads_insights` (spend, CTR/CPC/CPM, purchases, ROAS), `meta_ads_campaigns`, `meta_ads_account`, `meta_ads_create_campaign` / `meta_ads_create_ad_set` (always `PAUSED`) |
| Google Analytics 4 (Data API) | property id + service-account JSON key, or an OAuth access token (optionally refresh token + client id/secret) | `ga4_report`, `ga4_traffic_overview`, `ga4_source_medium`, `ga4_conversions`, `ga4_metadata` |

Plus `connector_status`. Every tool is declared from the connector's JSON Schema and adds its own usage rules to the
agent's system prompt; `connectors.tools.tool_specs()` / `dispatch()` expose the same tools to non-ADK frameworks.

**Connect once, use everywhere.** Users connect each data source in the Studio's **External Tools** window (plug icon
in the dock). `POST /connectors/connect` validates the credentials against the live API and stores them for the
account, so every agentic workflow of that account uses the connection. Several accounts of one source (one Meta ad
account per client) are separate named connections that agents select with `connection="<label>"`. Only the
connection comes from the user: agents choose every query detail (dates, levels, metrics, filters) themselves.

**When data cannot be fetched.** Nothing is invented. The tool returns `not_connected`, `connection_failed` (rejected
or revoked credentials, which stay failed until reconnected), `fetch_failed` (provider error), or `ok` with
`no_data=true`, and the module records a data notice. The chat (Live Sandbox, and `@agent` in the Builder chat) shows
each notice as a pop-up above the agent's reply, with an **Open External Tools** button. Once the source is connected,
a **Continue with the data** button lets the agent carry on. Meanwhile the agent tells the user what is missing and
continues with the parts of the task that do not need it.

**Security model.**
- Credentials never pass through a chat message, a tool argument, a module payload or a result. The External Tools
  form posts them to `agent_builder/connectors_api.py` only, and agents only ever see data.
- Vault (`connectors/vault.py`): Fernet-encrypted in process memory with a per-process key, scoped to
  (account, connector, connection) and expiring after `TECTONIC_CONNECTOR_TTL_HOURS` (default 12). A restart
  means users reconnect. Implement `SecretStore` to back it with a managed secret manager instead.
- Redaction (`connectors/redaction.py`): stored values and well-known token shapes are masked in every log record,
  in telemetry tool payloads, in the audit trail and in upstream error messages. `ConnectorSecretsPlugin` strips
  credentials pasted into a chat message before any model or session sees them, and the UI refuses to send them.
- Tokens travel in `Authorization` headers, never in URLs. A service-account key's `token_uri` is allow-listed to
  Google, and Meta writes are forced to `PAUSED` and re-checked after creation.

**Enabling it for a project.** Add `external_connectors` to `ENABLED_MODULES` in the project's
`shared_libraries/core_modules.py` (`None` already enables every module). The Builder offers it in the modules
checklist and selects it when requirements mention Meta Ads, GA4, ROAS, ad spend or web traffic. Optional settings:
`META_GRAPH_API_VERSION` (default `v24.0`), `TECTONIC_CONNECTOR_TIMEOUT` (s), `TECTONIC_CONNECTOR_MAX_ATTEMPTS`.

**Adding a connector** (LinkedIn, HubSpot, ...): subclass `connectors.BaseConnector`. Declare `auth_schemes`
(the form fields) and `capabilities` (JSON Schemas), implement `authenticate` / `fetch_data` / `execute_action`,
and call `register_connector(MyConnector)`. Its tools, its card in External Tools and its API come with it.

## One model for every workflow

Generated projects name a model in `shared_libraries/constants.py`, but inside the Studio that is only a placeholder.
`agent_builder/workflow_model.py` (a plugin on every run) points each of the project's agents (root, sub-agents and
AgentTool specialists) at the Agent Builder's live model: the platform default, or the user's custom model from the
Builder settings, resolved per call. Switching the Builder's model therefore switches every workflow too. The
generated model applies only when a project runs standalone (`adk run`). Agents built on a bespoke `BaseLlm`
subclass are left as written.

## Adding a module

1. Subclass `BaseModule` in `services/` and build its core in `setup()`.
2. Mark public methods `@operation("…")`, with signature `async def op(self, ctx, **params)`.
3. Add the module's folder to `_paths.MODULE_PACKAGES` and the class to `runtime.MODULE_CLASSES`.

Tests: `python -m pytest` from the project root.
