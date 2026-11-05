"""Agent Compiler - JIT agent factory."""
from __future__ import annotations
import hashlib
import asyncio
from datetime import datetime, UTC
from typing import Any

from ..domain.enums import AgentStatus, EventType
from ..domain.agent_bom import AgentBillOfMaterials
from ..domain.mission_contract import MissionContract
from ..domain.execution_graph import TaskNode
from ..domain.trust_registry import TrustRegistry
from ..domain.evidence_fabric import EvidenceFabric, EvidenceEvent


class CompiledAgent:
    """An ephemeral agent compiled for a specific task."""
    
    def __init__(self, bom: AgentBillOfMaterials, client: Any, system_prompt: str,
                 trust_registry: TrustRegistry, evidence_fabric: EvidenceFabric,
                 use_mock: bool = False, on_stream: Any = None):
        self.bom = bom
        self.client = client
        self.system_prompt = system_prompt
        self.trust_registry = trust_registry
        self.evidence_fabric = evidence_fabric
        self.use_mock = use_mock
        self.on_stream = on_stream  # Callback for streaming updates
    
    async def _stream_chunk(self, chunk_type: str, content: str):
        """Send a streaming chunk to the callback."""
        if self.on_stream:
            try:
                if asyncio.iscoroutinefunction(self.on_stream):
                    await self.on_stream(chunk_type, content)
                else:
                    self.on_stream(chunk_type, content)
            except Exception:
                pass
    
    async def execute(self, input_data: dict[str, Any]) -> dict[str, Any]:
        self.bom.status = AgentStatus.ACTIVE
        self.bom.activated_at = datetime.now(UTC)
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.AGENT_ACTIVATED, trace_id=self.bom.mission_id,
            mission_id=self.bom.mission_id, agent_id=self.bom.id,
            payload={"role": self.bom.role, "tools": self.bom.assigned_tools},
        ))
        
        if self.use_mock:
            # Stream mock thinking
            mock_thinking = f"ðŸ§  Analyzing task: {self.bom.role}...\n\nConsidering the input and dependencies..."
            await self._stream_chunk("thinking", mock_thinking)
            await asyncio.sleep(0.5)
            
            mock_exec = f"ðŸ“‹ Executing task logic...\n\nProcessing: {input_data.get('task', 'task')[:80]}..."
            await self._stream_chunk("execution", mock_exec)
            await asyncio.sleep(0.5)
            
            self.bom.tokens_consumed = 150
            self.bom.api_calls_made = 1
            mock_output = f"âœ… Task '{self.bom.role}' completed successfully.\n\nAnalyzed input and produced results for: {input_data.get('task', 'task')[:100]}"
            await self._stream_chunk("output", mock_output)
            return {"output": mock_output, "success": True, "thinking": mock_thinking, "execution": mock_exec}
        
        # Build a comprehensive prompt for real LLM execution
        task_desc = input_data.get('task', '')
        context = input_data.get('context', {})
        deps = {k: v for k, v in input_data.items() if k.startswith('dep_')}
        
        prompt = f"""You are an expert AI agent executing a task in a professional business context.

## Your Role
{self.system_prompt}

## Task Description
{task_desc}

## Context
{context}

## Previous Task Results (Dependencies)
{deps if deps else 'None - this is the first task'}

## Instructions
Execute this task thoroughly and produce a comprehensive, professional report that business stakeholders can read.

**IMPORTANT**: Your OUTPUT must be:
- Written in clear, professional language suitable for business executives
- Well-structured with proper headings, bullet points, and sections
- Detailed and comprehensive - provide real insights, analysis, and actionable recommendations
- Formatted using Markdown for readability (use ##, ###, bullet points, bold, etc.)
- For tables, use ONLY proper Markdown table syntax like this:
  | Column 1 | Column 2 | Column 3 |
  |----------|----------|----------|
  | Data 1   | Data 2   | Data 3   |
- DO NOT use ASCII art boxes, plus signs (+), or decorative borders for tables
- DO NOT wrap content in triple backticks (```) unless it's actual code

Format your response EXACTLY as follows:

### THINKING
Brief summary of your approach (2-3 sentences)

### EXECUTION
Your detailed analysis process (can be technical)

### OUTPUT
**This is the main deliverable - make it comprehensive and professional!**

Write a complete, well-formatted report here that includes:
- Executive summary
- Key findings with detailed explanations
- Data/analysis where relevant
- Actionable recommendations
- Clear conclusions

Use proper Markdown formatting throughout.

Now execute this task and produce exceptional results."""

        try:
            # Stream the thinking phase - we're starting
            await self._stream_chunk("thinking", f"ðŸ§  Processing task: {self.bom.role}...")
            
            response = await self.client.aio.models.generate_content(
                model="gemini-3.6-flash", 
                contents=prompt
            )
            
            # Extract thinking, execution, and output sections
            text = response.text
            thinking = ""
            execution = ""
            output = text
            
            if "### THINKING" in text:
                parts = text.split("### THINKING")
                if len(parts) > 1:
                    rest = parts[1]
                    if "### EXECUTION" in rest:
                        thinking = rest.split("### EXECUTION")[0].strip()
                        rest = rest.split("### EXECUTION")[1]
                        if "### OUTPUT" in rest:
                            execution = rest.split("### OUTPUT")[0].strip()
                            output = rest.split("### OUTPUT")[1].strip()
                        else:
                            execution = rest.strip()
                    elif "### OUTPUT" in rest:
                        thinking = rest.split("### OUTPUT")[0].strip()
                        output = rest.split("### OUTPUT")[1].strip()
                    else:
                        thinking = rest.strip()
            
            # Stream the extracted sections to frontend
            if thinking:
                await self._stream_chunk("thinking", thinking)
            if execution:
                await self._stream_chunk("execution", execution)
            if output:
                await self._stream_chunk("output", output)
            
            # Get token usage if available
            usage = getattr(response, 'usage_metadata', None)
            if usage:
                self.bom.tokens_consumed += getattr(usage, 'total_token_count', 100)
            else:
                self.bom.tokens_consumed += 100
            self.bom.api_calls_made += 1
            
            return {
                "output": output,
                "thinking": thinking,
                "execution": execution,
                "full_response": text,
                "success": True
            }
        except Exception as e:
            return {"output": None, "success": False, "error": str(e), "thinking": f"Error occurred: {str(e)}"}
    
    def terminate(self, reason: str = "Task completed"):
        self.bom.status = AgentStatus.TERMINATED
        self.bom.terminated_at = datetime.now(UTC)
        self.bom.termination_reason = reason
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.AGENT_TERMINATED, trace_id=self.bom.mission_id,
            mission_id=self.bom.mission_id, agent_id=self.bom.id,
            payload={"reason": reason, "tokens": self.bom.tokens_consumed},
        ))


class AgentCompiler:
    """Factory for JIT agent compilation."""
    
    def __init__(self, trust_registry: TrustRegistry, evidence_fabric: EvidenceFabric, api_key: str):
        self.trust_registry = trust_registry
        self.evidence_fabric = evidence_fabric
        self.client = None
        # Support both old (AIza...) and new (AQ....) API key formats
        self.use_mock = not api_key or len(api_key) < 20
        
        if not self.use_mock:
            try:
                from google import genai
                self.client = genai.Client(api_key=api_key)
            except Exception:
                self.use_mock = True
        
        self._compiled_agents: dict[str, CompiledAgent] = {}
    
    def compile_agent(self, task: TaskNode, contract: MissionContract, on_stream: Any = None) -> CompiledAgent:
        authorized_tools = [c for c in task.required_capabilities 
                           if self.trust_registry.is_capability_approved(c)]
        system_prompt = f"""ROLE: {task.name}
TASK: {task.description}
MISSION: {contract.objective}
TOOLS: {authorized_tools}
CONSTRAINTS: Only complete assigned task, return JSON output."""
        prompt_hash = hashlib.sha256(system_prompt.encode()).hexdigest()[:16]
        
        bom = AgentBillOfMaterials(
            mission_id=contract.id, task_id=task.id, name=f"Agent_{task.name}",
            role=task.name, assigned_tools=authorized_tools,
            effective_authority={"risk": contract.risk_classification.value},
            risk_classification=task.risk_classification,
            creation_rationale=f"JIT for: {task.description}", system_prompt_hash=prompt_hash,
        )
        self.evidence_fabric.emit(EvidenceEvent(
            event_type=EventType.AGENT_COMPILED, trace_id=contract.trace_id,
            mission_id=contract.id, agent_id=bom.id, task_id=task.id,
            payload={"role": bom.role, "tools": authorized_tools},
        ))
        agent = CompiledAgent(bom, self.client, system_prompt, self.trust_registry, 
                              self.evidence_fabric, use_mock=self.use_mock, on_stream=on_stream)
        self._compiled_agents[bom.id] = agent
        return agent
    
    def get_agent(self, agent_id: str) -> CompiledAgent | None:
        return self._compiled_agents.get(agent_id)
    
    def terminate_all(self, mission_id: str):
        to_remove = [aid for aid, a in self._compiled_agents.items() if a.bom.mission_id == mission_id]
        for aid in to_remove:
            agent = self._compiled_agents.pop(aid, None)
            if agent:
                agent.terminate("Mission terminated")


