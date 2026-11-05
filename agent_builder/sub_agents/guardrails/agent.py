"""Deterministic Guardrails Gatekeeper (Zero LLM Interaction).

Handles request safety, design validation (requirements & agent cards), and code AST scanning
in pure Python code without using any LLM calls.
"""

import json
from pathlib import Path
from typing import Optional

from google.adk.tools import ToolContext

from ...shared_libraries.constants import (
    STATE_AGENT_CARDS,
    STATE_GUARDRAIL_REPORT,
    STATE_INTENT,
    STATE_PROJECT_NAME,
    STATE_REQUIREMENTS,
)
from ...workspace import output_dir
from .sanitizer import check_input_guardrails
from .tools import (
    check_request_safety,
    record_guardrail_verdict,
    scan_python_source,
    validate_json_payload,
)


def guardrails(stage: str = "request", request: str = "", tool_context: ToolContext = None) -> dict:
    """Deterministic guardrails tool that validates safety, policy, schemas, and code without LLM calls.

    Args:
        stage: "request", "design", or "code".
        request: The user request text (used in stage "request").
        tool_context: Injected by ADK.

    Returns:
        dict with status ("success" or "error"), verdict ("APPROVED" or "REJECTED"), and details.
    """
    clean_stage = str(stage).strip().lower()
    if clean_stage.startswith("stage:"):
        clean_stage = clean_stage.replace("stage:", "").strip()
    if "design" in clean_stage:
        clean_stage = "design"
    elif "code" in clean_stage:
        clean_stage = "code"
    elif "request" in clean_stage:
        clean_stage = "request"
    else:
        clean_stage = "request"

    # ---------------- STAGE: REQUEST ----------------
    if clean_stage == "request":
        user_text = request or ""
        if tool_context and not user_text:
            intent_data = tool_context.state.get(STATE_INTENT) or {}
            user_text = intent_data.get("summary", "") if isinstance(intent_data, dict) else str(intent_data)

        # 1. Threat check (Hard block on death, violence, terrorism, malware)
        input_check = check_input_guardrails(user_text)
        if input_check.is_blocked:
            if tool_context:
                record_guardrail_verdict(
                    stage="request",
                    approved=False,
                    summary=f"REJECTED: {input_check.block_reason}",
                    findings_json=json.dumps([{"severity": "blocker", "code": input_check.block_code, "message": input_check.block_reason}]),
                    required_changes_json=json.dumps(["Please redefine your prompt to focus on legitimate and safe agent tasks."]),
                    tool_context=tool_context,
                )
            return {
                "status": "error",
                "verdict": "REJECTED",
                "reason": input_check.block_reason,
                "guidance": input_check.user_guidance,
            }

        # 2. General request safety & local-only enforcement
        safety = check_request_safety(user_text)
        if not safety.get("safe", False):
            blockers = safety.get("blockers", [])
            if tool_context:
                record_guardrail_verdict(
                    stage="request",
                    approved=False,
                    summary="REJECTED: Safety policy violation detected.",
                    findings_json=json.dumps(blockers),
                    required_changes_json=json.dumps([b["message"] for b in blockers]),
                    tool_context=tool_context,
                )
            return {"status": "error", "verdict": "REJECTED", "blockers": blockers}

        # Approved
        warnings = safety.get("warnings", [])
        if tool_context:
            record_guardrail_verdict(
                stage="request",
                approved=True,
                summary="APPROVED: Request complies with safety and local-only policies.",
                findings_json=json.dumps(warnings),
                required_changes_json="[]",
                tool_context=tool_context,
            )
        return {
            "status": "success",
            "verdict": "APPROVED",
            "summary": "Request complies with safety and local-only policies.",
            "warnings": warnings,
        }

    # ---------------- STAGE: DESIGN ----------------
    elif clean_stage == "design":
        if not tool_context:
            return {"status": "error", "verdict": "REJECTED", "error": "No session context available."}

        req_data = tool_context.state.get(STATE_REQUIREMENTS)
        if not req_data:
            return {"status": "error", "verdict": "REJECTED", "error": "No requirements found in session state."}

        req_json = json.dumps(req_data, default=str) if isinstance(req_data, dict) else str(req_data)
        req_val = validate_json_payload("requirements", req_json)
        if not req_val.get("valid", False):
            errors = req_val.get("errors", [])
            record_guardrail_verdict(
                stage="design",
                approved=False,
                summary="REJECTED: Requirements schema or completeness validation failed.",
                findings_json=json.dumps([{"severity": "blocker", "code": "REQUIREMENTS_INVALID", "message": e} for e in errors]),
                required_changes_json=json.dumps(errors),
                tool_context=tool_context,
            )
            return {"status": "error", "verdict": "REJECTED", "errors": errors}

        # Check agent cards if cards exist
        project = tool_context.state.get(STATE_PROJECT_NAME) or (req_data.get("project_name") if isinstance(req_data, dict) else "")
        cards_store = tool_context.state.get(STATE_AGENT_CARDS) or {}
        cards = cards_store.get(project) or {}
        card_errors = []
        for card_name, card_obj in cards.items():
            card_json = json.dumps(card_obj, default=str) if isinstance(card_obj, dict) else str(card_obj)
            c_val = validate_json_payload("agent_card", card_json)
            if not c_val.get("valid", False):
                card_errors.extend(f"{card_name}: {e}" for e in c_val.get("errors", []))

        if card_errors:
            record_guardrail_verdict(
                stage="design",
                approved=False,
                summary="REJECTED: One or more agent cards failed validation.",
                findings_json=json.dumps([{"severity": "blocker", "code": "CARD_INVALID", "message": e} for e in card_errors]),
                required_changes_json=json.dumps(card_errors),
                tool_context=tool_context,
            )
            return {"status": "error", "verdict": "REJECTED", "card_errors": card_errors}

        record_guardrail_verdict(
            stage="design",
            approved=True,
            summary="APPROVED: Requirements and agent cards are valid, complete, and safe.",
            findings_json=json.dumps([{"severity": "warning", "code": "NOTICE", "message": w} for w in req_val.get("warnings", [])]),
            required_changes_json="[]",
            tool_context=tool_context,
        )
        return {
            "status": "success",
            "verdict": "APPROVED",
            "summary": "Requirements and agent cards are complete, valid, and safe.",
        }

    # ---------------- STAGE: CODE ----------------
    elif clean_stage == "code":
        if not tool_context:
            return {"status": "error", "verdict": "REJECTED", "error": "No session context available."}

        project = tool_context.state.get(STATE_PROJECT_NAME, "")
        project_dir = output_dir() / project if project else output_dir()
        py_files = list(project_dir.rglob("*.py")) if project_dir.is_dir() else []
        code_findings = []
        for py_file in py_files:
            try:
                content = py_file.read_text(encoding="utf-8")
                is_root = (py_file.name == "agent.py" and py_file.parent == project_dir / project)
                findings = scan_python_source(content, filename=py_file.name, expect_root_agent=is_root)
                code_findings.extend(findings)
            except Exception as exc:
                code_findings.append({"severity": "blocker", "code": "READ_ERROR", "message": f"Could not read {py_file}: {exc}"})

        blockers = [f for f in code_findings if f.get("severity") == "blocker"]
        approved = len(blockers) == 0
        record_guardrail_verdict(
            stage="code",
            approved=approved,
            summary="APPROVED: Python code passed AST safety scanning." if approved else f"REJECTED: Found {len(blockers)} code blockers.",
            findings_json=json.dumps(code_findings),
            required_changes_json=json.dumps([b["message"] for b in blockers]),
            tool_context=tool_context,
        )
        if approved:
            return {"status": "success", "verdict": "APPROVED", "summary": "Python code passed AST safety scanning."}
        else:
            return {"status": "error", "verdict": "REJECTED", "blockers": blockers}

    return {"status": "error", "verdict": "REJECTED", "error": f"Unknown stage '{stage}'."}


# Backwards compatibility alias
guardrails_agent = guardrails
