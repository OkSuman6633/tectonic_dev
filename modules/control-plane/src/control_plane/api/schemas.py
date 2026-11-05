"""Pydantic schemas for API."""
from pydantic import BaseModel, Field
from typing import Any


class MissionRequest(BaseModel):
    objective: str = Field(..., description="Mission objective")
    context: dict[str, Any] = Field(default_factory=dict)
    risk_classification: str = Field(default="moderate")
    workflow_mode: str = Field(default="dynamic")
    static_workflow: dict[str, Any] | None = None
    max_tokens: int = Field(default=100000)
    max_api_calls: int = Field(default=100)


class MissionResponse(BaseModel):
    mission_id: str
    status: str
    message: str


class ExecutionResult(BaseModel):
    mission_id: str
    status: str
    results: dict[str, Any]
    budget_used: dict[str, Any]
    evidence_pack: dict[str, Any]
