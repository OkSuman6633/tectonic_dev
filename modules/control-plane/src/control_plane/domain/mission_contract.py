"""Mission Contract - The primary governed object that supersedes the agent."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any
import hashlib
import json
from ulid import ULID

from .enums import RiskClassification, MissionStatus, DataClassification, WorkflowMode


def now_utc() -> datetime:
    return datetime.now(UTC)


def new_mission_id() -> str:
    return f"mission_{ULID()}"


@dataclass
class BudgetConstraints:
    """Budget limits for mission execution."""
    max_tokens: int = 100000
    max_api_calls: int = 100
    max_duration_seconds: int = 3600
    max_cost_usd: float = 10.0
    tokens_used: int = 0
    api_calls_used: int = 0
    cost_incurred_usd: float = 0.0


@dataclass
class HumanOversightRequirements:
    """Human oversight configuration."""
    require_approval_before_start: bool = False
    require_approval_for_high_risk: bool = True
    require_approval_for_external_actions: bool = True
    approval_timeout_seconds: int = 3600
    escalation_contacts: list[str] = field(default_factory=list)


@dataclass
class CapabilityPermission:
    """Permission for a specific capability."""
    capability_id: str
    granted: bool = True
    max_invocations: int | None = None
    requires_approval: bool = False
    data_classification_limit: DataClassification = DataClassification.INTERNAL


@dataclass
class MissionAuthority:
    """Authority boundaries for mission execution."""
    permitted_capabilities: list[CapabilityPermission] = field(default_factory=list)
    permitted_data_classifications: list[DataClassification] = field(
        default_factory=lambda: [DataClassification.PUBLIC, DataClassification.INTERNAL]
    )
    can_spawn_child_agents: bool = False
    max_child_agents: int = 0
    can_access_external_systems: bool = False
    permitted_external_domains: list[str] = field(default_factory=list)


@dataclass
class MissionContract:
    """The primary governed object that supersedes the agent."""
    id: str = field(default_factory=new_mission_id)
    trace_id: str = field(default_factory=lambda: str(ULID()))
    tenant_id: str = "default"
    objective: str = ""
    context: dict[str, Any] = field(default_factory=dict)
    success_criteria: list[str] = field(default_factory=list)
    workflow_mode: WorkflowMode = WorkflowMode.DYNAMIC
    static_workflow_definition: dict[str, Any] | None = None
    risk_classification: RiskClassification = RiskClassification.MODERATE
    authority: MissionAuthority = field(default_factory=MissionAuthority)
    budget: BudgetConstraints = field(default_factory=BudgetConstraints)
    human_oversight: HumanOversightRequirements = field(default_factory=HumanOversightRequirements)
    status: MissionStatus = MissionStatus.PENDING
    created_at: datetime = field(default_factory=now_utc)
    created_by: str = "system"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    policy_version: str = "1.0.0"
    contract_hash: str = ""

    def __post_init__(self):
        if not self.contract_hash:
            self.contract_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        content = {"objective": self.objective, "risk": self.risk_classification, "policy": self.policy_version}
        return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()[:16]

    def is_budget_exceeded(self) -> bool:
        return (self.budget.tokens_used >= self.budget.max_tokens or
                self.budget.api_calls_used >= self.budget.max_api_calls or
                self.budget.cost_incurred_usd >= self.budget.max_cost_usd)

    def record_usage(self, tokens: int = 0, api_calls: int = 0, cost_usd: float = 0.0):
        self.budget.tokens_used += tokens
        self.budget.api_calls_used += api_calls
        self.budget.cost_incurred_usd += cost_usd

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "trace_id": self.trace_id, "tenant_id": self.tenant_id,
            "objective": self.objective, "context": self.context, "success_criteria": self.success_criteria,
            "workflow_mode": self.workflow_mode.value, "risk_classification": self.risk_classification.value,
            "status": self.status.value,
            "budget": {"max_tokens": self.budget.max_tokens, "tokens_used": self.budget.tokens_used,
                       "max_api_calls": self.budget.max_api_calls, "api_calls_used": self.budget.api_calls_used},
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "policy_version": self.policy_version, "contract_hash": self.contract_hash,
        }
