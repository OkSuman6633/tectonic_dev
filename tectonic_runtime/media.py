"""Media store: images the platform generates (and reference images handed to it), kept on disk.

Images never travel through module payloads, telemetry, the audit trail or the model context as bytes:
callers get an id and a URL (``/media/images/<id>``) that the Studio serves to the image's owner only.

    <TECTONIC_MEDIA_PATH or generated_agents/_platform/media>/images/<id>.<ext>   the image
                                                                    /<id>.json    its metadata
"""

from __future__ import annotations

import json
import os
import re
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ._paths import STATE_DIR

MAX_IMAGE_BYTES = 20 * 1024 * 1024
IMAGE_ID = re.compile(r"^[0-9a-f]{32}$")
_EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
               "image/heic": "heic", "image/heif": "heif", "image/svg+xml": "svg"}
URL_PREFIX = "/media/images/"


class MediaError(ValueError):
    """An image cannot be stored or found (the message is safe to show)."""


@dataclass
class StoredImage:
    id: str
    mime_type: str
    owner: str
    prompt: str = ""
    model: str = ""
    kind: str = "generated"  # "generated" | "reference"
    team: str | None = None
    agent_id: str = ""
    session_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    size_bytes: int = 0

    @property
    def url(self) -> str:
        return URL_PREFIX + self.id

    def public(self) -> dict[str, Any]:
        """What tools, the chat and telemetry see (never the bytes)."""
        return {"id": self.id, "url": self.url, "mime_type": self.mime_type, "prompt": self.prompt, "model": self.model}


def sniff_mime(data: bytes) -> str | None:
    """The real image type from its magic bytes (providers and uploads may mislabel it)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[4:12] in (b"ftypheic", b"ftypheix", b"ftypmif1", b"ftypheif"):
        return "image/heic"
    head = data[:512].lstrip().lower()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head):
        return "image/svg+xml"
    return None


class MediaStore:
    def __init__(self, root: Path | None = None) -> None:
        raw = os.getenv("TECTONIC_MEDIA_PATH")
        self.root = (root or (Path(raw) if raw else STATE_DIR / "media")) / "images"
        self._lock = threading.Lock()

    def _meta_path(self, image_id: str) -> Path:
        if not IMAGE_ID.match(image_id or ""):  # also keeps ids from escaping the folder
            raise MediaError("invalid image id")
        return self.root / f"{image_id}.json"

    def save(self, data: bytes, *, owner: str, mime_type: str | None = None, prompt: str = "", model: str = "",
             kind: str = "generated", team: str | None = None, agent_id: str = "", session_id: str | None = None) -> StoredImage:
        if not data:
            raise MediaError("empty image")
        if len(data) > MAX_IMAGE_BYTES:
            raise MediaError(f"image too large ({len(data) // 1024} KB; limit {MAX_IMAGE_BYTES // (1024 * 1024)} MB)")
        mime = sniff_mime(data) or (mime_type if mime_type in _EXTENSIONS and mime_type != "image/svg+xml" else None)
        if mime is None:
            raise MediaError("not a supported image (PNG, JPEG, WebP, GIF, HEIC or SVG)")
        if mime == "image/svg+xml":  # every SVG, generated or uploaded, is stripped of scripts and external refs
            from .services.image_types import ImageGenerationError
            from .services.svg_image_provider import sanitize_svg

            try:
                data = sanitize_svg(data.decode("utf-8"))
            except (ImageGenerationError, UnicodeDecodeError) as exc:
                raise MediaError(f"unsafe or invalid SVG: {exc}") from None
        image = StoredImage(id=uuid.uuid4().hex, mime_type=mime, owner=owner, prompt=prompt[:2000], model=model, kind=kind,
                            team=team, agent_id=agent_id, session_id=session_id, size_bytes=len(data))
        with self._lock:
            self.root.mkdir(parents=True, exist_ok=True)
            self._data_path(image).write_bytes(data)
            tmp = self.root / f"{image.id}.json.tmp"
            tmp.write_text(json.dumps(asdict(image)), encoding="utf-8")
            tmp.replace(self.root / f"{image.id}.json")
        return image

    def _data_path(self, image: StoredImage) -> Path:
        return self.root / f"{image.id}.{_EXTENSIONS[image.mime_type]}"

    def get(self, image_id: str) -> StoredImage:
        meta = self._meta_path(image_id)
        try:
            raw = json.loads(meta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise MediaError("image not found") from None
        return StoredImage(**{k: v for k, v in raw.items() if k in StoredImage.__dataclass_fields__})

    def read(self, image_id: str) -> tuple[StoredImage, bytes]:
        image = self.get(image_id)
        try:
            return image, self._data_path(image).read_bytes()
        except OSError:
            raise MediaError("image not found") from None

    def file_path(self, image_id: str) -> tuple[StoredImage, Path]:
        image = self.get(image_id)
        path = self._data_path(image)
        if not path.is_file():
            raise MediaError("image not found")
        return image, path

    def delete(self, image_id: str) -> bool:
        try:
            image = self.get(image_id)
        except MediaError:
            return False
        with self._lock:
            for path in (self._data_path(image), self.root / f"{image.id}.json"):
                path.unlink(missing_ok=True)
        return True

    def list(self, *, owner: str | None = None, session_id: str | None = None, kind: str = "generated",
             limit: int = 20) -> list[StoredImage]:
        if not self.root.is_dir():
            return []
        found: list[StoredImage] = []
        for meta in sorted(self.root.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                image = self.get(meta.stem)
            except MediaError:
                continue
            if image.kind != kind or (owner is not None and image.owner != owner) or \
                    (session_id is not None and image.session_id != session_id):
                continue
            found.append(image)
            if len(found) >= limit:
                break
        return found


_store: MediaStore | None = None


def get_media_store() -> MediaStore:
    global _store
    if _store is None:
        _store = MediaStore()
    return _store


def reset_media_store(root: Path | None = None) -> MediaStore:
    """Point the store somewhere else (tests)."""
    global _store
    _store = MediaStore(root)
    return _store
