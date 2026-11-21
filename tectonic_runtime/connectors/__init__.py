"""External Connector Module: the secure bridge between agents and clients' third-party data.

    BaseConnector            the contract (authenticate / fetch_data / execute_action + declarations)
    MetaAdsConnector         Meta Marketing API: insights (spend, ROAS, ...), campaigns, PAUSED staging
    GoogleAnalyticsConnector GA4 Data API: reports, traffic, source/medium, conversions
    register_connector       plug in a new data source (LinkedIn, HubSpot, ...)
    CredentialVault          encrypted, expiring, per-account credential storage
    connector_tools()        ADK tools (JSON-Schema declared);  tool_specs()/dispatch() for other frameworks

The runtime module ``external_connectors`` (tectonic_runtime/services/connectors_service.py) runs it
behind the standard module API, and ``agent_builder/connectors_api.py`` serves the Studio's External Tools window.
"""

from .base import (AuthScheme, BaseConnector, Capability, ConnectorError, CredentialField, Credentials,
                   CredentialsInvalid, CredentialsRequired, UnsupportedOperation)
from .google_analytics import GoogleAnalyticsConnector
from .meta_ads import MetaAdsConnector
from .redaction import find_secrets, install_log_redaction, register_secret, scrub
from .registry import all_connectors, get_connector, register_connector
from .vault import ConnectionKey, CredentialVault, SecretStore, owner_of

__all__ = [
    "AuthScheme", "BaseConnector", "Capability", "ConnectionKey", "ConnectorError", "CredentialField",
    "CredentialVault", "Credentials", "CredentialsInvalid", "CredentialsRequired",
    "GoogleAnalyticsConnector", "MetaAdsConnector", "SecretStore", "UnsupportedOperation", "all_connectors",
    "find_secrets", "get_connector", "install_log_redaction", "owner_of", "register_connector", "register_secret",
    "scrub",
]
