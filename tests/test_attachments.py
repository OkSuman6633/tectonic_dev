"""Attachments: every agent can read images, PDFs, Office documents and text files."""

from __future__ import annotations

import base64
import io
import zipfile

import pytest
from google.genai import types

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'


def _zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, text in files.items():
            zf.writestr(name, text)
    return buf.getvalue()


def _part(data: bytes, mime: str, name: str) -> types.Part:
    return types.Part(inline_data=types.Blob(mime_type=mime, data=data, display_name=name))


DOCX = _zip({"word/document.xml": f'<w:document {W}><w:body><w:p><w:r><w:t>Refund policy</w:t></w:r></w:p>'
                                   '<w:p><w:r><w:t>Refunds within </w:t></w:r><w:r><w:t>30 days.</w:t></w:r></w:p></w:body></w:document>'})
PPTX = _zip({"ppt/slides/slide2.xml": f"<p:sld {A} xmlns:p='x'><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>",
             "ppt/slides/slide1.xml": f"<p:sld {A} xmlns:p='x'><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>"})
XLSX = _zip({
    "xl/workbook.xml": f'<workbook {S}><sheets><sheet name="Orders"/></sheets></workbook>',
    "xl/sharedStrings.xml": f"<sst {S}><si><t>sku</t></si><si><t>qty</t></si><si><t>A-1</t></si></sst>",
    "xl/worksheets/sheet1.xml": f'<worksheet {S}><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>'
                                '<row><c t="s"><v>2</v></c><c><v>4</v></c></row></sheetData></worksheet>',
})
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_office_documents_become_text():
    from agent_builder.attachments import normalize_part

    doc = normalize_part(_part(DOCX, DOCX_MIME, "policy.docx")).text
    assert doc.startswith('[Attached docx document "policy.docx"]') and "Refund policy\nRefunds within 30 days." in doc
    slides = normalize_part(_part(PPTX, "application/octet-stream", "deck.pptx")).text  # recognised by extension
    assert slides.index("Slide 1 ---\nFirst") < slides.index("Slide 2 ---\nSecond")
    sheet = normalize_part(_part(XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "o.xlsx")).text
    assert "--- Sheet: Orders ---\nsku,qty\nA-1,4" in sheet


def test_images_and_pdfs_stay_native_text_files_are_inlined_others_explained():
    from agent_builder.attachments import normalize_content

    msg = types.Content(role="user", parts=[
        types.Part(text="What is in these?"),
        _part(b"\x89PNG", "image/png", "shot.png"),
        _part(b"\xff\xd8", "image/jpg", "photo.jpg"),
        _part(b"%PDF-1.7", "application/pdf", "spec.pdf"),
        _part("id,name\n1,Ann".encode(), "text/csv", "people.csv"),
        _part(b"\x00\x01", "application/zip", "bundle.zip"),
    ])
    out = normalize_content(msg).parts
    assert out[0].text == "What is in these?"
    assert out[1].inline_data.mime_type == "image/png"
    assert out[2].inline_data.mime_type == "image/jpeg"  # normalised for the providers
    assert out[3].inline_data.mime_type == "application/pdf"
    assert "id,name\n1,Ann" in out[4].text
    assert "cannot be read" in out[5].text
    assert normalize_content(types.Content(role="user", parts=[types.Part(text="hi")])) is None  # nothing to do


def test_oversized_and_broken_files_are_reported_not_sent(monkeypatch):
    from agent_builder import attachments

    monkeypatch.setattr(attachments, "MAX_FILE_BYTES", 10)
    assert "over the" in attachments.normalize_part(_part(b"x" * 11, "image/png", "big.png")).text
    monkeypatch.setattr(attachments, "MAX_FILE_BYTES", 10_000)
    assert "could not be read as docx" in attachments.normalize_part(_part(b"not a zip", DOCX_MIME, "x.docx")).text


def test_uploads_from_the_chat_api():
    from agent_builder.attachments import attachment_parts, normalize_content, parts_from_upload

    parts = parts_from_upload([{"name": "a.png", "mimeType": "image/png", "data": base64.b64encode(b"img").decode()}, {"name": "empty"}])
    assert len(parts) == 1 and parts[0].inline_data.data == b"img" and parts[0].inline_data.display_name == "a.png"
    with pytest.raises(ValueError):
        parts_from_upload([{"name": "bad", "data": "@@not base64@@"}])
    # What ask_agent forwards: the files, not the user's own words.
    msg = normalize_content(types.Content(role="user", parts=[types.Part(text="ask @desk"), *parts,
                                                              _part(b"hello", "text/plain", "n.txt")]))
    forwarded = attachment_parts(msg)
    assert len(forwarded) == 2 and forwarded[0].inline_data and forwarded[1].text.startswith("[Attached file")
