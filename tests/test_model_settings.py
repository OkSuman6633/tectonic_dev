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
    result = await model_settings.apply_default("claude-sonnet-5-5", anthropic_api_key="sk-ant-api03-abcdefghijklmnop")
    assert checked == [("claude-sonnet-5-5", "sk-ant-api03-abcdefghijklmnop")]
    assert result["model"] == "claude-sonnet-5-5" and result["provider"] == "anthropic" and result["has_anthropic_key"]
    assert "abcdefghijklmnop" not in result["anthropic_key_hint"]  # never echoed back in full
    assert isinstance(model_settings.MODEL.delegate, StudioClaude) and model_settings.MODEL.delegate.model == "claude-sonnet-5-5"
    text = env.read_text(encoding="utf-8")
    assert text.startswith("# keep me\nGOOGLE_API_KEY=AIza-old\nOTHER=1\n")
    assert "BUILDER_MODEL=claude-sonnet-5-5" in text and "ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop" in text
    # A saved key is reused: switching between Claude models needs no key again.
    assert (await model_settings.apply_default("claude-opus-5-5"))["model"] == "claude-opus-5-5"


async def test_invalid_choices_change_nothing(settings):
    model_settings, env, _ = settings
    before_env, before_model = env.read_text(encoding="utf-8"), model_settings.MODEL.model
    for kwargs, message in [({"model": "claude-opus-5-5"}, "Add your Anthropic API key"),
                            ({"model": "claude-opus-5-5", "anthropic_api_key": "not-a-key"}, "does not look like"),
                            ({"model": "claude-opus-5-5", "anthropic_api_key": "sk-ant-bad"}, "rejected"),
                            ({"model": ""}, "Choose a model"),
                            ({"model": "bad model; rm -rf"}, "Choose a model")]:
        with pytest.raises(model_settings.SettingsError, match=message):
            await model_settings.apply_default(**kwargs)
    assert env.read_text(encoding="utf-8") == before_env and model_settings.MODEL.model == before_model
    import os
    assert "ANTHROPIC_API_KEY" not in os.environ


async def test_choosing_gemini_needs_a_google_key_and_updates_the_platform_default(settings, monkeypatch):
    model_settings, env, _ = settings
    result = await model_settings.apply_default("gemini-2.5-pro")
    assert result["model"] == "gemini-2.5-pro" and result["provider"] == "google"
    assert "GEMINI_MODEL=gemini-2.5-pro" in env.read_text(encoding="utf-8")
    monkeypatch.delenv("GOOGLE_API_KEY")
    with pytest.raises(model_settings.SettingsError, match="Google AI Studio API key"):
        await model_settings.apply_default("gemini-2.5-flash")


# --- custom override: one slot per account, toggled against the platform default ---------------------
ALICE, BOB = "u_aaaaaaaaaaaa", "u_bbbbbbbbbbbb"
ALICE_KEY = "sk-ant-api03-alice-own-key-0123456789"


@pytest.fixture
def overrides(settings, tmp_path, monkeypatch):
    """Signed-in accounts with an isolated data folder and sign-in secret."""
    from agent_builder import auth

    model_settings, _, checked = settings
    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TECTONIC_AUTH_SECRET", "test-secret-one")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-platform-shared-key")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(model_settings, "_fernet_cache", None)
    gemini_checked: list = []

    async def fake_gemini(model, key):
        gemini_checked.append((model, key))

    monkeypatch.setattr(model_settings, "_check_gemini", fake_gemini)
    caches = (model_settings._choices, model_settings._key_source, model_settings._errors)
    for cache in caches:
        cache.clear()
    yield model_settings, checked, gemini_checked
    for cache in caches:
        cache.clear()


def _store(model_settings) -> dict:
    import json

    return json.loads(model_settings._store_path().read_text(encoding="utf-8"))


async def test_a_users_own_key_is_used_only_for_them_and_never_touches_the_environment(overrides):
    import os

    from agent_builder.workspace import as_user

    model_settings, checked, _ = overrides
    env_before = dict(os.environ)
    default_name = model_settings.MODEL.model
    with as_user(ALICE):
        result = await model_settings.save_custom("claude-sonnet-5-5", api_key=ALICE_KEY)
    assert checked == [("claude-sonnet-5-5", ALICE_KEY)]
    assert result["mode"] == "custom" and result["model"] == "claude-sonnet-5-5" and result["active_key_source"] == "user"
    assert result["custom"]["has_own_key"] and result["custom"]["key_hint"] == "sk-ant…"
    assert ALICE_KEY not in str(result)  # never echoed back
    assert dict(os.environ) == env_before  # no process-wide side effects at all
    assert ALICE_KEY not in model_settings._store_path().read_text(encoding="utf-8")  # encrypted at rest

    # Each call resolves its own caller: Alice's override; Bob and anonymous calls stay on the default.
    with as_user(ALICE):
        delegate, name = model_settings.MODEL.current()
        assert name == "claude-sonnet-5-5" and delegate.client.api_key == ALICE_KEY
    with as_user(BOB):
        assert model_settings.MODEL.current()[1] == default_name
        assert model_settings.status()["mode"] == "default"
    assert model_settings.MODEL.current()[1] == default_name


async def test_concurrent_requests_resolve_their_own_override(overrides):
    import asyncio

    from agent_builder.workspace import as_user

    model_settings, _, _ = overrides
    with as_user(ALICE):
        await model_settings.save_custom("claude-opus-5-5", api_key=ALICE_KEY)
    default_name = model_settings.MODEL.model

    async def who(user):
        with as_user(user):
            await asyncio.sleep(0)  # interleave the tasks
            return model_settings.MODEL.current()[1]

    results = await asyncio.gather(*[who(ALICE if i % 2 == 0 else BOB) for i in range(20)])
    assert results == ["claude-opus-5-5" if i % 2 == 0 else default_name for i in range(20)]


async def test_saving_again_overwrites_the_one_slot_in_place(overrides):
    from agent_builder.workspace import as_user

    model_settings, checked, _ = overrides
    with as_user(ALICE):
        await model_settings.save_custom("claude-sonnet-5-5", api_key=ALICE_KEY)
        first_token = _store(model_settings)[ALICE]["custom"]["key"]
        # Same provider, key left blank: the saved key is kept (not re-checked) and the model replaced.
        result = await model_settings.save_custom("claude-opus-5-5")
        assert result["model"] == "claude-opus-5-5" and result["active_key_source"] == "user"
        assert model_settings.MODEL.current()[0].client.api_key == ALICE_KEY
        # A new key replaces the old one.
        await model_settings.save_custom("claude-opus-5-5", api_key="sk-ant-api03-alice-second-key-99")
        assert model_settings.MODEL.current()[0].client.api_key == "sk-ant-api03-alice-second-key-99"
    store = _store(model_settings)
    assert list(store) == [ALICE]  # one entry per account: no history
    assert set(store[ALICE]) == {"mode", "custom"} and store[ALICE]["custom"]["key"] != first_token
    assert len(checked) == 2  # the first key and its replacement; the kept key was not re-checked


async def test_switching_provider_drops_the_other_providers_key(overrides, monkeypatch):
    import os

    from agent_builder.workspace import as_user

    model_settings, _, gemini_checked = overrides
    with as_user(ALICE):
        await model_settings.save_custom("claude-sonnet-5-5", api_key=ALICE_KEY)
        # Gemini without a key of its own: runs on the platform's Google key; the Anthropic key is not kept.
        result = await model_settings.save_custom("gemini-2.5-pro")
        assert result["model"] == "gemini-2.5-pro" and result["active_key_source"] == "platform"
        assert "key" not in _store(model_settings)[ALICE]["custom"]
        # With a Google key of its own, that key goes to this user's Gemini client only.
        await model_settings.save_custom("gemini-2.5-pro", api_key="AIzaSy-alice-google-key-123")
        assert gemini_checked == [("gemini-2.5-pro", "AIzaSy-alice-google-key-123")]
        assert model_settings.MODEL.current()[0].api_client._api_client.api_key == "AIzaSy-alice-google-key-123"
        # No platform Anthropic key and none given: refused, and the saved override is unchanged.
        monkeypatch.delenv("ANTHROPIC_API_KEY")
        before = _store(model_settings)
        with pytest.raises(model_settings.SettingsError, match="Enter your Anthropic API key"):
            await model_settings.save_custom("claude-opus-5-5")
        assert _store(model_settings) == before
    assert os.environ["GOOGLE_API_KEY"] == "AIza-old"


async def test_toggle_keeps_the_saved_override_and_clear_removes_it(overrides):
    from agent_builder.workspace import as_user

    model_settings, _, _ = overrides
    default_name = model_settings.MODEL.model
    with as_user(ALICE):
        with pytest.raises(model_settings.SettingsError, match="Save a custom model first"):
            await model_settings.set_mode("custom")
        await model_settings.save_custom("claude-sonnet-5-5", api_key=ALICE_KEY)

        result = await model_settings.set_mode("default")
        assert result["mode"] == "default" and result["model"] == default_name
        assert result["custom"]["model"] == "claude-sonnet-5-5" and result["custom"]["has_own_key"]  # kept

        result = await model_settings.set_mode("custom")
        assert result["mode"] == "custom" and model_settings.MODEL.current()[0].client.api_key == ALICE_KEY

        with pytest.raises(model_settings.SettingsError, match="Mode must be"):
            await model_settings.set_mode("sideways")

        result = await model_settings.clear_custom()
        assert result["mode"] == "default" and result["custom"] is None
        assert model_settings.MODEL.current()[1] == default_name
    assert ALICE not in _store(model_settings)


async def test_a_rotated_secret_makes_the_saved_key_unreadable_and_falls_back_to_the_default(overrides, monkeypatch):
    from agent_builder import auth
    from agent_builder.workspace import as_user

    model_settings, _, _ = overrides
    with as_user(ALICE):
        await model_settings.save_custom("claude-sonnet-5-5", api_key=ALICE_KEY)
    monkeypatch.setenv("TECTONIC_AUTH_SECRET", "test-secret-two")
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(model_settings, "_fernet_cache", None)
    model_settings._invalidate(ALICE)
    with as_user(ALICE):
        status = model_settings.status()
        assert status["mode"] == "custom" and status["model"] == model_settings.MODEL.model  # on the default
        assert not status["custom"]["key_readable"] and "enter it again" in status["custom_error"]
        with pytest.raises(model_settings.SettingsError, match="cannot run"):
            await model_settings.set_mode("custom")


async def test_an_older_store_entry_is_read_as_an_active_override(overrides):
    import json

    from agent_builder.workspace import as_user

    model_settings, _, _ = overrides
    model_settings._store_path().write_text(json.dumps({ALICE: "gemini-2.5-flash"}), encoding="utf-8")
    with as_user(ALICE):
        status = model_settings.status()
    assert status["mode"] == "custom" and status["model"] == "gemini-2.5-flash" and status["active_key_source"] == "platform"


async def test_overrides_need_an_account_and_the_default_needs_an_admin_off_cloud_run(overrides, monkeypatch):
    model_settings, _, _ = overrides
    with pytest.raises(model_settings.SettingsError, match="Sign in"):
        await model_settings.save_custom("gemini-2.5-pro")  # sign-in on, nobody signed in
    with pytest.raises(model_settings.SettingsError, match="ask an admin"):
        await model_settings.apply_default("gemini-2.5-pro", admin=False)
    monkeypatch.setenv("K_SERVICE", "tectonic")
    with pytest.raises(model_settings.SettingsError, match="Cloud Run"):
        await model_settings.apply_default("gemini-2.5-pro")
    assert model_settings.status()["can_edit_default"] is False


def test_settings_routes_toggle_per_signed_in_user(overrides):
    """The HTTP surface (PUT/DELETE /studio/settings/custom, POST /studio/settings/mode), as each caller."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from agent_builder import auth, studio_api

    app = FastAPI()
    studio_api.install(app)
    client = TestClient(app)
    alice, bob = auth.register("alice", "correct-horse-1"), auth.register("bobby", "correct-horse-2")
    as_alice = {"Authorization": f"Bearer {auth.issue_token(alice)}"}
    as_bob = {"Authorization": f"Bearer {auth.issue_token(bob)}"}

    assert client.put("/studio/settings/custom", json={"model": "claude-sonnet-5-5"}).status_code == 401
    r = client.put("/studio/settings/custom", json={"model": "claude-sonnet-5-5", "api_key": ALICE_KEY}, headers=as_alice)
    assert r.status_code == 200 and r.json()["mode"] == "custom" and ALICE_KEY not in r.text
    assert client.get("/studio/settings", headers=as_bob).json()["mode"] == "default"
    r = client.post("/studio/settings/mode", json={"mode": "default"}, headers=as_alice)
    assert r.json()["mode"] == "default" and r.json()["custom"]["model"] == "claude-sonnet-5-5"
    assert client.post("/studio/settings/mode", json={"mode": "custom"}, headers=as_bob).status_code == 400
    r = client.delete("/studio/settings/custom", headers=as_alice)
    assert r.status_code == 200 and r.json()["custom"] is None


def test_generated_projects_never_carry_or_expose_the_servers_key(tmp_path, monkeypatch):
    """The generator leaves .env keys blank, and a project from before that fix never hands the key out."""
    import inspect

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from agent_builder import auth, studio_api, workspace
    from agent_builder.sub_agents.code_generator import tools as codegen

    assert "master_key" not in inspect.getsource(codegen)

    monkeypatch.setenv("TECTONIC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TECTONIC_AUTH_SECRET", "test-secret-one")
    monkeypatch.setenv("GOOGLE_API_KEY", "AIzaSERVERKEY0123456789")
    monkeypatch.setattr(auth, "_secret_cache", None)
    monkeypatch.setattr(workspace, "OUTPUT_DIR", tmp_path / "generated_agents")
    app = FastAPI()
    studio_api.install(app)
    client = TestClient(app)
    user = auth.register("carol", "correct-horse-3")
    project = tmp_path / "generated_agents" / user["id"] / "desk"
    (project / "desk").mkdir(parents=True)
    (project / "desk" / "agent.py").write_text("root_agent = None\n")
    (project / ".env").write_text("GOOGLE_API_KEY=AIzaSERVERKEY0123456789\nGEMINI_MODEL=gemini-2.5-pro\n")
    r = client.get("/api/system/agents/desk/env", headers={"Authorization": f"Bearer {auth.issue_token(user)}"})
    assert r.status_code == 200 and r.json()["hasKey"] and r.json()["apiKey"] == "" and "SERVERKEY" not in r.text
