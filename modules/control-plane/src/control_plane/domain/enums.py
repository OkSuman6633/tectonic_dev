"""Enumerations for the Control Plane domain."""
from __future__ import annotations
from enum import StrEnum


class RiskClassification(StrEnum):
    """Risk classification levels for mission contracts."""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class DataClassification(StrEnum):
    """Data sensitivity classification."""
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class AuthorizationOutcome(StrEnum):
    """Authorization decision outcomes."""
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"


class MissionStatus(StrEnum):
    """Mission execution status."""
    PENDING = "pending"
    PLANNING = "planning"
    EXECUTING = "executing"
    PAUSED_FOR_APPROVAL = "paused_for_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    TERMINATED = "terminated"
    QUARANTINED = "quarantined"


class TaskStatus(StrEnum):
    """Individual task execution status."""
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    AWAITING_VALIDATION = "awaiting_validation"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class AgentStatus(StrEnum):
    """Ephemeral agent lifecycle status."""
    COMPILING = "compiling"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"
    QUARANTINED = "quarantined"


class WorkflowMode(StrEnum):
    """Workflow execution mode."""
    STATIC = "static"
    DYNAMIC = "dynamic"


class EventType(StrEnum):
    """Evidence fabric event types."""
    # Mission lifecycle
    MISSION_CREATED = "mission.created"
    MISSION_PLANNING_STARTED = "mission.planning.started"
    MISSION_PLANNING_COMPLETED = "mission.planning.completed"
    MISSION_EXECUTION_STARTED = "mission.execution.started"
    MISSION_COMPLETED = "mission.completed"
    MISSION_FAILED = "mission.failed"
    MISSION_TERMINATED = "mission.terminated"
    
    # Task lifecycle
    TASK_CREATED = "task.created"
    TASK_STARTED = "task.started"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
    
    # Agent lifecycle
    AGENT_COMPILED = "agent.compiled"
    AGENT_ACTIVATED = "agent.activated"
    AGENT_TERMINATED = "agent.terminated"
    AGENT_QUARANTINED = "agent.quarantined"
    
    # Tool invocation
    TOOL_INVOCATION_REQUESTED = "tool.invocation.requested"
    TOOL_INVOCATION_AUTHORIZED = "tool.invocation.authorized"
    TOOL_INVOCATION_DENIED = "tool.invocation.denied"
    TOOL_INVOCATION_COMPLETED = "tool.invocation.completed"
    TOOL_INVOCATION_FAILED = "tool.invocation.failed"
    
    # Authorization
    AUTHORIZATION_REQUESTED = "authorization.requested"
    AUTHORIZATION_GRANTED = "authorization.granted"
    AUTHORIZATION_DENIED = "authorization.denied"
    AUTHORIZATION_ESCALATED = "authorization.escalated"
    
    # Assurance
    ASSURANCE_CHECK_STARTED = "assurance.check.started"
    ASSURANCE_CHECK_PASSED = "assurance.check.passed"
    ASSURANCE_CHECK_FAILED = "assurance.check.failed"
    
    # Safety
    KILL_SWITCH_ACTIVATED = "safety.kill_switch.activated"
    BUDGET_LIMIT_REACHED = "safety.budget_limit.reached"
    RATE_LIMIT_EXCEEDED = "safety.rate_limit.exceeded"


class CapabilityTier(StrEnum):
    """Capability risk tier in trust registry."""
    TIER_1_SAFE = "tier_1_safe"
    TIER_2_MODERATE = "tier_2_moderate"
    TIER_3_ELEVATED = "tier_3_elevated"
    TIER_4_CRITICAL = "tier_4_critical"
