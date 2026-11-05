"""Which model the Agent Builder runs on: chosen in the Studio, validated, applied live.

The choice covers the Builder and all its specialists (intent, requirements, agent cards, code
generator, idea provider, critics) and the agent editor.

* With sign-in, every user picks their own model (saved in the data folder, applied to their runs only);
  the provider API keys are shared by the whole server, so only an admin may change them.
* Without sign-in (a local Studio) the choice is the server default, saved to .env as before.

Keys are never returned in full: the Studio sees the first characters of the key the running model uses.
"""

from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path

import anthropic
from google.adk.models.base_llm import BaseLlm

from .shared_libraries.constants import MODEL, PROJECT_ROOT, build_model
from .shared_libraries.studio_model import claude_model_id, is_claude
from .workspace import current_user

ENV_PATH: Path = PROJECT_ROOT / ".env"

# Models offered in the Studio (any other model id can be typed in).
CATALOGUE = [
    {"id": "claude-opus-5-5", "provider": "anthropic", "label": "Claude Opus 5.5", "tag": "Recommended",
     "description": "Anthropic's default model: strongest for designing agents and writing their code."},
    {"id": "claude-sonnet-5-5", "provider": "anthropic", "label": "Claude Sonnet 5.5", "tag": "Balanced",
     "description": "Fast and capable for everyday building at half Opus's price."},
    {"id": "claude-haiku-5-5", "provider": "anthropic", "label": "Claude Haiku 5.5", "tag": "Fastest",
     "description": "Lowest cost and latency, for simple agents."},
    {"id": "claude-fable-5-1", "provider": "anthropic", "label": "Claude Fable 5.1", "tag": "Most capable",
     "description": "Anthropic's most capable model, for the hardest designs (premium price, longer turns)."},
    {"id": "gemini-3.6-flash", "provider": "google", "label": "Gemini 3.6 Flash", "tag": "Fast",
     "description": "Google's fast multimodal model."},
    {"id": "gemini-2.5-pro", "provider": "google", "label": "Gemini 2.5 Pro", "tag": "Reasoning",
     "description": "Google's reasoning model."},
    {"id": "gemini-2.5-flash", "provider": "google", "label": "Gemini 2.5 Flash", "tag": "Low latency",
     "description": "Google's low-latency model."},
]
_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/@-]{1,120}$")


class SettingsError(ValueError):
    """The requested settings cannot be applied (nothing was changed)."""


def provider_of(model: str) -> str:
    return "anthropic" if is_claude(model) else "google"


def _hint(key: str) -> str:
    """The first characters of a key: enough to tell which key it is, never enough to use it."""
    return f"{key[:6]}…" if key else ""


def _google_key() -> str:
    return os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")


def _key_in_use(delegate: BaseLlm) -> str:
    """The API key the live model client actually sends (not what .env says now)."""
    client = getattr(delegate, "client", None)  # Claude: the AsyncAnthropic it was built with
    if client is not None:
        return str(getattr(client, "api_key", "") or "")
    try:  # Gemini: the google-genai client resolves its key from the environment when first used
        return str(delegate.api_client._api_client.api_key or "")
    except Exception:
        return ""


# --- each user's own model (sign-in) ---------------------------------------------------------------
_choices: dict[str, tuple[BaseLlm, str]] = {}  # user id -> (built model, its name)
_prefs_lock = threading.Lock()


def _prefs_path() -> Path:
    from .auth import data_dir

    return data_dir() / "builder_models.json"


def _prefs() -> dict[str, str]:
    try:
        return json.loads(_prefs_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_pref(user: str, model: str) -> None:
    with _prefs_lock:
        prefs = _prefs()
        prefs[user] = model
        tmp = _prefs_path().with_suffix(".tmp")
        tmp.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
        tmp.replace(_prefs_path())


def _user_choice() -> tuple[BaseLlm, str] | None:
    """The signed-in user's model for this call (None: the server default)."""
    user = current_user()
    if not user:
        return None
    if user not in _choices:
        model = _prefs().get(user)
        if not model:
            return None
        try:
            _choices[user] = (build_model(model), model)
        except Exception:  # e.g. their Claude model but the key was removed: fall back to the default
            return None
    return _choices[user]


MODEL.set_resolver(_user_choice)


def status(admin: bool = True) -> dict:
    anthropic_key, google_key = os.getenv("ANTHROPIC_API_KEY", ""), _google_key()
    delegate, model = MODEL.current()
    return {
        "model": model, "provider": provider_of(model), "catalogue": CATALOGUE, "default_model": MODEL.model,
        # What the running Builder really uses for this user, read from its live client.
        "active_key_hint": _hint(_key_in_use(delegate)), "active_key_provider": provider_of(model),
        "can_edit_keys": admin,
        "has_anthropic_key": bool(anthropic_key), "anthropic_key_hint": _hint(anthropic_key),
        "has_google_key": bool(google_key), "google_key_hint": _hint(google_key),
    }


def _update_env_file(updates: dict[str, str]) -> None:
    """Set KEY=value lines in .env, keeping every other line (and its order) as it is."""
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    pending = dict(updates)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
        if key in pending:
            lines[i] = f"{key}={pending.pop(key)}"
    lines += [f"{key}={value}" for key, value in pending.items()]
    tmp = ENV_PATH.with_name(ENV_PATH.name + ".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.replace(tmp, ENV_PATH)


async def _check_claude(model: str, api_key: str) -> None:
    """Confirm the key works and can use the model (a metadata lookup: no tokens are spent)."""
    client = anthropic.AsyncAnthropic(api_key=api_key, max_retries=1, timeout=20.0)
    try:
        await client.models.retrieve(claude_model_id(model))
    except anthropic.AuthenticationError as exc:
        raise SettingsError("Anthropic rejected this API key. Check it in the Anthropic Console (it starts with sk-ant-).") from exc
    except anthropic.PermissionDeniedError as exc:
        raise SettingsError(f"This Anthropic API key is not allowed to use {model}.") from exc
    except anthropic.NotFoundError as exc:
        raise SettingsError(f"{model} is not an Anthropic model this key can use. Pick one from the list.") from exc
    except anthropic.APIConnectionError as exc:
        raise SettingsError("Could not reach the Anthropic API. Check your internet connection.") from exc
    except anthropic.APIStatusError as exc:
        raise SettingsError(f"Anthropic API error {exc.status_code}: {exc.message}") from exc
    finally:
        await client.close()


async def apply(model: str, anthropic_api_key: str | None = None, google_api_key: str | None = None,
                admin: bool = True) -> dict:
    """Validate and switch the Builder's model (the signed-in user's own, else the server default); new keys
    are saved too (admins only: every user shares them). On any error nothing changes."""
    model = (model or "").strip()
    anthropic_api_key = (anthropic_api_key or "").strip() or None
    google_api_key = (google_api_key or "").strip() or None
    if (anthropic_api_key or google_api_key) and not admin:
        raise SettingsError("API keys are shared by every user of this server: ask an admin to change them.")
    if not _MODEL_ID.match(model):
        raise SettingsError("Choose a model (or type a valid model id).")
    if anthropic_api_key and not anthropic_api_key.startswith("sk-ant-"):
        raise SettingsError("That does not look like an Anthropic API key (it starts with sk-ant-).")

    user = current_user()
    updates: dict[str, str] = {} if user else {"BUILDER_MODEL": model}  # a user's choice leaves the default alone
    if anthropic_api_key:
        updates["ANTHROPIC_API_KEY"] = anthropic_api_key
    if google_api_key:
        updates.update(GOOGLE_API_KEY=google_api_key, GEMINI_API_KEY=google_api_key)
    if is_claude(model):
        key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY", "")
        if not key:
            raise SettingsError("Add your Anthropic API key to build with Claude models." if admin
                                else "This server has no Anthropic API key yet: ask an admin to add it.")
        await _check_claude(model, key)
    else:
        if not (google_api_key or _google_key()):
            raise SettingsError("Add a Google AI Studio API key to build with Gemini models." if admin
                                else "This server has no Google API key yet: ask an admin to add it.")
        if not user:
            updates["GEMINI_MODEL"] = model  # a server-wide Gemini choice is also the platform's default Gemini model

    previous = {k: os.environ.get(k) for k in updates}
    os.environ.update(updates)
    try:
        delegate = build_model(model)
        if updates:
            _update_env_file(updates)
        if user:
            _save_pref(user, model)
    except Exception as exc:
        for key, value in previous.items():  # leave the process exactly as it was
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        raise SettingsError(f"Could not switch to {model}: {exc}") from exc
    if anthropic_api_key or google_api_key:
        # New keys: every model built with the old ones (other users' choices, the default) is rebuilt.
        _choices.clear()
        if user:
            try:
                MODEL.use(build_model(MODEL.model), MODEL.model)
            except Exception:
                pass  # the default keeps its previous client; users can still pick a working model
    if user:
        _choices[user] = (delegate, model)
    else:
        MODEL.use(delegate, model)
    return status(admin)
