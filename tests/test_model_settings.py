"""Builder model choice: the switchable StudioModel, the Claude adapter settings, and the settings service."""

from __future__ import annotations

import pytest
from anthropic import NOT_GIVEN
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from agent_builder.shared_libraries.studio_model import CLAUDE_MAX_TOKENS, StudioClaude, StudioModel, build_claude, is_claude


class RecordingLlm(BaseLlm):
    """Replies with its own name and records the requests it got."""

    seen: list = []

    async def generate_content_async(self, llm_request, stream=False):
        self.seen.append(llm_request)
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.model)]))


async def _reply(model: BaseLlm, request: LlmRequest) -> str:
    return "".join([r.content.parts[0].text async for r in model.generate_content_async(request)])


def _request(contents=None) -> LlmRequest:
    return LlmRequest(model="studio", contents=contents or [types.Content(role="user", parts=[types.Part(text="hi")])],
                      config=types.GenerateContentConfig())


async def test_switching_applies_to_the_next_call_of_every_agent_sharing_the_model():
    shared = StudioModel(model="gemini-a")
    gemini, other = RecordingLlm(model="gemini-a", seen=[]), RecordingLlm(model="gemini-b", seen=[])
    shared.use(gemini, "gemini-a")
    assert await _reply(shared, _request()) == "gemini-a"
    assert gemini.seen[0].model == "gemini-a"  # the delegate's own model id, not the wrapper's
    shared.use(other, "gemini-b")
    assert await _reply(shared, _request()) == "gemini-b" and shared.model == "gemini-b"


def test_claude_requests_use_effort_structured_output_and_no_sampling():
    from agent_builder.shared_libraries.types import Intent

    claude = build_claude("claude-opus-5-5", "sk-ant-test")
    assert isinstance(claude, StudioClaude) and claude.max_tokens == CLAUDE_MAX_TOKENS
    request = LlmRequest(model="claude-opus-5-5", config=types.GenerateContentConfig(temperature=0.3, system_instruction="be brief"))
    request.set_output_schema(Intent)
    kwargs = claude._build_anthropic_kwargs(request, [{"role": "user", "content": "hi"}], NOT_GIVEN, NOT_GIVEN, NOT_GIVEN)
    assert "temperature" not in kwargs and kwargs["max_tokens"] == CLAUDE_MAX_TOKENS
    assert kwargs["output_config"]["effort"] == "high"
    fmt = kwargs["output_config"]["format"]
    assert fmt["type"] == "json_schema" and fmt["schema"]["additionalProperties"] is False

    plain = claude._build_anthropic_kwargs(LlmRequest(model="claude-opus-5-5", config=types.GenerateContentConfig()),
                                           [{"role": "user", "content": "hi"}], NOT_GIVEN, NOT_GIVEN, NOT_GIVEN)
    assert "format" not in plain["output_config"]
    # Older models keep their own request surface (no effort parameter forced on them).
    old = build_claude("claude-haiku-4-5", "sk-ant-test")._build_anthropic_kwargs(
        LlmRequest(model="claude-haiku-4-5", config=types.GenerateContentConfig()), [], NOT_GIVEN, NOT_GIVEN, NOT_GIVEN)
    assert "output_config" not in old
    assert is_claude("claude-sonnet-5-5") and is_claude("anthropic/claude-opus-5-5") and not is_claude("gemini-2.5-pro")


async def test_a_schema_too_complex_for_structured_outputs_falls_back_to_an_instruction():
    """Anthropic refused the Builder's Requirements schema ('Schema is too complex', 'Grammar compilation timed out'):
    retry unconstrained."""
    import httpx
    import anthropic
    from anthropic.types import Message, TextBlock, Usage

    from agent_builder.shared_libraries.types import Requirements

    sent: list[dict] = []

    class FakeMessages:
        async def create(self, **kwargs):
            sent.append(kwargs)
            if "format" in kwargs.get("output_config", {}):
                raise anthropic.BadRequestError(
                    "Error code: 400 - Grammar compilation timed out",
                    response=httpx.Response(400, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")),
                    body={"type": "error", "error": {"type": "invalid_request_error", "message": "Grammar compilation timed out"}})
            text = 'Here you go:\n```json\n{"project_name": "joke_bot", "is_complete": false}\n```'
            return Message(id="m", type="message", role="assistant", model=kwargs["model"], content=[TextBlock(type="text", text=text)],
                           stop_reason="end_turn", stop_sequence=None, usage=Usage(input_tokens=5, output_tokens=5))

    client = anthropic.AsyncAnthropic(api_key="sk-ant-test")
    client.messages = FakeMessages()  # no network: the fake answers like the real API did
    claude = StudioClaude(model="claude-opus-5-5", max_tokens=CLAUDE_MAX_TOKENS, client=client)

    from pydantic import BaseModel as _Model

    class Small(_Model):
        project_name: str = ""
        is_complete: bool = False

    def request(schema=Small):
        r = LlmRequest(model="claude-opus-5-5", contents=[types.Content(role="user", parts=[types.Part(text="jokes")])],
                       config=types.GenerateContentConfig(system_instruction="You gather requirements."))
        r.set_output_schema(schema)
        return r

    replies = [r async for r in claude.generate_content_async(request())]
    assert Small.model_validate_json(replies[-1].content.parts[-1].text).project_name == "joke_bot"
    assert len(sent) == 2 and "format" not in sent[1]["output_config"] and "conforms to this JSON schema" in str(sent[1]["system"])
    # Remembered: the next call skips the refused attempt.
    replies = [r async for r in claude.generate_content_async(request())]
    assert len(sent) == 3 and "format" not in sent[2]["output_config"]
    # A schema as large as Requirements skips structured outputs up front (no ~1 min refusal first).
    replies = [r async for r in claude.generate_content_async(request(Requirements))]
    assert len(sent) == 4 and "format" not in sent[3]["output_config"]
    assert Requirements.model_validate_json(replies[-1].content.parts[-1].text).project_name == "joke_bot"


async def test_signed_reasoning_is_only_sent_back_to_the_provider_that_produced_it():
    shared = StudioModel(model="x")
    gemini_thought = types.Part(text="g", thought=True, thought_signature=b"\x01gemini-sig")
    claude_thought = types.Part(text="c", thought=True, thought_signature=b"claude-sig")
    shared._claude_signatures.add(b"claude-sig")
    history = [types.Content(role="user", parts=[types.Part(text="hi")]),
               types.Content(role="model", parts=[gemini_thought, types.Part(text="answer 1")]),
               types.Content(role="model", parts=[claude_thought, types.Part(text="answer 2")]),
               types.Content(role="model", parts=[gemini_thought])]  # reasoning only: dropped entirely

    to_claude = shared._portable_history(history, to_claude=True)
    assert [[p.text for p in c.parts] for c in to_claude] == [["hi"], ["answer 1"], ["c", "answer 2"]]
    to_gemini = shared._portable_history(history, to_claude=False)
    assert [[p.text for p in c.parts] for c in to_gemini] == [["hi"], ["g", "answer 1"], ["answer 2"], ["g"]]


@pytest.fixture
def settings(tmp_path, monkeypatch):
    from agent_builder import model_settings

    env = tmp_path / ".env"
    env.write_text("# keep me\nGOOGLE_API_KEY=AIza-old\nOTHER=1\n", encoding="utf-8")
    monkeypatch.setattr(model_settings, "ENV_PATH", env)
    for key in ("ANTHROPIC_API_KEY", "BUILDER_MODEL", "GEMINI_MODEL", "GOOGLE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("GOOGLE_API_KEY", "AIza-old")
    original = (model_settings.MODEL.delegate, model_settings.MODEL.model)
    checked: list = []

    async def fake_check(model, key):
        checked.append((model, key))
        if key == "sk-ant-bad":
            raise model_settings.SettingsError("Anthropic rejected this API key.")

    monkeypatch.setattr(model_settings, "_check_claude", fake_check)
    yield model_settings, env, checked
    model_settings.MODEL.use(*original)


async def test_choosing_claude_validates_saves_and_switches_live(settings):
    model_settings, env, checked = settings
    result = await model_settings.apply("claude-sonnet-5-5", anthropic_api_key="sk-ant-api03-abcdefghijklmnop")
    assert checked == [("claude-sonnet-5-5", "sk-ant-api03-abcdefghijklmnop")]
    assert result["model"] == "claude-sonnet-5-5" and result["provider"] == "anthropic" and result["has_anthropic_key"]
    assert "abcdefghijklmnop" not in result["anthropic_key_hint"]  # never echoed back in full
    assert isinstance(model_settings.MODEL.delegate, StudioClaude) and model_settings.MODEL.delegate.model == "claude-sonnet-5-5"
    text = env.read_text(encoding="utf-8")
    assert text.startswith("# keep me\nGOOGLE_API_KEY=AIza-old\nOTHER=1\n")
    assert "BUILDER_MODEL=claude-sonnet-5-5" in text and "ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop" in text
    # A saved key is reused: switching between Claude models needs no key again.
    assert (await model_settings.apply("claude-opus-5-5"))["model"] == "claude-opus-5-5"


async def test_invalid_choices_change_nothing(settings):
    model_settings, env, _ = settings
    before_env, before_model = env.read_text(encoding="utf-8"), model_settings.MODEL.model
    for kwargs, message in [({"model": "claude-opus-5-5"}, "Add your Anthropic API key"),
                            ({"model": "claude-opus-5-5", "anthropic_api_key": "not-a-key"}, "does not look like"),
                            ({"model": "claude-opus-5-5", "anthropic_api_key": "sk-ant-bad"}, "rejected"),
                            ({"model": ""}, "Choose a model"),
                            ({"model": "bad model; rm -rf"}, "Choose a model")]:
        with pytest.raises(model_settings.SettingsError, match=message):
            await model_settings.apply(**kwargs)
    assert env.read_text(encoding="utf-8") == before_env and model_settings.MODEL.model == before_model
    import os
    assert "ANTHROPIC_API_KEY" not in os.environ


async def test_choosing_gemini_needs_a_google_key_and_updates_the_platform_default(settings, monkeypatch):
    model_settings, env, _ = settings
    result = await model_settings.apply("gemini-2.5-pro")
    assert result["model"] == "gemini-2.5-pro" and result["provider"] == "google"
    assert "GEMINI_MODEL=gemini-2.5-pro" in env.read_text(encoding="utf-8")
    monkeypatch.delenv("GOOGLE_API_KEY")
    with pytest.raises(model_settings.SettingsError, match="Google AI Studio API key"):
        await model_settings.apply("gemini-2.5-flash")
