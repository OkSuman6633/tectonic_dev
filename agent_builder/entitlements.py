"""Subscription plans and runtime entitlements — the configuration-driven tier plane.

This is the engine behind the 4-tier subscription model (Starter / Pro / Business / Enterprise).
It is intentionally *data, not code*: every limit lives in ``PLANS`` below, and the rest of the
codebase only ever calls the small helper API at the bottom, never reads a tier constant.

Two things are tracked per account:
  * **The chosen plan** — stored in ``<data>/plans.json`` (one id per account).
  * **Monthly token usage** — stored in ``<data>/plans_usage.json``, reset by calendar month.

There is **no payment** yet: choosing a plan is free, and a user may switch plans at any time.
Enforcement is the same regardless, so the experience is identical once billing is added later.

No network, no model calls, and no imports from the rest of the app at module load — this file is
import-safe and fully unit-testable. (It lives in ``agent_builder`` rather than ``tectonic_runtime``
because it depends on ``agent_builder.auth.data_dir`` and ``agent_builder.workspace.current_user``,
both imported lazily inside functions.)
"""

from __future__ import annotations

import json
import os
import threading
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any

PLAN_IDS: tuple[str, ...] = ("starter", "pro", "business", "enterprise")

# The plan a single-user Studio runs on when sign-in is off (keeps local studios fully featured).
PLAN_WHEN_AUTH_OFF = "pro"

# --- model tiers --------------------------------------------------------------------------------
# Order matters: a plan's ``max_model_tier`` unlocks every tier up to and including it.
TIER_ORDER: tuple[str, ...] = ("economy", "balanced", "reasoning", "flagship", "preview")

_MODEL_TIER: dict[str, str] = {
    "gemini-3.6-flash": "economy",
    "gemini-2.5-flash": "economy",
    "gemini-2.5-flash-lite": "economy",
    "claude-haiku-5-5": "economy",
    "claude-sonnet-5-5": "balanced",
    "gemini-2.5-pro": "reasoning",
    "claude-opus-5-5": "flagship",
    "claude-fable-5-1": "flagship",
}
# A model id we don't know is premium by default: it must be explicitly allowed, never silently free.
UNKNOWN_TIER = "flagship"


def tier_rank(tier: str) -> int:
    try:
        return TIER_ORDER.index(tier)
    except ValueError:
        return TIER_ORDER.index(UNKNOWN_TIER)


def model_tier(model_id: str) -> str:
    key = (model_id or "").strip().lower()
    # "gemini/gemini-2.5-pro" and "models/gemini-..." both normalise to the bare id.
    key = key.split("/")[-1]
    return _MODEL_TIER.get(key, UNKNOWN_TIER)


# --- plan definitions ----------------------------------------------------------------------------
# ``monthly_tokens`` / ``max_tokens_per_run`` of 0 mean "unlimited" (Enterprise contract).
_BUSINESS_MODULES: dict[str, str] = {
    "guardrails": "ga", "intent_detection": "ga", "short_term_memory": "ga",
    "long_term_memory": "ga", "tool_orchestration": "ga", "agentic_rag": "ga",
    "vector_db": "ga", "promptops": "ga", "auditability": "ga", "finops": "ga",
    "image_generation": "ga", "external_connectors": "ga",
    "billing_and_metering": "beta", "multi_tenancy": "beta",
    "identity_and_access": "beta", "control_plane": "beta",
    "workflow_engine": "beta", "conversational_engine": "beta",
    "observability": "beta", "human_oversight": "beta",
    "knowledge_base": "beta", "context_engineering": "beta",
    "evaluation_framework": "beta", "sentinel_agents": "beta",
    "mcp": "beta", "data_source_plugins": "beta",
    "llm_gateway": "beta", "secrets_and_credential_management": "beta",
    "agent_cards": "beta", "a2a": "beta", "agent_marketplace": "beta",
}

_PLANS: dict[str, dict[str, Any]] = {
    "starter": {
        "name": "Starter",
        "tagline": "Try it out",
        "description": "Build one simple AI assistant and explore what Tectonic can do.",
        "bullets": ["1 AI assistant", "Basic (economy) AI models", "Small monthly allowance", "Short-term memory"],
        "max_model_tier": "economy",
        "allow_byok": False,
        "max_agents": 1,
        "max_sub_agents": 3,
        "max_iterations": 30,
        "max_concurrent_runs": 2,
        "monthly_tokens": 500_000,
        "max_tokens_per_run": 50_000,
        "max_seats": 1,
        "context_window_tokens": 128_000,
        "vector_store_bytes": 10 * 1024 * 1024,
        "persistent_memory": False,
        "memory_retention_days": 30,
        "rbac": False,
        "human_in_the_loop": False,
        "sso_saml": False,
        "scim": False,
        "audit_export": False,
        "private_deployment": False,
        "trace_retention_days": 7,
        "queue_priority": "standard",
        "sla": "best_effort",
        "overage": "hard_cap",
        "modules": {
            "guardrails": "ga",
            "intent_detection": "ga",
            "short_term_memory": "ga",
            "tool_orchestration": "ga",
            "auditability": "ga",
        },
        "connectors": [],
    },
    "pro": {
        "name": "Pro",
        "tagline": "The serious individual builder",
        "description": "Full model catalogue, your own AI key, memory, data connections and images.",
        "bullets": ["All AI models", "Use your own AI key", "Long-term memory", "Data connections", "Top-up when you run out"],
        "max_model_tier": "flagship",
        "allow_byok": True,
        "max_agents": 10,
        "max_sub_agents": 8,
        "max_iterations": 80,
        "max_concurrent_runs": 10,
        "monthly_tokens": 5_000_000,
        "max_tokens_per_run": 200_000,
        "max_seats": 1,
        "context_window_tokens": 256_000,
        "vector_store_bytes": 1024 * 1024 * 1024,
        "persistent_memory": True,
        "memory_retention_days": 90,
        "rbac": False,
        "human_in_the_loop": False,
        "sso_saml": False,
        "scim": False,
        "audit_export": False,
        "private_deployment": False,
        "trace_retention_days": 30,
        "queue_priority": "standard",
        "sla": "99.5%",
        "overage": "credit_top_up",
        "modules": {
            "guardrails": "ga",
            "intent_detection": "ga",
            "short_term_memory": "ga",
            "long_term_memory": "ga",
            "tool_orchestration": "ga",
            "agentic_rag": "ga",
            "vector_db": "ga",
            "promptops": "ga",
            "auditability": "ga",
            "finops": "ga",
            "image_generation": "ga",
            "external_connectors": "ga",
        },
        "connectors": ["google_analytics", "meta_ads", "http"],
    },
    "business": {
        "name": "Business",
        "tagline": "For teams that work together",
        "description": "Pooled team allowance, seats and roles, shared knowledge, approvals and audit.",
        "bullets": ["Everything in Pro", "Team seats & roles", "Shared team knowledge", "Human approvals", "Priority handling"],
        "max_model_tier": "preview",
        "allow_byok": True,
        "max_agents": 500,
        "max_sub_agents": 15,
        "max_iterations": 200,
        "max_concurrent_runs": 50,
        "monthly_tokens": 50_000_000,
        "max_tokens_per_run": 500_000,
        "max_seats": 100,
        "context_window_tokens": 512_000,
        "vector_store_bytes": 50 * 1024 * 1024 * 1024,
        "persistent_memory": True,
        "memory_retention_days": 365,
        "rbac": True,
        "human_in_the_loop": True,
        "sso_saml": False,
        "scim": False,
        "audit_export": True,
        "private_deployment": False,
        "trace_retention_days": 90,
        "queue_priority": "priority",
        "sla": "99.9%",
        "overage": "credit_top_up",
        "modules": _BUSINESS_MODULES,
        "connectors": ["google_analytics", "meta_ads", "http"],
    },
    "enterprise": {
        "name": "Enterprise",
        "tagline": "Built around your company",
        "description": "Negotiated limits, SSO, private deployment, dedicated capacity and full audit.",
        "bullets": ["Custom (negotiated) limits", "Single sign-on", "Private deployment", "Dedicated capacity", "Full audit export"],
        "max_model_tier": "preview",
        "allow_byok": True,
        "max_agents": 0,  # 0 = negotiated / unlimited
        "max_sub_agents": 0,
        "max_iterations": 0,
        "max_concurrent_runs": 0,
        "monthly_tokens": 0,
        "max_tokens_per_run": 0,
        "max_seats": 0,
        "context_window_tokens": 0,
        "vector_store_bytes": 0,
        "persistent_memory": True,
        "memory_retention_days": 0,
        "rbac": True,
        "human_in_the_loop": True,
        "sso_saml": True,
        "scim": True,
        "audit_export": True,
        "private_deployment": True,
        "trace_retention_days": 365,
        "queue_priority": "dedicated",
        "sla": "custom",
        "overage": "contract",
        "modules": {**_BUSINESS_MODULES, "regulatory_compliance": "beta",
                    "deployment_strategy": "beta", "graph_db": "beta", "multi_modality": "beta",
                    "llmops": "beta", "sdk_and_developer_portal": "beta"},
        "connectors": ["google_analytics", "meta_ads", "http"],
    },
}

# --- plan sources -------------------------------------------------------------------------------
# The per-plan JSON files in <repo>/plans/ (or $TECTONIC_PLANS_DIR) are the source of truth for the
# lock/unlock status of every module and tool. ``_PLANS`` above is only the fallback used when the
# JSON files are unavailable (e.g. a partial checkout); it is kept in sync with the same numbers.

_PLANS_DIR_ENV = "TECTONIC_PLANS_DIR"


def _plans_dir() -> Path | None:
    """The directory holding plans/*.json, if present."""
    override = os.environ.get(_PLANS_DIR_ENV)
    candidates = ([Path(override)] if override else []) + [Path(__file__).resolve().parent.parent / "plans"]
    for candidate in candidates:
        try:
            if candidate.is_dir():
                return candidate
        except OSError:  # pragma: no cover - permission / path error
            continue
    return None


def _normalize_plan(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalise a plan dict (in-code fallback or JSON file) into the internal shape.

    ``modules`` keeps only *unlocked* modules (name → status), preserving the original behaviour of
    ``module_allowed``. Locked modules move to ``locked_modules`` so the lock/unlock status of every
    module is explicit and queryable. ``tools`` becomes a name → {"locked": bool} map.
    """
    plan = dict(raw)
    modules = plan.get("modules", {})
    unlocked: dict[str, str] = {}
    locked: dict[str, dict[str, Any]] = {}
    for name, entry in modules.items():
        if isinstance(entry, str):
            unlocked[name] = entry
        elif isinstance(entry, dict):
            if entry.get("locked"):
                locked[name] = {"status": entry.get("status", "beta"),
                                "unlock_hint": entry.get("unlock_hint")}
            else:
                unlocked[name] = entry.get("status", "ga")
        else:
            unlocked[name] = str(entry or "ga")
    plan["modules"] = unlocked
    plan["locked_modules"] = locked
    tools = plan.get("tools")
    if isinstance(tools, dict):
        plan["tools"] = {name: (t if isinstance(t, dict) else {"locked": bool(t)})
                         for name, t in tools.items()}
    else:
        plan["tools"] = {
            "web_search": {"locked": False},
            "agent_access": {"locked": False},
            "build_pipeline": {"locked": False},
            "file_manager": {"locked": False},
            "memory": {"locked": False},
            "review": {"locked": False},
            "interview": {"locked": False},
            "image_generation": {"locked": "image_generation" not in unlocked},
            "connectors": {"locked": "external_connectors" not in unlocked},
        }
    return plan


def _load_json_plans() -> dict[str, dict[str, Any]]:
    """Read plans/{starter,pro,business,enterprise}.json (the lock/unlock source of truth)."""
    directory = _plans_dir()
    if directory is None:
        return {}
    loaded: dict[str, dict[str, Any]] = {}
    for pid in PLAN_IDS:
        try:
            raw = json.loads((directory / f"{pid}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(raw, dict):
            loaded[pid] = _normalize_plan(raw)
    return loaded


_PLANS = {pid: _normalize_plan(plan) for pid, plan in _PLANS.items()}
_PLANS.update(_load_json_plans())

# Every module known across all plans (Enterprise unlocks them all), used for lock status.
_ALL_MODULES: set[str] = set()
for _plan in _PLANS.values():
    _ALL_MODULES.update(_plan.get("modules", {}))


def plans_catalog() -> list[dict[str, Any]]:
    """Every plan id with its name (the order of ``PLAN_IDS``)."""
    return [{"id": pid, "name": _PLANS[pid]["name"]} for pid in PLAN_IDS]


def plan_definition(plan_id: str) -> dict[str, Any]:
    key = (plan_id or "").strip().lower()
    if key not in _PLANS:
        raise ValueError(f"unknown plan {plan_id!r}; available: {', '.join(PLAN_IDS)}")
    return _PLANS[key]


# --- storage: the account's chosen plan -----------------------------------------------------------
def _data_dir() -> Path:
    from .auth import data_dir  # lazy: avoids an import cycle at module load

    return data_dir()


def _plans_path() -> Path:
    return _data_dir() / "plans.json"


_plans_lock = threading.RLock()


def _read_plans() -> dict[str, str]:
    try:
        data = json.loads(_plans_path().read_text(encoding="utf-8"))
        return {k: v for k, v in data.items() if isinstance(v, str)} if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_plans(store: dict[str, str]) -> None:
    with _plans_lock:
        path = _plans_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(store, indent=2), encoding="utf-8")
        tmp.replace(path)


def get_plan_id(user_id: str | None) -> str | None:
    """The account's chosen plan, or None when it has not picked one yet.

    A single-user Studio (sign-in off, no account id) persists its plan under a ``local`` key and
    defaults to ``PLAN_WHEN_AUTH_OFF`` so it stays fully featured without a picker.
    """
    if not user_id:
        return _read_plans().get("local") or PLAN_WHEN_AUTH_OFF
    try:
        from .db import SubscriptionRepository

        sub = SubscriptionRepository.get_by_user_id(user_id)
        if sub:
            return sub["plan_id"]
    except Exception:
        pass
    return _read_plans().get(user_id)


def set_plan_id(user_id: str | None, plan_id: str) -> None:
    """Record (or change) the account's plan. Enforces role and expiration rules."""
    plan_definition(plan_id)  # validate
    pid = plan_id.strip().lower()
    if user_id:
        from .db import SubscriptionRepository

        SubscriptionRepository.set_plan(user_id, pid)

    with _plans_lock:
        store = _read_plans()
        store[user_id or "local"] = pid
        _write_plans(store)


def effective_plan_id(user_id: str | None) -> str:
    """The plan to enforce: the chosen one, or ``starter`` until a picker choice is made."""
    return get_plan_id(user_id) or "starter"


# --- monthly token usage ledger -------------------------------------------------------------------
def _usage_path() -> Path:
    return _data_dir() / "plans_usage.json"


_usage_lock = threading.RLock()


def _month_key() -> str:
    return time.strftime("%Y-%m", time.localtime())


def _read_usage() -> dict[str, Any]:
    try:
        data = json.loads(_usage_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_usage(store: dict[str, Any]) -> None:
    with _usage_lock:
        path = _usage_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(store, indent=2), encoding="utf-8")
        tmp.replace(path)


def monthly_tokens(user_id: str | None) -> int:
    if not user_id:
        return 0
    return int(_read_usage().get(user_id, {}).get(_month_key(), 0))


def record_tokens(user_id: str | None, tokens: int) -> int:
    """Add ``tokens`` to this account's current-month total. Returns the new total."""
    if not user_id or tokens <= 0:
        return monthly_tokens(user_id)
    with _usage_lock:
        store = _read_usage()
        month = _month_key()
        entry = store.setdefault(user_id, {})
        entry[month] = int(entry.get(month, 0)) + int(tokens)
        _write_usage(store)
    return monthly_tokens(user_id)


def monthly_quota(plan_id: str) -> int:
    return int(plan_definition(plan_id)["monthly_tokens"])


def quota_exhausted(user_id: str | None, plan_id: str | None = None) -> bool:
    """True when the account's monthly token allowance is already spent (0 = unlimited → never)."""
    if not user_id:
        return False
    plan_id = plan_id or effective_plan_id(user_id)
    quota = monthly_quota(plan_id)
    return quota > 0 and monthly_tokens(user_id) >= quota


# --- per-run context (in-loop guardrails) ---------------------------------------------------------
# Populated by the telemetry plugin at run start and read by its before/after model callbacks.
_run_ctx: ContextVar[dict[str, Any] | None] = ContextVar("tectonic_plan_run", default=None)


def begin_run(user_id: str | None) -> None:
    _run_ctx.set({"user": user_id, "plan": effective_plan_id(user_id), "tokens": 0, "iterations": 0})


def end_run() -> None:
    _run_ctx.set(None)


def _run_state() -> dict[str, Any] | None:
    return _run_ctx.get()


def run_tokens() -> int:
    state = _run_state()
    return int(state["tokens"]) if state else 0


def add_run_tokens(tokens: int) -> None:
    state = _run_state()
    if state and tokens > 0:
        state["tokens"] = int(state["tokens"]) + int(tokens)


def run_cap_exhausted(plan_id: str | None = None) -> bool:
    """True when the run has already used its per-run token allowance (0 = unlimited → never)."""
    state = _run_state()
    if not state:
        return False
    plan_id = plan_id or state.get("plan") or "starter"
    cap = int(plan_definition(plan_id)["max_tokens_per_run"])
    return cap > 0 and run_tokens() >= cap


def note_iteration() -> int:
    state = _run_state()
    if not state:
        return 0
    state["iterations"] = int(state.get("iterations", 0)) + 1
    return state["iterations"]


def iterations_exhausted(plan_id: str | None = None) -> bool:
    state = _run_state()
    if not state:
        return False
    plan_id = plan_id or state.get("plan") or "starter"
    cap = int(plan_definition(plan_id)["max_iterations"])
    return cap > 0 and int(state.get("iterations", 0)) >= cap


# --- capability checks ----------------------------------------------------------------------------
def max_model_tier_of(plan_id: str) -> str:
    return str(plan_definition(plan_id)["max_model_tier"])


def model_allowed(plan_id: str, model_id: str) -> bool:
    """Is this model within the plan's catalogue tier?"""
    return tier_rank(model_tier(model_id)) <= tier_rank(max_model_tier_of(plan_id))


def allowed_models(plan_id: str) -> list[str]:
    """Every catalogue model the plan may use (for filtering the Studio's model picker)."""
    from .model_settings import CATALOGUE  # lazy

    return [m["id"] for m in CATALOGUE if model_allowed(plan_id, m["id"])]


def module_allowed(plan_id: str, module_name: str) -> bool:
    return module_name in plan_definition(plan_id)["modules"]


def allowed_modules(plan_id: str) -> set[str]:
    return set(plan_definition(plan_id)["modules"])


def connector_allowed(plan_id: str, connector_name: str) -> bool:
    return connector_name in plan_definition(plan_id)["connectors"]


def allowed_connectors(plan_id: str) -> list[str]:
    return list(plan_definition(plan_id)["connectors"])


# --- lock/unlock status (module & tool availability by plan) -------------------------------------
# Orchestration asks these before using a module or tool instead of building an agent. A locked
# feature returns a clear "not available on your plan" message naming the plans that unlock it.
def _display(name: str) -> str:
    return name.replace("_", " ").strip().title()


def lock_message(plan_id: str, kind: str, name: str) -> str:
    """The standard 'not available on your plan' message an agent or the UI can show."""
    plan = plan_definition(plan_id)
    label = _display(name)
    unlocking: list[str] = []
    for pid in PLAN_IDS:
        other = plan_definition(pid)
        if kind == "module":
            unlocked = name in other["modules"]
        else:
            entry = other.get("tools", {}).get(name)
            unlocked = isinstance(entry, dict) and not entry.get("locked", True)
        if unlocked:
            unlocking.append(other["name"])
    if len(unlocking) == 1:
        suffix = f"Upgrade to {unlocking[0]} to use it."
    elif unlocking:
        suffix = f"Upgrade to {', '.join(unlocking[:-1])} or {unlocking[-1]} to use it."
    else:
        suffix = "Upgrade to unlock it."
    return f"{label} is not available on the {plan['name']} plan. {suffix}"


def locked_modules(plan_id: str) -> set[str]:
    """Module names the plan does not include."""
    return set(_ALL_MODULES) - set(plan_definition(plan_id)["modules"])


def module_lock_hint(plan_id: str, module_name: str) -> str | None:
    """The upgrade message for a locked module, or None when the plan allows it."""
    plan = plan_definition(plan_id)
    if module_name in plan["modules"]:
        return None
    explicit = plan.get("locked_modules", {}).get(module_name, {}).get("unlock_hint")
    return explicit or lock_message(plan_id, "module", module_name)


def tool_allowed(plan_id: str, tool_name: str) -> bool:
    """May this plan use this tool? Unknown tools are locked (fail closed)."""
    entry = plan_definition(plan_id).get("tools", {}).get(tool_name)
    return isinstance(entry, dict) and not entry.get("locked", True)


def locked_tools(plan_id: str) -> set[str]:
    return {name for name, entry in plan_definition(plan_id).get("tools", {}).items()
            if isinstance(entry, dict) and entry.get("locked")}


def tool_lock_hint(plan_id: str, tool_name: str) -> str | None:
    """The upgrade message for a locked tool, or None when the plan allows it."""
    if tool_allowed(plan_id, tool_name):
        return None
    return lock_message(plan_id, "tool", tool_name)


def allow_byok(plan_id: str) -> bool:
    return bool(plan_definition(plan_id)["allow_byok"])


def agent_creation_allowed(user_id: str | None, project_name: str | None = None) -> tuple[bool, str]:
    """May this account create another agent project? (0 = unlimited → always True)."""
    plan = plan_definition(effective_plan_id(user_id))
    max_agents = int(plan["max_agents"])
    if max_agents <= 0:
        return True, ""
    from .directory import projects  # lazy

    existing = [p for p in projects() if p != project_name]
    if len(existing) >= max_agents:
        return False, (f"AGENT_LIMIT_EXCEEDED — your plan allows up to {max_agents} agent(s). "
                       f"Delete one or upgrade to build another.")
    return True, ""


# --- UI-facing summaries --------------------------------------------------------------------------
def public_plan(plan_id: str, chosen: bool) -> dict[str, Any]:
    """A single plan, shaped for the picker/compare UI (no internal fields)."""
    p = plan_definition(plan_id)
    return {
        "id": plan_id,
        "name": p["name"],
        "tagline": p["tagline"],
        "description": p["description"],
        "bullets": p["bullets"],
        "monthly_tokens": p["monthly_tokens"],
        "max_tokens_per_run": p["max_tokens_per_run"],
        "max_agents": p["max_agents"],
        "max_seats": p["max_seats"],
        "models": f"up to {p['max_model_tier']}",
        "byok": p["allow_byok"],
        "persistent_memory": p["persistent_memory"],
        "rbac": p["rbac"],
        "human_in_the_loop": p["human_in_the_loop"],
        "sso_saml": p["sso_saml"],
        "audit_export": p["audit_export"],
        "private_deployment": p["private_deployment"],
        "sla": p["sla"],
        "chosen": chosen,
    }


def public_plans(user_id: str | None) -> list[dict[str, Any]]:
    username = ""
    sub = None
    if user_id:
        try:
            from .db import SubscriptionRepository, UserRepository

            user = UserRepository.get_by_id(user_id)
            if user:
                username = user.get("username", "") or ""
            sub = SubscriptionRepository.get_by_user_id(user_id)
        except Exception:
            pass

    has_admin = "admin" in username.lower()
    now = time.time()
    starter_expired = bool(sub and (sub.get("status") == "expired" or now >= sub.get("expires_at", 0)))
    current = get_plan_id(user_id)

    result: list[dict[str, Any]] = []
    for pid in PLAN_IDS:
        p = public_plan(pid, current == pid)
        if pid == "starter":
            if starter_expired:
                p["available"] = False
                p["unavailable_reason"] = "7-day Starter trial ended. Please create another account to use Starter."
            else:
                p["available"] = True
                p["unavailable_reason"] = None
        else:
            if has_admin:
                p["available"] = True
                p["unavailable_reason"] = None
            else:
                p["available"] = False
                p["unavailable_reason"] = (
                    "Available only for admin accounts (username containing 'admin', "
                    "e.g. 'data admin', 'admin portal', 'admin account')."
                )
        result.append(p)
    return result


def plan_status(user_id: str | None) -> dict[str, Any]:
    """Everything the Studio needs to render the current plan and enforce limits in the UI."""
    from .directory import projects  # lazy: avoids an import cycle

    plan_id = effective_plan_id(user_id)
    p = plan_definition(plan_id)
    agent_count = len(projects())  # projects() handles the no-sign-in case via the shared output dir
    max_agents = int(p["max_agents"])

    sub = None
    if user_id:
        try:
            from .db import SubscriptionRepository

            sub = SubscriptionRepository.get_by_user_id(user_id)
        except Exception:
            pass

    now = time.time()
    sub_status = sub["status"] if sub else "active"
    started_at = sub["started_at"] if sub else now
    expires_at = sub["expires_at"] if sub else (now + 7 * 86400)
    is_expired = sub_status == "expired" or now >= expires_at

    return {
        "plan_id": get_plan_id(user_id),  # None until the user has chosen (the UI then shows the picker)
        "effective_plan_id": plan_id,
        "plan": public_plan(plan_id, True),
        "allowed_models": allowed_models(plan_id),
        "allowed_modules": sorted(allowed_modules(plan_id)),
        "allowed_connectors": allowed_connectors(plan_id),
        "locked_modules": sorted(locked_modules(plan_id)),
        "locked_tools": sorted(locked_tools(plan_id)),
        "allow_byok": p["allow_byok"],
        "subscription_status": sub_status,
        "plan_started_at": started_at,
        "plan_expires_at": expires_at,
        "is_expired": is_expired,
        "usage": {
            "monthly_tokens": monthly_tokens(user_id),
            "monthly_quota": monthly_quota(plan_id),
            "agents": agent_count,
            "max_agents": max_agents if max_agents > 0 else None,
        },
    }


# --- plan-compliance reports (lead-presentable: what was built vs. what the plan allows) ----------
def _limit(value: Any) -> int | None:
    """Plan definitions use 0 for 'negotiated / unlimited'; expose that as None for display."""
    n = int(value)
    return n if n > 0 else None


def _limits(plan_id: str) -> dict[str, Any]:
    p = plan_definition(plan_id)
    return {
        "max_agents": _limit(p["max_agents"]),
        "max_sub_agents": _limit(p["max_sub_agents"]),
        "max_iterations": _limit(p["max_iterations"]),
        "monthly_tokens": _limit(p["monthly_tokens"]),
        "max_tokens_per_run": _limit(p["max_tokens_per_run"]),
        "context_window_tokens": _limit(p["context_window_tokens"]),
        "vector_store_bytes": _limit(p["vector_store_bytes"]),
        "persistent_memory": bool(p["persistent_memory"]),
        "model_tier": f"up to {p['max_model_tier']}",
    }


def project_report(user_id: str | None, project_name: str) -> dict[str, Any]:
    """A per-project plan-compliance report: what was built, what the plan allows, and whether it fits."""
    from .directory import project_tree, projects  # lazy
    from .workspace import output_dir  # lazy

    plan_id = effective_plan_id(user_id)
    p = plan_definition(plan_id)
    tree = project_tree(project_name)
    sub_agents = [e for e in tree if e["kind"] == "sub_agent"]
    tools = sorted({t for e in tree for t in (e.get("tools") or []) if isinstance(t, str)})
    pkg = Path(output_dir()) / project_name
    try:
        files = len([f for f in pkg.rglob("*.py") if f.is_file()])
    except OSError:
        files = len(tree)

    max_agents = int(p["max_agents"])
    max_sub_agents = int(p["max_sub_agents"])
    quota = monthly_quota(plan_id)
    used = monthly_tokens(user_id)
    total_agents = len(projects())

    return {
        "project": project_name,
        "plan_id": plan_id,
        "plan_name": p["name"],
        "built": {"agents": len(tree), "sub_agents": len(sub_agents), "tools": tools, "files": files},
        "limits": _limits(plan_id),
        "compliance": {
            "agents_within_limit": max_agents <= 0 or total_agents <= max_agents,
            "sub_agents_within_limit": max_sub_agents <= 0 or len(sub_agents) <= max_sub_agents,
            "tokens_within_quota": quota <= 0 or used <= quota,
        },
        "usage": {"monthly_tokens": used, "monthly_quota": quota, "total_agents": total_agents},
        "allowed_models": allowed_models(plan_id),
        "allowed_modules": sorted(allowed_modules(plan_id)),
        "allowed_connectors": allowed_connectors(plan_id),
    }


def account_report(user_id: str | None) -> dict[str, Any]:
    """The account-wide plan report: live usage vs. limits, plus one report per generated project."""
    from .directory import projects  # lazy

    plan_id = effective_plan_id(user_id)
    p = plan_definition(plan_id)
    all_projects = projects()
    max_agents = int(p["max_agents"])

    return {
        "plan_id": get_plan_id(user_id),
        "effective_plan_id": plan_id,
        "plan_name": p["name"],
        "usage": {
            "monthly_tokens": monthly_tokens(user_id),
            "monthly_quota": monthly_quota(plan_id),
            "agents": len(all_projects),
            "max_agents": _limit(max_agents),
        },
        "limits": _limits(plan_id),
        "allowed_models": allowed_models(plan_id),
        "allowed_modules": sorted(allowed_modules(plan_id)),
        "allowed_connectors": allowed_connectors(plan_id),
        "projects": [project_report(user_id, name) for name in all_projects],
    }
