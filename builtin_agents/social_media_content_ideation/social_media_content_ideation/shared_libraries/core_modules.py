"""Shared Tectonic platform modules for this project's agents.

Inside the Tectonic agent server every agent gets the platform as ADK tools (guardrails, intent,
short/long-term memory, tool orchestration, Agentic RAG knowledge, FinOps spend, PromptOps feedback,
audit trail, image generation, external data connectors such as Meta Ads and GA4) and its instruction is served by
PromptOps as '<team>.<agent>' (versioned, A/B-testable).
Run standalone (plain `adk run`), the import fails and the agents work with their static prompts.
"""

TEAM = "social_media_content_ideation"
# Platform modules enabled in the approved Agent Architecture Specification (None: all modules).
ENABLED_MODULES = ['agentic_rag', 'auditability', 'finops', 'guardrails', 'image_generation', 'intent_detection', 'long_term_memory', 'promptops', 'short_term_memory', 'tool_orchestration']


def _fill(text, context, state_keys):
    for key in state_keys:
        value = context.state.get(key)
        text = text.replace("{" + key + "}", "" if value is None else (value if isinstance(value, str) else str(value)))
    return text


try:
    from tectonic_runtime.adk_tools import module_instructions, worker_tools

    CORE_MODULE_TOOLS = worker_tools(team=TEAM, modules=ENABLED_MODULES)
    CORE_MODULE_INSTRUCTIONS = module_instructions(ENABLED_MODULES)

    def managed_instruction(agent_name, template, state_keys=()):
        """Instruction provider served by PromptOps ('<team>.<agent>'), falling back to the template."""

        async def provider(context):
            text = template
            try:
                from tectonic_runtime import get_runtime
                from tectonic_runtime.identity import session_id_of

                text, _ = await get_runtime().module("promptops").resolve_template(
                    f"{TEAM}.{agent_name}", session_id_of(context), template
                )
            except Exception:
                pass
            return _fill(text, context, state_keys)

        return provider

except ImportError as _exc:  # standalone run, or a server shipped without tectonic_runtime
    import logging

    logging.getLogger(__name__).warning(
        "Tectonic platform modules unavailable (%s): %s runs WITHOUT guardrails, memory, RAG, FinOps or audit tools.",
        _exc, TEAM,
    )
    CORE_MODULE_TOOLS = []
    CORE_MODULE_INSTRUCTIONS = ""

    def managed_instruction(agent_name, template, state_keys=()):
        def provider(context):
            return _fill(template, context, state_keys)

        return provider
