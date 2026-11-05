"""Guardrail tools: request safety checks, JSON schema validation, code AST scanning, verdict recording."""

import ast
import json
import re
from typing import Any

from google.adk.tools import ToolContext
from pydantic import ValidationError

from ...shared_libraries.constants import STATE_GUARDRAIL_HISTORY, STATE_GUARDRAIL_REPORT
from ...shared_libraries.types import (
    AgentCard,
    GuardrailFinding,
    GuardrailReport,
    Intent,
    Requirements,
    parse_json_loose,
)

_BLOCKED_REQUEST_PATTERNS = [
    (r"\b(ransomware|keylogger|credential\s+stealer|botnet|ddos|rootkit)\b", "MALWARE",
     "The request describes malware or attack tooling."),
    (r"\b(steal|harvest|exfiltrat\w*|scrape)\b.{0,40}\b(passwords?|credentials?|tokens?|cookies?|api[\s_-]?keys?)\b",
     "CREDENTIAL_THEFT", "The request involves harvesting credentials or secrets."),
    (r"\b(bypass|disable|evade|circumvent)\b.{0,30}\b(safety|guardrails?|content\s+filters?|moderation)\b",
     "SAFETY_BYPASS", "The request tries to bypass safety controls."),
    (r"\bphishing\b|\b(mass|bulk)\s+(spam|emailing)\b", "PHISHING_SPAM", "The request involves phishing or bulk spam."),
    (r"\b(synthesi[sz]e|manufacture|build)\b.{0,30}\b(explosives?|nerve\s+agents?|bioweapons?|chemical\s+weapons?)\b",
     "WEAPONS", "The request involves weapons of mass harm."),
    (r"\b(stalk|doxx?|covertly\s+track)\w*\b.{0,40}\b(person|individual|ex[\s-]?(girlfriend|boyfriend|partner|wife|husband))\b",
     "SURVEILLANCE", "The request involves stalking or covert tracking of a person."),
]
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|prompts|rules)",
    r"reveal\s+(your\s+)?(system\s+)?prompt",
    r"you\s+are\s+now\s+(dan|unrestricted|jailbroken)",
    r"disregard\s+(your|the)\s+(guidelines|policies|rules)",
]
_LOCAL_ONLY_PATTERNS = [
    r"\b(dockerfile|docker[\s-]?compose|kubernetes|k8s|helm|terraform|cloud\s*build|cloud\s*run|app\s*engine)\b",
    r"\bvertex\s+ai\s+agent\s+engine\b",
    r"\bdeploy\w*\s+(it\s+)?to\s+(aws|gcp|azure|google\s+cloud|the\s+cloud)\b",
]
_SECRET_RE = re.compile(
    r"""(api[_-]?key|secret|password|passwd|token)\s*=\s*["'][A-Za-z0-9_\-/+=]{16,}["']""", re.IGNORECASE
)
_BLOCKED_CALLS = {"eval", "exec", "__import__"}
_BLOCKED_DOTTED = {"os.system", "os.popen", "os.execv", "os.execl", "os.spawnl"}
_WARN_DOTTED = {"shutil.rmtree", "os.remove", "os.unlink", "os.rmdir"}
_WARN_IMPORTS = {"pickle", "marshal", "ctypes", "socket", "subprocess"}
_CLOUD_IMPORT_PREFIXES = ("vertexai", "google.cloud", "boto3", "azure")


def _dotted(node: ast.AST) -> str:
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def scan_python_source(code: str, filename: str = "module.py", expect_root_agent: bool = False) -> list:
    """Return a list of GuardrailFinding dicts for a Python source string."""
    findings: list = []

    def add(severity: str, code_: str, message: str, line: int = 0) -> None:
        findings.append(
            GuardrailFinding(severity=severity, code=code_, message=message, location=f"{filename}:{line}" if line else filename).model_dump()
        )

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        add("blocker", "SYNTAX_ERROR", f"{exc.msg}", exc.lineno or 0)
        return findings

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            name = _dotted(node.func)
            if name in _BLOCKED_CALLS:
                add("blocker", "DANGEROUS_CALL", f"Call to {name}() is not allowed.", node.lineno)
            elif name in _BLOCKED_DOTTED:
                add("blocker", "DANGEROUS_CALL", f"Call to {name}() is not allowed.", node.lineno)
            elif name in _WARN_DOTTED:
                add("warning", "DESTRUCTIVE_CALL", f"{name}() deletes data; make sure paths are sandboxed.", node.lineno)
            if name.startswith("subprocess."):
                for kw in node.keywords:
                    if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                        add("blocker", "SHELL_TRUE", "subprocess with shell=True is not allowed.", node.lineno)
            if name == "sqlite3.connect" and node.args:
                first_arg = node.args[0]
                if isinstance(first_arg, ast.Constant) and isinstance(first_arg.value, str):
                    val = first_arg.value
                    if val.endswith((".db", ".sqlite", ".sqlite3")) and "/" not in val and "\\" not in val:
                        add(
                            "blocker",
                            "BARE_DATABASE_PATH",
                            f"sqlite3.connect('{val}') uses a bare relative path that pollutes outside directories. Use DB_PATH or DATA_DIR / '{val}' from ..shared_libraries.constants.",
                            node.lineno,
                        )
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            modules = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            for module in modules:
                root = module.split(".")[0]
                if root in _WARN_IMPORTS:
                    add("warning", "SENSITIVE_IMPORT", f"Import of '{module}' needs review.", node.lineno)
                if module.startswith(_CLOUD_IMPORT_PREFIXES):
                    add("warning", "LOCAL_ONLY", f"'{module}' is a cloud SDK; the project must run locally.", node.lineno)

    for match in _SECRET_RE.finditer(code):
        line = code.count("\n", 0, match.start()) + 1
        add("blocker", "HARDCODED_SECRET", "Possible hard-coded secret; read it from the environment instead.", line)

    if expect_root_agent:
        defines_root = any(
            isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "root_agent" for t in n.targets)
            for n in tree.body
        )
        if not defines_root:
            add("blocker", "NO_ROOT_AGENT", "agent.py must define a module-level 'root_agent'.")
    return findings


def _format_findings(findings: list) -> dict:
    blockers = [f for f in findings if f["severity"] == "blocker"]
    return {"safe": not blockers, "blockers": blockers, "warnings": [f for f in findings if f["severity"] == "warning"]}


def check_request_safety(text: str) -> dict:
    """Check a natural-language agent request against safety and local-only policies.

    Args:
        text: The user's request (or the requirements text) to inspect.

    Returns:
        dict with "safe" (False if any blocker), "blockers" and "warnings" lists of findings.
    """
    findings = []
    lowered = text or ""
    for pattern, code, message in _BLOCKED_REQUEST_PATTERNS:
        if re.search(pattern, lowered, re.IGNORECASE | re.DOTALL):
            findings.append(GuardrailFinding(severity="blocker", code=code, message=message).model_dump())
    for pattern in _INJECTION_PATTERNS:
        if re.search(pattern, lowered, re.IGNORECASE):
            findings.append(
                GuardrailFinding(severity="blocker", code="PROMPT_INJECTION", message="Text tries to override system instructions.").model_dump()
            )
            break
    for pattern in _LOCAL_ONLY_PATTERNS:
        if re.search(pattern, lowered, re.IGNORECASE):
            findings.append(
                GuardrailFinding(
                    severity="warning",
                    code="LOCAL_ONLY",
                    message="Cloud/container deployment was requested; only local ADK execution is supported and those parts will be dropped.",
                ).model_dump()
            )
            break
    result = _format_findings(findings)
    result["status"] = "success"
    return result


_SCHEMAS = {"intent": Intent, "requirements": Requirements, "agent_card": AgentCard}


def validate_json_payload(schema_name: str, payload_json: str) -> dict:
    """Validate a JSON payload against one of the project's Pydantic schemas.

    Args:
        schema_name: "intent", "requirements" or "agent_card".
        payload_json: The JSON text to validate.

    Returns:
        dict with "valid" and, if invalid, a list of human-readable errors.
    """
    model = _SCHEMAS.get(schema_name)
    if model is None:
        return {"status": "error", "error": f"schema_name must be one of {sorted(_SCHEMAS)}"}
    try:
        data = parse_json_loose(payload_json)
    except (ValueError, json.JSONDecodeError) as exc:
        return {"status": "success", "valid": False, "errors": [f"Not valid JSON: {exc}"]}
    try:
        model.model_validate(data)
    except ValidationError as exc:
        errors = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        return {"status": "success", "valid": False, "errors": errors}
    findings = []
    if schema_name == "requirements":
        findings = _requirements_consistency(Requirements.model_validate(data))
    return {"status": "success", "valid": not any(f["severity"] == "blocker" for f in findings), "errors": [f["message"] for f in findings if f["severity"] == "blocker"], "warnings": [f["message"] for f in findings if f["severity"] != "blocker"]}


def _requirements_consistency(req: Requirements) -> list:
    findings = []
    if not req.is_complete:
        findings.append({
            "severity": "blocker",
            "message": "Requirements gathering is still in progress (is_complete is false). Complete requirements elicitation before proceeding to design approval.",
        })
    if req.questions_for_user:
        findings.append({
            "severity": "blocker",
            "message": f"There are unresolved questions for the user: {req.questions_for_user}. Clarify these with the user first.",
        })
    if not req.goal or len(req.goal.strip()) < 10:
        findings.append({"severity": "blocker", "message": "Requirements goal is missing or too brief."})
    names = [req.root_agent.name] + [a.name for a in req.sub_agents]
    if len(names) != len(set(names)):
        findings.append({"severity": "blocker", "message": "Agent names must be unique."})
    tool_names = {t.name for t in req.tools}
    for agent in [req.root_agent] + req.sub_agents:
        for tool in agent.tools:
            if tool not in tool_names:
                findings.append({"severity": "blocker", "message": f"Agent '{agent.name}' uses undefined tool '{tool}'."})
    if len(req.sub_agents) > 8:
        findings.append({"severity": "warning", "message": "More than 8 sub-agents is hard to maintain."})
    if req.architecture == "single" and req.sub_agents:
        findings.append({"severity": "warning", "message": "Architecture is 'single' but sub-agents are listed."})
    for tool in req.tools:
        if tool.requires_network:
            findings.append({"severity": "warning", "message": f"Tool '{tool.name}' needs network access; ensure the user expects it."})
    return findings


def validate_python_code(code: str, filename: str = "module.py", expect_root_agent: bool = False) -> dict:
    """Parse Python source and scan its AST for dangerous calls, secrets and cloud-only code.

    Args:
        code: Python source text.
        filename: Name used in finding locations.
        expect_root_agent: True when checking an agent.py that must define root_agent.

    Returns:
        dict with "safe", "blockers" and "warnings".
    """
    result = _format_findings(scan_python_source(code, filename, expect_root_agent))
    result["status"] = "success"
    return result


def record_guardrail_verdict(
    stage: str,
    approved: bool,
    summary: str,
    findings_json: str,
    required_changes_json: str,
    tool_context: ToolContext,
) -> dict:
    """Record the final guardrail verdict for the current stage. Call this exactly once, last.

    Downstream code-writing tools refuse to run unless the latest verdict is approved
    at the "design" or "code" stage. A verdict containing any blocker is forced to rejected.

    Args:
        stage: "request", "design" or "code".
        approved: True only if there are no blocking findings.
        summary: One or two sentences explaining the decision.
        findings_json: JSON list of findings: severity (info|warning|blocker), code, message, location.
        required_changes_json: JSON list of strings describing what must change before approval.
        tool_context: Injected by ADK.

    Returns:
        dict with the stored verdict.
    """
    if stage not in ("request", "design", "code"):
        return {"status": "error", "error": "stage must be 'request', 'design' or 'code'."}
    try:
        raw_findings = parse_json_loose(findings_json or "[]")
        raw_changes = parse_json_loose(required_changes_json or "[]")
        if not isinstance(raw_findings, list) or not isinstance(raw_changes, list):
            raise ValueError("findings_json and required_changes_json must be JSON arrays.")
        findings = [GuardrailFinding.model_validate(f) for f in raw_findings]
    except (ValueError, ValidationError, json.JSONDecodeError) as exc:
        return {"status": "error", "error": f"Invalid findings payload: {exc}"}
    has_blocker = any(f.severity == "blocker" for f in findings)
    report = GuardrailReport(
        stage=stage,
        approved=bool(approved) and not has_blocker,
        summary=summary,
        findings=findings,
        required_changes=[str(c) for c in raw_changes],
    ).model_dump()
    tool_context.state[STATE_GUARDRAIL_REPORT] = report
    history: Any = list(tool_context.state.get(STATE_GUARDRAIL_HISTORY) or [])
    history.append({"stage": stage, "approved": report["approved"], "summary": summary})
    tool_context.state[STATE_GUARDRAIL_HISTORY] = history
    return {"status": "success", "verdict": report}
