"""Keep connector credentials out of LLM context, logs, telemetry and the audit trail.

Two layers:

1. **Exact values.** Every secret the vault stores is registered here; ``scrub`` replaces any
   occurrence of a registered value in any string or nested structure.
2. **Shapes.** Well-known credential formats (Meta ``EAA…`` tokens, Google ``ya29.`` access tokens and
   ``1//`` refresh tokens, PEM private keys, ``access_token=`` query parameters, bearer headers) are
   masked even when they were never registered, e.g. a token the user pasted into the chat.

``install_log_redaction()`` applies ``scrub`` to every Python log record (the ADK, uvicorn and the
platform's own tracing all log through ``logging``).
"""

from __future__ import annotations

import logging
import re
import threading
from typing import Any

REDACTED = "[REDACTED]"

# kind -> pattern. Ordered: the PEM block must win over the generic long-token patterns.
SECRET_PATTERNS: dict[str, re.Pattern[str]] = {
    "private_key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)", re.S),
    "private_key_json": re.compile(r'"private_key"\s*:\s*"[^"]*"'),
    "meta_access_token": re.compile(r"\bEAA[A-Za-z0-9]{30,}\b"),
    "google_access_token": re.compile(r"\bya29\.[0-9A-Za-z_\-]{20,}"),
    "google_refresh_token": re.compile(r"\b1//[0-9A-Za-z_\-]{20,}"),
    "query_secret": re.compile(r"((?:access_token|appsecret_proof|client_secret|refresh_token|assertion)=)[^&\s\"']+", re.I),
    "bearer": re.compile(r"(Bearer\s+)[A-Za-z0-9._~+/\-]{16,}=*", re.I),
}

_MIN_SECRET_LEN = 8
_MAX_TRACKED = 2000
_lock = threading.Lock()
_known: dict[str, None] = {}  # insertion-ordered set of registered secret values
_known_re: re.Pattern[str] | None = None


def register_secret(*values: str | None) -> None:
    """Track secret values so any later occurrence is masked (bounded; oldest forgotten first)."""
    global _known_re
    added = False
    with _lock:
        for value in values:
            if isinstance(value, str) and len(value) >= _MIN_SECRET_LEN and value not in _known:
                _known[value] = None
                added = True
                # A multi-line secret (a service-account JSON) is also tracked line by line.
                for line in value.splitlines():
                    line = line.strip().strip('",')
                    if len(line) >= 24 and line not in _known:
                        _known[line] = None
        while len(_known) > _MAX_TRACKED:
            _known.pop(next(iter(_known)))
        if added:
            ordered = sorted(_known, key=len, reverse=True)  # longest first: no partial masks
            _known_re = re.compile("|".join(re.escape(v) for v in ordered)) if ordered else None


def _scrub_text(text: str) -> str:
    pattern = _known_re
    if pattern is not None:
        text = pattern.sub(REDACTED, text)
    for kind, regex in SECRET_PATTERNS.items():
        if kind in ("query_secret", "bearer"):
            text = regex.sub(lambda m: m.group(1) + REDACTED, text)
        elif kind == "private_key_json":
            text = regex.sub('"private_key": "' + REDACTED + '"', text)
        else:
            text = regex.sub(REDACTED, text)
    return text


def scrub(value: Any, _depth: int = 0) -> Any:
    """Return ``value`` with every secret masked (strings, and strings nested in dicts/lists/tuples)."""
    if isinstance(value, str):
        return _scrub_text(value) if value else value
    if _depth > 12:
        return value
    if isinstance(value, dict):
        return {k: scrub(v, _depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v, _depth + 1) for v in value]
    if isinstance(value, tuple):
        return tuple(scrub(v, _depth + 1) for v in value)
    return value


def find_secrets(text: str) -> list[str]:
    """Kinds of credential found in free text (used to stop pasted tokens reaching the LLM)."""
    if not text:
        return []
    kinds = [kind for kind, regex in SECRET_PATTERNS.items() if kind not in ("bearer", "query_secret") and regex.search(text)]
    if _known_re is not None and _known_re.search(text):
        kinds.append("stored_credential")
    if '"type": "service_account"' in text or '"type":"service_account"' in text:
        kinds.append("service_account_json")
    return sorted(set(kinds))


# --- logging -------------------------------------------------------------------------------------
_installed = False


def install_log_redaction() -> None:
    """Scrub every log record process-wide (idempotent)."""
    global _installed
    if _installed:
        return
    _installed = True
    previous = logging.getLogRecordFactory()

    def factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = previous(*args, **kwargs)
        try:
            message = record.getMessage()
            cleaned = _scrub_text(message)
            if cleaned != message:
                record.msg, record.args = cleaned, None
        except Exception:  # a malformed record must never break logging
            pass
        return record

    logging.setLogRecordFactory(factory)
