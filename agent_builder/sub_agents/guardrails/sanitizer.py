"""Input and output guardrails engine: deterministic PII/PHI detection, redaction, and threat blocking.

Runs 100% in Python code without any LLM interaction.
"""

import re
from typing import Optional
from pydantic import BaseModel, Field

# --- Threat Patterns (HARD BLOCK - DO NOT SEND TO LLM) -------------------------
_DEATH_VIOLENCE_PATTERNS = [
    (
        r"\b(kill\s+(?:you|him|her|them|everyone|all|people|myself|yourself)|murder|assassinate|slaughter|behead|massacre)\b",
        "DEATH_OR_VIOLENCE",
        "Content expresses death threats, killing, or severe violence.",
    ),
    (
        r"\b(death\s+threat|die\s+in\s+a\s+fire|hope\s+you\s+die|you\s+should\s+die|suicide|commit\s+suicide|hang\s+yourself|end\s+your\s+life)\b",
        "SUICIDE_SELF_HARM",
        "Content references suicide, self-harm, or wishing death upon someone.",
    ),
    (
        r"\b(bomb|detonate|mass\s+shooting|shoot\s+up\s+a\s+school|terrorist\s+attack|build\s+a\s+bomb|pipe\s+bomb|bioweapon|chemical\s+weapon|sarin|anthrax|cyanide\s+poisoning)\b",
        "WEAPONS_TERRORISM",
        "Content involves weapons of mass harm, terrorism, or explosive devices.",
    ),
    (
        r"\b(torture|mutilate|cut\s+your\s+wrists|strangle|shoot\s+(?:him|her|them|you))\b",
        "PHYSICAL_HARM",
        "Content describes severe physical torture or bodily harm.",
    ),
    (
        r"\b(ransomware|keylogger|ddos\s+attack|botnet|remote\s+code\s+execution\s+exploit)\b",
        "CYBER_ATTACK",
        "Content describes malicious attack tooling or malware creation.",
    ),
    (
        r"\b(doxx?|stalk|covertly\s+track)\b.{0,40}\b(person|individual|someone|ex[\s-]?(?:wife|husband|partner|girlfriend|boyfriend))\b",
        "STALKING_DOXXING",
        "Content involves covert surveillance, stalking, or doxxing.",
    ),
    (
        r"(?:ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)|you\s+are\s+now\s+(?:dan|unrestricted|jailbroken))",
        "PROMPT_INJECTION",
        "Content attempts to jailbreak or bypass system instructions.",
    ),
]

# --- PII Patterns (Redact before sending to LLM) ------------------------------
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_SSN_RE = re.compile(r"\b\d{3}[-\s]\d{2}[-\s]\d{4}\b")
_CREDIT_CARD_RE = re.compile(
    r"\b(?:\d{4}[-\s]){3}\d{4}\b|\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13})\b"
)
_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b(?:\+?[1-9]\d{1,2}[-.\s]?)?\d{10}\b"
)
_IPV4_RE = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b"
)
_IPV6_RE = re.compile(r"\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b")
_GOV_ID_RE = re.compile(
    r"\b(?:passport|driver'?s?\s*licen[sc]e|national\s*id|ssn|dl)[:\s#]+([A-Z0-9-]{6,15})\b",
    re.IGNORECASE,
)

# --- PHI Patterns (Protected Health Information) -------------------------------
_MRN_RE = re.compile(
    r"\b(?:mrn|medical\s*record|patient\s*id|chart\s*(?:no|number)|rx\s*(?:no|number)?)[:\s#]*([A-Z0-9-]{5,15})\b",
    re.IGNORECASE,
)
_HEALTH_INSURANCE_RE = re.compile(
    r"\b(?:health\s*insurance|member\s*id|subscriber\s*id|policy\s*number|medicare(?:\s*id)?|medicaid(?:\s*id)?)[:\s#]*([A-Z0-9-]{6,15})\b",
    re.IGNORECASE,
)
_HEALTH_CONDITION_RE = re.compile(
    r"\b(?:diagnosed\s+with|treatment\s+for|suffering\s+from|patient\s+has)\s+([a-zA-Z\s]{3,30}?)\s+(?:prescribed|admitted|under\s+dr\b)",
    re.IGNORECASE,
)

# --- Secret / API Key Patterns (For Output Guardrails) -------------------------
_SECRET_RE = re.compile(
    r"""(?i)(?:api[_-]?key|secret|password|passwd|token|bearer)\s*[:=]\s*["']?([A-Za-z0-9_\-/+=]{16,})["']?"""
)
_PRIVATE_KEY_RE = re.compile(
    r"-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----"
)


class InputGuardrailResult(BaseModel):
    is_blocked: bool = False
    block_reason: str = ""
    block_code: str = ""
    user_guidance: str = ""
    sanitized_text: str = ""
    pii_redacted: list[str] = Field(default_factory=list)
    phi_redacted: list[str] = Field(default_factory=list)


class OutputGuardrailResult(BaseModel):
    is_mitigated: bool = False
    sanitized_text: str = ""
    redactions: list[str] = Field(default_factory=list)


def check_input_guardrails(text: str) -> InputGuardrailResult:
    """Analyze input text: block threats/death prompts immediately; redact PII and PHI.

    100% deterministic code without LLM calls.
    """
    raw_text = text or ""

    # 1. Check for Death, Threats, Violence, and Severe Harm (HARD BLOCK)
    for pattern, code, description in _DEATH_VIOLENCE_PATTERNS:
        match = re.search(pattern, raw_text, re.IGNORECASE)
        if match:
            guidance = (
                f"Your request was blocked by safety guardrails [{code}]: {description}\n\n"
                "Please redefine your prompt to focus on legitimate, safe agent creation tasks."
            )
            return InputGuardrailResult(
                is_blocked=True,
                block_reason=description,
                block_code=code,
                user_guidance=guidance,
                sanitized_text="",
            )

    # 2. Check and Redact PII (Personally Identifiable Information)
    pii_found = []
    sanitized = raw_text

    if _EMAIL_RE.search(sanitized):
        pii_found.append("EMAIL")
        sanitized = _EMAIL_RE.sub("[REDACTED_EMAIL]", sanitized)

    if _SSN_RE.search(sanitized):
        pii_found.append("SSN")
        sanitized = _SSN_RE.sub("[REDACTED_SSN]", sanitized)

    if _CREDIT_CARD_RE.search(sanitized):
        pii_found.append("CREDIT_CARD")
        sanitized = _CREDIT_CARD_RE.sub("[REDACTED_CREDIT_CARD]", sanitized)

    if _GOV_ID_RE.search(sanitized):
        pii_found.append("GOVERNMENT_ID")
        sanitized = _GOV_ID_RE.sub("[REDACTED_GOV_ID]", sanitized)

    # 3. Check and Redact PHI (Protected Health Information)
    phi_found = []

    if _MRN_RE.search(sanitized):
        phi_found.append("MEDICAL_RECORD_NUMBER")
        sanitized = _MRN_RE.sub("[REDACTED_PHI_MRN]", sanitized)

    if _HEALTH_INSURANCE_RE.search(sanitized):
        phi_found.append("HEALTH_INSURANCE_ID")
        sanitized = _HEALTH_INSURANCE_RE.sub("[REDACTED_PHI_INSURANCE]", sanitized)

    if _HEALTH_CONDITION_RE.search(sanitized):
        phi_found.append("HEALTH_CONDITION")
        sanitized = _HEALTH_CONDITION_RE.sub("[REDACTED_PHI_CONDITION]", sanitized)

    # Phone numbers and IP addresses (checked after SSN and Credit Card to avoid false splits)
    if _PHONE_RE.search(sanitized):
        pii_found.append("PHONE_NUMBER")
        sanitized = _PHONE_RE.sub("[REDACTED_PHONE]", sanitized)

    if _IPV4_RE.search(sanitized):
        # Exclude loopback / local subnet references if common, but redact external IPs
        pii_found.append("IP_ADDRESS")
        sanitized = _IPV4_RE.sub("[REDACTED_IP]", sanitized)

    if _IPV6_RE.search(sanitized):
        pii_found.append("IP_ADDRESS_V6")
        sanitized = _IPV6_RE.sub("[REDACTED_IP]", sanitized)

    return InputGuardrailResult(
        is_blocked=False,
        block_reason="",
        block_code="",
        user_guidance="",
        sanitized_text=sanitized,
        pii_redacted=sorted(set(pii_found)),
        phi_redacted=sorted(set(phi_found)),
    )


def check_output_guardrails(text: str) -> OutputGuardrailResult:
    """Analyze and mitigate output text: redact echoed PII/PHI, leaked secrets, or API keys.

    100% deterministic code without LLM calls.
    """
    raw_text = text or ""
    sanitized = raw_text
    redactions = []

    # 1. Redact Secrets, Passwords, and Private Keys
    if _PRIVATE_KEY_RE.search(sanitized):
        redactions.append("PRIVATE_KEY")
        sanitized = _PRIVATE_KEY_RE.sub("[REDACTED_PRIVATE_KEY]", sanitized)

    if _SECRET_RE.search(sanitized):
        redactions.append("API_KEY_OR_SECRET")
        sanitized = _SECRET_RE.sub("api_key=[REDACTED_SECRET]", sanitized)

    # 2. Redact any inadvertently reflected PII/PHI in output
    if _EMAIL_RE.search(sanitized):
        redactions.append("EMAIL")
        sanitized = _EMAIL_RE.sub("[REDACTED_EMAIL]", sanitized)

    if _SSN_RE.search(sanitized):
        redactions.append("SSN")
        sanitized = _SSN_RE.sub("[REDACTED_SSN]", sanitized)

    if _CREDIT_CARD_RE.search(sanitized):
        redactions.append("CREDIT_CARD")
        sanitized = _CREDIT_CARD_RE.sub("[REDACTED_CREDIT_CARD]", sanitized)

    if _PHONE_RE.search(sanitized):
        redactions.append("PHONE_NUMBER")
        sanitized = _PHONE_RE.sub("[REDACTED_PHONE]", sanitized)

    if _MRN_RE.search(sanitized):
        redactions.append("MEDICAL_RECORD_NUMBER")
        sanitized = _MRN_RE.sub("[REDACTED_PHI_MRN]", sanitized)

    if _HEALTH_INSURANCE_RE.search(sanitized):
        redactions.append("HEALTH_INSURANCE_ID")
        sanitized = _HEALTH_INSURANCE_RE.sub("[REDACTED_PHI_INSURANCE]", sanitized)

    return OutputGuardrailResult(
        is_mitigated=len(redactions) > 0,
        sanitized_text=sanitized,
        redactions=sorted(set(redactions)),
    )
