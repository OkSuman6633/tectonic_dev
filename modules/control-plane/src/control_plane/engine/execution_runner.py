"""Execution Graph Runner - Processes planned tasks."""
from __future__ import annotations
import asyncio
from datetime import datetime, UTC
from typing import Any, Callable

from ..domain.enums import EventType, TaskStatus, MissionStatus, RiskClassification
from ..domain.mission_contract import MissionContract
from ..domain.execution_graph import ExecutionGraph, TaskNode
from ..domain.evidence_fabric import EvidenceFabric, EvidenceEvent
from .agent_compiler import AgentCompiler
from .assurance_node import AssuranceNode


class ExecutionRunner:
    """Engine to process the execution graph."""
    
    def __init__(self, agent_compiler: AgentCompiler, assurance_node: AssuranceNode,
                 evidence_fabric: EvidenceFabric, on_event: Callable[[dict], Any] | None = None):
        self.agent_compiler = agent_compiler
        self.assurance_node = assurance_node
        self.evidence_fabric = evidence_fabric
        self.on_event = on_event
        self._kill_switch = False
    
    async def run(self, graph: ExecutionGraph, contract: MissionContract) -> dict[str, Any]:
        contract.status = MissionStatus.EXECUTING
        contract.started_at = datetime.now(UTC)
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.MISSION_EXECUTION_STARTED, trace_id=contract.trace_id,
            mission_id=contract.id, payload={"task_count": len(graph.tasks)},
        ))
        await self._notify({"type": "mission_started", "mission_id": contract.id})
        
        results: dict[str, Any] = {}
        while not graph.is_complete() and not graph.has_failed() and not self._kill_switch:
            if contract.is_budget_exceeded():
                self.evidence_fabric.emit(EvidenceEvent(
                    event_type=EventType.BUDGET_LIMIT_REACHED, trace_id=contract.trace_id,
                    mission_id=contract.id, severity="warning",
                ))
                break
            ready_tasks = graph.get_ready_tasks()
            if not ready_tasks:
                await asyncio.sleep(0.1)
                continue
            await asyncio.gather(*[self._execute_task(t, contract, results) for t in ready_tasks])
        
        self.agent_compiler.terminate_all(contract.id)
        if self._kill_switch:
            contract.status = MissionStatus.TERMINATED
        elif graph.has_failed():
            contract.status = MissionStatus.FAILED
        else:
            contract.status = MissionStatus.COMPLETED
        contract.completed_at = datetime.now(UTC)
        await self._notify({"type": "mission_completed", "mission_id": contract.id,
                           "status": contract.status.value})
        return results
    
    async def _execute_task(self, task: TaskNode, contract: MissionContract, results: dict) -> None:
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now(UTC)
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.TASK_STARTED, trace_id=contract.trace_id,
            mission_id=contract.id, task_id=task.id, payload={"name": task.name},
        ))
        await self._notify({"type": "task_started", "task_id": task.id, "name": task.name})
        
        # Create streaming callback for real-time thinking updates
        async def stream_callback(chunk_type: str, content: str):
            await self._notify({
                "type": "thinking_stream",
                "task_id": task.id,
                "task_name": task.name,
                "chunk_type": chunk_type,
                "content": content,
            })
        
        agent = self.agent_compiler.compile_agent(task, contract, on_stream=stream_callback)
        await self._notify({"type": "agent_compiled", "agent_id": agent.bom.id, "task_id": task.id})
        
        input_data = {"task": task.description, "context": contract.context}
        for dep_id in task.dependencies:
            if dep_id in results:
                input_data[f"dep_{dep_id}"] = results[dep_id]
        
        result = await agent.execute(input_data)
        contract.record_usage(tokens=agent.bom.tokens_consumed, api_calls=1)
        
        if task.risk_classification in (RiskClassification.HIGH, RiskClassification.CRITICAL):
            assurance = await self.assurance_node.validate_output(
                task.id, contract.id, contract.trace_id, result, input_data)
            if not assurance.passed:
                result["success"] = False
        
        if result.get("success"):
            task.status = TaskStatus.COMPLETED
            task.output_data = result
            results[task.id] = result.get("output")
        else:
            task.status = TaskStatus.FAILED
            task.error = result.get("error", "Failed")
        
        task.completed_at = datetime.now(UTC)
        agent.terminate()
        await self._notify({
            "type": "task_completed", 
            "task_id": task.id, 
            "name": task.name,
            "status": task.status.value,
            "output": result.get("output", ""),
            "thinking": result.get("thinking", ""),
            "execution": result.get("execution", ""),
            "full_response": result.get("full_response", ""),
            "tokens_used": agent.bom.tokens_consumed,
        })
    
    def activate_kill_switch(self):
        self._kill_switch = True
    
    async def _notify(self, event: dict):
        if self.on_event:
            try:
                if asyncio.iscoroutinefunction(self.on_event):
                    await self.on_event(event)
                else:
                    self.on_event(event)
            except Exception:
                pass

