"""Mission Planner - Generates execution plans from Mission Contracts."""
from __future__ import annotations
import json
from datetime import datetime, UTC
from typing import Any

from ..domain.enums import EventType, TaskStatus, RiskClassification, WorkflowMode
from ..domain.mission_contract import MissionContract
from ..domain.execution_graph import ExecutionGraph, TaskNode
from ..domain.evidence_fabric import EvidenceFabric, EvidenceEvent
from ..domain.trust_registry import TrustRegistry


class MissionPlanner:
    """Plans mission execution by analyzing objectives and generating task graphs."""
    
    def __init__(self, trust_registry: TrustRegistry, evidence_fabric: EvidenceFabric,
                 api_key: str):
        self.trust_registry = trust_registry
        self.evidence_fabric = evidence_fabric
        self.api_key = api_key
        self.client = None
        # Support both old (AIza...) and new (AQ....) API key formats
        self.use_mock = not api_key or len(api_key) < 20
        
        if not self.use_mock:
            try:
                from google import genai
                self.client = genai.Client(api_key=api_key)
            except Exception:
                self.use_mock = True
    
    async def create_plan(self, contract: MissionContract) -> ExecutionGraph:
        """Create an execution plan for the mission."""
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.MISSION_PLANNING_STARTED,
            trace_id=contract.trace_id, mission_id=contract.id,
            payload={"objective": contract.objective},
        ))
        
        if contract.workflow_mode == WorkflowMode.STATIC:
            graph = self._create_static_plan(contract)
        else:
            graph = await self._create_dynamic_plan(contract)
        
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.MISSION_PLANNING_COMPLETED,
            trace_id=contract.trace_id, mission_id=contract.id,
            payload={"task_count": len(graph.tasks), "graph_id": graph.id},
        ))
        return graph
    
    def _create_static_plan(self, contract: MissionContract) -> ExecutionGraph:
        """Create plan from static workflow definition."""
        graph = ExecutionGraph(mission_id=contract.id)
        if not contract.static_workflow_definition:
            return graph
        
        for step in contract.static_workflow_definition.get("steps", []):
            task = TaskNode(
                id=step.get("id", f"task_{len(graph.tasks)}"),
                name=step.get("name", "Unnamed Task"),
                description=step.get("description", ""),
                required_capabilities=step.get("capabilities", []),
                dependencies=step.get("dependencies", []),
                risk_classification=RiskClassification(step.get("risk", "moderate")),
            )
            graph.add_task(task)
        return graph
    
    async def _create_dynamic_plan(self, contract: MissionContract) -> ExecutionGraph:
        """Use LLM to dynamically plan the mission."""
        
        # Use mock planning if no valid API key
        if self.use_mock:
            return self._create_mock_plan(contract)
        
        available_caps = self.trust_registry.list_capabilities()
        
        prompt = f"""You are a mission planner for an AI orchestration system.
Given the objective below, create a structured execution plan.

OBJECTIVE: {contract.objective}

CONTEXT: {json.dumps(contract.context)}

SUCCESS CRITERIA: {contract.success_criteria}

AVAILABLE CAPABILITIES (tools you can assign to tasks):
{json.dumps(available_caps, indent=2)}

CONSTRAINTS:
- Risk Classification: {contract.risk_classification.value}
- Max API Calls: {contract.budget.max_api_calls}
- Max Tokens: {contract.budget.max_tokens}

Create a JSON plan with this exact structure:
{{
  "tasks": [
    {{
      "id": "task_1",
      "name": "Task Name",
      "description": "What this task does",
      "required_capabilities": ["capability_id"],
      "dependencies": [],
      "risk": "low|moderate|high|critical",
      "estimated_tokens": 1000
    }}
  ]
}}

Return ONLY valid JSON, no markdown or explanation."""

        try:
            response = await self.client.aio.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt
            )
            plan_text = response.text.strip()
            if plan_text.startswith("```"):
                plan_text = plan_text.split("```")[1]
                if plan_text.startswith("json"):
                    plan_text = plan_text[4:]
            plan_data = json.loads(plan_text)
            
            # Build execution graph from LLM response
            graph = ExecutionGraph(mission_id=contract.id)
            for task_data in plan_data.get("tasks", []):
                task = TaskNode(
                    id=task_data.get("id", f"task_{len(graph.tasks)}"),
                    name=task_data.get("name", "Unnamed"),
                    description=task_data.get("description", ""),
                    required_capabilities=task_data.get("required_capabilities", []),
                    dependencies=task_data.get("dependencies", []),
                    risk_classification=RiskClassification(task_data.get("risk", "moderate")),
                    estimated_tokens=task_data.get("estimated_tokens", 1000),
                )
                graph.add_task(task)
            return graph
        except Exception as e:
            # Fallback to mock plan
            return self._create_mock_plan(contract)
    
    def _create_mock_plan(self, contract: MissionContract) -> ExecutionGraph:
        """Create a mock execution plan for demo purposes."""
        graph = ExecutionGraph(mission_id=contract.id)
        
        # Create intelligent mock tasks based on objective keywords
        objective_lower = contract.objective.lower()
        
        tasks = []
        if any(word in objective_lower for word in ["research", "analyze", "find", "search"]):
            tasks.append({"id": "task_1", "name": "Research & Analysis", 
                         "description": f"Research information about: {contract.objective}",
                         "capabilities": ["llm_reasoning", "web_search"], "deps": [], "risk": "low"})
            tasks.append({"id": "task_2", "name": "Synthesize Findings",
                         "description": "Compile and synthesize research findings",
                         "capabilities": ["llm_reasoning"], "deps": ["task_1"], "risk": "low"})
            tasks.append({"id": "task_3", "name": "Generate Report",
                         "description": "Create final report with recommendations",
                         "capabilities": ["llm_reasoning"], "deps": ["task_2"], "risk": "low"})
        elif any(word in objective_lower for word in ["write", "create", "generate", "compose"]):
            tasks.append({"id": "task_1", "name": "Understand Requirements",
                         "description": f"Analyze requirements for: {contract.objective}",
                         "capabilities": ["llm_reasoning"], "deps": [], "risk": "low"})
            tasks.append({"id": "task_2", "name": "Create Draft",
                         "description": "Generate initial draft content",
                         "capabilities": ["llm_reasoning"], "deps": ["task_1"], "risk": "low"})
            tasks.append({"id": "task_3", "name": "Review & Polish",
                         "description": "Review and finalize the content",
                         "capabilities": ["llm_reasoning"], "deps": ["task_2"], "risk": "low"})
        elif any(word in objective_lower for word in ["code", "build", "develop", "implement"]):
            tasks.append({"id": "task_1", "name": "Design Architecture",
                         "description": "Design the solution architecture",
                         "capabilities": ["llm_reasoning"], "deps": [], "risk": "moderate"})
            tasks.append({"id": "task_2", "name": "Implement Solution",
                         "description": "Write the code implementation",
                         "capabilities": ["llm_reasoning", "code_execution"], "deps": ["task_1"], "risk": "moderate"})
            tasks.append({"id": "task_3", "name": "Test & Validate",
                         "description": "Test and validate the implementation",
                         "capabilities": ["llm_reasoning", "code_execution"], "deps": ["task_2"], "risk": "moderate"})
        else:
            # Generic task breakdown
            tasks.append({"id": "task_1", "name": "Analyze Objective",
                         "description": f"Understand and analyze: {contract.objective}",
                         "capabilities": ["llm_reasoning"], "deps": [], "risk": "low"})
            tasks.append({"id": "task_2", "name": "Execute Task",
                         "description": "Execute the main objective",
                         "capabilities": ["llm_reasoning"], "deps": ["task_1"], "risk": "moderate"})
            tasks.append({"id": "task_3", "name": "Deliver Results",
                         "description": "Compile and deliver final results",
                         "capabilities": ["llm_reasoning"], "deps": ["task_2"], "risk": "low"})
        
        for t in tasks:
            task = TaskNode(
                id=t["id"], name=t["name"], description=t["description"],
                required_capabilities=t["capabilities"], dependencies=t["deps"],
                risk_classification=RiskClassification(t["risk"]),
            )
            graph.add_task(task)
        
        return graph
