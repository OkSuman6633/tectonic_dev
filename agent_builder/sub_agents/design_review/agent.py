"""Design-review specialists: the idea provider and the two critics (design and code).

They are run by the Builder's deterministic `review_design` / `review_code` tools (tools/review.py), which
hand them everything they need in the message, so they need no tools or session state of their own.
"""

from google.adk.agents import LlmAgent

from ...shared_libraries.constants import MODEL
from ...shared_libraries.types import DesignIdeas, Review
from ...tracing import TRACE_CALLBACKS
from . import prompt


def _specialist(name: str, description: str, instruction: str, schema) -> LlmAgent:
    return LlmAgent(
        name=name,
        model=MODEL,
        description=description,
        instruction=instruction,
        output_schema=schema,
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
        **TRACE_CALLBACKS,
    )


idea_provider_agent = _specialist(
    "idea_provider",
    "Proposes concrete, high-impact improvements to a planned agent (capabilities, tools, modules, UX).",
    prompt.IDEA_PROVIDER_PROMPT,
    DesignIdeas,
)

design_critic_agent = _specialist(
    "design_critic",
    "Scores a draft agent specification, lists gaps with exact fixes and accepts the worthwhile ideas.",
    prompt.DESIGN_CRITIC_PROMPT,
    Review,
)

code_critic_agent = _specialist(
    "code_critic",
    "Reviews a generated ADK project against its specification and lists bugs and gaps with exact fixes.",
    prompt.CODE_CRITIC_PROMPT,
    Review,
)
