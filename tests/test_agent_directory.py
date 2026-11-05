"""Agent directory: listing every agent, chatting with any of them, and deleting generated ones."""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest

ECHO = '''
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import types


class EchoLlm(BaseLlm):
    model: str = "echo"

    async def generate_content_async(self, llm_request, stream=False):
        text = llm_request.contents[-1].parts[0].text
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=f"echo: {text}")]))
'''


def _agent(name: str, prefix: str, children: list[str], root: bool = False) -> str:
    var = "root_agent" if root else name
    imports = "".join(f"from {'.sub_agents.' if root else '..'}{c}.agent import {c}\n" for c in children)
    return (f"from google.adk.agents import LlmAgent\nfrom {prefix}shared_libraries.echo import EchoLlm\nfrom . import prompt\n{imports}\n"
            f'{var} = LlmAgent(\n    name="{name}",\n    description="{name} agent",\n    model=EchoLlm(),\n'
            f"    instruction=prompt.INSTRUCTION,\n    sub_agents=[{', '.join(children)}],\n)\n")


@pytest.fixture
def out(tmp_path, monkeypatch):
    from agent_builder import directory
    from agent_builder import workspace

    root = tmp_path / f"gen_{uuid.uuid4().hex[:8]}"
    pkg = root / "desk" / "desk"
    files = {
        pkg / "__init__.py": "from . import agent\n",
        pkg / "shared_libraries" / "__init__.py": "",
        pkg / "shared_libraries" / "echo.py": ECHO,
        pkg / "agent.py": _agent("desk_root", ".", ["alpha", "beta"], root=True),
        pkg / "prompt.py": 'INSTRUCTION = """Route to alpha or beta."""\n',
        pkg / "sub_agents" / "__init__.py": "",
    }
    for name, children in {"alpha": ["gamma"], "beta": [], "gamma": []}.items():
        files[pkg / "sub_agents" / name / "__init__.py"] = ""
        files[pkg / "sub_agents" / name / "agent.py"] = _agent(name, "...", children)
        files[pkg / "sub_agents" / name / "prompt.py"] = f'INSTRUCTION = """You are {name}."""\n'
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    monkeypatch.setattr(directory, "OUTPUT_DIR", root)
    monkeypatch.setattr(workspace, "OUTPUT_DIR", root)
    evicted: list[str] = []
    monkeypatch.setattr(directory, "_evict_hooks", [evicted.append])
    yield root, evicted
    for mod in [m for m in sys.modules if m.startswith(root.name)]:
        del sys.modules[mod]


def test_lists_builder_and_generated_agents_from_code(out):
    from agent_builder import directory

    entries = {e["id"]: e for e in directory.list_entries()}
    assert entries["agent_builder"]["kind"] == "builder" and not entries["agent_builder"]["deletable"]
    assert "agent_builder/requirement_understanding" in entries
    assert entries["desk"]["name"] == "desk_root" and entries["desk"]["children"] == ["desk/alpha", "desk/beta"]
    assert entries["desk/gamma"]["parent"] == "desk/alpha" and entries["desk/gamma"]["depth"] == 2
    assert directory.resolve("@beta")["id"] == "desk/beta" and directory.resolve("DESK")["id"] == "desk"


async def test_chat_with_a_sub_agent_directly_returns_reply_and_trace(out):
    from agent_builder import directory

    result = await directory.run_agent("desk/beta", "hello", session_key="s1")
    assert result["reply"] == "echo: hello" and result["agent"] == "beta"
    assert result["trace"][0]["type"] == "agent" and result["trace"][0]["agent"] == "beta"
    with pytest.raises(directory.DirectoryError):
        await directory.run_agent("agent_builder", "hi")


async def test_deleting_a_sub_agent_removes_its_code_and_descendants_and_detaches_it(out):
    from agent_builder import directory

    root, evicted = out
    pkg = root / "desk" / "desk"
    result = await directory.delete_agent("desk/alpha")
    assert set(result["deleted"]) == {"desk/alpha", "desk/gamma"} and result["detached_from"] == ["desk"]
    assert not (pkg / "sub_agents" / "alpha").exists() and not (pkg / "sub_agents" / "gamma").exists()
    source = (pkg / "agent.py").read_text(encoding="utf-8")
    assert "alpha" not in source and "beta" in source
    assert "never delegate or transfer" in (pkg / "prompt.py").read_text(encoding="utf-8")
    assert evicted == [directory.app_name("desk")]
    # The project still loads, with only the surviving sub-agent.
    assert [e["id"] for e in directory.project_tree("desk")] == ["desk", "desk/beta"]
    assert (await directory.run_agent("desk", "still alive?"))["reply"] == "echo: still alive?"


async def test_deleting_a_project_and_protecting_the_builder(out):
    from agent_builder import directory

    root, _ = out
    with pytest.raises(directory.DirectoryError):
        await directory.delete_agent("agent_builder/code_generator")
    result = await directory.delete_agent("desk")
    assert result["kind"] == "project" and set(result["agents"]) == {"desk_root", "alpha", "beta", "gamma"}
    assert not (root / "desk").exists() and directory.projects() == []


async def test_builder_delete_tool_requires_confirmation(out):
    from agent_builder.tools.agent_access import delete_agent

    root, _ = out
    assert (await delete_agent("desk/beta"))["status"] == "confirmation_required"
    assert (root / "desk" / "desk" / "sub_agents" / "beta").exists()
    assert (await delete_agent("desk/beta", confirm=True))["status"] == "success"
