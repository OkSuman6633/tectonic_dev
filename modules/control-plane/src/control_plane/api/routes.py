"""API routes for the Control Plane."""
from fastapi import APIRouter, HTTPException
from typing import Any

from .schemas import MissionRequest, MissionResponse, ExecutionResult
from ..domain.enums import RiskClassification, WorkflowMode
from ..domain.mission_contract import MissionContract, BudgetConstraints

router = APIRouter(prefix="/api/v1", tags=["missions"])


@router.post("/missions", response_model=MissionResponse)
async def create_mission(request: MissionRequest) -> MissionResponse:
    """Create and execute a new mission."""
    from ..main import get_orchestrator
    
    orchestrator = get_orchestrator()
    
    contract = MissionContract(
        objective=request.objective,
        context=request.context,
        risk_classification=RiskClassification(request.risk_classification),
        workflow_mode=WorkflowMode(request.workflow_mode),
        static_workflow_definition=request.static_workflow,
        budget=BudgetConstraints(
            max_tokens=request.max_tokens,
            max_api_calls=request.max_api_calls,
        ),
    )
    
    # Start mission execution (non-blocking for real-time updates)
    import asyncio
    asyncio.create_task(orchestrator.execute_mission(contract))
    
    return MissionResponse(
        mission_id=contract.id,
        status="started",
        message="Mission created and execution started. Connect to WebSocket for real-time updates.",
    )


@router.get("/missions/{mission_id}")
async def get_mission(mission_id: str) -> dict[str, Any]:
    """Get mission status and details."""
    from ..main import get_orchestrator
    
    orchestrator = get_orchestrator()
    mission = orchestrator.get_mission(mission_id)
    
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    graph = orchestrator.get_graph(mission_id)
    
    return {
        "mission": mission.to_dict(),
        "graph": graph.to_dict() if graph else None,
    }


@router.post("/missions/{mission_id}/kill")
async def kill_mission(mission_id: str) -> dict[str, str]:
    """Activate kill switch for a mission."""
    from ..main import get_orchestrator
    
    orchestrator = get_orchestrator()
    orchestrator.kill_mission(mission_id)
    
    return {"status": "kill_switch_activated", "mission_id": mission_id}


@router.get("/capabilities")
async def list_capabilities() -> list[dict[str, Any]]:
    """List all registered capabilities."""
    from ..main import get_orchestrator
    return get_orchestrator().trust_registry.list_capabilities()


@router.get("/evidence/{mission_id}")
async def get_evidence_pack(mission_id: str) -> dict[str, Any]:
    """Get evidence pack for a mission."""
    from ..main import get_orchestrator
    return get_orchestrator().evidence_fabric.get_mission_evidence_pack(mission_id)


@router.get("/missions/{mission_id}/report")
async def get_mission_report(mission_id: str) -> dict[str, Any]:
    """Get full mission report with all outputs and thinking."""
    from ..main import get_orchestrator
    from fastapi.responses import JSONResponse
    import json
    from datetime import datetime
    
    orchestrator = get_orchestrator()
    mission = orchestrator.get_mission(mission_id)
    
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    graph = orchestrator.get_graph(mission_id)
    evidence = orchestrator.evidence_fabric.get_mission_evidence_pack(mission_id)
    
    # Compile full report
    report = {
        "title": f"Mission Report: {mission.objective[:50]}...",
        "generated_at": datetime.now().isoformat(),
        "mission": {
            "id": mission.id,
            "objective": mission.objective,
            "status": mission.status.value,
            "risk_classification": mission.risk_classification.value,
            "created_at": mission.created_at.isoformat() if mission.created_at else None,
            "completed_at": mission.completed_at.isoformat() if mission.completed_at else None,
            "budget_used": {
                "tokens": mission.budget.tokens_used,
                "max_tokens": mission.budget.max_tokens,
                "api_calls": mission.budget.api_calls_used,
                "max_api_calls": mission.budget.max_api_calls,
            }
        },
        "tasks": [],
        "summary": "",
    }
    
    if graph:
        final_output = ""
        for task in graph.tasks:
            task_report = {
                "id": task.id,
                "name": task.name,
                "description": task.description,
                "status": task.status.value,
                "risk": task.risk_classification.value,
                "output": None,
                "thinking": None,
                "execution": None,
            }
            if task.output_data:
                task_report["output"] = task.output_data.get("output", "")
                task_report["thinking"] = task.output_data.get("thinking", "")
                task_report["execution"] = task.output_data.get("execution", "")
                final_output = task.output_data.get("output", final_output)
            report["tasks"].append(task_report)
        
        report["summary"] = final_output
    
    report["evidence_count"] = len(evidence.get("events", []))
    
    return report


@router.get("/missions/{mission_id}/download")
async def download_mission_report(mission_id: str):
    """Download mission report as JSON file."""
    from fastapi.responses import Response
    import json
    
    # Get the report data
    report = await get_mission_report(mission_id)
    
    # Convert to JSON string with nice formatting
    report_json = json.dumps(report, indent=2, default=str)
    
    # Return as downloadable file
    return Response(
        content=report_json,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=mission_report_{mission_id}.json"
        }
    )
