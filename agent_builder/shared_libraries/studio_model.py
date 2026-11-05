"""The Builder's model: Gemini or Claude, switchable at runtime from the Studio.

Every Builder agent (and the agent editor) holds the same ``StudioModel`` instance, which delegates
each call to the model currently selected. Switching it applies to the next model call, no restart.

Claude runs through ADK's Anthropic adapter (official ``anthropic`` SDK), tuned in ``StudioClaude``.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import deque
from typing import AsyncGenerator, Callable, Optional

import anthropic
from anthropic import AsyncAnthropic, transform_schema
from google.adk.models.anthropic_llm import AnthropicLlm
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import BaseModel, PrivateAttr

# Current-generation Claude models: they reject sampling parameters and take an explicit effort level.
_CURRENT_CLAUDE = re.compile(r"^claude-(opus|sonnet|haiku|fable|mythos)-5")
# Builder calls are non-streaming; 16K output tokens keeps each call under the SDK's HTTP-timeout guard
# while leaving room for whole-file code writes.
CLAUDE_MAX_TOKENS = 16_000
CLAUDE_EFFORT = "high"  # the Builder designs and writes code: intelligence-sensitive work
_MAX_TRACKED_SIGNATURES = 2_000
# Structured outputs compile the schema into a grammar first. Measured on the Builder's schemas: Intent
# (~1.5K chars) compiles in seconds; Requirements (~6.5K chars) is refused after ~65 s ("Grammar
# compilation timed out"). Larger schemas go straight to the instruction route.
STRUCTURED_SCHEMA_MAX_CHARS = 3_000


def is_claude(model: str) -> bool:
    name = (model or "").strip().lower()
    return name.startswith(("claude-", "anthropic/"))


def claude_model_id(model: str) -> str:
    name = model.strip()
    return name.split("/", 1)[1] if name.lower().startswith("anthropic/") else name


def _response_schema(llm_request: LlmRequest) -> dict | None:
    """The agent's output_schema as a JSON schema Claude's structured outputs accept, if any."""
    config = llm_request.config
    schema = (getattr(config, "response_json_schema", None) or getattr(config, "response_schema", None)) if config else None
    if isinstance(schema, type) and issubclass(schema, BaseModel):
        return transform_schema(schema)
    if isinstance(schema, dict):
        return transform_schema(schema)
    return None


def _schema_key(schema: dict) -> str:
    return hashlib.sha256(json.dumps(schema, sort_keys=True).encode()).hexdigest()


def _json_only(response: LlmResponse) -> LlmResponse:
    """Keep only the JSON object of a reply (ADK validates output_schema replies with model_validate_json)."""
    parts = (response.content.parts or []) if response.content else []
    text = "".join(p.text for p in parts if p.text and not p.thought)
    start, end = text.find("{"), text.rfind("}")
    if response.partial or start < 0 or end <= start:
        return response
    candidate = text[start:end + 1]
    try:
        json.loads(candidate)
    except ValueError:
        return response
    kept = [p for p in parts if p.thought] + [types.Part(text=candidate)]
    return response.model_copy(update={"content": types.Content(role="model", parts=kept)})


class StudioClaude(AnthropicLlm):
    """ADK's Claude adapter with the Builder's settings: explicit effort, no sampling parameters on current
    models, and output_schema honoured (the adapter drops it, while ADK validates those replies as JSON -
    e.g. intent_detection and requirement_understanding). The schema goes out as structured output; one
    that Anthropic refuses as too complex is sent as an instruction instead, and the JSON object is
    taken from the reply."""

    _unconstrained: set = PrivateAttr(default_factory=set)  # schemas structured outputs refused

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        schema = _response_schema(llm_request)
        key = _schema_key(schema) if schema is not None else None
        if key is not None and len(json.dumps(schema)) > STRUCTURED_SCHEMA_MAX_CHARS:
            self._unconstrained.add(key)  # too big to compile in time: don't pay a ~1 min refusal first
        if key is None or key not in self._unconstrained:
            try:
                async for response in super().generate_content_async(llm_request, stream):
                    yield response
                return
            except anthropic.BadRequestError:
                # Large schemas are refused in several ways ("Schema is too complex", "Grammar compilation
                # timed out"); retry without structured output. Any other 400 fails again just the same.
                if key is None:
                    raise
        request = llm_request.model_copy(deep=True)
        request.config.response_schema = None
        request.config.response_json_schema = None
        request.append_instructions([
            "Reply with only a JSON object (no prose, no code fences) that conforms to this JSON schema:\n"
            + json.dumps(schema)
        ])
        async for response in super().generate_content_async(request, stream):
            yield _json_only(response)
        self._unconstrained.add(key)  # it worked: skip the refused attempt from now on

    def _build_anthropic_kwargs(self, llm_request, messages, tools, tool_choice, thinking):
        kwargs = super()._build_anthropic_kwargs(llm_request, messages, tools, tool_choice, thinking)
        output_config = dict(kwargs.get("output_config") or {})
        if _CURRENT_CLAUDE.match(kwargs["model"]):
            for key in ("temperature", "top_p", "top_k"):
                kwargs.pop(key, None)
            output_config.setdefault("effort", CLAUDE_EFFORT)
        schema = _response_schema(llm_request)
        if schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        if output_config:
            kwargs["output_config"] = output_config
        return kwargs


def build_claude(model: str, api_key: str) -> StudioClaude:
    return StudioClaude(model=claude_model_id(model), max_tokens=CLAUDE_MAX_TOKENS, client=AsyncAnthropic(api_key=api_key))


class StudioModel(BaseLlm):
    """The one model instance every Builder agent holds; delegates to the model selected in the Studio."""

    model: str
    _delegate: BaseLlm = PrivateAttr()
    # Thinking signatures Claude produced in this process: only those may be sent back to Claude, and
    # never to Gemini (each provider rejects the other's signed reasoning when you switch mid-conversation).
    _claude_signatures: set = PrivateAttr(default_factory=set)
    _signature_order: deque = PrivateAttr(default_factory=deque)

    # Per-user choice (multi-user Studio): returns (delegate, name) for the current user, or None for the default.
    _resolver: Optional[Callable[[], Optional[tuple[BaseLlm, str]]]] = PrivateAttr(default=None)

    def use(self, delegate: BaseLlm, name: str) -> None:
        """Switch the default model of every Builder agent to `delegate` (shown as `name`)."""
        self._delegate = delegate
        self.model = name

    def set_resolver(self, resolver: Callable[[], Optional[tuple[BaseLlm, str]]]) -> None:
        """Let each signed-in user run the Builder on their own model (see model_settings.py)."""
        self._resolver = resolver

    def current(self) -> tuple[BaseLlm, str]:
        """The (delegate, model name) serving this call: the user's own choice, else the default."""
        chosen = self._resolver() if self._resolver else None
        return chosen or (self._delegate, self.model)

    @property
    def delegate(self) -> BaseLlm:
        return self.current()[0]

    @property
    def capabilities(self):  # type: ignore[override]
        return self.current()[0].capabilities

    def _remember(self, response: LlmResponse) -> None:
        for part in (response.content.parts or []) if response.content else []:
            sig = part.thought_signature
            if part.thought and sig and sig not in self._claude_signatures:
                self._claude_signatures.add(sig)
                self._signature_order.append(sig)
                if len(self._signature_order) > _MAX_TRACKED_SIGNATURES:
                    self._claude_signatures.discard(self._signature_order.popleft())

    def _portable_history(self, contents: list[types.Content], to_claude: bool) -> list[types.Content]:
        """Drop signed reasoning the target provider did not produce (it would reject it)."""
        out = []
        for content in contents:
            parts = content.parts or []
            kept = [p for p in parts
                    if not (p.thought and p.thought_signature)
                    or (p.thought_signature in self._claude_signatures) == to_claude]
            if len(kept) == len(parts):
                out.append(content)
            elif kept:
                out.append(content.model_copy(update={"parts": kept}))
        return out

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        delegate = self.current()[0]  # pinned for this call even if the user switches meanwhile
        to_claude = isinstance(delegate, AnthropicLlm)
        llm_request.model = delegate.model
        llm_request.contents = self._portable_history(list(llm_request.contents or []), to_claude)
        async for response in delegate.generate_content_async(llm_request, stream):
            if to_claude and not response.partial:
                self._remember(response)
            yield response

    def connect(self, llm_request: LlmRequest):
        delegate = self.current()[0]
        llm_request.model = delegate.model
        return delegate.connect(llm_request)
