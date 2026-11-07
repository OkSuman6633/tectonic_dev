"""Studio HTTP API shared by both servers (server.py locally, server_full.py on Cloud Run).

* ``/auth/*``: sign-in (see auth.py). Sign-in is on by default; ``TECTONIC_AUTH=off`` runs a single-user
  Studio without accounts (the frontend then skips the login screen).
* ``/api/system/agents/*``: the signed-in user's generated agents, their files and their ``.env``.

``install(app)`` adds both routers and, with sign-in on, the request gate that confines every call to the
caller's own workspace.
"""

from __future__ import annotations

import datetime
import os
import re
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

from . import auth
from .tools.file_manager import resolve_safe_path
from .workspace import current_user, module_prefix, output_dir

router = APIRouter()
_AGENT_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,80}$")
_LOCAL_USER = {"id": None, "username": "local", "admin": True}


def auth_enabled() -> bool:
    return os.getenv("TECTONIC_AUTH", "on").strip().lower() not in ("off", "0", "false", "no")


def install(app) -> None:
    from . import model_settings  # noqa: F401  (registers each user's own Builder model)

    app.include_router(router)
    if auth_enabled():
        app.add_middleware(auth.AuthMiddleware,
                           list_apps=lambda: [f"{module_prefix()}.{d.name}.{d.name}" for d in own_projects()])


def current_user_info() -> dict:
    """The signed-in user (with sign-in off: a local admin)."""
    if not auth_enabled():
        return _LOCAL_USER
    user = auth.get_user(current_user() or "")
    if user is None:
        raise HTTPException(401, "Sign in required")
    return user


def own_projects() -> list[Path]:
    """The signed-in user's generated projects, newest first."""
    root = output_dir()
    if not root.exists():
        return []
    found = [d for d in root.iterdir()
             if d.is_dir() and not d.name.startswith((".", "_")) and (d / d.name / "agent.py").exists()]
    return sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)


def own_project(name: str) -> Path:
    """A project folder of the signed-in user (never a path outside their workspace)."""
    if not _AGENT_NAME.match(name or ""):
        raise HTTPException(400, "Invalid agent name")
    d = output_dir() / name
    if not d.is_dir():
        raise HTTPException(404, f"Agent '{name}' not found")
    return d


def _server_key() -> bool:
    return bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))


# --- accounts ------------------------------------------------------------------------------------
@router.get("/auth/config")
async def auth_config():
    return {"auth": auth_enabled()}


@router.post("/auth/register")
async def auth_register(body: dict = Body(...)):
    try:
        user = auth.register(str(body.get("username", "")), str(body.get("password", "")))
    except auth.AuthError as exc:
        raise HTTPException(400, str(exc))
    return {"token": auth.issue_token(user), "user": user}


@router.post("/auth/login")
async def auth_login(body: dict = Body(...)):
    try:
        user = auth.login(str(body.get("username", "")), str(body.get("password", "")))
    except auth.AuthError as exc:
        raise HTTPException(401, str(exc))
    return {"token": auth.issue_token(user), "user": user}


@router.get("/auth/me")
async def auth_me():
    return {"user": current_user_info()}


# --- the Builder's model ------------------------------------------------------------------------
@router.get("/studio/settings")
async def studio_settings():
    """This user's mode (default | custom), the model and key actually in use (masked), their saved override
    (masked) and the platform default."""
    from . import model_settings

    return model_settings.status(admin=current_user_info()["admin"])


async def _settings_call(call):
    from . import model_settings

    try:
        return await call(model_settings, current_user_info()["admin"])
    except model_settings.SettingsError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/studio/settings")
async def studio_settings_update(body: dict = Body(...)):
    """{model, anthropic_api_key?, google_api_key?}: the platform default, for every user (admin; not on Cloud Run)."""
    return await _settings_call(lambda ms, admin: ms.apply_default(
        str(body.get("model", "")), body.get("anthropic_api_key"), body.get("google_api_key"), admin=admin))


@router.put("/studio/settings/custom")
async def studio_custom_save(body: dict = Body(...)):
    """{model, api_key?}: overwrite this user's one custom override and switch to it."""
    return await _settings_call(lambda ms, admin: ms.save_custom(str(body.get("model", "")), body.get("api_key"), admin=admin))


@router.delete("/studio/settings/custom")
async def studio_custom_clear():
    """Delete this user's override (model and key) and return to the platform default."""
    return await _settings_call(lambda ms, admin: ms.clear_custom(admin=admin))


@router.post("/studio/settings/mode")
async def studio_mode(body: dict = Body(...)):
    """{mode: "default" | "custom"}: toggle without losing the saved override."""
    return await _settings_call(lambda ms, admin: ms.set_mode(str(body.get("mode", "")), admin=admin))


# --- the user's generated agents -----------------------------------------------------------------
@router.get("/api/system/agents")
async def list_system_agents():
    """CreatedAgent[]: { name, appName, path, files, promptPreview, hasAgentPy, lastModified }."""
    agents = []
    for d in own_projects():
        ap = d / d.name / "agent.py"
        agents.append({
            "name": d.name,
            "appName": f"{module_prefix()}.{d.name}.{d.name}",  # ADK dotted path
            "path": f"generated_agents/{d.name}",  # never expose the server's folder layout
            "files": [str(f.relative_to(d)).replace("\\", "/") for f in d.rglob("*.py") if f.is_file()],
            "promptPreview": "",
            "hasAgentPy": True,
            "lastModified": datetime.datetime.fromtimestamp(ap.stat().st_mtime).isoformat(),
        })
    return {"agents": agents}


@router.get("/api/system/agents/{name}/files")
async def get_agent_files(name: str):
    d = own_project(name)
    files = {}
    for f in d.rglob("*"):
        if f.is_file() and not f.name.startswith(".") and "__pycache__" not in f.parts:
            try:
                files[str(f.relative_to(d)).replace("\\", "/")] = f.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                pass  # binary files
    return {"files": files}


@router.post("/api/system/agents/{name}/files")
async def save_agent_file(name: str, body: dict = Body(...)):
    d = own_project(name)
    fp, content = body.get("filePath"), body.get("content")
    if not fp or content is None:
        raise HTTPException(400, "filePath and content required")
    try:
        full = resolve_safe_path(str(fp), base=d)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    return {"success": True, "message": f"Saved {fp}"}


@router.get("/api/system/agents/{name}/env")
async def get_agent_env(name: str):
    """AgentEnvConfig: { agentName, hasKey, apiKey, model, agentEnvExists, envPath }.
    Without its own key an agent runs on the server's key, which is never sent to the browser."""
    env_path = own_project(name) / ".env"
    key, model = "", "gemini-3.6-flash"
    if env_path.exists():
        txt = env_path.read_text(encoding="utf-8")
        gk = re.search(r"^(?:GOOGLE|GEMINI)_API_KEY=(.*)$", txt, re.MULTILINE)
        mk = re.search(r"^GEMINI_MODEL=(.*)$", txt, re.MULTILINE)
        key = gk.group(1).strip() if gk else ""
        model = mk.group(1).strip() if mk else model
    if key and key == (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")):
        key = ""  # projects generated before this fix carry the server's own key: never hand it out
    return {"agentName": name, "hasKey": bool(key) or _server_key(), "apiKey": key, "model": model,
            "agentEnvExists": env_path.exists(), "envPath": f"generated_agents/{name}/.env"}


@router.post("/api/system/agents/{name}/env")
async def save_agent_env(name: str, body: dict = Body(...)):
    d = own_project(name)
    key = (body.get("apiKey") or "").strip()
    model = (body.get("model") or "gemini-3.6-flash").strip()
    if not key:
        raise HTTPException(400, "apiKey required")
    (d / ".env").write_text(f"GOOGLE_API_KEY={key}\nGEMINI_API_KEY={key}\nGEMINI_MODEL={model}\n", encoding="utf-8")
    return {"success": True, "message": f"Saved .env for {name}", "envPath": f"generated_agents/{name}/.env"}
