"""Serves images generated in the chat: ``GET /media/images/<id>``.

With sign-in on, the auth middleware has already bound the caller (``/media/`` is a protected path) and only
the image's owner (the ADK user whose agent generated it) may read it; anyone else gets 404, so ids reveal
nothing. With sign-in off (a single-user local Studio) every image is the local user's.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from tectonic_runtime.media import MediaError, get_media_store

from .workspace import current_user

router = APIRouter()


@router.get("/media/images/{image_id}")
async def get_image(image_id: str, download: bool = False):
    from .studio_api import auth_enabled

    try:
        image, path = get_media_store().file_path(image_id)
    except MediaError:
        raise HTTPException(404, "Image not found") from None
    if auth_enabled() and image.owner != current_user():
        raise HTTPException(404, "Image not found")
    filename = f"tectonic-{image.id[:8]}{path.suffix}"
    return FileResponse(path, media_type=image.mime_type, filename=filename if download else None,
                        content_disposition_type="attachment" if download else "inline",
                        headers={"Cache-Control": "private, max-age=31536000, immutable",
                                 "X-Content-Type-Options": "nosniff",
                                 # SVGs are sanitized when stored; this keeps any image from running code if opened directly.
                                 "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox"})
