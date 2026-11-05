# Tectonic ADK Design Playbook

## Choosing an architecture: single agent
Use a single LlmAgent when the job has one role, fewer than about six tools and no hand-offs. It is the cheapest and most predictable option: one prompt, one tool set, no delegation overhead. Prefer it for focused assistants such as a calculator-style helper, a lookup bot over one data source, or a form-filling agent. Upgrade to a coordinator only when responsibilities clearly split.

## Choosing an architecture: coordinator with specialists
Use a coordinator root agent with specialist sub-agents when requests span distinct domains (for example billing, scheduling and reporting). The coordinator classifies intent and delegates; each specialist owns 2-5 tools and its own instruction. Keep specialist descriptions sharp and non-overlapping because the coordinator routes on them. This is the recommended default for business assistants with more than one workflow.

## Choosing an architecture: sequential pipeline
Use a SequentialAgent when work flows through fixed stages, such as extract, validate, enrich, then report. Each stage writes its result to a session-state key (output_key) that the next stage reads. Pipelines are deterministic and easy to test; they are the right choice for document processing, ETL-style data handling and approval flows.

## Choosing an architecture: parallel fan-out
Use a ParallelAgent when independent lookups can run at the same time, such as querying several sources for a research summary, followed by an aggregator agent that merges results from state. Parallelism cuts latency but multiplies LLM cost, so cap the number of branches and keep each branch's output small.

## Choosing an architecture: loop / refinement
Use a LoopAgent for generate-critique-revise cycles such as drafting, code review or plan refinement. Always set max_iterations (2-4) and give the critic a clear pass/fail rubric so the loop terminates. Record each iteration's verdict in state for auditability.

## Tool design rules
Tools are plain Python functions with type hints and Google-style docstrings; ADK builds the function declaration from them. Every tool returns a dict with a "status" key ("success" or "error") plus data, never raises to the model, and validates its inputs. Keep tools atomic and idempotent where possible. Name them verb_noun (create_invoice, list_overdue_payments). Put destructive operations behind an explicit confirmation parameter.

## Session state and hand-offs
Define the shared state keys up front (for example current_customer, draft_report). Agents read state through their instruction (state placeholders) and write it with output_key or tool_context.state. Keep values small and structured; store large artefacts in files or the database and keep references in state.

## Local storage choices
SQLite under data/<project>.db is the recommended default for structured records: transactional, queryable and zero-setup. JSON files suit small configuration or append-only logs. In-memory storage is only for demos because it resets every session. Never write outside the generated project's own folder.

## Guardrails and approvals
Screen untrusted input with core_guardrails_check(stage="input") and the agent's final reply with stage="output". Redact PII before storing or echoing it. Require explicit user confirmation for actions that spend money, delete data, contact third parties or change permissions. Encode thresholds (for example refunds above 500 EUR need approval) as tool-level checks, not only prompt text.

## Platform module: knowledge (Agentic RAG + Vector DB)
Agents that answer from documents should call core_ask_knowledge or core_knowledge_search instead of relying on model memory. The Builder ingests the project's requirements and any reference documents into the project's knowledge namespace; workers retrieve with routed, self-correcting multi-hop search and cite sources. Recommend this whenever the agent must follow policies, FAQs or product data.

## Platform module: memory
Use core_memory_note / core_memory_context for within-session working notes (auto-summarised when long) and core_remember / core_recall for durable facts and user preferences. Team-wide conventions shared by the Builder are read with core_recall(scope="team").

## Platform module: FinOps budgets
Every generated project gets a monthly LLM budget. "alert" warns at the threshold and is the default for internal tools; "block" hard-stops LLM calls at the limit and is recommended for customer-facing or experimental agents with uncertain traffic. Agents can check core_spend_status before expensive multi-step work.

## Platform module: PromptOps
Every generated agent's instruction is a managed prompt named <project>.<agent>. Admins can publish new versions, A/B test them with sticky per-session assignment and promote winners only on statistically significant improvement, or roll back instantly. Write instructions as clear role, rules, tool usage and output format sections so variants are easy to compare.

## Platform module: tool orchestration
Wrap unreliable external calls (HTTP APIs, flaky services) as registered tools and invoke them through core_call_tool to get retries with backoff, a circuit breaker and reliability scores. Pure local functions can stay as direct tools.

## Platform module: audit trail
All agent reasoning, tool calls, delegations and module calls are written to a tamper-evident hash chain with PII redacted. Agents can read their team's trail with core_audit_trail to answer "what happened" questions. Regulated domains (finance, healthcare, HR) should mention auditability in acceptance criteria.

## Recommended defaults by domain
Finance and billing: coordinator architecture, SQLite, knowledge base for policies, confirmation for refunds and payments, block budget for customer-facing use. HR and attendance: coordinator or single agent, SQLite, PII redaction on, knowledge base for handbook. Customer support: coordinator with triage plus specialists, knowledge base for FAQs (high priority), output guardrails on. Research and summarisation: parallel fan-out plus aggregator, knowledge base for sources, loop for refinement. Operations and monitoring: sequential pipeline, tool orchestration for external APIs, audit trail emphasised.

## Acceptance criteria that catch real failures
Write 3-5 verifiable checks: one happy-path task end to end, one invalid-input case returning a helpful error, one guardrail case (blocked or redacted), one persistence check (data survives a restart), and one knowledge-grounded answer that cites a source when the agent uses RAG.
