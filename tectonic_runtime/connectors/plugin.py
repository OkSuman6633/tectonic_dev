"""ADK plugin: credentials pasted into the chat never reach the model or the session history.

Connector credentials are entered in the Studio's External Tools window, but users sometimes paste a token
or a service-account key straight into a message. This plugin rewrites the user message before ADK stores
it or sends it to any model: each credential is replaced with ``[REDACTED]`` and the agent is told to
point the user to the External Tools window instead.
"""

from __future__ import annotations

from typing import Any, Optional

from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types

from .redaction import find_secrets, scrub

NOTE = ("[Platform note: the user's message contained a credential ({kinds}). It was removed before reaching you "
        "and was NOT stored. Tell the user never to paste credentials in the chat and to connect the data source "
        "in the External Tools window (the plug icon in the Studio's dock) instead.]")


class ConnectorSecretsPlugin(BasePlugin):
    def __init__(self, name: str = "tectonic_connector_secrets") -> None:
        super().__init__(name=name)

    async def on_user_message_callback(self, *, invocation_context: Any,
                                       user_message: types.Content) -> Optional[types.Content]:
        if not user_message or not user_message.parts:
            return None
        found: list[str] = []
        parts = []
        for part in user_message.parts:
            if part.text and (kinds := find_secrets(part.text)):
                found += kinds
                parts.append(part.model_copy(update={"text": scrub(part.text)}))
            else:
                parts.append(part)
        if not found:
            return None
        parts.append(types.Part(text=NOTE.format(kinds=", ".join(sorted(set(found))))))
        return types.Content(role=user_message.role or "user", parts=parts)


connector_secrets_plugin = ConnectorSecretsPlugin()
