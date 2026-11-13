"""One model everywhere: generated agentic workflows run on the model the Agent Builder currently uses.

The Builder's model is a placeholder (``shared_libraries.constants.MODEL``, a ``StudioModel``): every call
resolves to the signed-in user's choice in the Studio — the platform default, or their custom model — so
switching it in the Builder settings applies immediately. This plugin points every agent of a generated
project at that same placeholder before each run: the root agent, its sub-agents and the specialists it
calls as AgentTools, whatever model their generated code names (that model is only the fallback for
running the project standalone, outside the Studio).
"""

from __future__ import annotations

from typing import Any

from google.adk.agents import LlmAgent
from google.adk.models.anthropic_llm import AnthropicLlm
from google.adk.models.google_llm import Gemini
from google.adk.models.lite_llm import LiteLlm
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.agent_tool import AgentTool

from . import model_settings  # noqa: F401  (installs the per-user resolver on MODEL)
from .shared_libraries.constants import MODEL

BUILDER_APP = "agent_builder"
# What generated code configures: a model name or a stock provider adapter (constants.MODEL is a LiteLlm).
# A bespoke BaseLlm subclass is deliberate custom code (or a test double) and is left as written.
_STOCK_MODELS = (LiteLlm, Gemini, AnthropicLlm)


def _replaceable(model: Any) -> bool:
    return model is not MODEL and (not model or isinstance(model, str) or isinstance(model, _STOCK_MODELS))


def bind_studio_model(agent: Any, _seen: set[int] | None = None) -> int:
    """Point ``agent`` and every agent below it at the Builder's model. Returns how many were changed."""
    seen = _seen if _seen is not None else set()
    if agent is None or id(agent) in seen:
        return 0
    seen.add(id(agent))
    changed = 0
    if isinstance(agent, LlmAgent) and _replaceable(agent.model):
        agent.model = MODEL
        changed += 1
    for sub in getattr(agent, "sub_agents", None) or []:
        changed += bind_studio_model(sub, seen)
    for tool in getattr(agent, "tools", None) or []:
        if isinstance(tool, AgentTool):
            changed += bind_studio_model(tool.agent, seen)
    return changed


class WorkflowModelPlugin(BasePlugin):
    def __init__(self, name: str = "tectonic_workflow_model") -> None:
        super().__init__(name=name)

    async def before_run_callback(self, *, invocation_context: Any) -> None:
        if getattr(invocation_context, "app_name", None) != BUILDER_APP:  # the Builder already uses MODEL
            bind_studio_model(getattr(invocation_context, "agent", None))
        return None


workflow_model_plugin = WorkflowModelPlugin()
