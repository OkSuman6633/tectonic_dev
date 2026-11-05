"""Execution Graph - Task dependency graph for mission execution."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any
from ulid import ULID

from .enums import TaskStatus, RiskClassification


@dataclass
class TaskNode:
    """A task in the execution graph."""
    id: str = field(default_factory=lambda: f"task_{ULID()}")
    name: str = ""
    description: str = ""
    required_capabilities: list[str] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)  # task IDs
    risk_classification: RiskClassification = RiskClassification.MODERATE
    estimated_tokens: int = 1000
    timeout_seconds: int = 300
    requires_validation: bool = False
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent_id: str | None = None
    input_data: dict[str, Any] = field(default_factory=dict)
    output_data: dict[str, Any] | None = None
    error: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "required_capabilities": self.required_capabilities,
            "dependencies": self.dependencies,
            "risk_classification": self.risk_classification.value,
            "status": self.status.value, "assigned_agent_id": self.assigned_agent_id,
            "input_data": self.input_data, "output_data": self.output_data,
            "error": self.error,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass
class ExecutionGraph:
    """Dependency graph of tasks for mission execution."""
    id: str = field(default_factory=lambda: f"graph_{ULID()}")
    mission_id: str = ""
    tasks: list[TaskNode] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    
    def add_task(self, task: TaskNode) -> None:
        self.tasks.append(task)
        
    def get_task(self, task_id: str) -> TaskNode | None:
        for task in self.tasks:
            if task.id == task_id:
                return task
        return None
    
    def get_ready_tasks(self) -> list[TaskNode]:
        """Get tasks that are ready to execute (dependencies satisfied)."""
        completed_ids = {t.id for t in self.tasks if t.status == TaskStatus.COMPLETED}
        ready = []
        for task in self.tasks:
            if task.status != TaskStatus.PENDING:
                continue
            if all(dep in completed_ids for dep in task.dependencies):
                ready.append(task)
        return ready
    
    def is_complete(self) -> bool:
        return all(t.status in (TaskStatus.COMPLETED, TaskStatus.SKIPPED) for t in self.tasks)
    
    def has_failed(self) -> bool:
        return any(t.status == TaskStatus.FAILED for t in self.tasks)
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "mission_id": self.mission_id,
            "tasks": [t.to_dict() for t in self.tasks],
            "created_at": self.created_at.isoformat(),
            "is_complete": self.is_complete(), "has_failed": self.has_failed(),
        }
