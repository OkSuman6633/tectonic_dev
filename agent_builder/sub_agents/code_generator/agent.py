"""Sub-Agent 5: synthesises and writes runnable Google ADK Python files."""

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext

from ...shared_libraries.constants import MODEL, STATE_AGENT_CARDS, STATE_GENERATED_FILES, STATE_PROJECT_NAME, STATE_VERIFICATION
from ...tools.memory import render_state_block
from ...tracing import TRACE_CALLBACKS
from . import prompt
from .tools import (
    format_python_code,
    list_project_files,
    scaffold_project,
    validate_python_syntax,
    verify_generated_project,
    write_project_file,
)


def _instruction(context: ReadonlyContext) -> str:
    return prompt.CODE_GENERATOR_PROMPT + render_state_block(
        context, (STATE_PROJECT_NAME, STATE_AGENT_CARDS, STATE_GENERATED_FILES, STATE_VERIFICATION)
    )


code_generator_agent = LlmAgent(
    name="code_generator",
    model=MODEL,
    description="Scaffolds and writes the runnable Google ADK project (agents, prompts, tools, requirements) from approved Agent Cards.",
    instruction=_instruction,
    tools=[
        scaffold_project,
        write_project_file,
        format_python_code,
        validate_python_syntax,
        list_project_files,
        verify_generated_project,
    ],
    **TRACE_CALLBACKS,
)
