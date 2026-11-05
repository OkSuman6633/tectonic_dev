"""Images and documents attached to a chat message, made readable for every agent.

The Studio sends attachments as ``inline_data`` parts of the user message. Before any agent runs,
``AttachmentPlugin`` normalises them:

  * images (PNG, JPEG, WebP, GIF, HEIC) and PDFs stay inline: Gemini and Claude read them natively;
  * text files (txt, md, csv, json, xml, html, code, ...) become text parts;
  * Word / PowerPoint / Excel files (docx, pptx, xlsx) become text parts with their extracted text;
  * anything else becomes a short note so the agent can tell the user it cannot read that format.
"""

from __future__ import annotations

import io
import re
import zipfile
from typing import Any, Optional
from xml.etree import ElementTree

from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types

MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_TEXT_CHARS = 120_000  # per document, so one spreadsheet cannot crowd out the conversation

NATIVE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"}
_TEXT_TYPES = {"application/json", "application/xml", "application/x-yaml", "application/yaml", "application/javascript",
               "application/x-python", "application/sql", "application/x-ndjson"}
_TEXT_SUFFIXES = (".txt", ".md", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".html", ".htm", ".yaml", ".yml", ".log",
                  ".py", ".js", ".ts", ".sql", ".ini", ".toml", ".rtf")
_OFFICE = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _xml_text(data: bytes, paragraph_tags: tuple[str, ...]) -> str:
    """Text of an OOXML part: <t> runs joined, a line break after each paragraph-like element."""
    lines, current = [], []
    for _event, elem in ElementTree.iterparse(io.BytesIO(data), events=("end",)):
        tag = _local(elem.tag)
        if tag == "t" and elem.text:
            current.append(elem.text)
        elif tag == "tab":
            current.append("\t")
        elif tag in paragraph_tags:
            lines.append("".join(current))
            current = []
    if current:
        lines.append("".join(current))
    return "\n".join(line for line in lines if line.strip())


def _docx(zf: zipfile.ZipFile) -> str:
    return _xml_text(zf.read("word/document.xml"), ("p",))


def _pptx(zf: zipfile.ZipFile) -> str:
    def number(name: str) -> int:
        m = re.search(r"(\d+)\.xml$", name)
        return int(m.group(1)) if m else 0

    slides = sorted((n for n in zf.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)), key=number)
    return "\n\n".join(f"--- Slide {number(n)} ---\n{_xml_text(zf.read(n), ('p',))}" for n in slides)


def _xlsx(zf: zipfile.ZipFile) -> str:
    shared: list[str] = []
    if "xl/sharedStrings.xml" in zf.namelist():
        root = ElementTree.fromstring(zf.read("xl/sharedStrings.xml"))
        shared = ["".join(t.text or "" for t in si.iter() if _local(t.tag) == "t") for si in root if _local(si.tag) == "si"]
    names = {}
    if "xl/workbook.xml" in zf.namelist():
        wb = ElementTree.fromstring(zf.read("xl/workbook.xml"))
        names = {i + 1: s.get("name") for i, s in enumerate(e for e in wb.iter() if _local(e.tag) == "sheet")}
    out = []
    sheets = sorted((n for n in zf.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)),
                    key=lambda n: int(re.search(r"(\d+)\.xml$", n).group(1)))
    for path in sheets:
        idx = int(re.search(r"(\d+)\.xml$", path).group(1))
        rows = []
        for row in ElementTree.fromstring(zf.read(path)).iter():
            if _local(row.tag) != "row":
                continue
            cells = []
            for c in row:
                if _local(c.tag) != "c":
                    continue
                value = next((v.text or "" for v in c.iter() if _local(v.tag) in ("v", "t")), "")
                if c.get("t") == "s" and value.isdigit() and int(value) < len(shared):
                    value = shared[int(value)]
                cells.append(value)
            if any(cells):
                rows.append(",".join(cells))
        out.append(f"--- Sheet: {names.get(idx, idx)} ---\n" + "\n".join(rows))
    return "\n\n".join(out)


def extract_office_text(kind: str, data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        return {"docx": _docx, "pptx": _pptx, "xlsx": _xlsx}[kind](zf)


def _office_kind(mime: str, name: str) -> Optional[str]:
    if mime in _OFFICE:
        return _OFFICE[mime]
    suffix = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    return suffix if suffix in ("docx", "pptx", "xlsx") else None


def _is_text(mime: str, name: str) -> bool:
    return mime.startswith("text/") or mime in _TEXT_TYPES or name.lower().endswith(_TEXT_SUFFIXES)


def _as_text_part(name: str, kind: str, text: str) -> types.Part:
    clipped = text[:MAX_TEXT_CHARS]
    note = f"\n[... truncated: showing the first {MAX_TEXT_CHARS:,} of {len(text):,} characters]" if len(text) > MAX_TEXT_CHARS else ""
    return types.Part(text=f'[Attached {kind} "{name}"]\n<<<\n{clipped}{note}\n>>>')


def normalize_part(part: types.Part) -> types.Part:
    """One user-message part, readable by any model (see module docstring)."""
    blob = part.inline_data
    if blob is None or blob.data is None:
        return part
    mime = (blob.mime_type or "").split(";", 1)[0].strip().lower()
    name = blob.display_name or "attachment"
    data = blob.data
    if len(data) > MAX_FILE_BYTES:
        return types.Part(text=f'[Attachment "{name}" was not read: {len(data) // 1_048_576} MB is over the '
                               f'{MAX_FILE_BYTES // 1_048_576} MB limit.]')
    if mime == "image/jpg":  # a common non-standard type that both providers reject
        mime = "image/jpeg"
    if mime in NATIVE_TYPES:
        if mime != blob.mime_type:
            return types.Part(inline_data=types.Blob(mime_type=mime, data=data, display_name=blob.display_name))
        return part
    kind = _office_kind(mime, name)
    if kind:
        try:
            return _as_text_part(name, f"{kind} document", extract_office_text(kind, data))
        except (zipfile.BadZipFile, KeyError, ElementTree.ParseError) as exc:
            return types.Part(text=f'[Attachment "{name}" could not be read as {kind}: {exc}]')
    if _is_text(mime, name):
        return _as_text_part(name, "file", data.decode("utf-8", errors="replace"))
    return types.Part(text=f'[Attachment "{name}" ({mime or "unknown type"}) cannot be read. Supported: images, PDF, '
                           'Word, PowerPoint, Excel and text files.]')


def normalize_content(content: Optional[types.Content]) -> Optional[types.Content]:
    """The message with every attachment normalised, or None when it has no attachments."""
    parts = list(getattr(content, "parts", None) or [])
    if not any(p.inline_data is not None for p in parts):
        return None
    return types.Content(role=content.role or "user", parts=[normalize_part(p) for p in parts])


def parts_from_upload(items: Any) -> list[types.Part]:
    """Attachments sent as JSON ``[{"name", "mimeType", "data": <base64>}]`` (the directory chat API)."""
    import base64
    import binascii

    parts = []
    for item in items or []:
        if not isinstance(item, dict) or not item.get("data"):
            continue
        try:
            data = base64.b64decode(str(item["data"]), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError(f"Attachment {item.get('name')!r} is not valid base64") from exc
        parts.append(types.Part(inline_data=types.Blob(mime_type=str(item.get("mimeType") or "application/octet-stream"),
                                                       data=data, display_name=str(item.get("name") or "attachment"))))
    return parts


def attachment_parts(content: Optional[types.Content]) -> list[types.Part]:
    """The (already normalised) attachments of a message: what ask_agent forwards to another agent."""
    return [p for p in (getattr(content, "parts", None) or [])
            if p.inline_data is not None or (p.text or "").startswith("[Attached ")]


class AttachmentPlugin(BasePlugin):
    """Normalises attachments on the incoming user message of every run (Builder and generated agents)."""

    def __init__(self, name: str = "tectonic_attachments") -> None:
        super().__init__(name=name)

    async def on_user_message_callback(self, *, invocation_context: Any, user_message: types.Content) -> Optional[types.Content]:
        return normalize_content(user_message)


attachment_plugin = AttachmentPlugin()
