"""Risk Engine & Continuous Authorization."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, UTC
from typing import Any

from ..domain.enums import AuthorizationOutcome, RiskClassification, CapabilityTier, EventType
from ..domain.mission_contract import MissionContract
from ..domain.trust_registry import TrustRegistry, CapabilityDefinition
from ..domain.evidence_fabric import EvidenceFabric, EvidenceEvent


@dataclass
class AuthorizationRequest:
    mission_id: str
    agent_id: str
    capability_id: str
    input_data: dict[str, Any]
    trace_id: str


@dataclass
class AuthorizationDecision:
    outcome: AuthorizationOutcome
    capability_id: str
    rationale: str
    conditions: list[str] | None = None


class RiskEngine:
    """Continuous authorization and risk assessment engine."""
    
    def __init__(self, trust_registry: TrustRegistry, evidence_fabric: EvidenceFabric):
        self.trust_registry = trust_registry
        self.evidence_fabric = evidence_fabric
        self._rate_limits: dict[str, list[datetime]] = {}

    def evaluate_authorization(self, request: AuthorizationRequest, 
                                contract: MissionContract) -> AuthorizationDecision:
        capability = self.trust_registry.get_capability(request.capability_id)
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.AUTHORIZATION_REQUESTED, trace_id=request.trace_id,
            mission_id=request.mission_id, agent_id=request.agent_id,
            payload={"capability_id": request.capability_id},
        ))
        
        if not capability:
            return self._deny(request, "Capability not found")
        if not self.trust_registry.is_capability_approved(request.capability_id):
            return self._deny(request, "Capability not approved")
        if contract.is_budget_exceeded():
            return self._deny(request, "Budget exceeded")
        if not self._check_rate_limit(request.agent_id, capability):
            return self._deny(request, "Rate limit exceeded")
        if not self._is_risk_compatible(capability, contract):
            if contract.human_oversight.require_approval_for_high_risk:
                return self._require_approval(request, "High-risk requires approval")
            return self._deny(request, "Risk exceeds authority")
        if capability.requires_explicit_approval:
            return self._require_approval(request, "Explicit approval required")
        
        return self._allow(request, "All checks passed")

    def _check_rate_limit(self, agent_id: str, capability: CapabilityDefinition) -> bool:
        now = datetime.now(UTC)
        key = f"{agent_id}:{capability.id}"
        if key not in self._rate_limits:
            self._rate_limits[key] = []
        one_min_ago = now.timestamp() - 60
        self._rate_limits[key] = [ts for ts in self._rate_limits[key] if ts.timestamp() > one_min_ago]
        if len(self._rate_limits[key]) >= capability.rate_limit_per_minute:
            return False
        self._rate_limits[key].append(now)
        return True

    def _is_risk_compatible(self, cap: CapabilityDefinition, contract: MissionContract) -> bool:
        tier_map = {CapabilityTier.TIER_1_SAFE: 0, CapabilityTier.TIER_2_MODERATE: 1,
                    CapabilityTier.TIER_3_ELEVATED: 2, CapabilityTier.TIER_4_CRITICAL: 3}
        risk_map = {RiskClassification.LOW: 0, RiskClassification.MODERATE: 1,
                    RiskClassification.HIGH: 2, RiskClassification.CRITICAL: 3}
        return tier_map.get(cap.tier, 2) <= risk_map.get(contract.risk_classification, 1)

    def _allow(self, req: AuthorizationRequest, rationale: str) -> AuthorizationDecision:
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.AUTHORIZATION_GRANTED, trace_id=req.trace_id,
            mission_id=req.mission_id, agent_id=req.agent_id, decision_rationale=rationale,
        ))
        return AuthorizationDecision(AuthorizationOutcome.ALLOW, req.capability_id, rationale)

    def _deny(self, req: AuthorizationRequest, rationale: str) -> AuthorizationDecision:
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.AUTHORIZATION_DENIED, trace_id=req.trace_id,
            mission_id=req.mission_id, agent_id=req.agent_id, decision_rationale=rationale,
            severity="warning",
        ))
        return AuthorizationDecision(AuthorizationOutcome.DENY, req.capability_id, rationale)

    def _require_approval(self, req: AuthorizationRequest, rationale: str) -> AuthorizationDecision:
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.AUTHORIZATION_ESCALATED, trace_id=req.trace_id,
            mission_id=req.mission_id, agent_id=req.agent_id, decision_rationale=rationale,
        ))
        return AuthorizationDecision(AuthorizationOutcome.REQUIRE_APPROVAL, req.capability_id, rationale)
