"""Types shared by the image module and its providers (Google raster images, Claude vector drawings)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class ImageGenerationError(RuntimeError):
    """The image could not be produced (the message is written for the end user)."""


class ProviderUnavailableError(ImageGenerationError):
    """The provider itself could not serve the request (no or rejected key, model unavailable, quota, outage),
    as opposed to a refusal of this particular prompt. Only these failures may switch to another provider."""


@dataclass
class ProviderImage:
    data: bytes
    mime_type: str


@dataclass
class ProviderResult:
    images: list[ProviderImage]
    text: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_usage: bool = False
    notes: list[str] = field(default_factory=list)


class ImageProvider(Protocol):
    def available(self) -> str | None:
        """None when configured, else why not (shown to the user)."""

    async def generate(self, *, model: str, prompt: str, aspect_ratio: str, count: int,
                       references: list[ProviderImage]) -> ProviderResult: ...
