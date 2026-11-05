export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, string>;
  returns: string;
  status?: 'idle' | 'calling' | 'success' | 'error';
  color?: string;
}

export interface GuardrailRule {
  id: string;
  name: string;
  description: string;
  type: 'input' | 'output' | 'safety';
  active: boolean;
}

export interface SubAgentNode {
  id: string;
  name: string;
  role: string;
  color: string;
  tools: string[];
}

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  isRecommended?: boolean;
}

export interface DecisionQuestion {
  id: string;
  title: string;
  description?: string;
  options: DecisionOption[];
  selectedOption: string;
  isCustom: boolean;
  customValue: string;
  /** Structured decisions from the Builder (pending_decisions). */
  why?: string;
  category?: string;
  multiSelect?: boolean;
  selectedOptions?: string[];
  allowCustom?: boolean;
}

export interface DecisionGroup {
  id: string;
  title: string;
  description?: string;
  questions: DecisionQuestion[];
  extraNotes?: string;
  isSubmitted?: boolean;
  /** True when built from the Builder's structured pending_decisions (answers go back as DECISIONS_JSON). */
  structured?: boolean;
  round?: number;
  /** Interview step this card belongs to ("Step 3 of 7 · Architecture & topology"). */
  step?: InterviewStepRef;
}

export interface InterviewStepRef {
  key: string;
  number: number;
  total: number;
  title: string;
  phase: string;
}

/** The Builder's `build_phase` state: where the guided interview / build currently is. */
export interface BuilderJourney {
  stepIndex: number;
  total: number;
  completed: string[];
  approved: boolean;
  phase: string;
  /** 0-5 across design validation → deliver once the spec is approved; null before. */
  buildStage: number | null;
  /** The user has chosen on the step-plan card which steps they decide themselves. */
  planChosen?: boolean;
  /** `auto`: the AI decides this step with its recommended choices (the user did not pick it). */
  steps: { key: string; title: string; phase: string; auto?: boolean }[];
}

/** An agent reachable from the Builder chat (GET /directory/agents). */
export interface DirectoryAgent {
  /** 'agent_builder', 'agent_builder/<specialist>', '<project>' or '<project>/<sub_agent_dir>'. */
  id: string;
  name: string;
  kind: 'builder' | 'builder_sub_agent' | 'project' | 'sub_agent';
  project: string | null;
  parent: string | null;
  depth: number;
  description: string;
  tools: string[];
  children: string[];
  deletable: boolean;
}

/** One hop of a chat turn: an agent taking over, or a tool / agent-tool it called. */
export interface TraceStep {
  type: 'agent' | 'tool';
  agent: string;
  name?: string;
  args?: string;
  status?: string;
  detail?: string;
  /** Ran inside another agent reached through ask_agent. */
  nested?: boolean;
}

/** Phase 4 output: the compiled Agent Architecture Specification. */
export interface ArchitectureSpec {
  project: string;
  markdown: string;
  leadSystemPrompt: string;
  config: Record<string, unknown>;
  enabledModules: string[];
}

export interface ExtractedAgentSpec {
  goal: string;
  tools: AgentTool[];
  guardrails: GuardrailRule[];
  architecture: 'coordinator' | 'sub_agents';
  storage: 'sqlite' | 'json' | string;
  dataSource: 'ready_dataset' | 'mock_data' | string;
  outputFormat: 'plain_text' | 'json' | 'both' | string;
  subAgents: SubAgentNode[];
}

/** An image or document sent with a chat message (images and PDFs go to the model as-is; Office and
 *  text files are read as text by the server). `data` (base64) is only kept until the message is sent. */
export interface ChatAttachment {
  name: string;
  mimeType: string;
  size: number;
  data?: string;
}

/** Improvement ideas the Idea Provider proposed for the agent being designed. */
export interface DesignIdeas {
  summary: string;
  ideas: { title: string; description: string; impact: 'high' | 'medium' | 'low'; area: string }[];
}

/** The Critic's review of a design (before the spec) or of the generated code. */
export interface DesignReview {
  stage: 'design' | 'code';
  score: number;
  verdict: 'approve' | 'revise';
  summary: string;
  strengths: string[];
  issues: { severity: 'blocker' | 'major' | 'minor'; area: string; problem: string; fix: string }[];
  acceptedIdeas: string[];
}

/** The Builder built a new agent on its own to answer the user's question, then asked it. */
export interface AutopilotRun {
  question: string;
  project: string;
  answered: boolean;
  agent: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  decisionGroup?: DecisionGroup;
  architectureSpec?: ArchitectureSpec;
  /** Directory id of the agent this message was sent to / answered by (absent: the Builder). */
  agentTarget?: string;
  /** Agent name that answered (shown instead of "Meta-Agent Builder"). */
  agentName?: string;
  trace?: TraceStep[];
  /** The reply was recovered from the server session after a page refresh. */
  recovered?: boolean;
  /** Files the user attached (names and types only). */
  attachments?: ChatAttachment[];
  designIdeas?: DesignIdeas;
  designReview?: DesignReview;
  codeReview?: DesignReview;
  autopilot?: AutopilotRun;
  structuredInfo?: {
    goal?: string;
    tools?: string[];
    guardrails?: string[];
    architecture?: string;
  };
}

/** One file an agent edit changed (POST /directory/edit). Paths are relative to generated_agents/<project>/. */
export interface AgentEditFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  added: number;
  removed: number;
  diff?: string;
}

export interface PromptPublish {
  prompt?: string;
  version?: string;
  published?: boolean;
  error?: string;
}

/** Result of a conversational edit of a generated agent. */
export interface AgentEditResult {
  status: 'success' | 'no_change' | 'error';
  project: string;
  target: string;
  agent: string;
  app_name: string;
  edit_id?: string;
  summary?: string;
  reply?: string;
  error?: string;
  problems?: string[];
  rolled_back?: boolean;
  files?: AgentEditFile[];
  prompts?: PromptPublish[];
  trace?: TraceStep[];
  duration_ms?: number;
}

export interface AgentUndoResult {
  status: 'success';
  project: string;
  target: string;
  app_name: string;
  undone: string;
  request: string;
  files: AgentEditFile[];
  prompts: PromptPublish[];
}

/** GET /directory/edits/<project>: recorded edits plus whether one is running right now. */
export interface AgentEditHistory {
  project: string;
  edits: { id: string; target?: string; request: string; summary: string; created_at: string; files: string[] }[];
  editing: boolean;
  last_attempt: {
    request: string;
    status: AgentEditResult['status'];
    edit_id?: string | null;
    summary: string;
    error?: string | null;
    problems: string[];
    finished_at: string;
  } | null;
}

/** What an edit message in the sandbox shows. */
export interface SandboxEditView {
  outcome: 'success' | 'no_change' | 'error' | 'undone';
  editId?: string;
  summary: string;
  files: AgentEditFile[];
  problems?: string[];
  prompts?: PromptPublish[];
  /** Set on a success once it has been undone. */
  undone?: boolean;
  /** Recovered from the server after a page refresh. */
  recovered?: boolean;
}

export interface SandboxChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  /** 'edit-request': the user's change request; 'edit': its outcome; 'notice': session / re-run markers. */
  kind?: 'edit-request' | 'edit' | 'notice';
  edit?: SandboxEditView;
  /** A test message re-sent automatically to the updated agent. */
  rerun?: boolean;
  /** Files the user attached (names and types only). */
  attachments?: ChatAttachment[];
  /** The reply was recovered from the server session after a page refresh. */
  recovered?: boolean;
  toolCalls?: {
    toolName: string;
    params: Record<string, any>;
    result?: any;
    durationMs?: number;
  }[];
  guardrailTriggered?: {
    rule: string;
    reason: string;
    action: 'blocked' | 'sanitized' | 'warned';
  };
  cardPayload?: any;
}

export interface CreatedAgent {
  name: string;
  appName: string;
  path: string;
  files: string[];
  promptPreview: string;
  hasAgentPy: boolean;
  lastModified: string;
}

export interface EnvConfig {
  hasKey: boolean;
  apiKey: string;
  apiBase?: string;
  model?: string;
  envExists: boolean;
}

export interface AgentEnvConfig {
  agentName: string;
  hasKey: boolean;
  apiKey: string;
  apiBase?: string;
  model?: string;
  agentEnvExists: boolean;
  envPath: string;
}

// Streaming Types
export interface StreamingChunk {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'file_write' | 'agent_switch' | 'complete';
  content?: string;
  agent?: string;
  tool?: string;
  filePath?: string;
  fileContent?: string;
  timestamp?: number;
}

export interface FileWriteEvent {
  path: string;
  content: string;
  status: 'writing' | 'complete';
  linesWritten: number;
  totalLines: number;
}

export interface AgentEvent {
  agent: string;
  action: string;
  status: 'started' | 'thinking' | 'executing' | 'complete';
  timestamp: number;
}

/** A model the Builder can run on (GET /studio/settings). */
export interface BuilderModelOption {
  id: string;
  provider: 'anthropic' | 'google';
  label: string;
  tag: string;
  description: string;
}

/** The Builder's model and which provider keys are configured (keys are only ever shown masked). */
export interface StudioSettings {
  model: string;
  provider: 'anthropic' | 'google';
  catalogue: BuilderModelOption[];
  has_anthropic_key: boolean;
  anthropic_key_hint: string;
  has_google_key: boolean;
  google_key_hint: string;
  /** First characters of the key the running Builder actually sends (read from its live client). */
  active_key_hint?: string;
  active_key_provider?: 'anthropic' | 'google';
  /** Keys are server-wide: only admins may change them. Any user may pick their own model. */
  can_edit_keys?: boolean;
  default_model?: string;
}
