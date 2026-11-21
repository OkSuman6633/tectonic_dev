"""Which model the Agent Builder runs on: a platform default, plus one custom override per account.

The choice covers the Builder and all its specialists (intent, requirements, agent cards, code
generator, idea provider, critics) and the agent editor.

Two layers:

* **Platform default**: the server's own configuration (``BUILDER_MODEL`` / ``GEMINI_MODEL`` and the
  ``GOOGLE_API_KEY`` / ``ANTHROPIC_API_KEY`` it was started with, from Secret Manager on Cloud Run).
  Every account uses it unless it switches to its override. An admin may edit it from the Studio only
  where the server owns its own ``.env`` (a local Studio): on Cloud Run it comes from the deployment,
  and an edit made at runtime would vanish at the next restart.
* **Custom override**: one slot per account ``{model, provider, encrypted key?}``. Saving overwrites the
  slot in place (no history, no extra env entries). A mode switch (``default`` | ``custom``) chooses
  which one serves that account's Builder; switching back to ``default`` keeps the slot so the user can
  flip again, and ``clear_custom`` deletes it.

Isolation: a user's own key is passed straight to that user's model client (``build_model(api_key=)``).
It is never written to ``os.environ`` or ``.env``, so it cannot leak into another user's calls; the
active model is resolved per call from the signed-in user (a contextvar, see workspace.py).
At rest it is Fernet-encrypted with a key derived from ``TECTONIC_AUTH_SECRET``. The API only ever
returns the first characters of a key.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from pathlib import Path

import anthropic
from google.adk.models.base_llm import BaseLlm

from .shared_libraries.constants import MODEL, PROJECT_ROOT, build_model, resolve_model_name
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
_KEY_CHARS = re.compile(r"^[A-Za-z0-9._\-]{8,512}$")  # catches pasted junk; the provider check is the real test
MODES = ("default", "custom")
LOCAL_ACCOUNT = "local"  # the single account of a Studio running without sign-in


class SettingsError(ValueError):
    """The requested settings cannot be applied (nothing was changed)."""


def provider_of(model: str) -> str:
    return "anthropic" if is_claude(model) else "google"


def _provider_name(provider: str) -> str:
    return "Anthropic" if provider == "anthropic" else "Google"


def _hint(key: str) -> str:
    """The first characters of a key: enough to tell which key it is, never enough to use it."""
    return f"{key[:6]}…" if key else ""


def _google_key() -> str:
    return os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")


def _platform_key(provider: str) -> str:
    return os.getenv("ANTHROPIC_API_KEY", "") if provider == "anthropic" else _google_key()


def _key_in_use(delegate: BaseLlm) -> str:
    """The API key the live model client actually sends (not what .env says now)."""
    client = getattr(delegate, "client", None)  # Claude: the AsyncAnthropic it was built with
    if client is not None:
        return str(getattr(client, "api_key", "") or "")
    try:  # Gemini: the google-genai client (an explicit override key, else the environment's)
        return str(delegate.api_client._api_client.api_key or "")
    except Exception:
        return ""


def _on_cloud_run() -> bool:
    return bool(os.getenv("K_SERVICE"))


def _account() -> str | None:
    """Whose override applies: the signed-in user, or the one local account when sign-in is off."""
    user = current_user()
    if user:
        return user
    from .studio_api import auth_enabled  # lazy: studio_api imports this module

    return None if auth_enabled() else LOCAL_ACCOUNT


# --- keys at rest ---------------------------------------------------------------------------------
_fernet_cache = None


def _fernet():
    """Fernet keyed by HKDF(TECTONIC_AUTH_SECRET): rotating that secret makes saved keys unreadable (re-enter)."""
    global _fernet_cache
    if _fernet_cache is None:
        import base64

        from cryptography.fernet import Fernet
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF

        from .auth import _secret

        raw = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"tectonic/model-override-keys/v1").derive(_secret())
        _fernet_cache = Fernet(base64.urlsafe_b64encode(raw))
    return _fernet_cache


def _encrypt(key: str) -> str:
    return _fernet().encrypt(key.encode("utf-8")).decode("ascii")


def _decrypt(token: str | None) -> str | None:
    if not token:
        return None
    from cryptography.fernet import InvalidToken

    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None  # written under another TECTONIC_AUTH_SECRET: treated as no saved key


# --- the per-account store: <TECTONIC_DATA_DIR>/builder_models.json --------------------------------
_store_lock = threading.Lock()


def _store_path() -> Path:
    from .auth import data_dir

    return data_dir() / "builder_models.json"


def _read_store() -> dict:
    try:
        data = json.loads(_store_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _normalize(entry) -> dict | None:
    """One account's entry; an older file stored just the chosen model name (it was always active)."""
    if isinstance(entry, str) and entry:
        return {"mode": "custom", "custom": {"model": entry, "provider": provider_of(entry)}}
    if isinstance(entry, dict) and isinstance(entry.get("custom"), dict) and entry["custom"].get("model"):
        return {"mode": entry.get("mode") if entry.get("mode") in MODES else "default", "custom": entry["custom"]}
    return None


def _entry(account: str) -> dict | None:
    return _normalize(_read_store().get(account))


def _write_entry(account: str, entry: dict | None) -> None:
    """Overwrite (or, with None, delete) this account's single slot. Atomic, owner-only file."""
    with _store_lock:
        store = _read_store()
        if entry is None:
            store.pop(account, None)
        else:
            store[account] = entry
        path = _store_path()
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(store, indent=2), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass  # e.g. Windows: ACLs, not mode bits
        tmp.replace(path)


# --- resolving the model for each call ---------------------------------------------------------------
# account -> (built model, name) when its override is active, None when it runs on the default.
_choices: dict[str, tuple[BaseLlm, str] | None] = {}
_key_source: dict[str, str] = {}  # account -> "user" | "platform": whose key its override sends
_errors: dict[str, str] = {}  # account -> why its active override could not be built (it runs on the default)


def _build_custom(custom: dict) -> tuple[BaseLlm, str, str]:
    """(model, name, key source) for an override slot. Raises ValueError when it cannot run."""
    model = custom["model"]
    own_key = _decrypt(custom.get("key"))
    if custom.get("key") and own_key is None:
        raise ValueError("your saved API key can no longer be read (the server's secret changed): enter it again")
    return build_model(model, api_key=own_key), model, "user" if own_key else "platform"


def _invalidate(account: str) -> None:
    _choices.pop(account, None)
    _key_source.pop(account, None)
    _errors.pop(account, None)


def _user_choice() -> tuple[BaseLlm, str] | None:
    """The calling account's override for this model call (None: the platform default)."""
    account = _account()
    if not account:
        return None
    if account not in _choices:
        entry = _entry(account)
        if not entry or entry["mode"] != "custom":
            _choices[account] = None
        else:
            try:
                delegate, name, source = _build_custom(entry["custom"])
                _choices[account], _key_source[account] = (delegate, name), source
            except Exception as exc:  # e.g. a platform key it relied on was removed: run on the default
                _choices[account], _errors[account] = None, str(exc)
    return _choices[account]


MODEL.set_resolver(_user_choice)


def status(admin: bool = True) -> dict:
    account = _account()
    delegate, model = MODEL.current()  # resolves this account's override, if active
    entry = _entry(account) if account else None
    mode = entry["mode"] if entry else "default"
    custom = None
    if entry:
        slot = entry["custom"]
        custom = {
            "model": slot["model"], "provider": slot.get("provider") or provider_of(slot["model"]),
            "has_own_key": bool(slot.get("key")), "key_hint": slot.get("key_hint", "") if slot.get("key") else "",
            "key_readable": not slot.get("key") or _decrypt(slot.get("key")) is not None,
            "updated_at": slot.get("updated_at"),
        }
    overriding = bool(account and _choices.get(account))
    anthropic_key, google_key = os.getenv("ANTHROPIC_API_KEY", ""), _google_key()
    can_edit_default = admin and not _on_cloud_run()
    return {
        "mode": mode,
        "model": model, "provider": provider_of(model),
        # What the running Builder really uses for this user, read from its live client.
        "active_key_hint": _hint(_key_in_use(delegate)), "active_key_provider": provider_of(model),
        "active_key_source": _key_source.get(account, "platform") if overriding else "platform",
        "custom_error": _errors.get(account, "") if account and mode == "custom" else "",
        "default_model": MODEL.model, "default_provider": provider_of(MODEL.model),
        "custom": custom,
        "can_customize": account is not None,
        "can_edit_default": can_edit_default,
        "can_edit_keys": can_edit_default,  # older Studio builds read this name
        "default_managed_by": "studio" if not _on_cloud_run() else "deployment",
        "catalogue": CATALOGUE,
        "has_anthropic_key": bool(anthropic_key), "anthropic_key_hint": _hint(anthropic_key),
        "has_google_key": bool(google_key), "google_key_hint": _hint(google_key),
    }


# --- validation (metadata lookups: no tokens are spent) ----------------------------------------------
async def _check_claude(model: str, api_key: str) -> None:
    """Confirm the key works and can use the model."""
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


async def _check_gemini(model: str, api_key: str) -> None:
    """Confirm a user's Google key works and can see the model."""
    from google import genai
    from google.genai import errors

    client = genai.Client(api_key=api_key, vertexai=False)
    try:
        await client.aio.models.get(model=resolve_model_name(model))
    except errors.ClientError as exc:
        if exc.code == 404:
            raise SettingsError(f"{model} is not a Gemini model this key can use. Pick one from the list.") from exc
        if exc.code in (400, 401, 403):
            raise SettingsError("Google rejected this API key. Check it in Google AI Studio → API keys.") from exc
        raise SettingsError(f"Google API error {exc.code}: {exc.message}") from exc
    except errors.APIError as exc:
        raise SettingsError(f"Google API error {exc.code}: {exc.message}") from exc
    except Exception as exc:  # network failures surface as httpx/aiohttp errors depending on the SDK build
        raise SettingsError("Could not reach the Google AI API. Check your internet connection.") from exc
    finally:
        try:
            await client.aio.aclose()
        except Exception:
            pass


async def _check_key(provider: str, model: str, api_key: str) -> None:
    await (_check_claude if provider == "anthropic" else _check_gemini)(model, api_key)


def _validate_model(model: str) -> str:
    model = (model or "").strip()
    if not _MODEL_ID.match(model):
        raise SettingsError("Choose a model (or type a valid model id).")
    return model


def _validate_key_format(provider: str, key: str) -> None:
    if provider == "anthropic" and not key.startswith("sk-ant-"):
        raise SettingsError("That does not look like an Anthropic API key (it starts with sk-ant-).")
    if not _KEY_CHARS.match(key):
        raise SettingsError(f"That does not look like a {_provider_name(provider)} API key.")


# --- custom override: one slot per account -----------------------------------------------------------
def _require_account() -> str:
    account = _account()
    if not account:
        raise SettingsError("Sign in to save your own model.")
    return account


async def save_custom(model: str, api_key: str | None = None, admin: bool = True) -> dict:
    """Validate and save this account's override (overwriting the previous one) and switch to it.

    ``api_key`` blank: keep the saved key if it is for the same provider, else use the platform's key
    for that provider (if the server has one). A key for another provider is dropped, never kept around.
    On any error nothing changes.
    """
    account = _require_account()
    model = _validate_model(model)
    provider = provider_of(model)
    new_key = (api_key or "").strip() or None
    if new_key:
        _validate_key_format(provider, new_key)

    previous = (_entry(account) or {}).get("custom") or {}
    kept_key = None
    if not new_key and previous.get("key") and (previous.get("provider") or provider_of(previous.get("model", ""))) == provider:
        kept_key = _decrypt(previous["key"])  # None if unreadable: falls through to the platform key
    own_key = new_key or kept_key

    if own_key:
        if new_key:  # a kept key was validated when it was saved; re-checking only costs latency
            await _check_key(provider, model, own_key)
    elif not _platform_key(provider):
        raise SettingsError(f"Enter your {_provider_name(provider)} API key: this server has no shared one for {model}.")
    elif provider == "anthropic":
        await _check_claude(model, _platform_key(provider))  # the model id must exist for the shared key too

    try:
        delegate = build_model(model, api_key=own_key)
    except Exception as exc:
        raise SettingsError(f"Could not switch to {model}: {exc}") from exc

    slot = {"model": model, "provider": provider, "updated_at": int(time.time())}
    if own_key:
        slot.update(key=_encrypt(own_key), key_hint=_hint(own_key))
    _write_entry(account, {"mode": "custom", "custom": slot})
    _invalidate(account)
    _choices[account], _key_source[account] = (delegate, model), "user" if own_key else "platform"
    return status(admin)


async def set_mode(mode: str, admin: bool = True) -> dict:
    """Switch this account between the platform default and its saved override (the slot is kept)."""
    account = _require_account()
    mode = (mode or "").strip().lower()
    if mode not in MODES:
        raise SettingsError("Mode must be 'default' or 'custom'.")
    entry = _entry(account)
    if mode == "custom":
        if not entry:
            raise SettingsError("Save a custom model first.")
        try:
            _build_custom(entry["custom"])  # refuse to activate an override that cannot run
        except Exception as exc:
            raise SettingsError(f"Your custom model cannot run: {exc}") from exc
    if entry and entry["mode"] != mode:
        _write_entry(account, {**entry, "mode": mode})
    _invalidate(account)
    return status(admin)


async def clear_custom(admin: bool = True) -> dict:
    """Delete this account's override (model and key) and return it to the platform default."""
    account = _require_account()
    _write_entry(account, None)
    _invalidate(account)
    return status(admin)


# --- platform default (admin; a server that owns its .env) ------------------------------------------
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


async def apply_default(model: str, anthropic_api_key: str | None = None, google_api_key: str | None = None,
                        admin: bool = True) -> dict:
    """Validate and switch the platform default model (and its shared keys) for every account that has
    no active override. Server-wide by design, so admin-only, and refused on Cloud Run where the default
    is the deployment's configuration. On any error nothing changes."""
    if not admin:
        raise SettingsError("The platform default is shared by every user: ask an admin to change it.")
    if _on_cloud_run():
        raise SettingsError("On Cloud Run the platform default comes from the deployment (Secret Manager and env "
                            "vars): a change made here would be lost at the next restart. Use a custom model instead.")
    model = _validate_model(model)
    anthropic_api_key = (anthropic_api_key or "").strip() or None
    google_api_key = (google_api_key or "").strip() or None
    if anthropic_api_key:
        _validate_key_format("anthropic", anthropic_api_key)

    updates: dict[str, str] = {"BUILDER_MODEL": model}
    if anthropic_api_key:
        updates["ANTHROPIC_API_KEY"] = anthropic_api_key
    if google_api_key:
        updates.update(GOOGLE_API_KEY=google_api_key, GEMINI_API_KEY=google_api_key)
    if is_claude(model):
        key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY", "")
        if not key:
            raise SettingsError("Add your Anthropic API key to build with Claude models.")
        await _check_claude(model, key)
    else:
        if not (google_api_key or _google_key()):
            raise SettingsError("Add a Google AI Studio API key to build with Gemini models.")
        updates["GEMINI_MODEL"] = model  # the platform's default Gemini model too (generated agents, RAG)

    # The platform default is process-wide configuration of a single-owner server, so the environment is
    # the right home for it here (generated agents and the platform runtime read their keys from it).
    previous = {k: os.environ.get(k) for k in updates}
    os.environ.update(updates)
    try:
        delegate = build_model(model)
        _update_env_file(updates)
    except Exception as exc:
        for key, value in previous.items():  # leave the process exactly as it was
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        raise SettingsError(f"Could not switch to {model}: {exc}") from exc
    if anthropic_api_key or google_api_key:
        # Overrides that rely on the platform's keys are rebuilt with the new ones on their next call.
        _choices.clear()
        _key_source.clear()
        _errors.clear()
    MODEL.use(delegate, model)
    return status(admin)
