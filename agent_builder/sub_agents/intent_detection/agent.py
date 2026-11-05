"""Sub-Agent 1: classifies the user request and extracts entities."""

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext

from ...shared_libraries.constants import MODEL, STATE_INTENT, STATE_PROJECT_NAME, STATE_REQUIREMENTS
from ...shared_libraries.types import Intent
from ...tools.memory import render_state_block
from ...tracing import TRACE_CALLBACKS
from . import prompt


def _instruction(context: ReadonlyContext) -> str:
    return prompt.INTENT_PROMPT + render_state_block(
        context, (STATE_INTENT, STATE_REQUIREMENTS, STATE_PROJECT_NAME)
    )


intent_detection_agent = LlmAgent(
    name="intent_detection",
    model=MODEL,
    description="Classifies the user's message in session context and extracts domain, entities, and capabilities.",
    instruction=_instruction,
    output_schema=Intent,
    output_key=STATE_INTENT,
    disallow_transfer_to_parent=True,
    disallow_transfer_to_peers=True,
    **TRACE_CALLBACKS,
)
