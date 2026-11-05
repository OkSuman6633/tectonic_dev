"""Conversational agent editing: edit → verify → live (re-run sees it), rollback on failure, undo, sandboxing."""

from __future__ import annotations

import json
import sys
import uuid

import pytest
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from tectonic_runtime import ModuleEventBus, reset_runtime

# The generated project's model replies with its live system instruction, so a re-run proves which
# prompt the agent really used (code default or PromptOps version).
SYS_ECHO = '''
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import types


class SysEchoLlm(BaseLlm):
    model: str = "sys-echo"

    async def generate_content_async(self, llm_request, stream=False):
        text = (str(llm_request.config.system_instruction or "").strip().splitlines() or [""])[0]  # drop ADK transfer text
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=text)]))
'''

# Same shape as the generated core_modules.py: the instruction is served by PromptOps as '<TEAM>.<agent>'.
CORE_MODULES = '''
TEAM = "desk"
CORE_MODULE_INSTRUCTIONS = ""


def managed_instruction(agent_name, template, state_keys=()):
    async def provider(context):
        from tectonic_runtime import get_runtime
        from tectonic_runtime.identity import session_id_of

        text, _ = await get_runtime().module("promptops").resolve_template(f"{TEAM}.{agent_name}", session_id_of(context), template)
        return text

    return provider
'''


def _agent(name: str, children: list[str], root: bool = False) -> str:
    prefix = "." if root else "..."
    imports = "".join(f"from {'.sub_agents.' if root else '..'}{c}.agent import {c}\n" for c in children)
    return (f"from google.adk.agents import LlmAgent\nfrom {prefix}shared_libraries.echo import SysEchoLlm\n"
            f"from {prefix}shared_libraries.core_modules import CORE_MODULE_INSTRUCTIONS, managed_instruction\n"
            f"from . import prompt\n{imports}\n"
            f'{"root_agent" if root else name} = LlmAgent(\n    name="{name}",\n    description="{name} agent",\n    model=SysEchoLlm(),\n'
            f'    instruction=managed_instruction("{name}", prompt.INSTRUCTION + CORE_MODULE_INSTRUCTIONS),\n'
            f"    sub_agents=[{', '.join(children)}],\n)\n")


class ScriptedLlm(BaseLlm):
    """Stands in for Gemini in the editor: replays queued turns (function calls or a final text)."""

    model: str = "scripted"
    turns: list = []

    async def generate_content_async(self, llm_request, stream=False):
        turn = self.turns.pop(0)
        if isinstance(turn, str):
            part = types.Part(text=turn)
        else:
            name, args = turn
            part = types.Part(function_call=types.FunctionCall(name=name, args=args))
        yield LlmResponse(content=types.Content(role="model", parts=[part]))


@pytest.fixture
def project(tmp_path, monkeypatch):
    from agent_builder import directory, editor
    from agent_builder.sub_agents.agent_editor.agent import agent_editor
    from agent_builder import workspace

    runtime = reset_runtime(ModuleEventBus())
    root = tmp_path / f"gen_{uuid.uuid4().hex[:8]}"
    pkg = root / "desk" / "desk"
    files = {
        root / "desk" / "requirements.txt": "google-adk\n",
        root / "desk" / ".env": "GOOGLE_API_KEY=secret\n",
        pkg / "__init__.py": "from . import agent\n",
        pkg / "shared_libraries" / "__init__.py": "",
        pkg / "shared_libraries" / "echo.py": SYS_ECHO,
        pkg / "shared_libraries" / "core_modules.py": CORE_MODULES,
        pkg / "agent.py": _agent("desk_root", ["beta"], root=True),
        pkg / "prompt.py": 'INSTRUCTION = """You are the desk."""\n',
        pkg / "sub_agents" / "__init__.py": "",
        pkg / "sub_agents" / "beta" / "__init__.py": "",
        pkg / "sub_agents" / "beta" / "agent.py": _agent("beta", []),
        pkg / "sub_agents" / "beta" / "prompt.py": 'INSTRUCTION = """You are beta."""\n',
    }
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    monkeypatch.setattr(directory, "OUTPUT_DIR", root)
    monkeypatch.setattr(workspace, "OUTPUT_DIR", root)
    evicted: list[str] = []
    monkeypatch.setattr(directory, "_evict_hooks", [evicted.append])
    llm = ScriptedLlm()
    monkeypatch.setattr(agent_editor, "model", llm)
    monkeypatch.setattr(editor, "_SESSIONS", type(editor._SESSIONS)())
    yield {"root": root, "pkg": pkg, "evicted": evicted, "llm": llm, "runtime": runtime}
    for mod in [m for m in sys.modules if m.startswith(root.name)]:
        del sys.modules[mod]


def _edit_prompt_turns(path: str, text: str, summary: str = "- Updated the prompt") -> list:
    return [("list_agent_files", {}), ("read_agent_file", {"path": path}),
            ("write_agent_file", {"path": path, "content": f'INSTRUCTION = """{text}"""\n'}), ("check_agent", {}), summary]


async def test_edit_goes_live_and_the_rerun_uses_the_updated_agent(project):
    from agent_builder import directory, editor

    assert (await directory.run_agent("desk", "hi"))["reply"] == "You are the desk."
    project["llm"].turns = _edit_prompt_turns("desk/prompt.py", "You are the desk. Answer in French.")
    result = await editor.edit_agent("desk", "answer in French", session_key="s1")

    assert result["status"] == "success" and result["summary"] == "- Updated the prompt"
    assert [f["path"] for f in result["files"]] == ["desk/prompt.py"]
    assert "+INSTRUCTION = " in result["files"][0]["diff"] and result["files"][0]["status"] == "modified"
    assert project["evicted"] == [directory.app_name("desk")]
    assert result["prompts"] == [{"prompt": "desk.desk_root", "version": "v2", "published": True}]
    # Re-execution loads the new code AND its PromptOps version.
    assert (await directory.run_agent("desk", "hi", session_key="rerun"))["reply"] == "You are the desk. Answer in French."
    listing = editor.list_edits("desk")
    edits = listing["edits"]
    assert len(edits) == 1 and edits[0]["request"] == "answer in French" and edits[0]["files"] == ["desk/prompt.py"]
    assert listing["editing"] is False and listing["last_attempt"]["status"] == "success"
    assert listing["last_attempt"]["edit_id"] == result["edit_id"]


async def test_edit_overrides_a_promoted_prompt_version(project):
    """An admin-promoted PromptOps version would otherwise shadow the edited prompt.py forever."""
    from agent_builder import directory, editor

    promptops = project["runtime"].module("promptops")
    await promptops.ensure_prompt("desk.beta", "You are beta.")
    promoted = await promptops.registry.register(tenant_id="platform", prompt_name="desk.beta", version="v9", template="Promoted beta.")
    await promptops._activate(promoted)
    assert (await directory.run_agent("desk/beta", "hi"))["reply"] == "Promoted beta."

    project["llm"].turns = _edit_prompt_turns("desk/sub_agents/beta/prompt.py", "You are beta, now terse.")
    result = await editor.edit_agent("desk/beta", "be terse")
    assert result["status"] == "success" and result["prompts"][0]["prompt"] == "desk.beta"
    assert (await directory.run_agent("desk/beta", "hi", session_key="after"))["reply"] == "You are beta, now terse."


async def test_a_change_that_breaks_the_agent_is_rolled_back(project):
    from agent_builder import editor

    original = (project["pkg"] / "agent.py").read_text(encoding="utf-8")
    broken = original.replace("from . import prompt", "from . import prompt\nfrom .missing_module import nothing")
    write = ("write_agent_file", {"path": "desk/agent.py", "content": broken})
    # First attempt and the repair round both leave the import broken.
    project["llm"].turns = [("read_agent_file", {"path": "desk/agent.py"}), write, "- Added an import",
                            write, "- Still broken"]
    result = await editor.edit_agent("desk", "import the missing module")

    assert result["status"] == "error" and result["rolled_back"] is True
    assert any("missing_module" in p for p in result["problems"])
    assert (project["pkg"] / "agent.py").read_text(encoding="utf-8") == original
    listing = editor.list_edits("desk")
    assert project["evicted"] == [] and listing["edits"] == []
    assert listing["last_attempt"]["status"] == "error" and listing["last_attempt"]["request"] == "import the missing module"


async def test_the_repair_round_can_fix_a_broken_change(project):
    from agent_builder import editor

    original = (project["pkg"] / "agent.py").read_text(encoding="utf-8")
    broken = original.replace("from . import prompt", "from . import prompt\nfrom .missing_module import nothing")
    fixed = original.replace('description="desk_root agent"', 'description="Front desk"')
    project["llm"].turns = [("read_agent_file", {"path": "desk/agent.py"}), ("write_agent_file", {"path": "desk/agent.py", "content": broken}),
                            "- Changed it", ("write_agent_file", {"path": "desk/agent.py", "content": fixed}), "- Fixed the import"]
    result = await editor.edit_agent("desk", "rename the description to Front desk")
    assert result["status"] == "success" and result["summary"] == "- Fixed the import"
    assert 'description="Front desk"' in (project["pkg"] / "agent.py").read_text(encoding="utf-8")


async def test_new_files_are_removed_on_rollback_and_undo_restores_the_previous_version(project):
    from agent_builder import directory, editor

    project["llm"].turns = _edit_prompt_turns("desk/prompt.py", "Version two.")
    assert (await editor.edit_agent("desk", "v2"))["status"] == "success"
    undone = await editor.undo_last_edit("desk")
    assert undone["request"] == "v2" and [f["path"] for f in undone["files"]] == ["desk/prompt.py"]
    assert (project["pkg"] / "prompt.py").read_text(encoding="utf-8") == 'INSTRUCTION = """You are the desk."""\n'
    assert (await directory.run_agent("desk", "hi", session_key="undo"))["reply"] == "You are the desk."
    with pytest.raises(directory.DirectoryError):
        await editor.undo_last_edit("desk")

    # A failing edit that created a new sub-agent folder leaves nothing behind.
    project["llm"].turns = [("write_agent_file", {"path": "desk/sub_agents/gamma/agent.py", "content": "x = (\n"}),
                            "- Added gamma", "- Gave up"]
    result = await editor.edit_agent("desk", "add gamma")
    assert result["status"] == "no_change"  # the guardrail scan refused the broken file, so nothing was written
    assert not (project["pkg"] / "sub_agents" / "gamma").exists()


async def test_undo_is_refused_when_the_files_changed_after_the_edit(project):
    from agent_builder import directory, editor

    project["llm"].turns = _edit_prompt_turns("desk/prompt.py", "Version two.")
    await editor.edit_agent("desk", "v2")
    (project["pkg"] / "prompt.py").write_text('INSTRUCTION = """Hand edited."""\n', encoding="utf-8")
    with pytest.raises(directory.DirectoryError, match="changed after"):
        await editor.undo_last_edit("desk")
    assert (project["pkg"] / "prompt.py").read_text(encoding="utf-8") == 'INSTRUCTION = """Hand edited."""\n'


async def test_follow_up_after_an_outside_change_must_reread_before_writing(project):
    from agent_builder import editor

    project["llm"].turns = _edit_prompt_turns("desk/prompt.py", "Version two.")
    await editor.edit_agent("desk", "v2", session_key="s")
    (project["pkg"] / "prompt.py").write_text('INSTRUCTION = """Hand edited."""\n', encoding="utf-8")
    # The editor read prompt.py in its first turn, but the file changed since: a blind overwrite is refused.
    project["llm"].turns = [("write_agent_file", {"path": "desk/prompt.py", "content": 'INSTRUCTION = """Blind."""\n'}), "- Done"]
    result = await editor.edit_agent("desk", "v3", session_key="s")
    assert result["status"] == "no_change"
    assert (project["pkg"] / "prompt.py").read_text(encoding="utf-8") == 'INSTRUCTION = """Hand edited."""\n'


def test_editable_paths_are_sandboxed_to_the_project(project):
    from agent_builder.sub_agents.agent_editor.tools import editable_files, resolve_editable

    assert resolve_editable("desk", "desk/prompt.py")[0] == "desk/prompt.py"
    assert resolve_editable("desk", "desk/prompt.py")[0] == "desk/prompt.py"
    assert resolve_editable("desk", f"{project['root'].name}/desk/requirements.txt")[0] == "requirements.txt"
    for bad in ("../other/x.py", "desk/../../x.py", ".env", "desk/.env", "data/x.json", "desk/tool.exe", "other.py",
                "desk/__pycache__/x.py", "/abs/desk/prompt.py/../../.."):
        with pytest.raises(ValueError):
            resolve_editable("desk", bad)
    files = editable_files("desk")
    assert "desk/prompt.py" in files and "requirements.txt" in files and not any(".env" in f for f in files)


async def test_builder_agents_cannot_be_edited_and_builder_tool_hides_diffs(project):
    from agent_builder import directory, editor
    from agent_builder.tools.agent_access import edit_agent

    with pytest.raises(directory.DirectoryError):
        await editor.edit_agent("agent_builder/code_generator", "change it")
    with pytest.raises(directory.DirectoryError):
        await editor.edit_agent("desk", "   ")

    class Ctx:
        session = type("S", (), {"id": "builder-session"})()

    project["llm"].turns = _edit_prompt_turns("desk/prompt.py", "Version two.")
    result = await edit_agent("desk", "v2", Ctx())
    assert result["status"] == "success" and "trace" not in result
    assert result["files"] == [{"path": "desk/prompt.py", "status": "modified", "added": 1, "removed": 1}]
    json.dumps(result)  # tool results must be JSON-serialisable


async def test_an_edit_finishes_even_when_its_caller_is_cancelled(project):
    """A browser refresh (or a stopped Builder run) cancels the request: the edit must still complete."""
    import asyncio

    from agent_builder import editor

    gate = asyncio.Event()

    class GatedLlm(ScriptedLlm):
        async def generate_content_async(self, llm_request, stream=False):
            await gate.wait()
            async for response in super().generate_content_async(llm_request, stream):
                yield response

    gated = GatedLlm(turns=_edit_prompt_turns("desk/prompt.py", "Survived the refresh."))
    from agent_builder.sub_agents.agent_editor.agent import agent_editor

    agent_editor.model = gated
    caller = asyncio.create_task(editor.edit_agent("desk", "survive"))
    await asyncio.sleep(0.05)
    caller.cancel()
    with pytest.raises(asyncio.CancelledError):
        await caller
    gate.set()
    while editor._tasks:
        await asyncio.sleep(0.05)
    assert 'Survived the refresh.' in (project["pkg"] / "prompt.py").read_text(encoding="utf-8")
    listing = editor.list_edits("desk")
    assert listing["last_attempt"]["status"] == "success" and len(listing["edits"]) == 1


async def test_deleting_a_project_removes_its_edit_history(project):
    from agent_builder import directory, editor

    project["llm"].turns = _edit_prompt_turns("desk/prompt.py", "Version two.")
    await editor.edit_agent("desk", "v2")
    assert (project["root"] / "_edits" / "desk").is_dir()
    await directory.delete_agent("desk")
    assert not (project["root"] / "_edits" / "desk").exists()
