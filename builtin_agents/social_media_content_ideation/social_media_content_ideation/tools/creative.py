"""Sample visual generation with Google's image models.

The project's ``GOOGLE_API_KEY`` / ``GEMINI_API_KEY`` (from ``.env``) drives Google's Gemini image model
(``gemini-2.5-flash-image`` by default, overridable with ``TECTONIC_IMAGE_MODEL``). Each image is written into
the project's ``data/creative/`` folder and, when the Tectonic runtime is present, also registered in the
platform media store so it appears inside the agent's chat reply.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any

from ..shared_libraries.constants import CREATIVE_DIR, IMAGE_MODEL, IMAGE_TIMEOUT_SECONDS

TEAM = "social_media_content_ideation"
_SUPPORTED_RATIOS = {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"}
_STYLE_HINTS = {
    "photo": "photorealistic photo, natural lighting, shot on a modern camera, high detail, social-media ready",
    "graphic": "bold graphic design, flat vector shapes, strong colour blocking, high contrast, clean typography",
    "ugc": "authentic user-generated style phone photo, casual framing, natural light, unpolished and real",
    "meme": "internet meme style image, simple composition, expressive subject, generous empty space for a caption",
    "editorial": "editorial product photography, studio lighting, minimal props, premium brand aesthetic",
}


class CreativeError(RuntimeError):
    """Image generation failed; the message is safe to show to the user."""


def _error(message: str) -> dict:
    """Build a standard error response."""
    return {"status": "error", "message": message}


def _api_key() -> str:
    """Read the Google API key used for image generation.

    Returns:
        The key, or an empty string when none is configured.
    """
    for name in ("TECTONIC_IMAGE_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"):
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _client():
    """Create a google-genai client for the configured key.

    Returns:
        A ready ``google.genai.Client``.

    Raises:
        CreativeError: when the key is missing or the SDK is unavailable.
    """
    key = _api_key()
    if not key:
        raise CreativeError(
            "Image generation needs a Google API key: set GOOGLE_API_KEY in the project's .env file."
        )
    try:
        from google import genai
    except ImportError as exc:  # pragma: no cover - dependency declared in requirements.txt
        raise CreativeError("The google-genai package is not installed: run pip install -r requirements.txt.") from exc
    return genai.Client(api_key=key)


def _slug(text: str, limit: int = 40) -> str:
    """Turn a title into a filesystem-safe slug."""
    clean = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip()).strip("-").lower()
    return (clean or "visual")[:limit]


def _ratio(value: str) -> str:
    """Validate an aspect ratio, falling back to 1:1."""
    text = (value or "").strip()
    return text if text in _SUPPORTED_RATIOS else "1:1"


def _build_prompt(prompt: str, style: str, on_image_text: str) -> str:
    """Compose the final generation prompt from the idea, the style and any on-image copy."""
    parts = [prompt.strip()]
    hint = _STYLE_HINTS.get((style or "").strip().lower())
    if hint:
        parts.append(hint)
    parts.append("Designed for a social media feed: strong focal point, readable at thumbnail size.")
    if (on_image_text or "").strip():
        parts.append(f'Include this exact text in the image, spelled correctly: "{on_image_text.strip()}".')
    else:
        parts.append("Do not add any text, words, letters or watermarks.")
    return ". ".join(p.rstrip(".") for p in parts if p) + "."


def _extract_images(response: Any) -> list[tuple[bytes, str]]:
    """Pull the inline images out of a generate_content response.

    Args:
        response: The google-genai response object.

    Returns:
        List of (bytes, mime_type) tuples.
    """
    images: list[tuple[bytes, str]] = []
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            blob = getattr(part, "inline_data", None)
            if blob is not None and getattr(blob, "data", None):
                images.append((blob.data, blob.mime_type or "image/png"))
    return images


def _store_in_chat(data: bytes, mime_type: str, prompt: str, tool_context: Any) -> dict | None:
    """Register an image in the Tectonic media store so the chat can display it.

    Args:
        data: Image bytes.
        mime_type: The image MIME type.
        prompt: The prompt used, stored as metadata.
        tool_context: Injected ADK tool context (may be None when run standalone).

    Returns:
        The public image dict ({id, url, mime_type}) or None when the platform runtime is unavailable.
    """
    try:
        from tectonic_runtime.media import get_media_store

        session_id = None
        try:
            from tectonic_runtime.identity import session_id_of

            session_id = session_id_of(tool_context)
        except Exception:
            session_id = getattr(getattr(tool_context, "session", None), "id", None)
        stored = get_media_store().save(
            data,
            owner=getattr(tool_context, "user_id", None) or "studio",
            mime_type=mime_type,
            prompt=prompt,
            model=IMAGE_MODEL,
            kind="generated",
            team=TEAM,
            agent_id=getattr(tool_context, "agent_name", None) or TEAM,
            session_id=session_id,
        )
        return stored.public()
    except Exception:  # standalone run or a media store failure must not lose the saved file
        return None


def _generate(prompt: str, aspect_ratio: str, style: str, on_image_text: str,
              tool_context: Any) -> tuple[list[dict], list[str], str]:
    """Generate one image and store it on disk and in the chat.

    Returns:
        Tuple of (chat images, saved file paths, the effective prompt).
    """
    from google.genai import types

    effective_prompt = _build_prompt(prompt, style, on_image_text)
    config = types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
        image_config=types.ImageConfig(aspect_ratio=_ratio(aspect_ratio)),
        http_options=types.HttpOptions(timeout=IMAGE_TIMEOUT_SECONDS * 1000),
    )
    client = _client()  # held in a local: the SDK closes its transport when the client is collected
    try:
        response = client.models.generate_content(model=IMAGE_MODEL, contents=effective_prompt, config=config)
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()
    images = _extract_images(response)
    if not images:
        block = ""
        feedback = getattr(response, "prompt_feedback", None)
        if feedback is not None:
            block = str(getattr(feedback, "block_reason", "") or "")
        raise CreativeError(
            "Google returned no image"
            + (f" (blocked: {block})" if block else "")
            + ". Rephrase the prompt: describe the scene, style and colours without brand names or people's likeness."
        )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    chat_images: list[dict] = []
    files: list[str] = []
    for index, (data, mime_type) in enumerate(images[:1]):
        extension = "png" if "png" in mime_type else ("jpg" if "jpeg" in mime_type or "jpg" in mime_type else "webp")
        name = f"{stamp}_{_slug(prompt)}_{index + 1}.{extension}"
        path = CREATIVE_DIR / name
        try:
            path.write_bytes(data)
            files.append(str(path.relative_to(CREATIVE_DIR.parent.parent)))
        except OSError as exc:
            raise CreativeError(f"Could not save the generated image: {exc}") from exc
        registered = _store_in_chat(data, mime_type, effective_prompt, tool_context)
        if registered:
            chat_images.append({"id": registered["id"], "url": registered["url"],
                                "mime_type": registered.get("mime_type", mime_type)})
    return chat_images, files, effective_prompt


def post_generate_image(prompt: str, aspect_ratio: str = "1:1", style: str = "photo",
                        on_image_text: str = "", tool_context: Any = None) -> dict:
    """Create one sample visual for a content idea with Google's image model.

    Use it after the strategy is agreed, once per idea the user wants to see. Write a rich, concrete prompt
    (subject, setting, colours, composition, mood) instead of a vague one.

    Args:
        prompt: What the visual should show, for example 'a cold glass of oat milk on a marble counter, morning light'.
        aspect_ratio: '1:1' (feed), '9:16' (Reels/Shorts/Stories), '4:5', '16:9'. Defaults to '1:1'.
        style: 'photo' (photorealistic), 'graphic' (bold flat design), 'ugc' (authentic phone photo),
            'meme' (caption-ready) or 'editorial' (premium product shot). Defaults to 'photo'.
        on_image_text: Optional exact caption text to render inside the image. Leave empty for no text.
        tool_context: Injected by ADK.

    Returns:
        dict with status, images (shown in the chat automatically), files (project-relative paths in
        data/creative/), the effective prompt and the model used. Returns status 'error' with the
        reason to tell the user when Google cannot produce the image.
    """
    try:
        if not (prompt or "").strip():
            return _error("prompt is required.")
        chat_images, files, effective_prompt = _generate(prompt, aspect_ratio, style, on_image_text, tool_context)
        return {
            "status": "success",
            "images": chat_images,
            "files": files,
            "prompt": effective_prompt,
            "model": IMAGE_MODEL,
            "provider": "google",
            "display": "The image is already shown in the chat; do not paste its URL or markdown.",
        }
    except CreativeError as exc:
        return _error(str(exc))
    except Exception as exc:  # provider/network errors surface as a message the user can act on
        return _error(f"Image generation failed: {str(exc)[:300]}")


def batch_generate_image(ideas: str, aspect_ratio: str = "9:16", style: str = "photo",
                         max_images: int = 3, tool_context: Any = None) -> dict:
    """Create one sample visual per idea in a batch (use this when the user asks for several samples).

    Args:
        ideas: JSON list of ideas, each an object with 'prompt' (required) and optional 'title' and 'on_image_text'.
            A JSON list of plain strings is also accepted.
        aspect_ratio: '1:1', '9:16', '4:5' or '16:9'. Defaults to '9:16'.
        style: 'photo', 'graphic', 'ugc', 'meme' or 'editorial'. Defaults to 'photo'.
        max_images: How many ideas to illustrate, between 1 and 3. Defaults to 3.
        tool_context: Injected by ADK.

    Returns:
        dict with status, a 'visuals' list (idea title, file path, prompt) and 'images' for the chat.
        Ideas that fail are reported individually in 'failures' instead of losing the whole batch.
    """
    try:
        parsed = json.loads(ideas) if isinstance(ideas, str) else ideas
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list) or not parsed:
            return _error("ideas must be a non-empty JSON list of ideas.")
        capped = max(1, min(int(max_images), 3))
        visuals: list[dict] = []
        failures: list[str] = []
        images: list[dict] = []
        for idea in parsed[:capped]:
            if isinstance(idea, str):
                title, prompt, on_image = idea, idea, ""
            elif isinstance(idea, dict):
                title = str(idea.get("title") or idea.get("idea") or "")
                prompt = str(idea.get("prompt") or idea.get("visual_prompt") or title)
                on_image = str(idea.get("on_image_text") or "")
            else:
                failures.append("One idea was neither text nor an object; skipped.")
                continue
            if not prompt.strip():
                failures.append(f"'{title or 'idea'}' has no prompt; skipped.")
                continue
            try:
                chat_images, files, effective_prompt = _generate(prompt, aspect_ratio, style, on_image, tool_context)
                visuals.append({"title": title or prompt[:60], "file": files[0] if files else None,
                                "prompt": effective_prompt})
                images.extend(chat_images)
            except CreativeError as exc:
                failures.append(f"{title or prompt[:40]}: {exc}")
        if not visuals:
            return {"status": "error", "message": "No image could be generated.", "failures": failures}
        return {
            "status": "success",
            "visuals": visuals,
            "images": images,
            "failures": failures,
            "model": IMAGE_MODEL,
            "provider": "google",
            "display": "The images are already shown in the chat; do not paste their URLs or markdown.",
        }
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        return _error(f"ideas must be valid JSON: {exc}")
