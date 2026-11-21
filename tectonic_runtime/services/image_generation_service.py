"""Image generation module: text-to-image and image editing for the Builder and every worker agent.

Two providers, chosen per request by ``style``:
  * Google (google-genai), raster images and photos. Model families by name: Gemini native image models
    (default ``gemini-2.5-flash-image``: generate, or edit / combine reference images) and Imagen
    (``imagen-*``: prompt-only, up to 4 images per call).
  * Claude (Anthropic API key), vector drawings: Claude writes SVG (logos, icons, diagrams, infographics,
    flat illustrations). Claude cannot produce photographs. See svg_image_provider.py.

  style="photo"  Google only.
  style="vector" Claude when configured, else Google.
  style="auto"   Google; if Google cannot serve the request at all (no or rejected key, model unavailable,
                 quota, outage) Claude draws it instead and the result says it is a vector illustration.
                 A refusal of the prompt itself (safety filter) never switches provider.

Configuration (environment):
  TECTONIC_IMAGE_MODEL     model id (default gemini-2.5-flash-image)
  TECTONIC_IMAGE_API_KEY   key for image calls (default: GOOGLE_API_KEY / GEMINI_API_KEY)
  GOOGLE_GENAI_USE_VERTEXAI=true (+ GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION) to call Vertex AI instead
  TECTONIC_IMAGE_TIMEOUT   seconds per provider call (default 120)
  ANTHROPIC_API_KEY / TECTONIC_SVG_MODEL   Claude vector drawings (default claude-opus-5-5)

Nothing is ever faked: with no key, offline mode, a rejected key, a safety block or a provider error the
operation fails with a message that says exactly what went wrong. Every prompt passes the Guardrails module
first, generated images are stored by the media store (never returned as bytes), and token usage is
metered into FinOps under the calling agent and team.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from ..base import BaseModule, CallContext, operation
from ..media import MediaError, get_media_store
from ..models import _report
from .image_types import (  # noqa: F401  (re-exported for callers and tests)
    ImageGenerationError,
    ImageProvider,
    ProviderImage,
    ProviderResult,
    ProviderUnavailableError,
)
from .svg_image_provider import SVG_MIME, ClaudeSvgProvider, svg_model

DEFAULT_MODEL = "gemini-2.5-flash-image"
MAX_IMAGES = 4
MAX_REFERENCES = 3
GEMINI_RATIOS = ("1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9")
IMAGEN_RATIOS = ("1:1", "3:4", "4:3", "9:16", "16:9")
# Imagen bills per image; FinOps meters tokens, so each image counts as the Gemini image-token equivalent.
IMAGE_TOKENS_PER_IMAGE = 1290
_BLOCK_REASONS = ("SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "SPII",
                  "IMAGE_RECITATION", "RECITATION")

STYLES = ("auto", "photo", "vector")


def image_model() -> str:
    return os.getenv("TECTONIC_IMAGE_MODEL") or DEFAULT_MODEL


def is_imagen(model: str) -> bool:
    return model.lower().startswith("imagen")


def _api_key() -> str:
    return os.getenv("TECTONIC_IMAGE_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or ""


def _uses_vertex() -> bool:
    return os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in ("1", "true", "yes")


def _api_failure(exc: BaseException) -> ImageGenerationError:
    """A google-genai error as a message for the user; provider-level failures are ProviderUnavailableError."""
    code = getattr(exc, "code", None)
    message = str(getattr(exc, "message", "") or exc)
    if code in (401, 403) or "API key not valid" in message or "PERMISSION_DENIED" in message:
        return ProviderUnavailableError(
            "the Google image provider rejected the API key. Set a valid Google AI Studio key (GOOGLE_API_KEY, or "
            "TECTONIC_IMAGE_API_KEY just for images) that has access to the image model.")
    if code == 404:
        return ProviderUnavailableError(
            f"the image model is not available to this key ({message[:200]}). Set TECTONIC_IMAGE_MODEL to one it can use.")
    if code == 429:
        return ProviderUnavailableError("the Google image quota or rate limit was reached. Try again in a minute.")
    if code == 400:
        return ImageGenerationError(f"the image provider refused the request: {message[:300]}")
    if code is not None and int(code) >= 500:
        return ProviderUnavailableError("the Google image provider had a temporary error. Try again.")
    return ProviderUnavailableError(f"the Google image provider call failed: {message[:300]}")


class GoogleImageProvider:
    """Gemini native image models and Imagen through google-genai."""

    def __init__(self) -> None:
        self._client = None
        self._client_key: str | None = None

    def available(self) -> str | None:
        if os.getenv("TECTONIC_OFFLINE", "0") == "1":
            return "image generation is unavailable in offline mode (TECTONIC_OFFLINE=1)."
        if not _api_key() and not _uses_vertex():
            return "image generation needs a Google API key: set GOOGLE_API_KEY (or TECTONIC_IMAGE_API_KEY) in .env."
        return None

    def client(self):
        key = _api_key()
        if self._client is None or self._client_key != key:  # the key may be changed from the Studio settings
            from google import genai

            self._client = genai.Client(api_key=key) if key else genai.Client()
            self._client_key = key
        return self._client

    async def generate(self, *, model: str, prompt: str, aspect_ratio: str, count: int,
                       references: list[ProviderImage]) -> ProviderResult:
        timeout = float(os.getenv("TECTONIC_IMAGE_TIMEOUT", "120"))
        try:
            if is_imagen(model):
                return await asyncio.wait_for(self._imagen(model, prompt, aspect_ratio, count), timeout)
            # Gemini image models return one image per call: run the calls side by side.
            results = await asyncio.wait_for(asyncio.gather(
                *(self._gemini(model, prompt, aspect_ratio, references) for _ in range(count)), return_exceptions=True), timeout)
        except asyncio.TimeoutError:
            raise ProviderUnavailableError(f"the image provider did not answer within {timeout:.0f} s. Try again.") from None
        except ImageGenerationError:
            raise
        except Exception as exc:
            raise _api_failure(exc) from exc
        merged = ProviderResult(images=[])
        errors: list[BaseException] = []
        for res in results:
            if isinstance(res, BaseException):
                errors.append(res)
                continue
            merged.images += res.images
            merged.text = merged.text or res.text
            merged.input_tokens += res.input_tokens
            merged.output_tokens += res.output_tokens
            merged.estimated_usage = merged.estimated_usage or res.estimated_usage
        if not merged.images:
            first = errors[0] if errors else ImageGenerationError("the model returned no image.")
            if isinstance(first, ImageGenerationError):
                raise first
            raise _api_failure(first) from first
        if errors:
            merged.notes.append(f"{len(errors)} of {count} images failed: {errors[0]}")
        return merged

    async def _gemini(self, model: str, prompt: str, aspect_ratio: str, references: list[ProviderImage]) -> ProviderResult:
        from google.genai import types

        contents: list[Any] = [types.Part.from_bytes(data=r.data, mime_type=r.mime_type) for r in references]
        contents.append(prompt)
        config = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"],
                                             image_config=types.ImageConfig(aspect_ratio=aspect_ratio))
        resp = await self.client().aio.models.generate_content(model=model, contents=contents, config=config)
        images, texts = [], []
        candidates = getattr(resp, "candidates", None) or []
        for cand in candidates[:1]:
            for part in (getattr(getattr(cand, "content", None), "parts", None) or []):
                blob = getattr(part, "inline_data", None)
                if blob is not None and getattr(blob, "data", None):
                    images.append(ProviderImage(data=blob.data, mime_type=blob.mime_type or "image/png"))
                elif getattr(part, "text", None) and not getattr(part, "thought", False):
                    texts.append(part.text)
        if not images:
            feedback = getattr(resp, "prompt_feedback", None)
            block = getattr(getattr(feedback, "block_reason", None), "name", None) or getattr(feedback, "block_reason", None)
            finish = getattr(getattr(candidates[0], "finish_reason", None), "name", None) if candidates else None
            reason = str(block or finish or "")
            if any(r in reason for r in _BLOCK_REASONS):
                raise ImageGenerationError(f"the provider's safety filter blocked this image ({reason}). Rephrase the request.")
            said = " ".join(texts).strip()
            detail = f": {said[:300]}" if said else f" (finish reason {reason or 'unknown'})."
            raise ImageGenerationError("the model returned no image" + detail)
        usage = getattr(resp, "usage_metadata", None)
        in_tok = int(getattr(usage, "prompt_token_count", 0) or 0)
        out_tok = int(getattr(usage, "candidates_token_count", 0) or 0)
        estimated = not (in_tok or out_tok)
        if estimated:
            in_tok, out_tok = max(1, len(prompt) // 4), IMAGE_TOKENS_PER_IMAGE * len(images)
        return ProviderResult(images=images, text=" ".join(texts).strip(), input_tokens=in_tok, output_tokens=out_tok,
                              estimated_usage=estimated)

    async def _imagen(self, model: str, prompt: str, aspect_ratio: str, count: int) -> ProviderResult:
        from google.genai import types

        config = types.GenerateImagesConfig(number_of_images=count, aspect_ratio=aspect_ratio, include_rai_reason=True)
        resp = await self.client().aio.models.generate_images(model=model, prompt=prompt, config=config)
        images, filtered = [], []
        for gen in getattr(resp, "generated_images", None) or []:
            img = getattr(gen, "image", None)
            if img is not None and getattr(img, "image_bytes", None):
                images.append(ProviderImage(data=img.image_bytes, mime_type=img.mime_type or "image/png"))
            elif getattr(gen, "rai_filtered_reason", None):
                filtered.append(gen.rai_filtered_reason)
        if not images:
            if filtered:
                raise ImageGenerationError(f"the provider's safety filter blocked this image ({filtered[0]}). Rephrase the request.")
            raise ImageGenerationError("the model returned no image.")
        result = ProviderResult(images=images, input_tokens=max(1, len(prompt) // 4),
                                output_tokens=IMAGE_TOKENS_PER_IMAGE * len(images), estimated_usage=True)
        if filtered:
            result.notes.append(f"{len(filtered)} image(s) were withheld by the safety filter.")
        return result


class ImageGenerationModule(BaseModule):
    name = "image_generation"
    label = "Image Generation"
    description = ("Images in the chat: photos and raster art (Google Gemini image models / Imagen) and vector "
                   "drawings by Claude (SVG logos, icons, diagrams, illustrations).")
    category = "multimodal"

    def __init__(self, bus) -> None:
        super().__init__(bus)
        self.provider: ImageProvider = GoogleImageProvider()  # raster / photos
        self.vector_provider: ImageProvider = ClaudeSvgProvider()  # vector drawings

    async def setup(self) -> None:
        get_media_store().root.mkdir(parents=True, exist_ok=True)

    async def _screen(self, ctx: CallContext, prompt: str) -> str:
        """Guardrails screen the prompt like any other user input; a block stops the generation."""
        if self.runtime is None or "guardrails" not in self.runtime.modules:
            return prompt
        res = await self.runtime.invoke("guardrails", "check_input", {"text": prompt}, ctx)
        if not res.ok:
            return prompt  # a guardrails outage must not take image generation down with it
        if not res.data.get("allowed", True):
            raise ImageGenerationError(f"the prompt was blocked by the platform guardrails ({res.data.get('violation') or 'policy'}).")
        return res.data.get("text") or prompt

    def _plan(self, style: str, model: str, references: list[ProviderImage]) -> list[tuple[str, ImageProvider, str]]:
        """Providers to try, in order: (kind, provider, model)."""
        google = ("google", self.provider, model or image_model())
        vector = ("vector", self.vector_provider, model or svg_model())
        if model:  # an explicit model names its provider
            return [vector] if model.lower().startswith("claude") else [google]
        if any(r.mime_type == SVG_MIME for r in references):
            return [vector]  # only Claude can edit a vector drawing
        if style == "photo":
            return [google]
        if style == "vector":
            return [vector, google]
        return [google, vector]

    @staticmethod
    def _unfit(kind: str, model: str, aspect_ratio: str, references: list[ProviderImage]) -> str | None:
        """Why this provider/model cannot serve the request at all (None when it can)."""
        if kind != "google":
            return None
        ratios = IMAGEN_RATIOS if is_imagen(model) else GEMINI_RATIOS
        if aspect_ratio not in ratios:
            return f"aspect_ratio must be one of {', '.join(ratios)}."
        if references and is_imagen(model):
            return f"{model} cannot edit images; use a Gemini image model for edits."
        return None

    @operation("Generate images from a text prompt, or edit / combine reference images; returns image ids and URLs")
    async def generate(self, ctx: CallContext, prompt: str, aspect_ratio: str = "1:1", count: int = 1,
                       reference_image_ids: list[str] | None = None, model: str = "", style: str = "auto") -> dict[str, Any]:
        prompt = (prompt or "").strip()
        if not prompt:
            raise ImageGenerationError("describe the image to generate (the prompt is empty).")
        if len(prompt) > 4000:
            raise ImageGenerationError("the prompt is too long (4000 characters max).")
        style = (style or "auto").strip().lower()
        if style not in STYLES:
            raise ImageGenerationError(f"style must be one of {', '.join(STYLES)}.")
        if aspect_ratio not in GEMINI_RATIOS:
            raise ImageGenerationError(f"aspect_ratio must be one of {', '.join(GEMINI_RATIOS)}.")
        model = (model or "").strip()
        try:
            count = int(count)
        except (TypeError, ValueError):
            count = 1
        count = max(1, min(MAX_IMAGES, count))
        refs_ids = list(dict.fromkeys(reference_image_ids or []))
        if len(refs_ids) > MAX_REFERENCES:
            raise ImageGenerationError(f"at most {MAX_REFERENCES} reference images can be used at once.")

        store = get_media_store()
        references: list[ProviderImage] = []
        for rid in refs_ids:
            try:
                ref, data = store.read(rid)
            except MediaError:
                raise ImageGenerationError(f"reference image {rid} was not found.") from None
            # Strictly the caller's own images: every user's Builder runs as "admin", so the role is no exemption.
            if ref.owner != ctx.tenant_id:
                raise ImageGenerationError(f"reference image {rid} was not found.")
            references.append(ProviderImage(data=data, mime_type=ref.mime_type))

        plan = self._plan(style, model, references)
        if len(plan) == 1:  # a single candidate: reject requests it can never serve before spending anything
            unfit = self._unfit(plan[0][0], plan[0][2], aspect_ratio, references)
            if unfit:
                raise ImageGenerationError(unfit)

        safe_prompt = await self._screen(ctx, prompt)
        failures: list[str] = []
        for kind, provider, plan_model in plan:
            problem = provider.available() or self._unfit(kind, plan_model, aspect_ratio, references)
            if problem:
                failures.append(problem)
                continue
            try:
                result = await provider.generate(model=plan_model, prompt=safe_prompt, aspect_ratio=aspect_ratio,
                                                 count=count, references=references)
            except ProviderUnavailableError as exc:
                failures.append(str(exc))
                continue  # this provider cannot serve anything right now: try the next one
            await _report(plan_model, "image", result.input_tokens, result.output_tokens, estimated=result.estimated_usage)
            if failures and kind == "vector" and style == "auto":
                result.notes.insert(0, "Google image generation was unavailable (" + failures[0].rstrip(".") +
                                    "), so Claude drew this as a vector illustration, not a photo-style image.")
            return self._store(ctx, store, result, prompt, plan_model, kind, aspect_ratio, count, bool(references))
        raise ImageGenerationError(" Also: ".join(dict.fromkeys(failures)) or "no image provider is configured.")

    def _store(self, ctx: CallContext, store, result: ProviderResult, prompt: str, model: str, kind: str,
               aspect_ratio: str, count: int, edited: bool) -> dict[str, Any]:
        saved = []
        for img in result.images[:count]:
            try:
                saved.append(store.save(img.data, owner=ctx.tenant_id, mime_type=img.mime_type, prompt=prompt, model=model,
                                        team=ctx.team, agent_id=ctx.agent_id, session_id=ctx.session_id).public())
            except MediaError as exc:
                result.notes.append(f"an image could not be stored: {exc}")
        if not saved:
            raise ImageGenerationError("the generated image could not be stored: " + "; ".join(result.notes))
        return {"images": saved, "count": len(saved), "model": model,
                "provider": "claude-svg" if kind == "vector" else "google", "vector": kind == "vector",
                "aspect_ratio": aspect_ratio, "edited": edited, "model_text": result.text, "notes": result.notes,
                "display": "The images are shown to the user in the chat automatically; do not paste their URLs."}

    @operation("Recent images generated in this session (or by this caller)")
    async def recent(self, ctx: CallContext, limit: int = 8, whole_account: bool = False) -> dict[str, Any]:
        images = get_media_store().list(owner=ctx.tenant_id, session_id=None if whole_account else ctx.session_id,
                                        limit=max(1, min(50, int(limit))))
        return {"images": [i.public() for i in images], "count": len(images)}

    @operation("Which image providers are configured (a key is set; providers validate it on the first call) and their models")
    async def status(self, ctx: CallContext) -> dict[str, Any]:
        google_problem, vector_problem = self.provider.available(), self.vector_provider.available()
        model = image_model()
        return {"configured": google_problem is None or vector_problem is None,
                "google": {"configured": google_problem is None, "problem": google_problem, "model": model,
                           "family": "imagen" if is_imagen(model) else "gemini",
                           "aspect_ratios": list(IMAGEN_RATIOS if is_imagen(model) else GEMINI_RATIOS),
                           "can_edit": not is_imagen(model), "backend": "vertex" if _uses_vertex() else "gemini-api"},
                "vector": {"configured": vector_problem is None, "problem": vector_problem, "model": svg_model(),
                           "makes": "SVG logos, icons, diagrams, infographics, flat illustrations (no photos)"},
                "max_images": MAX_IMAGES, "styles": list(STYLES)}

    def summarize(self, op_name: str, data: Any) -> str:
        if op_name == "generate" and isinstance(data, dict):
            verb = "edited" if data.get("edited") else ("drew" if data.get("vector") else "generated")
            return f"{verb} {data.get('count', 0)} image(s) with {data.get('model')}"
        if op_name == "status" and isinstance(data, dict):
            return ", ".join(f"{k}: {'configured' if data[k]['configured'] else 'off'}" for k in ("google", "vector"))
        return super().summarize(op_name, data)
