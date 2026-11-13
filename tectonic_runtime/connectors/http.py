"""Outbound HTTP for connectors: timeouts, bounded retries with backoff, and no secret in any URL.

Connectors authenticate with headers (``Authorization: Bearer``), never with query-string tokens, so an
upstream error, a proxy log or an exception message cannot carry a credential. Retries cover network
failures, HTTP 429 and 5xx; each connector decides which API-level errors are retryable by raising
``RetryableResponse`` from its response checker.
"""

from __future__ import annotations

import asyncio
import os
import random
from typing import Any, Awaitable, Callable

import httpx

DEFAULT_TIMEOUT = float(os.getenv("TECTONIC_CONNECTOR_TIMEOUT", "30"))
MAX_ATTEMPTS = int(os.getenv("TECTONIC_CONNECTOR_MAX_ATTEMPTS", "3"))
_MAX_BACKOFF = 8.0


class RetryableResponse(Exception):
    """Raised by a response checker to request a retry (e.g. an API-level rate-limit error)."""

    def __init__(self, response: httpx.Response, retry_after: float | None = None) -> None:
        super().__init__(f"retryable response {response.status_code}")
        self.response = response
        self.retry_after = retry_after


def _retry_after(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    try:
        return min(float(raw), _MAX_BACKOFF) if raw else None
    except ValueError:
        return None


class ConnectorHTTP:
    """A thin, testable wrapper over ``httpx.AsyncClient`` (inject ``transport`` in tests)."""

    def __init__(self, service: str, *, transport: httpx.AsyncBaseTransport | None = None,
                 timeout: float = DEFAULT_TIMEOUT, max_attempts: int = MAX_ATTEMPTS) -> None:
        self.service = service
        self.transport = transport
        self.timeout = timeout
        self.max_attempts = max(1, max_attempts)
        # Tests set this to 0 to retry without sleeping.
        self.backoff_base = 0.5

    async def request(self, method: str, url: str, *, headers: dict[str, str] | None = None,
                      params: dict[str, Any] | None = None, data: dict[str, Any] | None = None,
                      json: Any = None,
                      check: Callable[[httpx.Response], Awaitable[None] | None] | None = None) -> httpx.Response:
        """Send a request, retrying transient failures. ``check`` may raise ``RetryableResponse``."""
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            delay: float | None = None
            try:
                async with httpx.AsyncClient(transport=self.transport, timeout=self.timeout,
                                             follow_redirects=False) as client:
                    response = await client.request(method, url, headers=headers, params=params, data=data, json=json)
                if response.status_code == 429 or response.status_code >= 500:
                    raise RetryableResponse(response, _retry_after(response))
                if check is not None:
                    maybe = check(response)
                    if asyncio.iscoroutine(maybe):
                        await maybe
                return response
            except RetryableResponse as exc:
                last_error = exc
                delay = exc.retry_after
                if attempt == self.max_attempts:
                    return exc.response  # the caller turns the final response into a clear error
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                last_error = exc
                if attempt == self.max_attempts:
                    from .base import ConnectorError

                    raise ConnectorError(f"{self.service} is unreachable ({type(exc).__name__}); try again shortly",
                                         code="upstream_unreachable", retryable=True) from None
            await asyncio.sleep(delay if delay is not None else self._backoff(attempt))
        raise AssertionError(f"unreachable: {last_error}")  # pragma: no cover

    def _backoff(self, attempt: int) -> float:
        if self.backoff_base <= 0:
            return 0
        return min(_MAX_BACKOFF, self.backoff_base * 2 ** (attempt - 1)) * (0.75 + random.random() / 2)
