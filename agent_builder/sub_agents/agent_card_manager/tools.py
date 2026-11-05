"""Tools to create, read, update and link Agent Cards and keep the tool registry consistent."""

import json
from typing import Any

from google.adk.tools import ToolContext
from pydantic import ValidationError

from ...shared_libraries.constants import STATE_AGENT_CARDS, STATE_PROJECT_NAME
from ...shared_libraries.types import AgentCard, ToolSpec, parse_json_loose, slugify_identifier
from ...tools.file_manager import read_registry, write_registry


def _project(name: str) -> str:
    return slugify_identifier(name, default="generated_agent")


def _load(project: str, tool_context: ToolContext) -> dict:
    store = tool_context.state.get(STATE_AGENT_CARDS) or {}
    if project in store:
        return {k: dict(v) for k, v in store[project].items()}
    return read_registry(project)


def _save(project: str, cards: dict, tool_context: ToolContext) -> None:
    store: Any = dict(tool_context.state.get(STATE_AGENT_CARDS) or {})
    store[project] = cards
    tool_context.state[STATE_AGENT_CARDS] = store
    tool_context.state[STATE_PROJECT_NAME] = project
    write_registry(project, cards)


def _has_path(cards: dict, start: str, target: str) -> bool:
    """True if `target` is reachable from `start` following sub_agents links."""
    stack, seen = [start], set()
    while stack:
        current = stack.pop()
        if current == target:
            return True
        if current in seen or current not in cards:
            continue
        seen.add(current)
        stack.extend(cards[current].get("sub_agents", []))
    return False


def create_agent_card(project_name: str, card_json: str, tool_context: ToolContext) -> dict:
    """Create (or replace) one Agent Card in the project's registry.

    Args:
        project_name: snake_case project name.
        card_json: JSON object matching the agent_card schema (name, description, role, agent_type,
            instruction, tools, state_reads, output_key, ...). Exactly one card per project may have
            role "root". The model is gemini-3.6-flash.
        tool_context: Injected by ADK.

    Returns:
        dict with status and the normalised card.
    """
    project = _project(project_name)
    try:
        card = AgentCard.model_validate(parse_json_loose(card_json))
    except (ValueError, ValidationError, json.JSONDecodeError) as exc:
        return {"status": "error", "error": f"Invalid agent card: {exc}"}
    cards = _load(project, tool_context)
    if card.role == "root":
        other_roots = [n for n, c in cards.items() if c.get("role") == "root" and n != card.name]
        if other_roots:
            return {"status": "error", "error": f"Project already has root agent '{other_roots[0]}'."}
    if card.output_key and card.output_key not in card.state_writes:
        card.state_writes.append(card.output_key)
    cards[card.name] = card.model_dump()
    _save(project, cards, tool_context)
    return {"status": "success", "card": cards[card.name]}


def get_agent_card(project_name: str, agent_name: str, tool_context: ToolContext) -> dict:
    """Read one Agent Card.

    Args:
        project_name: snake_case project name.
        agent_name: Name of the agent whose card to read.
        tool_context: Injected by ADK.

    Returns:
        dict with status and the card.
    """
    cards = _load(_project(project_name), tool_context)
    name = slugify_identifier(agent_name)
    if name not in cards:
        return {"status": "error", "error": f"No card named '{name}'.", "available": sorted(cards)}
    return {"status": "success", "card": cards[name]}


def list_agent_cards(project_name: str, tool_context: ToolContext) -> dict:
    """List all Agent Cards of a project with their roles and links.

    Args:
        project_name: snake_case project name.
        tool_context: Injected by ADK.

    Returns:
        dict with status and a compact summary per card.
    """
    cards = _load(_project(project_name), tool_context)
    summary = [
        {
            "name": n,
            "role": c.get("role"),
            "agent_type": c.get("agent_type"),
            "parent": c.get("parent", ""),
            "sub_agents": c.get("sub_agents", []),
            "tools": [t.get("name") for t in c.get("tools", [])],
        }
        for n, c in sorted(cards.items())
    ]
    return {"status": "success", "project_name": _project(project_name), "cards": summary}


def update_agent_card(project_name: str, agent_name: str, updates_json: str, tool_context: ToolContext) -> dict:
    """Merge top-level field updates into an existing Agent Card (the name cannot change).

    Args:
        project_name: snake_case project name.
        agent_name: Card to update.
        updates_json: JSON object with the fields to replace, e.g. instruction or tools.
        tool_context: Injected by ADK.

    Returns:
        dict with status and the updated card.
    """
    project = _project(project_name)
    cards = _load(project, tool_context)
    name = slugify_identifier(agent_name)
    if name not in cards:
        return {"status": "error", "error": f"No card named '{name}'."}
    try:
        updates = parse_json_loose(updates_json)
        if not isinstance(updates, dict):
            raise ValueError("updates_json must be a JSON object.")
        updates.pop("name", None)
        merged = AgentCard.model_validate({**cards[name], **updates})
    except (ValueError, ValidationError, json.JSONDecodeError) as exc:
        return {"status": "error", "error": f"Invalid update: {exc}"}
    cards[name] = merged.model_dump()
    _save(project, cards, tool_context)
    return {"status": "success", "card": cards[name]}


def link_sub_agent(project_name: str, parent_name: str, child_name: str, tool_context: ToolContext) -> dict:
    """Link a child agent under a parent agent (updates both cards).

    Args:
        project_name: snake_case project name.
        parent_name: Agent that will own the child.
        child_name: Agent to attach. A child may have only one parent and cannot be the root.
        tool_context: Injected by ADK.

    Returns:
        dict with status and the parent's sub_agents list.
    """
    project = _project(project_name)
    cards = _load(project, tool_context)
    parent, child = slugify_identifier(parent_name), slugify_identifier(child_name)
    for name in (parent, child):
        if name not in cards:
            return {"status": "error", "error": f"No card named '{name}'.", "available": sorted(cards)}
    if parent == child or _has_path(cards, child, parent):
        return {"status": "error", "error": "Link would create a cycle."}
    if cards[child].get("role") == "root":
        return {"status": "error", "error": "The root agent cannot be a sub-agent."}
    existing_parent = cards[child].get("parent", "")
    if existing_parent and existing_parent != parent:
        return {"status": "error", "error": f"'{child}' already belongs to '{existing_parent}'."}
    if child not in cards[parent]["sub_agents"]:
        cards[parent]["sub_agents"] = cards[parent]["sub_agents"] + [child]
    cards[child]["parent"] = parent
    _save(project, cards, tool_context)
    return {"status": "success", "parent": parent, "sub_agents": cards[parent]["sub_agents"]}


def register_tool(project_name: str, agent_name: str, tool_json: str, tool_context: ToolContext) -> dict:
    """Register a tool (name, description, module, parameters) on an agent's card.

    Args:
        project_name: snake_case project name.
        agent_name: Agent that will use the tool.
        tool_json: JSON object matching the ToolSpec schema.
        tool_context: Injected by ADK.

    Returns:
        dict with status and the agent's tool names.
    """
    project = _project(project_name)
    cards = _load(project, tool_context)
    name = slugify_identifier(agent_name)
    if name not in cards:
        return {"status": "error", "error": f"No card named '{name}'."}
    try:
        spec = ToolSpec.model_validate(parse_json_loose(tool_json))
    except (ValueError, ValidationError, json.JSONDecodeError) as exc:
        return {"status": "error", "error": f"Invalid tool spec: {exc}"}
    tools = [t for t in cards[name]["tools"] if t["name"] != spec.name] + [spec.model_dump()]
    cards[name]["tools"] = tools
    _save(project, cards, tool_context)
    return {"status": "success", "tools": [t["name"] for t in tools]}


def validate_agent_registry(project_name: str, tool_context: ToolContext) -> dict:
    """Check that the project's cards form a consistent agent tree.

    Verifies exactly one root, resolvable sub-agent references, matching parent links, no cycles,
    unreachable agents, tool name collisions inside one module, and the model name.

    Args:
        project_name: snake_case project name.
        tool_context: Injected by ADK.

    Returns:
        dict with "valid" and a list of issues.
    """
    cards = _load(_project(project_name), tool_context)
    issues = []
    if not cards:
        return {"status": "success", "valid": False, "issues": ["No agent cards exist for this project."]}
    roots = [n for n, c in cards.items() if c.get("role") == "root"]
    if len(roots) != 1:
        issues.append(f"Expected exactly one root agent, found {len(roots)}.")
    for name, card in cards.items():
        card_model = card.get("model", "")
        if not card_model:
            issues.append(f"'{name}' must specify a valid model.")
        if card.get("agent_type") == "llm" and not card.get("instruction", "").strip():
            issues.append(f"'{name}' is an llm agent without an instruction.")
        for child in card.get("sub_agents", []):
            if child not in cards:
                issues.append(f"'{name}' references unknown sub-agent '{child}'.")
            elif cards[child].get("parent") != name:
                issues.append(f"'{child}' parent link does not point back to '{name}'.")
        if card.get("role") == "sub_agent" and not card.get("parent"):
            issues.append(f"Sub-agent '{name}' is not linked to a parent.")
    if len(roots) == 1:
        reachable = {n for n in cards if _has_path(cards, roots[0], n)}
        for name in sorted(set(cards) - reachable):
            issues.append(f"'{name}' is unreachable from the root agent.")
    seen: dict = {}
    for name, card in cards.items():
        for tool in card.get("tools", []):
            key = (tool["module"], tool["name"])
            if key in seen and seen[key] != name:
                continue  # the same tool shared by several agents is allowed
            seen[key] = name
    return {"status": "success", "valid": not issues, "issues": issues}
