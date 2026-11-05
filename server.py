"""Backend entrypoint: the ADK API server plus the Command Center telemetry WebSocket.

Replaces ``adk api_server`` — same routes (/run, /run_sse, /apps/...) on the same port, with a
global TelemetryPlugin attached to every agent run and ``/ws/telemetry`` streaming its events.
The shared core modules (tectonic_runtime) stream their activity on the same socket.

    python server.py            # http://127.0.0.1:8000, ws://127.0.0.1:8000/ws/telemetry
"""

import asyncio
import gc
import os
from pathlib import Path

import uvicorn
from fastapi import Body, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.cli.utils._nested_agent_loader import NestedAgentLoader

from agent_builder import directory, editor, studio_api
from agent_builder.telemetry import hub
from agent_builder.telemetry import router as telemetry_router
from tectonic_runtime import bus as module_bus
from tectonic_runtime import CallContext, get_runtime
from tectonic_runtime.simulation import is_running, run_office_simulation

PROJECT_ROOT = Path(__file__).resolve().parent
HOST = os.getenv("AGENT_BUILDER_HOST", "127.0.0.1")
PORT = int(os.getenv("AGENT_BUILDER_PORT", "8000"))
FRONTEND_DIR = PROJECT_ROOT / "frontend" / "dist"

# Get allowed origins from environment or use defaults
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
# Add wildcard for Cloud Run deployments
if os.getenv("K_SERVICE"):  # Cloud Run sets this environment variable
    ALLOWED_ORIGINS.append("*")

agent_loader = NestedAgentLoader(str(PROJECT_ROOT))
app = get_fast_api_app(
    agents_dir=str(PROJECT_ROOT),
    # Generated agents are addressed by dotted path (generated_agents.<project>.<project>). With
    # web=False ADK defaults to the flat AgentLoader, which rejects dots; the nested loader accepts them.
    agent_loader=agent_loader,
    web=False,
    host=HOST,
    port=PORT,
    allow_origins=ALLOWED_ORIGINS,
    # workspace first: it binds the signed-in user that telemetry and the Builder's tools rely on
    extra_plugins=["agent_builder.workspace.workspace_plugin", "agent_builder.attachments.attachment_plugin",
                   "agent_builder.telemetry.telemetry_plugin"],
)
app.include_router(telemetry_router)
# Sign-in (TECTONIC_AUTH=off for a single-user Studio) and each user's own agents under /api/system.
studio_api.install(app)

# --- API routes for environment configuration (replaces vite plugin in production) ---
@app.get("/api/env")
async def get_env():
    """Return environment configuration status."""
    google_key = os.getenv("GOOGLE_API_KEY", "")
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    raw_key = google_key or gemini_key
    return {
        "hasKey": len(raw_key) > 0,
        # The server's key is shared infrastructure: only admins may read it.
        "apiKey": raw_key if studio_api.current_user_info()["admin"] else "",
        "model": model,
        "envExists": True
    }

@app.post("/api/env")
async def set_env(body: dict = Body(...)):
    """In production, env vars are set via Secret Manager, so this is a no-op."""
    return {"success": True, "message": "Environment variables are managed via GCP Secret Manager"}


def _forward_module_event(event: dict) -> None:
    payload = {k: v for k, v in event.items() if k not in ("type", "timestamp")}
    hub.emit(event["type"], **payload)


module_bus.subscribe(_forward_module_event)
runtime = get_runtime()  # registers every module (state "offline" until first use)
_background: set[asyncio.Task] = set()

# Audit trail: agent telemetry comes from the hub (module events reach it directly off the bus).
_audit = runtime.module("auditability")
hub.add_listener(lambda event: None if event.get("type", "").startswith("MODULE_") else _audit.observe(event))  # type: ignore[attr-defined]

# The Command Center UI acts as the platform operator: admin-equivalent, separately attributed.
OPERATOR = CallContext(agent_id="operator", role="operator", session_id="command-center")


@app.post("/modules/{module}/{operation}")
async def invoke_module(module: str, operation: str, payload: dict = Body(default_factory=dict)) -> dict:
    if module not in runtime.modules:
        raise HTTPException(404, f"unknown module {module!r}")
    result = await runtime.invoke(module, operation, payload, OPERATOR)
    return result.to_dict()


@app.on_event("shutdown")
async def _flush_state() -> None:
    await _audit.flush()  # type: ignore[attr-defined]
    finops = runtime.module("finops")
    if getattr(finops, "repository", None) is not None:
        finops.repository.flush()  # type: ignore[attr-defined]


@app.get("/modules")
async def list_modules() -> dict:
    return {"modules": runtime.describe(), "simulation_running": is_running()}


@app.post("/modules/simulate")
async def simulate_office() -> dict:
    if is_running():
        return {"status": "already_running"}
    task = asyncio.create_task(run_office_simulation(runtime, agent_events=hub.emit))
    _background.add(task)
    task.add_done_callback(_background.discard)
    return {"status": "started"}


# --- Agent directory: every agent reachable from the Builder chat, and deletable -------------------
def _evict_app(app_name: str) -> None:
    """Drop a generated app's cached agent and runner so its next run loads the code on disk."""
    agent_loader.remove_agent_from_cache(app_name)
    # get_fast_api_app does not expose its ApiServer; the runner cache lives on that single instance.
    from google.adk.cli.api_server import ApiServer

    for server in (o for o in gc.get_objects() if isinstance(o, ApiServer)):
        server.runners_to_clean.add(app_name)


directory.on_evict(_evict_app)


@app.get("/directory/agents")
async def directory_agents() -> dict:
    return {"agents": directory.list_entries()}


@app.post("/directory/chat")
async def directory_chat(body: dict = Body(...)) -> dict:
    try:
        from agent_builder.attachments import parts_from_upload

        return await directory.run_agent(str(body.get("target", "")), str(body.get("message", "")),
                                         session_key=str(body.get("session_key") or "studio"),
                                         attachments=parts_from_upload(body.get("attachments")))
    except directory.DirectoryError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/directory/edit")
async def directory_edit(body: dict = Body(...)) -> dict:
    """Conversational edit of a generated agent: {target, request, session_key} → summary, diffs, status."""
    try:
        return await editor.edit_agent(str(body.get("target", "")), str(body.get("request", "")),
                                       session_key=str(body.get("session_key") or "studio"))
    except directory.DirectoryError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/directory/edit/undo")
async def directory_edit_undo(body: dict = Body(...)) -> dict:
    try:
        return await editor.undo_last_edit(str(body.get("target", "")))
    except directory.DirectoryError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/directory/edits/{target:path}")
async def directory_edits(target: str) -> dict:
    try:
        return editor.list_edits(target)
    except directory.DirectoryError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.delete("/directory/agents/{target:path}")
async def directory_delete(target: str) -> dict:
    try:
        return await directory.delete_agent(target)
    except directory.DirectoryError as exc:
        raise HTTPException(400, str(exc)) from exc


# --- Static file serving for production (serves built frontend) ---
# This must be AFTER all API routes to not interfere with them
if FRONTEND_DIR.exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="static-assets")
    
    # Serve other static files from frontend dist
    @app.get("/{full_path:path}")
    async def serve_frontend(request: Request, full_path: str):
        """Serve frontend files. Falls back to index.html for SPA routing."""
        # Skip API routes
        if full_path.startswith(("api/", "ws/", "run", "apps/", "list-apps", "directory/", "modules")):
            raise HTTPException(404, "Not found")
        
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # For SPA routing, return index.html
        index_path = FRONTEND_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        
        raise HTTPException(404, "Frontend not built")


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
