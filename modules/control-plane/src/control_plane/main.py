"""FastAPI application with WebSocket support for real-time updates."""
from __future__ import annotations
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .orchestrator import TectonicOrchestrator
from .api.routes import router

# Configuration - Use environment variable for API key
# Supports both old format (AIza...) and new format (AQ....)
API_KEY = os.getenv("GOOGLE_API_KEY","")

# Global state
_orchestrator: TectonicOrchestrator | None = None
_websocket_clients: set[WebSocket] = set()


async def broadcast_event(event: dict[str, Any]):
    """Broadcast event to all connected WebSocket clients."""
    if not _websocket_clients:
        return
    message = json.dumps(event, default=str)
    disconnected = set()
    for ws in _websocket_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)
    _websocket_clients.difference_update(disconnected)


def get_orchestrator() -> TectonicOrchestrator:
    """Get the global orchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = TectonicOrchestrator(API_KEY, on_event=broadcast_event)
    return _orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    get_orchestrator()  # Initialize
    yield


app = FastAPI(
    title="Tectonic Control Plane",
    description="Governed Autonomous Execution Control Plane with JIT Agent Creation",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await websocket.accept()
    _websocket_clients.add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back for keepalive
            await websocket.send_text(json.dumps({"type": "ack", "data": data}))
    except WebSocketDisconnect:
        _websocket_clients.discard(websocket)


@app.get("/health")
async def health():
    orchestrator = get_orchestrator()
    is_mock = orchestrator.planner.use_mock
    return {
        "status": "healthy", 
        "service": "tectonic-control-plane",
        "mock_mode": is_mock,
        "api_key_configured": bool(API_KEY and len(API_KEY) >= 20),
        "model": "gemini-3.6-flash"
    }


# Serve static files (frontend)
static_path = os.path.join(os.path.dirname(__file__), "static")
react_app_path = os.path.join(static_path, "app")

# Mount React app if built
if os.path.exists(react_app_path):
    app.mount("/app", StaticFiles(directory=react_app_path, html=True), name="react-app")

# Mount legacy static files
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/")
async def root():
    """Serve the frontend - React app if available, otherwise legacy."""
    # Try React app first
    react_index = os.path.join(react_app_path, "index.html")
    if os.path.exists(react_index):
        return FileResponse(react_index)
    
    # Fallback to legacy
    legacy_index = os.path.join(static_path, "index.html")
    if os.path.exists(legacy_index):
        return FileResponse(legacy_index)
    
    return {"message": "Tectonic Control Plane API", "docs": "/docs"}


@app.get("/legacy")
async def legacy_ui():
    """Serve the legacy frontend."""
    legacy_index = os.path.join(static_path, "index.html")
    if os.path.exists(legacy_index):
        return FileResponse(legacy_index)
    return {"error": "Legacy UI not found"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
