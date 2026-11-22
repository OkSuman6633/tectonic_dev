"""Generated-agent discovery: registry filtering, matching, routing and the orchestrator tool."""

from __future__ import annotations

from agent_builder import discovery
from agent_builder.tools import agent_access


def _entry(entry_id, name, kind, description, tools=None):
    return {"id": entry_id, "name": name, "kind": kind, "description": description, "tools": tools or []}


EXCEL = _entry("excel_desk", "Excel Analysis Agent", "project",
               "Analyzes Excel files and generates summaries and charts from spreadsheets.",
               ["read_excel", "chart"])
ATTENDANCE = _entry("log_desk", "Attendance Logger", "project",
                    "Logs Bob's daily check-ins and tracks attendance over time.",
                    ["log_checkin"])
EXCEL_SUB = _entry("excel_desk/summarizer", "Summarizer", "sub_agent",
                   "Writes plain-language summaries of spreadsheet data.", [])


def test_generated_agents_excludes_builder_entries():
    entries = [
        _entry("agent_builder", "agent_builder", "builder", "The Builder", []),
        _entry("agent_builder/intent_detection", "intent_detection", "builder_sub_agent", "", []),
        EXCEL, EXCEL_SUB,
    ]
    ids = {e["id"] for e in discovery.generated_agents(entries)}
    assert ids == {"excel_desk", "excel_desk/summarizer"}


def test_discover_reuses_matching_generated_agent():
    result = discovery.discover("analyze this excel file and generate a summary",
                                entries=[ATTENDANCE, EXCEL, EXCEL_SUB])
    assert result["route"] == "existing"
    assert result["best"]["id"] == "excel_desk"
    assert result["matches"][0]["score"] >= result["matches"][1]["score"]


def test_discover_returns_none_for_unrelated_query():
    result = discovery.discover("translate this French letter into English",
                                entries=[ATTENDANCE, EXCEL])
    assert result["route"] == "none" and result["best"] is None


def test_discover_honours_confidence_threshold():
    result = discovery.discover("analyze this excel file and generate a summary",
                                entries=[ATTENDANCE, EXCEL], min_score=0.9)
    assert result["route"] == "none"
    result = discovery.discover("analyze this excel file and generate a summary",
                                entries=[ATTENDANCE, EXCEL])
    assert result["route"] == "existing"


def test_tool_name_mention_boosts_match():
    result = discovery.discover("use the read_excel tool on the uploaded sheet",
                                entries=[ATTENDANCE, EXCEL])
    assert result["route"] == "existing" and result["best"]["id"] == "excel_desk"


def test_discover_agents_tool_wrapper(monkeypatch):
    monkeypatch.setattr(discovery.directory, "list_entries", lambda: [ATTENDANCE, EXCEL])
    out = agent_access.discover_agents("summarize my spreadsheet")
    assert out["status"] == "success" and out["route"] == "existing"
    assert out["best"]["id"] == "excel_desk"
    assert all(k in out["best"] for k in ("id", "name", "score", "tools"))
