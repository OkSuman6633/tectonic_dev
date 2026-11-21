"""Connector registry: the single place a new data source is plugged in.

    from tectonic_runtime.connectors import BaseConnector, register_connector

    @register_connector
    class HubSpotConnector(BaseConnector):
        name = "hubspot"; label = "HubSpot"; tool_prefix = "hubspot"
        auth_schemes = (...); capabilities = (...)
        async def authenticate(self): ...
        async def fetch_data(self, resource, params): ...

Registered connectors get LLM tools (one per capability), a card in the External Tools window and the
``/connectors`` API automatically.
"""

from __future__ import annotations

import re

from .base import BaseConnector, UnsupportedOperation
from .google_analytics import GoogleAnalyticsConnector
from .meta_ads import MetaAdsConnector

_REGISTRY: dict[str, type[BaseConnector]] = {}
_NAME = re.compile(r"^[a-z][a-z0-9_]{1,40}$")


def register_connector(cls: type[BaseConnector]) -> type[BaseConnector]:
    for attr in ("name", "tool_prefix"):
        if not _NAME.match(getattr(cls, attr, "") or ""):
            raise ValueError(f"{cls.__name__}.{attr} must be snake_case")
    if not cls.auth_schemes:
        raise ValueError(f"{cls.__name__} declares no auth_schemes")
    for other in _REGISTRY.values():
        if other is not cls and (other.name == cls.name or other.tool_prefix == cls.tool_prefix):
            raise ValueError(f"{cls.__name__} collides with {other.__name__} (name/tool_prefix must be unique)")
    _REGISTRY[cls.name] = cls
    return cls


def get_connector(name: str) -> type[BaseConnector]:
    """Look a connector up by name or tool prefix (``google_analytics`` or ``ga4``)."""
    key = (name or "").strip().lower()
    for cls in _REGISTRY.values():
        if key in (cls.name, cls.tool_prefix):
            return cls
    raise UnsupportedOperation(f"unknown connector {name!r}; available: {sorted(_REGISTRY)}")


def all_connectors() -> list[type[BaseConnector]]:
    return list(_REGISTRY.values())


register_connector(MetaAdsConnector)
register_connector(GoogleAnalyticsConnector)
