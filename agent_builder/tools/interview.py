"""The Builder's guided interview: steps, the pre-built module catalog, and the specification compiler.

Seven interview steps (the user's four phases, split so each turn asks only 1-2 questions):

  1 discovery   Use-case discovery            (Phase 1)
  2 io          Inputs & outputs               (Phase 1)
  3 topology    Architecture & topology        (Phase 2)
  4 agents      Sub-agent allocation           (Phase 2)
  5 modules     Tooling & pre-built modules    (Phase 3, checkbox list)
  6 governance  Guardrails, data & budget
  7 compile     Final compilation + approval   (Phase 4)

The step *structure* is fixed so the journey is predictable; every question and option inside a step is
written by the requirements agent for the user's specific use case.

Before step 1 the user picks on a step-plan card which steps they decide themselves; the others are
answered with the recommended options and the interview moves on without stopping.
"""

from __future__ import annotations

import json
import re
from typing import Any

from ..shared_libraries.types import slugify_identifier

INTERVIEW_STEPS: list[dict[str, str]] = [
    {"key": "discovery", "title": "Use-case discovery", "phase": "Phase 1",
     "goal": "Pin down the core problem to solve, who the primary users are and what a successful outcome looks like.",
     "guidance": "Ask about the job-to-be-done and the users/success criteria specific to this domain. Options must be "
                 "concrete interpretations of THIS use case (not generic)."},
    {"key": "io", "title": "Inputs & outputs", "phase": "Phase 1",
     "goal": "Identify the primary input data (sources, formats, how it arrives) and the desired outputs (format, channel, cadence).",
     "guidance": "Typically one multi-select question for input sources and one for outputs/delivery, with options drawn "
                 "from what this domain realistically uses."},
    {"key": "topology", "title": "Architecture & topology", "phase": "Phase 2",
     "goal": "Choose the agent topology: Single agent with tools, Sequential chain, Hierarchical leader/worker, Parallel "
             "fan-out, Loop/refinement, or Just-in-time dynamic compilation.",
     "guidance": "Recommend a SINGLE agent with tools when the task is simple fact-finding or one workflow (avoid "
                 "over-engineering). Recommend a division of labour (hierarchical / parallel) when it needs broad "
                 "exploration and synthesis or distinct domains. Explain the trade-off in each option's description."},
    {"key": "agents", "title": "Sub-agent allocation", "phase": "Phase 2",
     "goal": "Propose a concrete breakdown of sub-agents (name + responsibility) consistent with the chosen topology.",
     "guidance": "Ask ONE multi-select question listing the proposed specialists (label = snake_case agent name, "
                 "description = its responsibility); recommend the essential ones. If the chosen topology is a single "
                 "agent, instead ask how the single agent should be scoped (e.g. which workflows it owns)."},
    {"key": "modules", "title": "Tooling & pre-built modules", "phase": "Phase 3",
     "goal": "Select the pre-built platform modules and external integrations the agents need.",
     "guidance": "Ask ONE multi-select checklist question. Include the platform modules that fit this use case (use the "
                 "exact catalog labels below; explain in each description WHY it helps here; mark the ones you "
                 "recommend) and add 1-3 relevant external integrations (MCP servers, third-party APIs, GraphRAG, "
                 "LiteLLM routing) as extra options."},
    {"key": "governance", "title": "Guardrails, data & budget", "phase": "Phase 3",
     "goal": "Decide storage, approval / human-in-the-loop thresholds, PII handling and the monthly LLM budget (alert vs block).",
     "guidance": "Ask at most 2 questions covering the highest-risk governance decisions for this domain (e.g. one on "
                 "storage + approvals, one on budget with options like $2 / $5 / $20 and alert vs hard cap)."},
    {"key": "compile", "title": "Final compilation", "phase": "Phase 4",
     "goal": "Compile and approve the Agent Architecture Specification.", "guidance": ""},
]
STEP_KEYS = [s["key"] for s in INTERVIEW_STEPS]
TOTAL_STEPS = len(INTERVIEW_STEPS)
MAX_QUESTIONS_PER_STEP = 2

# Pre-built platform modules (tectonic_runtime) and the worker tools each one contributes.
PLATFORM_MODULES: dict[str, dict[str, Any]] = {
    "agentic_rag": {"label": "Agentic RAG knowledge base", "description": "Routed, self-correcting retrieval with cited answers over your documents.",
                    "tools": ["core_knowledge_search", "core_ask_knowledge", "core_add_knowledge"], "match": r"rag|knowledge|retriev|faq|document"},
    "vector_db": {"label": "Vector DB (Qdrant hybrid search)", "description": "Embedding store with dense + sparse search for semantic lookup.",
                  "tools": ["core_knowledge_search"], "match": r"vector|qdrant|embedding|semantic search"},
    "long_term_memory": {"label": "Long-term memory", "description": "Durable facts, preferences and team-shared knowledge across sessions.",
                         "tools": ["core_remember", "core_recall", "core_share_knowledge"], "match": r"long[- ]term|durable memory|preference memory"},
    "short_term_memory": {"label": "Short-term memory", "description": "Session working memory with automatic summarisation.",
                          "tools": ["core_memory_note", "core_memory_context"], "match": r"short[- ]term|working memory|session memory"},
    "guardrails": {"label": "Guardrails", "description": "Jailbreak, denied-topic and PII screening of inputs and outputs.",
                   "tools": ["core_guardrails_check"], "match": r"guardrail|safety|pii|moderation"},
    "intent_detection": {"label": "Intent detection", "description": "Classifies requests (incl. compound ones) to route work.",
                         "tools": ["core_classify_intent", "core_define_intents"], "match": r"intent|classif|routing of requests|triage router"},
    "tool_orchestration": {"label": "Tool orchestration", "description": "Retries, circuit breaker and reliability scoring for external calls.",
                           "tools": ["core_list_tools", "core_call_tool"], "match": r"orchestrat|retry|circuit|reliab"},
    "finops": {"label": "FinOps budget guard", "description": "Meters LLM cost per agent and enforces the team budget.",
               "tools": ["core_spend_status"], "match": r"finops|budget|cost|spend"},
    "promptops": {"label": "PromptOps", "description": "Versioned, A/B-tested prompts with rollback.",
                  "tools": ["core_prompt_feedback"], "match": r"promptops|prompt version|a/b"},
    "auditability": {"label": "Audit trail", "description": "Tamper-evident trace of reasoning, tool calls and decisions.",
                     "tools": ["core_audit_trail"], "match": r"audit|trace|compliance log"},
}
GOVERNANCE_MODULES = ("guardrails", "finops", "promptops", "auditability")


def step_index(key: str) -> int:
    return STEP_KEYS.index(key)


def catalog_block() -> str:
    lines = [f"- {m['label']} (id {mid}): {m['description']}" for mid, m in PLATFORM_MODULES.items()]
    return "Pre-built platform module catalog (use these exact labels as option labels):\n" + "\n".join(lines)


def step_brief(index: int) -> str:
    """Instruction handed to the requirements agent for the current interview step."""
    step = INTERVIEW_STEPS[index]
    brief = (f"INTERVIEW STEP {index + 1} of {TOTAL_STEPS} — {step['title']} ({step['phase']}).\n"
             f"Goal: {step['goal']}\nHow to ask: {step['guidance']}\n"
             f"Return 1-{MAX_QUESTIONS_PER_STEP} `decisions` for THIS step only, tailored to the user's use case; "
             "keep is_complete false; fill in the spec fields you already know.")
    if step["key"] == "modules":
        brief += "\n" + catalog_block()
    return brief


def match_module(text: str) -> str:
    low = (text or "").lower()
    for mid, m in PLATFORM_MODULES.items():
        if m["label"].lower() in low or mid.replace("_", " ") in low or mid in low:
            return mid
    for mid, m in PLATFORM_MODULES.items():
        if re.search(m["match"], low):
            return mid
    return ""


def merge_module_checklist(question: dict) -> dict:
    """Modules step: keep the agent's tailored options, tag catalog matches, and append any catalog
    module it left out (unrecommended) so the checklist always covers every pre-built module."""
    options = []
    seen: set[str] = set()
    for opt in question.get("options", []):
        mid = opt.get("module_id") or match_module(f"{opt.get('label', '')} {opt.get('description', '')}")
        if mid and mid in seen:
            continue
        if mid:
            seen.add(mid)
        options.append({**opt, "module_id": mid})
    for mid, m in PLATFORM_MODULES.items():
        if mid not in seen:
            options.append({"label": m["label"], "description": m["description"], "recommended": False, "module_id": mid})
    question = {**question, "multi_select": True, "options": options}
    return question


# --- step plan: which steps the user decides; the AI takes its recommended choices for the rest ------
PLAN_STEP = {"key": "plan", "title": "Choose your steps", "phase": "Start"}
PLAN_QUESTION_ID = "step_plan"
_PLAN_HINTS = {
    "discovery": "Confirm the problem, users and success criteria",
    "io": "Pick input sources and output formats / channels",
    "topology": "Single agent vs. sequential / hierarchical / parallel team",
    "agents": "Which specialist sub-agents are included",
    "modules": "Pre-built modules (RAG, memory, guardrails, ...) and integrations",
    "governance": "Storage, approvals, PII handling and monthly budget",
    "compile": "Review the final specification before anything is built",
}
PLAN_DEFAULT = ("compile",)  # by default the user only reviews the spec before the build
_PLAN_NONE = "None: let the AI decide everything"


def plan_question(autopilot: bool = False) -> dict:
    """The step-plan card. On autopilot the recommendation is to let the AI decide everything."""
    options = [{"label": s["title"], "description": _PLAN_HINTS[s["key"]],
                "recommended": not autopilot and s["key"] in PLAN_DEFAULT} for s in INTERVIEW_STEPS]
    options.append({"label": _PLAN_NONE, "description": "Build straight away with the AI's recommended choices",
                    "recommended": autopilot})
    return {
        "id": PLAN_QUESTION_ID, "title": "Which steps do you want to decide yourself?", "category": "general",
        "why": "Unticked steps are decided by the AI with its recommended choices, and the build moves on automatically.",
        "allow_custom": False, "multi_select": True, "options": options,
    }


def plan_from_selection(labels: list[str]) -> list[str]:
    """Step keys the user chose to decide, from the selected option labels of the plan question."""
    if _PLAN_NONE in labels:
        return []
    by_title = {s["title"]: s["key"] for s in INTERVIEW_STEPS}
    return [by_title[label] for label in labels if label in by_title]


def approval_question() -> dict:
    return {
        "id": "spec_approval", "title": "Approve this architecture and build it?", "category": "general",
        "why": "Approving compiles the agents, tools and platform wiring exactly as specified above.",
        "allow_custom": True, "multi_select": False,
        "options": [
            {"id": "A", "label": "Approve & build", "description": "Generate, verify and provision the system now", "recommended": True},
            {"id": "B", "label": "Revise topology", "description": "Go back to architecture & topology"},
            {"id": "C", "label": "Revise sub-agents", "description": "Change which specialists are included"},
            {"id": "D", "label": "Revise modules", "description": "Change the pre-built modules / integrations"},
            {"id": "E", "label": "Revise guardrails & budget", "description": "Change storage, approvals or budget"},
        ],
    }


REVISE_TARGET = {"B": "topology", "C": "agents", "D": "modules", "E": "governance"}


# --- specification compiler ------------------------------------------------------------------------
def _text(*parts: Any) -> str:
    return " ".join(str(p) for p in parts if p).lower()


def _agents(req: dict) -> tuple[dict, list[dict]]:
    root = req.get("root_agent") or {"name": req.get("project_name", "lead_agent")}
    return root, [a for a in (req.get("sub_agents") or []) if isinstance(a, dict)]


def _assign(mid: str, lead: dict, subs: list[dict]) -> list[str]:
    everyone = [lead.get("name", "lead_agent")] + [s.get("name", "") for s in subs]
    if mid in GOVERNANCE_MODULES or not subs:
        return everyone
    patterns = {
        "agentic_rag": r"answer|faq|knowledge|research|policy|document|support|question|search|explain",
        "vector_db": r"answer|faq|knowledge|research|document|search|similar",
        "long_term_memory": r"remember|preference|history|customer|profile|relationship",
        "short_term_memory": r"conversation|session|dialog|coordinat",
        "intent_detection": r"triage|route|classif|intake|dispatch",
        "tool_orchestration": r"api|external|integrat|fetch|sync|send|notify",
    }
    chosen = [s["name"] for s in subs if re.search(patterns.get(mid, r"$^"), _text(s.get("name"), s.get("role"), s.get("description"), s.get("instruction_outline")))]
    if mid in ("short_term_memory", "intent_detection", "long_term_memory"):
        chosen = [lead.get("name", "lead_agent")] + chosen
    return chosen or [lead.get("name", "lead_agent")]


def _selected_modules(decisions: dict) -> tuple[list[str], list[dict]]:
    modules, integrations = [], []
    for e in decisions.values():
        if e.get("step") != "modules":
            continue
        for opt in e.get("selected", []):
            if opt.get("module_id"):
                modules.append(opt["module_id"])
            else:
                integrations.append({"name": opt.get("label"), "description": opt.get("description", "")})
        if e.get("custom") and e.get("choice"):
            integrations.append({"name": e["choice"], "description": "custom integration requested by the user"})
    return list(dict.fromkeys(modules)), integrations


def _implied_modules(req: dict, decisions: dict, selected: list[str]) -> list[str]:
    """Modules the design relies on although they were not ticked: a platform tool named in the spec
    (e.g. core_spend_status in an instruction outline), or a budget chosen in the governance step."""
    text = json.dumps(req, default=str)
    provided = {t for mid in selected for t in PLATFORM_MODULES[mid]["tools"]}
    implied: list[str] = []
    for mid, m in PLATFORM_MODULES.items():
        if mid in selected:
            continue
        if any(t not in provided and re.search(rf"\b{t}\b", text) for t in m["tools"]):
            implied.append(mid)
            provided.update(m["tools"])
    budget = any(e.get("step") == "governance" and re.search(r"budget|spend|\$\s*\d", f"{e.get('title', '')} {e.get('choice', '')}", re.I)
                 for e in decisions.values())
    if budget and "finops" not in selected and "finops" not in implied:
        implied.append("finops")
    return implied


def _lead_prompt(project: str, req: dict, lead: dict, subs: list[dict], modules: dict[str, list[str]], decisions: dict) -> str:
    lead_name = lead.get("name", "lead_agent")
    lines = [f"You are {lead.get('role') or 'the lead agent'} (`{lead_name}`) of the `{project}` system.", "",
             "## Mission", req.get("goal") or "Help users accomplish the system's goal reliably.", ""]
    if req.get("target_users"):
        lines += ["## Users", str(req["target_users"]), ""]
    if lead.get("instruction_outline"):
        lines += ["## Responsibilities", str(lead["instruction_outline"]).strip(), ""]
    if subs:
        lines += ["## Your team (delegate, do not do their work yourself)"]
        lines += [f"- `{s.get('name')}` — {s.get('description') or s.get('role', '')}" for s in subs]
        lines.append("")
    usage = {
        "guardrails": "Screen untrusted input with core_guardrails_check(stage='input') and your final reply with stage='output'.",
        "agentic_rag": "Answer factual questions from the knowledge base with core_ask_knowledge and cite sources like [1].",
        "vector_db": "Use core_knowledge_search for semantic lookups before answering from memory.",
        "long_term_memory": "Recall user preferences and team conventions with core_recall; store new durable facts with core_remember.",
        "short_term_memory": "Keep working notes for long conversations with core_memory_note / core_memory_context.",
        "intent_detection": "Classify ambiguous or compound requests with core_classify_intent before routing.",
        "tool_orchestration": "Run external calls through core_call_tool for retries and circuit breaking.",
        "finops": "Check core_spend_status before expensive multi-step work; be concise when the budget is tight.",
        "promptops": "Report task success or failure with core_prompt_feedback when the user confirms an outcome.",
        "auditability": "When asked what happened, read core_audit_trail rather than guessing.",
    }
    mine = [mid for mid, users in modules.items() if lead_name in users]
    if mine:
        lines += ["## Platform modules"] + [f"- {usage[m]}" for m in mine if m in usage] + [""]
    rules = [str(r) for r in (req.get("guardrail_requirements") or [])]
    gov = [f"{e['title']}: {e['choice']}" for e in decisions.values() if e.get("step") == "governance"]
    if rules or gov:
        lines += ["## Rules"] + [f"- {r}" for r in rules] + [f"- {g}" for g in gov] + [""]
    if req.get("outputs"):
        lines += ["## Output", "Produce: " + "; ".join(str(o) for o in req["outputs"])]
    return "\n".join(lines).strip()


def compile_spec(req: dict, decisions: dict) -> dict:
    project = slugify_identifier(req.get("project_name") or "", default="generated_agent")
    lead, subs = _agents(req)
    selected, integrations = _selected_modules(decisions)
    if not selected:  # nothing chosen explicitly → governance baseline
        selected = list(GOVERNANCE_MODULES)
    implied = _implied_modules(req, decisions, selected)
    selected += implied
    module_map = {mid: _assign(mid, lead, subs) for mid in selected}
    tool_by_name = {t.get("name"): t for t in (req.get("tools") or []) if isinstance(t, dict)}

    def agent_entry(a: dict, is_lead: bool) -> dict:
        name = a.get("name", "lead_agent")
        mods = [mid for mid, users in module_map.items() if name in users]
        return {
            "name": name, "role": a.get("role", ""), "description": a.get("description", ""),
            "responsibilities": str(a.get("instruction_outline", "")).strip(),
            "custom_tools": [t for t in a.get("tools", []) if t in tool_by_name] or a.get("tools", []),
            "modules": mods,
            "platform_tools": sorted({t for m in mods for t in PLATFORM_MODULES[m]["tools"]}),
            **({"delegates_to": [s.get("name") for s in subs]} if is_lead and subs else {}),
        }

    topology_choice = next((e["choice"] for e in decisions.values() if e.get("step") == "topology"), None)
    config = {
        "project": project,
        "topology": {"pattern": req.get("architecture", "coordinator"), "chosen": topology_choice},
        "lead_agent": agent_entry(lead, True),
        "sub_agents": [agent_entry(s, False) for s in subs],
        "modules": {mid: {"label": PLATFORM_MODULES[mid]["label"], "used_by": users, "tools": PLATFORM_MODULES[mid]["tools"]}
                    for mid, users in module_map.items()},
        "integrations": integrations,
        "implied_modules": implied,
        "governance": {e["title"]: e["choice"] for e in decisions.values() if e.get("step") == "governance"},
        "custom_tools": [{"name": t.get("name"), "description": t.get("description", ""),
                          "parameters": [p.get("name") for p in t.get("parameters", []) if isinstance(p, dict)]}
                         for t in tool_by_name.values()],
    }
    lead_prompt = _lead_prompt(project, req, lead, subs, module_map, decisions)
    rows = "\n".join(f"| `{a['name']}` | {a['role'] or '—'} | {a['description'] or a['responsibilities'][:120] or '—'} | "
                     f"{', '.join(a['custom_tools']) or '—'} | {', '.join(a['modules']) or '—'} |"
                     for a in [config["lead_agent"], *config["sub_agents"]])
    markdown = (
        f"## Agent Architecture Specification · `{project}`\n\n"
        f"**Topology:** {topology_choice or req.get('architecture', '')}  \n**Goal:** {req.get('goal', '')}\n\n"
        f"### Lead agent system prompt\n```text\n{lead_prompt}\n```\n\n"
        + (f"> Also enabled because the design relies on them: {', '.join(implied)}\n\n" if implied else "")
        + f"### Agents\n| Agent | Role | Responsibility | Custom tools | Modules |\n|---|---|---|---|---|\n{rows}\n\n"
        f"### Configuration (modules → agents)\n```json\n{json.dumps(config, indent=2)}\n```"
    )
    return {"project": project, "lead_system_prompt": lead_prompt, "config": config, "enabled_modules": selected,
            "markdown": markdown}
