export interface PortalAgent {
  id: string;
  name: string;
  systemName?: string;
  appName: string;
  description: string;
  agentType: string;
  kind: 'project' | 'sub_agent' | 'builder' | 'builder_sub_agent';
  tools: string[];
  files: string[];
  lastModified?: string;
  path?: string;
  status: 'ready' | 'running' | 'error';
  lastError?: string;
  isGenerated?: boolean;
}

export const BUILDER_AGENT: PortalAgent = {
  id: 'agent_builder',
  name: 'Tectonic Architect',
  systemName: 'agent_builder',
  appName: 'agent_builder',
  description: 'Master AI Agent Architect & Creator. Describe any agent you want to create (e.g. Customer Support, Finance, Data Analyst, Automation) and I will design, code, and deploy it for you.',
  agentType: 'Agent Creator',
  kind: 'builder',
  tools: ['create_agent_card', 'scaffold_project', 'write_project_file', 'verify_generated_project'],
  files: [],
  status: 'ready',
  isGenerated: false,
};

export interface ToolCallItem {
  toolName: string;
  params: Record<string, any>;
  result: any;
  durationMs?: number;
  status?: string;
}

export interface TraceStepItem {
  type: string;
  agent?: string;
  name?: string;
  args?: string;
  detail?: string;
  status?: string;
}

export interface GuardrailItem {
  rule: string;
  reason: string;
  action: 'blocked' | 'sanitized' | 'warned';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  durationMs?: number;
  toolCalls?: ToolCallItem[];
  trace?: TraceStepItem[];
  guardrail?: GuardrailItem;
  status?: 'sending' | 'success' | 'error';
  errorMessage?: string;
  reaction?: 'like' | 'dislike';
  imageUri?: string;
}

export interface ChatSession {
  id: string;
  agentId: string;
  title: string;
  lastActive: number;
}

export interface AuthUser {
  id: string;
  username: string;
  admin: boolean;
}
