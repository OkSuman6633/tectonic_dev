"""Local console/file tracing and telemetry for every agent, model call and tool call."""

import json
import logging
import os
import time
from logging.handlers import RotatingFileHandler
from typing import Any, Optional

from .shared_libraries.constants import LOG_DIR

_LOGGER_NAME = "agent_builder"
_agent_started: dict = {}


def _configure_otel(logger: logging.Logger) -> None:
    if os.getenv("AGENT_BUILDER_OTEL_CONSOLE", "0") != "1":
        return
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        trace.set_tracer_provider(provider)
        logger.info("OpenTelemetry console span exporter enabled.")
    except Exception as exc:  # telemetry must never break the app
        logger.warning("Could not enable OpenTelemetry console exporter: %s", exc)


def setup_tracing() -> logging.Logger:
    """Configure console + rotating-file logging once and return the shared logger."""
    logger = logging.getLogger(_LOGGER_NAME)
    if logger.handlers:
        return logger
    level_name = os.getenv("AGENT_BUILDER_TRACE_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    formatter = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s", "%H:%M:%S")

    console = logging.StreamHandler()
    console.setLevel(level)
    console.setFormatter(formatter)
    logger.addHandler(console)

    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_DIR / "agent_builder_trace.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except OSError as exc:
        logger.warning("File tracing disabled (%s).", exc)

    _configure_otel(logger)
    return logger


logger = setup_tracing()


def _short(value: Any, limit: int = 500) -> str:
    try:
        text = value if isinstance(value, str) else json.dumps(value, default=str)
    except (TypeError, ValueError):
        text = repr(value)
    text = text.replace("\n", " ")
    return text if len(text) <= limit else text[:limit] + "..."


def before_agent_callback(callback_context: Any) -> Optional[Any]:
    key = (callback_context.invocation_id, callback_context.agent_name)
    _agent_started[key] = time.perf_counter()
    logger.info("AGENT START  %s", callback_context.agent_name)

    # --- PRE-ORCHESTRATION INPUT GUARDRAILS (ZERO LLM CALLS) ---
    # Intercept prompt before going to the orchestrator or sub-agents
    try:
        from .sub_agents.guardrails.sanitizer import check_input_guardrails
        from google.genai import types as genai_types

        user_content = getattr(callback_context, "user_content", None)
        if user_content:
            parts = getattr(user_content, "parts", []) or []
            for part in parts:
                text = getattr(part, "text", None)
                if not text or not isinstance(text, str):
                    continue

                check = check_input_guardrails(text)
                if check.is_blocked:
                    logger.warning(
                        "PRE-ORCHESTRATION GUARDRAIL BLOCKED [%s]: agent=%s reason=%s",
                        check.block_code,
                        callback_context.agent_name,
                        check.block_reason,
                    )
                    # Short-circuit orchestration completely: return block guidance directly
                    p = genai_types.Part.from_text(text=check.user_guidance)
                    return genai_types.Content(role="model", parts=[p])

                if check.pii_redacted or check.phi_redacted:
                    logger.info(
                        "PRE-ORCHESTRATION GUARDRAIL REDACTED: agent=%s pii=%s phi=%s",
                        callback_context.agent_name,
                        check.pii_redacted,
                        check.phi_redacted,
                    )
                    part.text = check.sanitized_text
    except Exception as exc:
        logger.error("Error in before_agent_callback guardrail: %s", exc)

    return None


def after_agent_callback(callback_context: Any) -> Optional[Any]:
    key = (callback_context.invocation_id, callback_context.agent_name)
    started = _agent_started.pop(key, None)
    elapsed = f"{time.perf_counter() - started:.2f}s" if started else "n/a"
    logger.info("AGENT END    %s (%s)", callback_context.agent_name, elapsed)

    # --- POST-ORCHESTRATION OUTPUT GUARDRAILS (ZERO LLM CALLS) ---
    # Mitigate output before showing to the user: scrub leaked secrets, passwords, reflected PII/PHI
    try:
        from .sub_agents.guardrails.sanitizer import check_output_guardrails

        output = getattr(callback_context, "output", None)
        if output:
            parts = getattr(output, "parts", []) or []
            for part in parts:
                text = getattr(part, "text", None)
                if text and isinstance(text, str):
                    out_check = check_output_guardrails(text)
                    if out_check.is_mitigated:
                        logger.info(
                            "POST-ORCHESTRATION OUTPUT MITIGATED: agent=%s redactions=%s",
                            callback_context.agent_name,
                            out_check.redactions,
                        )
                        part.text = out_check.sanitized_text
    except Exception as exc:
        logger.error("Error in after_agent_callback guardrail: %s", exc)

    return None


def before_model_callback(callback_context: Any, llm_request: Any) -> Optional[Any]:
    contents = getattr(llm_request, "contents", None) or []
    logger.debug("MODEL REQUEST  agent=%s messages=%d", callback_context.agent_name, len(contents))

    # --- DETERMINISTIC INPUT GUARDRAILS (ZERO LLM CALLS) ---
    try:
        from .sub_agents.guardrails.sanitizer import check_input_guardrails

        for content in contents:
            parts = getattr(content, "parts", []) or []
            for part in parts:
                text = getattr(part, "text", None)
                if not text or not isinstance(text, str):
                    continue

                check = check_input_guardrails(text)
                if check.is_blocked:
                    logger.warning(
                        "INPUT GUARDRAIL BLOCKED [%s]: agent=%s reason=%s",
                        check.block_code,
                        callback_context.agent_name,
                        check.block_reason,
                    )
                    from google.adk.models.llm_response import LlmResponse
                    from google.genai import types as genai_types

                    p = genai_types.Part.from_text(text=check.user_guidance)
                    c = genai_types.Content(role="model", parts=[p])
                    return LlmResponse(content=c)

                if check.pii_redacted or check.phi_redacted:
                    logger.info(
                        "INPUT GUARDRAIL REDACTED: agent=%s pii=%s phi=%s",
                        callback_context.agent_name,
                        check.pii_redacted,
                        check.phi_redacted,
                    )
                    part.text = check.sanitized_text
    except Exception as exc:
        logger.error("Error in input guardrail callback: %s", exc)

    return None


def after_model_callback(callback_context: Any, llm_response: Any) -> Optional[Any]:
    error = getattr(llm_response, "error_message", None)
    usage = getattr(llm_response, "usage_metadata", None)
    if error:
        logger.error("MODEL ERROR  agent=%s error=%s", callback_context.agent_name, error)
        return None

    logger.debug("MODEL RESPONSE agent=%s usage=%s", callback_context.agent_name, _short(str(usage), 200))

    # --- STRUCTURED JSON NORMALIZATION FOR AGENT OUTPUT SCHEMAS ---
    try:
        from .shared_libraries.types import fix_intent_json, fix_requirements_json
        from .sub_agents.guardrails.sanitizer import check_output_guardrails

        content = getattr(llm_response, "content", None)
        if content:
            parts = getattr(content, "parts", []) or []
            for part in parts:
                text = getattr(part, "text", None)
                if not text or not isinstance(text, str):
                    continue

                # If this agent outputs structured schema, ensure the JSON is 100% strictly valid
                if callback_context.agent_name == "requirement_understanding":
                    fixed = fix_requirements_json(text)
                    part.text = fixed
                    text = fixed
                elif callback_context.agent_name == "intent_detection":
                    fixed = fix_intent_json(text)
                    part.text = fixed
                    text = fixed

                # --- DETERMINISTIC OUTPUT GUARDRAILS (ZERO LLM CALLS) ---
                out_check = check_output_guardrails(text)
                if out_check.is_mitigated:
                    logger.info(
                        "OUTPUT GUARDRAIL MITIGATED: agent=%s redactions=%s",
                        callback_context.agent_name,
                        out_check.redactions,
                    )
                    part.text = out_check.sanitized_text
    except Exception as exc:
        logger.error("Error in output callback: %s", exc)

    return None


def before_tool_callback(tool: Any, args: dict, tool_context: Any) -> Optional[dict]:
    logger.info("TOOL CALL    %s args=%s", tool.name, _short(args))
    return None


def after_tool_callback(tool: Any, args: dict, tool_context: Any, tool_response: Any) -> Optional[dict]:
    status = tool_response.get("status") if isinstance(tool_response, dict) else "n/a"
    level = logging.WARNING if status == "error" else logging.INFO
    logger.log(level, "TOOL RESULT  %s status=%s %s", tool.name, status, _short(tool_response, 300))
    return None


TRACE_CALLBACKS = {
    "before_agent_callback": before_agent_callback,
    "after_agent_callback": after_agent_callback,
    "before_model_callback": before_model_callback,
    "after_model_callback": after_model_callback,
    "before_tool_callback": before_tool_callback,
    "after_tool_callback": after_tool_callback,
}
