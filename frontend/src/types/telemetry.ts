// Wire contract for ws://<host>/ws/telemetry — mirrors agent_builder/telemetry.py.

export type AgentState = 'idle' | 'thinking' | 'tool_execution' | 'error';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

interface EventBase {
  seq: number;
  timestamp: number; // epoch seconds
}

export interface HelloEvent extends EventBase {
  type: 'HELLO';
  server_id: string;
}

export interface AgentCreatedEvent extends EventBase {
  type: 'AGENT_CREATED';
  id: string;
  role: string;
  parent_id: string | null;
  system_prompt: string;
  description?: string;
  model?: string;
}

export interface AgentStateChangeEvent extends EventBase {
  type: 'AGENT_STATE_CHANGE';
  id: string;
  state: AgentState;
  detail?: string;
}

export interface ToolCallStartEvent extends EventBase {
  type: 'TOOL_CALL_START';
  id: string;
  call_id: string;
  tool_name: string;
  payload: JsonValue;
}

export interface ToolCallEndEvent extends EventBase {
  type: 'TOOL_CALL_END';
  id: string;
  call_id: string;
  tool_name: string;
  payload: JsonValue;
  result: JsonValue;
  status: 'success' | 'error';
  duration_ms: number | null;
  state_delta?: JsonObject;
}

export interface A2AMessageEvent extends EventBase {
  type: 'A2A_MESSAGE';
  from_id: string;
  to_id: string;
  message_summary: string;
}

export interface TokenStreamEvent extends EventBase {
  type: 'TOKEN_STREAM';
  id: string;
  chunk: string;
  kind?: 'text' | 'thought';
}

export interface AgentMetricsEvent extends EventBase {
  type: 'AGENT_METRICS';
  id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface RunEvent extends EventBase {
  type: 'RUN_STARTED' | 'RUN_COMPLETED';
  invocation_id: string;
  app_name: string;
  root_id: string;
}

// ---- Shared core modules (tectonic_runtime/events.py) ------------------------------------

export type ModuleState = 'offline' | 'booting' | 'idle' | 'busy' | 'error';

export interface ModuleOperationSpec {
  name: string;
  summary: string;
  params: { name: string; required: boolean; default?: JsonValue }[];
}

export interface ModuleRegisteredEvent extends EventBase {
  type: 'MODULE_REGISTERED';
  module: string;
  label: string;
  description: string;
  category: string;
  operations: ModuleOperationSpec[];
}

export interface ModuleStateEvent extends EventBase {
  type: 'MODULE_STATE';
  module: string;
  state: ModuleState;
  active_calls: number;
  total_calls: number;
  detail?: string;
}

export interface ModuleCallStartEvent extends EventBase {
  type: 'MODULE_CALL_START';
  module: string;
  operation: string;
  call_id: string;
  agent_id: string;
  session_id: string | null;
  payload: JsonValue;
}

export interface ModuleCallEndEvent extends EventBase {
  type: 'MODULE_CALL_END';
  module: string;
  operation: string;
  call_id: string;
  agent_id: string;
  session_id: string | null;
  status: 'success' | 'error';
  duration_ms: number;
  summary: string;
  result?: JsonValue;
  error?: string;
}

/** Agents deleted in the Studio (their code is gone): drop them from every view. */
export interface AgentDeletedEvent extends EventBase {
  type: 'AGENT_DELETED';
  ids: string[];
  project?: string | null;
}

export type TelemetryEvent =
  | HelloEvent
  | AgentDeletedEvent
  | ModuleRegisteredEvent
  | ModuleStateEvent
  | ModuleCallStartEvent
  | ModuleCallEndEvent
  | AgentCreatedEvent
  | AgentStateChangeEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | A2AMessageEvent
  | TokenStreamEvent
  | AgentMetricsEvent
  | RunEvent;

// ---- Client-side models -------------------------------------------------------------------

export interface AgentMeta {
  id: string;
  role: string;
  parentId: string | null;
  systemPrompt: string;
  description: string;
  model: string;
  state: AgentState;
  stateDetail?: string;
  createdAt: number; // epoch seconds
  lastActiveAt: number; // epoch seconds
  tokens: { prompt: number; completion: number; total: number };
  toolCallCount: number;
  /** Seen in another agent's event before its own AGENT_CREATED arrived. */
  stub?: boolean;
}

export interface TraceSegment {
  kind: 'text' | 'thought' | 'tool' | 'result';
  text: string;
}

export interface ToolCallRecord {
  callId: string;
  toolName: string;
  payload: JsonValue;
  result?: JsonValue;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  durationMs?: number | null;
}

export interface ModuleMeta {
  id: string;
  label: string;
  description: string;
  category: string;
  operations: ModuleOperationSpec[];
  state: ModuleState;
  stateDetail?: string;
  activeCalls: number;
  totalCalls: number;
  errorCount: number;
  lastAgent?: string;
  lastOperation?: string;
}

export interface ModuleCallRecord {
  callId: string;
  module: string;
  operation: string;
  agentId: string;
  payload: JsonValue;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  durationMs?: number;
  summary?: string;
  result?: JsonValue;
  error?: string;
}

export type LogLevel = 'spawn' | 'state' | 'tool' | 'a2a' | 'error' | 'run' | 'module';

export interface LogEntry {
  seq: number;
  timestamp: number;
  level: LogLevel;
  agentId?: string;
  text: string;
}

export interface Packet {
  key: string;
  edgeId: string;
  reverse: boolean;
  label: string;
  bornAt: number;
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed';
