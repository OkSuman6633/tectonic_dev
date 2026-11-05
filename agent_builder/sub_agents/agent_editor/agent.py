"""Agent editor: changes an existing generated project in place, from a conversation."""

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext

from ... import directory
from ...shared_libraries.constants import MODEL
from ...tracing import TRACE_CALLBACKS
from . import prompt
from .tools import STATE_EDIT_PROJECT, check_agent, editable_files, list_agent_files, read_agent_file, write_agent_file


def _instruction(context: ReadonlyContext) -> str:
    project = context.state.get(STATE_EDIT_PROJECT) or ""
    if not project:
        return prompt.AGENT_EDITOR_PROMPT + "\n\n# Project\n(none open: change nothing)"
    lines = []
    for e in directory.project_tree(project):
        folder = f"{project}/" if e["dir"] is None else f"{project}/sub_agents/{e['dir']}/"
        lines.append(f"- {e['id']} · name={e['name']} · {e['agent_type']} · folder={folder} · tools={', '.join(e['tools']) or '-'}")
    agents = "\n".join(lines)
    files = "\n".join(f"- {f}" for f in editable_files(project))
    return (prompt.AGENT_EDITOR_PROMPT + f"\n\n# Project '{project}' (paths are relative to generated_agents/{project}/)\n"
            f"Agents (root first):\n{agents or '- (could not read the agent tree)'}\n\nFiles:\n{files}")


agent_editor = LlmAgent(
    name="agent_editor",
    model=MODEL,
    description="Edits an existing generated agent project from a conversation (prompts, tools, sub-agents) and keeps it runnable.",
    instruction=_instruction,
    tools=[list_agent_files, read_agent_file, write_agent_file, check_agent],
    disallow_transfer_to_parent=True,
    disallow_transfer_to_peers=True,
    **TRACE_CALLBACKS,
)
