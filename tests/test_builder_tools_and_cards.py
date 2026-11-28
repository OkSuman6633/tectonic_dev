"""Unit and functional tests for shared types, file manager sandbox, memory persistence, agent cards, and code generation."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest


# --- Unit tests: shared_libraries/types.py --------------------------------------------------------
def test_slugify_identifier_and_parse_json_loose():
    from agent_builder.shared_libraries.types import ToolSpec, parse_json_loose, slugify_identifier

    assert slugify_identifier("") == "agent"
    assert slugify_identifier("123 My Agent!") == "a_123_my_agent"
    assert slugify_identifier("class") == "class_agent"
    assert slugify_identifier("x") == "x_agent"
    assert len(slugify_identifier("a" * 80)) == 48

    assert parse_json_loose('Here:\n```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_loose("prefix [1, 2, 3] suffix") == [1, 2, 3]
    with pytest.raises(ValueError):
        parse_json_loose("no json here")
    with pytest.raises(ValueError):
        parse_json_loose("{unterminated")

    spec = ToolSpec.model_validate({"name": "Fetch Data", "parameters": {"user_id": "str"}, "module": "my tools"})
    assert spec.name == "fetch_data" and spec.module == "my_tools"
    assert spec.parameters[0].name == "user_id" and spec.parameters[0].type == "str"


# --- Unit tests: tools/file_manager.py ------------------------------------------------------------
def test_file_manager_sandbox_and_policy(tmp_path):
    from agent_builder.tools import file_manager

    with pytest.raises(ValueError):
        file_manager.resolve_safe_path("")
    with pytest.raises(ValueError):
        file_manager.resolve_safe_path(str(tmp_path / "abs.py"))
    with pytest.raises(ValueError):
        file_manager.resolve_safe_path("../escape.py")

    assert file_manager.forbidden_reason("Dockerfile") is not None
    assert file_manager.forbidden_reason(".github/workflows/ci.yml") is not None
    assert file_manager.forbidden_reason("infra/main.tf") is not None
    assert file_manager.forbidden_reason("notes/eda.ipynb") is not None
    assert file_manager.forbidden_reason("demo/demo/agent.py") is None

    assert file_manager.write_file("demo/Dockerfile", "FROM python:3.11")["status"] == "error"
    assert file_manager.write_file("demo/binary.exe", "bad")["status"] == "error"
    ok = file_manager.write_file("demo/readme.md", "# Hello")
    assert ok["status"] == "success"
    conflict = file_manager.write_file("demo/readme.md", "# Overwrite", overwrite=False)
    assert conflict["status"] == "error"

    read_ok = file_manager.read_text_file("demo/readme.md")
    assert read_ok["status"] == "success" and read_ok["content"] == "# Hello"
    assert file_manager.read_text_file("demo/missing.md")["status"] == "error"
    listing = file_manager.list_files("demo")
    assert listing["status"] == "success" and any(e.replace("\\", "/") == "demo/readme.md" for e in listing["entries"])


# --- Unit tests: tools/memory.py ------------------------------------------------------------------
def test_memory_tools_progress_and_disk_snapshot():
    from agent_builder.tools import memory

    ctx = SimpleNamespace(state={})
    assert "nothing has been recorded" in memory.render_state_block(ctx, ("intent", "project_name"))

    assert memory.save_progress("bad_key", "x", ctx)["status"] == "error"
    assert memory.save_progress("intent", "not-json", ctx)["status"] == "error"
    assert memory.save_progress("intent", '{"category": "create_agent"}', ctx)["status"] == "success"
    assert memory.save_progress("project_name", "Invoice Desk!", ctx)["status"] == "success"
    assert ctx.state["project_name"] == "invoice_desk"

    loaded = memory.load_progress("intent", ctx)
    assert loaded["found"] is True and loaded["value"]["category"] == "create_agent"
    assert memory.load_progress("missing", ctx)["found"] is False

    summary = memory.get_session_summary(ctx)
    assert summary["has_intent"] is True and summary["project_name"] == "invoice_desk"

    assert memory.load_profile("agent_card_default")["status"] == "success"
    assert memory.load_profile("nonexistent_profile")["status"] == "error"

    saved = memory.persist_progress(ctx)
    assert saved["status"] == "success"
    ctx2 = SimpleNamespace(state={})
    restored = memory.restore_progress("invoice_desk", ctx2)
    assert restored["status"] == "success" and "intent" in restored["restored"]
    assert ctx2.state["project_name"] == "invoice_desk"
    assert memory.restore_progress("no_such_project", ctx2)["status"] == "error"


# --- Unit tests: agent_card_manager/tools.py ------------------------------------------------------
def test_agent_card_crud_linking_and_validation():
    from agent_builder.sub_agents.agent_card_manager import tools as acm

    ctx = SimpleNamespace(state={})
    root_card = json.dumps({
        "name": "coordinator",
        "role": "root",
        "agent_type": "llm",
        "description": "Coordinates tasks",
        "instruction": "Delegate to workers.",
        "output_key": "final_answer",
    })
    worker_card = json.dumps({
        "name": "fetcher",
        "role": "sub_agent",
        "agent_type": "llm",
        "description": "Fetches records",
        "instruction": "Fetch records cleanly.",
    })
    assert acm.create_agent_card("orders", root_card, ctx)["status"] == "success"
    # Second root rejected
    dup_root = acm.create_agent_card("orders", root_card.replace("coordinator", "second_root"), ctx)
    assert dup_root["status"] == "error"

    assert acm.create_agent_card("orders", worker_card, ctx)["status"] == "success"
    assert acm.get_agent_card("orders", "coordinator", ctx)["card"]["state_writes"] == ["final_answer"]
    assert acm.get_agent_card("orders", "ghost", ctx)["status"] == "error"

    # Orphan sub-agent fails validation before linking
    pre_val = acm.validate_agent_registry("orders", ctx)
    assert pre_val["valid"] is False

    # Link & cycle prevention
    assert acm.link_sub_agent("orders", "coordinator", "coordinator", ctx)["status"] == "error"
    assert acm.link_sub_agent("orders", "fetcher", "coordinator", ctx)["status"] == "error"
    assert acm.link_sub_agent("orders", "coordinator", "fetcher", ctx)["status"] == "success"

    # Register tool & update card
    tool_json = json.dumps({"name": "lookup_order", "description": "Look up order", "module": "orders_tools"})
    assert acm.register_tool("orders", "fetcher", tool_json, ctx)["tools"] == ["lookup_order"]
    assert acm.update_agent_card("orders", "fetcher", '{"description": "Updated desc"}', ctx)["card"]["description"] == "Updated desc"

    listed = acm.list_agent_cards("orders", ctx)
    assert len(listed["cards"]) == 2
    assert acm.validate_agent_registry("orders", ctx)["valid"] is True


# --- Functional test: full card -> guardrail -> scaffold -> write -> verify pipeline ----------------
def test_code_generator_end_to_end_scaffold_write_and_verify():
    from agent_builder.sub_agents.agent_card_manager import tools as acm
    from agent_builder.sub_agents.code_generator import tools as cg

    ctx = SimpleNamespace(state={})
    # Without guardrail approval, code generation is blocked
    assert cg.scaffold_project("billing_bot", "[]", ctx)["status"] == "error"
    assert cg.write_project_file("billing_bot", "tools/math_tools.py", "x = 1", ctx)["status"] == "error"

    # Create valid cards & approve design guardrail
    acm.create_agent_card("billing_bot", json.dumps({
        "name": "billing_root",
        "role": "root",
        "agent_type": "llm",
        "description": "Handles billing",
        "instruction": "Use compute_tax to answer.",
        "tools": [{"name": "compute_tax", "description": "Compute VAT", "module": "tax_tools"}],
    }), ctx)
    ctx.state["guardrail_report"] = {"stage": "design", "approved": True}

    scaffold = cg.scaffold_project("billing_bot", '["httpx>=0.27"]', ctx)
    assert scaffold["status"] == "success"
    assert "billing_bot/tools/tax_tools.py" in scaffold["tool_modules_to_implement"]

    # Unsafe Python or forbidden file is rejected
    bad_code = cg.write_project_file("billing_bot", "tools/tax_tools.py", 'eval("1+1")', ctx)
    assert bad_code["status"] == "error" and bad_code["blockers"]
    assert cg.write_project_file("billing_bot", "Dockerfile", "FROM python:3.11", ctx)["status"] == "error"

    # Missing tool module causes verification failure
    pre_verify = cg.verify_generated_project("billing_bot", ctx)
    assert pre_verify["ok"] is False

    # Bare sqlite3.connect path is blocked at write time by AST guardrail scan
    bare_db = 'import sqlite3\ndef compute_tax(amount: float) -> dict:\n    """Compute tax."""\n    sqlite3.connect("tax.db")\n    return {}\n'
    blocked_db = cg.write_project_file("billing_bot", "tools/tax_tools.py", bare_db, ctx)
    assert blocked_db["status"] == "error" and any(b["code"] == "BARE_DATABASE_PATH" for b in blocked_db["blockers"])

    # Pass-only placeholder passes AST safety scan, then is caught by verify_generated_project
    incomplete = 'def compute_tax(amount: float) -> dict:\n    """Compute tax."""\n    pass\n'
    assert cg.write_project_file("billing_bot", "tools/tax_tools.py", incomplete, ctx)["status"] == "success"
    mid_verify = cg.verify_generated_project("billing_bot", ctx)
    assert mid_verify["ok"] is False
    assert any("no real implementation" in p for p in mid_verify["problems"])

    # Write clean, complete implementation -> verification succeeds
    good_impl = '''def compute_tax(amount: float) -> dict:
    """Compute 20% VAT for a billing amount."""
    return {"status": "success", "tax": round(amount * 0.2, 2)}
'''
    written = cg.write_project_file("billing_bot", "tools/tax_tools.py", good_impl, ctx)
    assert written["status"] == "success"
    listing = cg.list_project_files("billing_bot")
    assert listing["status"] == "success" and "billing_bot/billing_bot/tools/tax_tools.py" in listing["files"]

    final_verify = cg.verify_generated_project("billing_bot", ctx)
    assert final_verify["ok"] is True and final_verify["problems"] == []
