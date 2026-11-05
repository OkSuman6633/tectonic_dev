"""Governed Capability Trust Registry - Stores available tools and MCP servers."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any, Callable
from ulid import ULID

from .enums import CapabilityTier, DataClassification, RiskClassification


@dataclass
class CapabilityDefinition:
    """A registered capability (tool, MCP server, or action)."""
    id: str
    name: str
    description: str
    tier: CapabilityTier = CapabilityTier.TIER_2_MODERATE
    data_classification: DataClassification = DataClassification.INTERNAL
    requires_explicit_approval: bool = False
    max_risk_classification: RiskClassification = RiskClassification.HIGH
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)
    handler: Callable[..., Any] | None = None
    is_enabled: bool = True
    rate_limit_per_minute: int = 60
    registered_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass  
class MCPServerDefinition:
    """A registered MCP (Model Context Protocol) server."""
    id: str
    name: str
    endpoint: str
    tier: CapabilityTier = CapabilityTier.TIER_2_MODERATE
    data_classification: DataClassification = DataClassification.INTERNAL
    capabilities: list[str] = field(default_factory=list)
    is_enabled: bool = True
    health_check_url: str | None = None


class TrustRegistry:
    """Registry pattern for available tools and MCP servers."""
    
    def __init__(self):
        self._capabilities: dict[str, CapabilityDefinition] = {}
        self._mcp_servers: dict[str, MCPServerDefinition] = {}
        self._approval_status: dict[str, bool] = {}  # capability_id -> approved
        
    def register_capability(self, capability: CapabilityDefinition) -> None:
        """Register a capability in the trust registry."""
        self._capabilities[capability.id] = capability
        self._approval_status[capability.id] = not capability.requires_explicit_approval
        
    def register_mcp_server(self, server: MCPServerDefinition) -> None:
        """Register an MCP server."""
        self._mcp_servers[server.id] = server
        
    def get_capability(self, capability_id: str) -> CapabilityDefinition | None:
        """Get a capability by ID."""
        return self._capabilities.get(capability_id)
    
    def get_approved_capabilities(self, max_tier: CapabilityTier | None = None,
                                  max_data_class: DataClassification | None = None) -> list[CapabilityDefinition]:
        """Get all approved capabilities, optionally filtered."""
        result = []
        tier_order = [CapabilityTier.TIER_1_SAFE, CapabilityTier.TIER_2_MODERATE, 
                      CapabilityTier.TIER_3_ELEVATED, CapabilityTier.TIER_4_CRITICAL]
        data_order = [DataClassification.PUBLIC, DataClassification.INTERNAL,
                      DataClassification.CONFIDENTIAL, DataClassification.RESTRICTED]
        
        for cap_id, cap in self._capabilities.items():
            if not cap.is_enabled or not self._approval_status.get(cap_id, False):
                continue
            if max_tier and tier_order.index(cap.tier) > tier_order.index(max_tier):
                continue
            if max_data_class and data_order.index(cap.data_classification) > data_order.index(max_data_class):
                continue
            result.append(cap)
        return result
    
    def is_capability_approved(self, capability_id: str) -> bool:
        """Check if a capability is approved for use."""
        return self._approval_status.get(capability_id, False)
    
    def approve_capability(self, capability_id: str) -> bool:
        """Explicitly approve a capability."""
        if capability_id in self._capabilities:
            self._approval_status[capability_id] = True
            return True
        return False
    
    def revoke_capability(self, capability_id: str) -> bool:
        """Revoke approval for a capability."""
        if capability_id in self._capabilities:
            self._approval_status[capability_id] = False
            return True
        return False
    
    def list_capabilities(self) -> list[dict[str, Any]]:
        """List all capabilities with their status."""
        return [
            {"id": c.id, "name": c.name, "tier": c.tier.value, 
             "data_classification": c.data_classification.value,
             "approved": self._approval_status.get(c.id, False), "enabled": c.is_enabled}
            for c in self._capabilities.values()
        ]
