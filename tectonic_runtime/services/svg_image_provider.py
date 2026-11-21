"""Vector images drawn by Claude (Anthropic API key): Claude writes SVG, which is sanitized and stored.

Claude cannot output pixels, so this provider makes vector artwork: logos, icons, diagrams, flowcharts,
infographics, flat illustrations, badges, simple scenes. It cannot make photographs; the module uses it for
style="vector" requests, and as the stand-in when Google image generation is unavailable (the result then says
it is a vector illustration).

Every SVG passes ``sanitize_svg`` before it is stored: only drawing elements and attributes survive (no
script, event handlers, foreignObject, external references or embedded images), so an image opened directly
from the Studio cannot run code. The media route also serves images under a no-script CSP.

Configuration: ANTHROPIC_API_KEY (or TECTONIC_SVG_API_KEY), TECTONIC_SVG_MODEL (default claude-opus-5-5).
"""

from __future__ import annotations

import asyncio
import base64
import os
import re
from xml.etree import ElementTree as ET

from .image_types import (
    ImageGenerationError,
    ProviderImage,
    ProviderResult,
    ProviderUnavailableError,
)

DEFAULT_SVG_MODEL = "claude-opus-5-5"
SVG_MIME = "image/svg+xml"
MAX_SVG_BYTES = 2 * 1024 * 1024
_RASTER = {"image/png", "image/jpeg", "image/webp", "image/gif"}

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
_ALLOWED_ELEMENTS = {
    "svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text",
    "tspan", "textPath", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "symbol", "use",
    "marker", "filter", "style", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix", "feComposite", "feFlood",
    "feMerge", "feMergeNode", "feDropShadow", "feTurbulence", "feDisplacementMap", "feMorphology",
    "feComponentTransfer", "feFuncR", "feFuncG", "feFuncB", "feFuncA", "feSpecularLighting", "feDiffuseLighting",
    "fePointLight", "feDistantLight", "feSpotLight", "feTile",
}
_URL = re.compile(r"url\(\s*['\"]?\s*([^)'\"\s]*)", re.I)
_SVG_BLOCK = re.compile(r"<svg\b[\s\S]*</svg>", re.I)

SYSTEM_PROMPT = """You are a vector illustrator. You answer every request with exactly one complete, standalone SVG
document and nothing else: no explanations and no Markdown fences.

Rules:
- Root: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">.
- Draw with shapes, paths, gradients, patterns, clip paths, masks and filters. Fill the whole canvas with a
  deliberate background unless a transparent background is asked for.
- Make it polished: a clear composition, a harmonious palette, consistent stroke weights, readable text in
  generic font families (sans-serif, serif, monospace) with any text the user asked for spelled exactly.
- Never use <script>, event attributes, <foreignObject>, <image>, external URLs, @import or web fonts.
- Use presentation attributes or a single <style> element; reference only ids defined in the same document.
- Keep it under 150 KB."""


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _safe_url_refs(value: str) -> bool:
    return all(ref.startswith("#") for ref in _URL.findall(value))


def sanitize_svg(source: str) -> bytes:
    """Keep only safe drawing content of an SVG document; raises ImageGenerationError when nothing usable is left."""
    if len(source.encode("utf-8")) > MAX_SVG_BYTES:
        raise ImageGenerationError("the drawing was too large to keep.")
    if re.search(r"<!DOCTYPE|<!ENTITY", source, re.I):
        raise ImageGenerationError("the drawing contained a DOCTYPE, which is not allowed.")
    try:
        root = ET.fromstring(source)
    except ET.ParseError as exc:
        raise ImageGenerationError(f"the drawing was not valid SVG ({exc}).") from None
    if _local(root.tag) != "svg":
        raise ImageGenerationError("the drawing was not an SVG document.")

    def clean(elem: ET.Element) -> None:
        for child in list(elem):
            ns = child.tag.split("}")[0][1:] if isinstance(child.tag, str) and child.tag.startswith("{") else SVG_NS
            name = _local(child.tag)
            if ns != SVG_NS or name not in _ALLOWED_ELEMENTS:
                elem.remove(child)
                continue
            if name == "style" and (re.search(r"@import|javascript:|expression\(", child.text or "", re.I)
                                    or not _safe_url_refs(child.text or "")):
                elem.remove(child)
                continue
            clean(child)
        for attr in list(elem.attrib):
            name, value = _local(attr), elem.attrib[attr]
            low = value.strip().lower()
            if (name.lower().startswith("on") or "javascript:" in low or "data:" in low
                    or (name == "href" and not value.startswith("#")) or not _safe_url_refs(value)):
                del elem.attrib[attr]

    clean(root)
    if not any(_local(e.tag) not in ("svg", "title", "desc", "defs", "style") for e in root.iter()):
        raise ImageGenerationError("the drawing was empty.")
    ET.register_namespace("", SVG_NS)
    ET.register_namespace("xlink", XLINK_NS)
    return ET.tostring(root, encoding="utf-8", xml_declaration=False)


def canvas_size(aspect_ratio: str) -> tuple[int, int]:
    w, h = (int(x) for x in aspect_ratio.split(":"))
    scale = 1024 / max(w, h)
    return round(w * scale), round(h * scale)


def svg_model() -> str:
    return os.getenv("TECTONIC_SVG_MODEL") or DEFAULT_SVG_MODEL


def _api_key() -> str:
    return os.getenv("TECTONIC_SVG_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or ""


class ClaudeSvgProvider:
    """Claude writes the SVG; the platform sanitizes and stores it."""

    def __init__(self) -> None:
        self._client = None
        self._client_key: str | None = None

    def available(self) -> str | None:
        if os.getenv("TECTONIC_OFFLINE", "0") == "1":
            return "vector drawing is unavailable in offline mode (TECTONIC_OFFLINE=1)."
        if not _api_key().strip():
            return "vector drawing needs an Anthropic API key (ANTHROPIC_API_KEY)."
        return None

    def client(self):
        key = _api_key().strip()
        if self._client is None or self._client_key != key:
            import anthropic

            timeout = float(os.getenv("TECTONIC_IMAGE_TIMEOUT", "120"))
            self._client = anthropic.AsyncAnthropic(api_key=key, max_retries=2, timeout=timeout)
            self._client_key = key
        return self._client

    async def generate(self, *, model: str, prompt: str, aspect_ratio: str, count: int,
                       references: list[ProviderImage]) -> ProviderResult:
        results = await asyncio.gather(*(self._one(model, prompt, aspect_ratio, references, i, count) for i in range(count)),
                                       return_exceptions=True)
        merged = ProviderResult(images=[])
        errors: list[BaseException] = []
        for res in results:
            if isinstance(res, BaseException):
                errors.append(res)
                continue
            merged.images += res.images
            merged.input_tokens += res.input_tokens
            merged.output_tokens += res.output_tokens
        if not merged.images:
            first = errors[0] if errors else ImageGenerationError("Claude returned no drawing.")
            raise first if isinstance(first, ImageGenerationError) else _api_failure(first)
        if errors:
            merged.notes.append(f"{len(errors)} of {count} drawings failed: {errors[0]}")
        merged.notes.append("Drawn by Claude as a vector (SVG) illustration.")
        return merged

    async def _one(self, model: str, prompt: str, aspect_ratio: str, references: list[ProviderImage],
                   index: int, count: int) -> ProviderResult:
        import anthropic

        w, h = canvas_size(aspect_ratio)
        content: list[dict] = []
        for ref in references:
            if ref.mime_type in _RASTER:
                content.append({"type": "image", "source": {"type": "base64", "media_type": ref.mime_type,
                                                            "data": base64.standard_b64encode(ref.data).decode()}})
            elif ref.mime_type == SVG_MIME:
                content.append({"type": "text", "text": "Existing SVG to modify:\n" + ref.data.decode("utf-8", "replace")})
        task = "Use the image(s) above as the reference. Request: " + prompt if references else prompt
        if count > 1:
            task += f"\n\n(Variation {index + 1} of {count}: make it clearly different from the other variations.)"
        content.append({"type": "text", "text": task})
        try:
            resp = await self.client().beta.messages.create(
                model=model, max_tokens=16000, system=SYSTEM_PROMPT.format(w=w, h=h),
                messages=[{"role": "user", "content": content}], output_config={"effort": "medium"},
                betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            )
        except anthropic.APIStatusError as exc:
            raise _api_failure(exc) from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderUnavailableError("could not reach the Anthropic API. Try again.") from exc
        if resp.stop_reason == "refusal":
            raise ImageGenerationError("Claude declined to draw this. Rephrase the request.")
        text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
        match = _SVG_BLOCK.search(text)
        if not match:
            reason = " (the drawing was cut off: ask for a simpler image)" if resp.stop_reason == "max_tokens" else ""
            raise ImageGenerationError("Claude did not return a drawing" + reason + ".")
        svg = sanitize_svg(match.group(0))
        return ProviderResult(images=[ProviderImage(data=svg, mime_type=SVG_MIME)],
                              input_tokens=resp.usage.input_tokens, output_tokens=resp.usage.output_tokens)


def _api_failure(exc: BaseException) -> ImageGenerationError:
    code = getattr(exc, "status_code", None)
    message = str(getattr(exc, "message", "") or exc)[:300]
    if code in (401, 403):
        return ProviderUnavailableError("the Anthropic API rejected the key (check ANTHROPIC_API_KEY).")
    if code == 404:
        return ProviderUnavailableError(f"the drawing model is not available to this key ({message}). Set TECTONIC_SVG_MODEL.")
    if code == 429:
        return ProviderUnavailableError("the Anthropic rate limit was reached. Try again in a minute.")
    if code is not None and code >= 500:
        return ProviderUnavailableError("the Anthropic API had a temporary error. Try again.")
    return ImageGenerationError(f"the drawing request failed: {message}")
