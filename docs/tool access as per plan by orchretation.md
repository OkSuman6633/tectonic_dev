# Orchestration Limits — Broadened Plan Defaults & Per-Plan Lock/Unlock

| | |
|---|---|
| **Status** | Implemented — plan definitions, lock/unlock files and in-loop enforcement are live |
| **Scope** | Orchestration-depth limits (sub-agents, reasoning iterations, concurrent runs) + per-plan module/tool availability |
| **Source of truth** | [`plans/{starter,pro,business,enterprise}.json`](../plans) |
| **Enforcement code** | [`agent_builder/entitlements.py`](../agent_builder/entitlements.py), [`tectonic_runtime/adk_tools.py`](../tectonic_runtime/adk_tools.py) |

---

## 1. What changed

Two things were broadened, working from the earlier PRD
([`ENTERPRISE_SUBSCRIPTION_AND_ENTITLEMENTS.md`](ENTERPRISE_SUBSCRIPTION_AND_ENTITLEMENTS.md)):

1. **Orchestration depth limits were raised** so a single run can fan out further and reason longer.
2. **Module/tool availability became a per-plan lock/unlock file** that the orchestrator consults at
   runtime — so a run can use a platform module or tool directly (e.g. "create an agent", "get the
   latest Google news", "generate an image") instead of always spawning a new agent, and a locked
   feature answers with a clear upgrade message instead of failing silently.

Numeric values remain **relative technical defaults** (`[Proposed Default - Tune After Cost Modeling]`),
exactly as the parent PRD states — no dollar prices are implied.

---

## 2. Broadened orchestration limits

| Limit | Starter | Pro | Business | Enterprise |
|---|---|---|---|---|
| Max sub-agents per run | ~~1~~ **3** | ~~3~~ **8** | ~~5~~ **15** | Negotiated (`0`) |
| Reasoning / tool-call iterations per run | ~~15~~ **30** | ~~40~~ **80** | ~~100~~ **200** | Negotiated (`0`) |
| Concurrent (simultaneous) runs | ~~1~~ **2** | ~~5~~ **10** | ~~25~~ **50** | Negotiated (`0`) |
| Max agents per account | 1 | 10 | 500 | Negotiated (`0`) |
| Max tokens per run | 50k | 200k | 500k | Negotiated (`0`) |

`0` means **negotiated / unlimited** (Enterprise contract). Every value is enforced by
[`agent_builder/entitlements.py`](../agent_builder/entitlements.py):

- `max_sub_agents` / `max_agents` — checked when a project is planned and built (compliance report).
- `max_iterations` — checked in the in-loop guardrail (`note_iteration` / `iterations_exhausted`).
- `max_concurrent_runs` — reserved for the run scheduler; exposed on the plan so the UI can show it.

---

## 3. Per-plan lock/unlock files

Every plan has one JSON file: [`plans/starter.json`](../plans/starter.json),
[`plans/pro.json`](../plans/pro.json), [`plans/business.json`](../plans/business.json),
[`plans/enterprise.json`](../plans/enterprise.json). They are the **source of truth** for the
lock/unlock status of every module and tool; the loader resolves `plans/` (or `$TECTONIC_PLANS_DIR`)
at import time and falls back to the in-code defaults only if the files are missing.

Each file carries:

- the orchestration limits from Section 2, plus compute, model-tier, memory and governance fields;
- `modules` — every known module with an explicit lock status:

```jsonc
"modules": {
  "guardrails":        { "status": "ga",   "locked": false },   // always available
  "long_term_memory":  { "status": "ga",   "locked": true  },   // locked on this plan
  "control_plane":     { "status": "beta", "locked": true  }    // locked on this plan
}
```

- `tools` — the builder/orchestration tools with an explicit lock status:

```jsonc
"tools": {
  "web_search":        { "locked": false },   // every plan
  "agent_access":      { "locked": false },   // create / edit / ask / delete an agent
  "build_pipeline":    { "locked": false },   // agent creation pipeline
  "image_generation":  { "locked": true  },   // Starter only
  "connectors":        { "locked": true  }    // Meta Ads / GA4 / HTTP on Pro+
}
```

`locked` is the only flag the runtime looks at. A module absent from a plan's unlocked set is
locked; the upgrade message is computed by scanning which plans *do* unlock it (so it never drifts
out of sync with the files).

---

## 4. Orchestration uses modules/tools instead of agents

The root orchestrator and generated agents call the shared platform modules through
[`tectonic_runtime/adk_tools.py`](../tectonic_runtime/adk_tools.py) (`core_*` tools). Each call now
resolves the signed-in account's plan and checks the lock file **before** invoking the module:

- **Allowed** → the module runs normally.
- **Locked** → the tool returns a structured error the agent reads back to the user:

```text
Image Generation is not available on the Starter plan. Upgrade to Pro, Business or Enterprise to use it.
```

This is the same contract as the existing HTTP gate (`MODULE_LOCKED`) and the image endpoint, so the
chat, the module API and the UI all say the same thing. Enforcement **fails open**: no plan chosen
yet, no signed-in user, or an entitlements lookup error → the call proceeds and the failure is
logged, never swallowed into a compute outage.

Available helpers in [`agent_builder/entitlements.py`](../agent_builder/entitlements.py):

| Helper | Returns |
|---|---|
| `module_allowed(plan, name)` / `module_lock_hint(plan, name)` | allow check + upgrade message |
| `tool_allowed(plan, name)` / `tool_lock_hint(plan, name)` | allow check + upgrade message |
| `locked_modules(plan)` / `locked_tools(plan)` | the plan's locked set |
| `lock_message(plan, kind, name)` | the standard "not available on your plan" text |
| `plan_status(user)` | now includes `locked_modules` and `locked_tools` for the UI |

---

## 5. Behavior contract

1. **Broadened orchestration** — Starter/Pro/Business runs may fan out and reason for the limits in
   Section 2; Enterprise stays negotiated.
2. **Lock/unlock is data, not code** — changing a plan's module/tool availability is an edit to the
   plan's JSON file, not a code change.
3. **Clear upgrade messaging** — a locked feature always names the plan(s) that unlock it, e.g.
   *"Upgrade to Pro, Business or Enterprise to use it."*
4. **Fail open, log loudly** — entitlement lookup failures never stop a run; they are logged and the
   call proceeds (mirroring the billing-and-metering module's documented posture).
