"""Main Orchestrator - Coordinates all control plane components."""
from __future__ import annotations
import asyncio
from datetime import datetime, UTC
from typing import Any, Callable

from .domain.enums import EventType, MissionStatus, WorkflowMode, CapabilityTier
from .domain.mission_contract import MissionContract
from .domain.execution_graph import ExecutionGraph
from .domain.trust_registry import TrustRegistry, CapabilityDefinition
from .domain.evidence_fabric import EvidenceFabric, EvidenceEvent, get_evidence_fabric
from .engine.mission_planner import MissionPlanner
from .engine.agent_compiler import AgentCompiler
from .engine.execution_runner import ExecutionRunner
from .engine.assurance_node import AssuranceNode


class TectonicOrchestrator:
    """Main orchestrator for governed autonomous execution."""
    
    def __init__(self, api_key: str, on_event: Callable[[dict], Any] | None = None):
        self.api_key = api_key
        self.evidence_fabric = get_evidence_fabric()
        self.trust_registry = TrustRegistry()
        self.on_event = on_event
        
        # Initialize engine components
        self.planner = MissionPlanner(self.trust_registry, self.evidence_fabric, api_key)
        self.compiler = AgentCompiler(self.trust_registry, self.evidence_fabric, api_key)
        self.assurance = AssuranceNode(self.evidence_fabric, api_key)
        self.runner = ExecutionRunner(self.compiler, self.assurance, self.evidence_fabric, on_event)
        
        # Active missions
        self._missions: dict[str, MissionContract] = {}
        self._graphs: dict[str, ExecutionGraph] = {}
        
        # Register default capabilities
        self._register_default_capabilities()
    
    def _register_default_capabilities(self):
        """Register default tools in trust registry."""
        caps = [
            CapabilityDefinition(id="llm_reasoning", name="LLM Reasoning", 
                                description="Use LLM for reasoning and analysis",
                                tier=CapabilityTier.TIER_1_SAFE),
            CapabilityDefinition(id="web_search", name="Web Search",
                                description="Search the web for information",
                                tier=CapabilityTier.TIER_2_MODERATE),
            CapabilityDefinition(id="code_execution", name="Code Execution",
                                description="Execute code in sandbox",
                                tier=CapabilityTier.TIER_3_ELEVATED),
            CapabilityDefinition(id="file_write", name="File Write",
                                description="Write files to disk",
                                tier=CapabilityTier.TIER_3_ELEVATED),
            CapabilityDefinition(id="api_call", name="External API Call",
                                description="Make external API calls",
                                tier=CapabilityTier.TIER_2_MODERATE),
        ]
        for cap in caps:
            self.trust_registry.register_capability(cap)
            self.trust_registry.approve_capability(cap.id)
    
    async def execute_mission(self, contract: MissionContract) -> dict[str, Any]:
        """Execute a complete mission lifecycle."""
        self._missions[contract.id] = contract
        
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.MISSION_CREATED, trace_id=contract.trace_id,
            mission_id=contract.id, payload=contract.to_dict(),
        ))
        await self._notify({"type": "mission_created", "mission": contract.to_dict()})
        
        # Planning phase
        contract.status = MissionStatus.PLANNING
        await self._notify({"type": "mission_planning", "mission_id": contract.id})
        
        graph = await self.planner.create_plan(contract)
        self._graphs[contract.id] = graph
        await self._notify({"type": "plan_created", "mission_id": contract.id, 
                           "graph": graph.to_dict()})
        
        # Execution phase
        results = await self.runner.run(graph, contract)
        
        # Generate evidence pack
        evidence_pack = self.evidence_fabric.get_mission_evidence_pack(contract.id)
        
        return {
            "mission_id": contract.id, "status": contract.status.value,
            "results": results, "evidence_pack": evidence_pack,
            "budget_used": {"tokens": contract.budget.tokens_used,
                           "api_calls": contract.budget.api_calls_used},
        }
    
    def get_mission(self, mission_id: str) -> MissionContract | None:
        return self._missions.get(mission_id)
    
    def get_graph(self, mission_id: str) -> ExecutionGraph | None:
        return self._graphs.get(mission_id)
    
    def kill_mission(self, mission_id: str):
        """Activate kill switch for a mission."""
        self.runner.activate_kill_switch()
        self.compiler.terminate_all(mission_id)
    
    async def _notify(self, event: dict):
        if self.on_event:
            try:
                if asyncio.iscoroutinefunction(self.on_event):
                    await self.on_event(event)
                else:
                    self.on_event(event)
            except Exception:
                pass
