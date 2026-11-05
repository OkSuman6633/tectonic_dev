import type { 
  ExtractedAgentSpec, 
  DecisionGroup, 
  DecisionQuestion, 
  DecisionOption,
  ArchitectureSpec,
  BuilderJourney,
  DirectoryAgent,
  TraceStep,
  CreatedAgent,
  EnvConfig,
  AgentEditResult,
  AgentUndoResult,
  AgentEditHistory,
  StudioSettings,
  ChatAttachment,
  DesignIdeas,
  DesignReview,
  AutopilotRun
} from '../types/agent';

/** The ADK session a request was sent to no longer exists (server data reset, stale id): open a new one. */
export class SessionMissingError extends Error {
  constructor(message = 'Session not found') {
    super(message);
    this.name = 'SessionMissingError';
  }
}

/** An ADK session as GET /apps/<app>/users/<user>/sessions/<id> returns it. */
export interface AdkSession {
  id: string;
  state?: Record<string, any>;
  events?: any[];
  lastUpdateTime?: number;
}

export type SessionLookup = { status: 'ok'; session: AdkSession } | { status: 'missing' } | { status: 'offline' };

/** A turn sent before a page refresh, found again in the server session. */
export interface TurnLookup {
  status: 'done' | 'running' | 'absent';
  events: any[];
  /** Seconds since the turn's latest event was recorded. */
  idleSeconds?: number;
}

export interface ChatResponse {
  reply: string;
  decisionGroup?: DecisionGroup;
  extractedSpec?: Partial<ExtractedAgentSpec>;
  isComplete?: boolean;
  journey?: BuilderJourney;
  architectureSpec?: ArchitectureSpec;
  trace?: TraceStep[];
  /** Set when the Builder handed the message to an existing agent (ask_agent). */
  routedTo?: string;
  routedAgent?: string;
  /** Set when the Builder changed (or undid a change to) a generated agent with edit_agent. */
  edited?: { project: string; target: string };
  designIdeas?: DesignIdeas;
  designReview?: DesignReview;
  codeReview?: DesignReview;
  autopilot?: AutopilotRun;
}

const asStrings = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

/** design_ideas from the Builder's state, or undefined when absent / malformed. */
export const toDesignIdeas = (raw: any): DesignIdeas | undefined => {
  if (!raw || !Array.isArray(raw.ideas) || raw.ideas.length === 0) return undefined;
  const impact = (v: any) => (v === 'high' || v === 'low' ? v : 'medium') as DesignIdeas['ideas'][number]['impact'];
  return {
    summary: String(raw.summary ?? ''),
    ideas: raw.ideas.map((i: any) => ({
      title: String(i?.title ?? 'Idea'), description: String(i?.description ?? ''), impact: impact(i?.impact), area: String(i?.area ?? ''),
    })),
  };
};

/** design_review / code_review from the Builder's state. */
export const toReview = (raw: any): DesignReview | undefined => {
  if (!raw || typeof raw !== 'object' || raw.score === undefined) return undefined;
  const severity = (v: any) => (v === 'blocker' || v === 'minor' ? v : 'major') as DesignReview['issues'][number]['severity'];
  return {
    stage: raw.stage === 'code' ? 'code' : 'design',
    score: Math.max(0, Math.min(10, Number(raw.score) || 0)),
    verdict: raw.verdict === 'revise' ? 'revise' : 'approve',
    summary: String(raw.summary ?? ''),
    strengths: asStrings(raw.strengths),
    issues: (Array.isArray(raw.issues) ? raw.issues : []).map((i: any) => ({
      severity: severity(i?.severity), area: String(i?.area ?? ''), problem: String(i?.problem ?? ''), fix: String(i?.fix ?? ''),
    })),
    acceptedIdeas: asStrings(raw.accepted_ideas ?? raw.acceptedIdeas),
  };
};

export const toAutopilot = (raw: any): AutopilotRun | undefined =>
  raw && raw.project ? {
    question: String(raw.question ?? ''), project: String(raw.project), answered: !!raw.answered, agent: String(raw.agent ?? raw.project),
  } : undefined;

export interface AgentChatResult {
  target: string;
  agent: string;
  kind: DirectoryAgent['kind'];
  project: string | null;
  reply: string;
  trace: TraceStep[];
  duration_ms: number;
}

export interface AgentDeleteResult {
  kind: 'project' | 'sub_agent';
  project: string;
  deleted: string[];
  agents: string[];
  detached_from?: string[];
}

/** A user message for ADK /run: the text, then each attachment as inline data (base64). */
const userParts = (text: string, attachments: ChatAttachment[] = []) => [
  { text },
  ...attachments.filter((a) => a.data).map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data, displayName: a.name } })),
];

const compactJson = (value: unknown, limit = 160): string => {
  const text = (typeof value === 'string' ? value : JSON.stringify(value)) ?? '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

export interface ConfirmPayload {
  decisions: Record<string, string>;
  customValues: Record<string, string>;
  extraNotes?: string;
  spec: ExtractedAgentSpec;
}

export interface RuntimeChatResponse {
  reply: string;
  toolCalls?: {
    toolName: string;
    params: Record<string, any>;
    result: any;
    durationMs: number;
  }[];
  guardrailTriggered?: {
    rule: string;
    reason: string;
    action: 'blocked' | 'sanitized' | 'warned';
  };
  cardPayload?: any;
}

// Fallback Spec for demo
export const DEFAULT_MOCK_SPEC: ExtractedAgentSpec = {
  goal: 'An intelligent AI assistant built with Google ADK powered by Google Gemini (gemini-3.6-flash).',
  tools: [
    {
      name: 'core_process',
      description: 'Execute core domain workflow and validation.',
      parameters: { query: 'string' },
      returns: 'Execution status and response payload',
      color: '#38bdf8'
    }
  ],
  guardrails: [
    {
      id: 'g-pii',
      name: 'Deterministic PII/Sensitive Sanitization',
      description: 'Zero-LLM regex inspection for credentials, tokens and sensitive info.',
      type: 'input',
      active: true
    },
    {
      id: 'g-safety',
      name: 'Safety & Authorization Gate',
      description: 'Enforces user confirmation before critical state modifications.',
      type: 'safety',
      active: true
    }
  ],
  architecture: 'coordinator',
  storage: 'sqlite',
  dataSource: 'mock_data',
  outputFormat: 'both',
  subAgents: []
};

export const DEFAULT_DECISION_GROUP: DecisionGroup = {
  id: 'decisions-init',
  title: 'Open Decisions & Agent Architecture',
  description: 'The Meta-Agent requires your architectural preferences before generating the executable ADK code.',
  questions: [
    {
      id: 'storage_method',
      title: 'Local Storage Method',
      description: 'Where should persistent records be stored locally?',
      selectedOption: 'sqlite',
      isCustom: false,
      customValue: '',
      options: [
        { id: 'sqlite', label: 'SQLite DB (Relational & ACID Compliant)', isRecommended: true },
        { id: 'json_files', label: 'JSON Files (Lightweight Flat Storage)' }
      ]
    },
    {
      id: 'agent_structure',
      title: 'Agent Architecture',
      description: 'Coordinator vs Modular Multi-Agent sub-delegation hierarchy',
      selectedOption: 'coordinator',
      isCustom: false,
      customValue: '',
      options: [
        { id: 'coordinator', label: 'Single Coordinator Agent (Lean & fast)', isRecommended: true },
        { id: 'sub_agents', label: 'Coordinator + Specialized Sub-Agents' }
      ]
    }
  ]
};

class ApiService {
  private isMockMode: boolean = false;

  constructor() {
    const saved = localStorage.getItem('agent_studio_mock_mode');
    // Default to false: USE REAL BACKEND
    this.isMockMode = saved !== null ? saved === 'true' : false;
  }

  public setMockMode(enabled: boolean) {
    this.isMockMode = enabled;
    localStorage.setItem('agent_studio_mock_mode', String(enabled));
  }

  public getMockMode(): boolean {
    return this.isMockMode;
  }

  // --- Builder model & provider keys (applied live by the backend, saved to .env) ---
  public async getStudioSettings(): Promise<StudioSettings | null> {
    try {
      const res = await fetch('/studio/settings');
      return res.ok ? ((await res.json()) as StudioSettings) : null;
    } catch {
      return null;
    }
  }

  /** Validates the model and keys (a Claude key is checked with Anthropic), saves them and switches the Builder. */
  public async saveStudioSettings(model: string, keys: { anthropicApiKey?: string; googleApiKey?: string }): Promise<StudioSettings> {
    const res = await fetch('/studio/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, anthropic_api_key: keys.anthropicApiKey || null, google_api_key: keys.googleApiKey || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Saving settings failed (${res.status})`);
    return data as StudioSettings;
  }

  // --- Environment & API Key Management (Zero LLM Interaction) ---
  public async getEnvConfig(): Promise<EnvConfig> {
    try {
      const res = await fetch('/api/env');
      if (!res.ok) throw new Error('Failed to read environment config');
      return await res.json();
    } catch {
      return { hasKey: false, apiKey: '', model: 'gemini-3.6-flash', envExists: false };
    }
  }

  public async saveEnvConfig(apiKey: string, model: string = 'gemini-3.6-flash'): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model })
    });
    if (!res.ok) {
      throw new Error('Failed to save .env configuration');
    }
    return await res.json();
  }

  // --- Session Management ---
  public async createSession(appName: string = 'agent_builder', userId: string = 'default_user'): Promise<string> {
    if (this.isMockMode) {
      return `mock-session-${Date.now()}`;
    }
    try {
      const res = await fetch(`/apps/${appName}/users/${userId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        throw new Error(`Session creation failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.id;
    } catch (err) {
      console.warn('Fallback to local session id on error:', err);
      return `session-${Date.now()}`;
    }
  }

  // --- Agent Builder Chat (Real ADK Backend) ---
  public async sendBuilderChat(message: string, sessionId: string, attachments: ChatAttachment[] = [], userId: string = 'default_user'): Promise<ChatResponse> {
    if (this.isMockMode) {
      await new Promise(r => setTimeout(r, 600));
      return {
        reply: `### Blueprint Recap\nIdentified requirement for "${message}". Review the design options below:`,
        decisionGroup: JSON.parse(JSON.stringify(DEFAULT_DECISION_GROUP)),
        extractedSpec: DEFAULT_MOCK_SPEC
      };
    }

    const payload = {
      appName: 'agent_builder',
      userId,
      sessionId,
      newMessage: {
        role: 'user',
        parts: userParts(message, attachments)
      }
    };

    const res = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 404 && errText.includes('Session not found')) throw new SessionMissingError();
      throw new Error(`ADK Backend error ${res.status}: ${errText}`);
    }

    const events: any[] = await res.json();
    return this.parseBuilderEvents(events);
  }

  // --- Parse ADK Events from Agent Builder (also turns recovered after a page refresh) ---
  public parseBuilderEvents(events: any[]): ChatResponse {
    let replyText = '';
    let extractedRequirements: any = null;
    let pendingDecisions: any = undefined;
    let journey: BuilderJourney | undefined;
    let architectureSpec: ArchitectureSpec | undefined;
    let designIdeas: DesignIdeas | undefined;
    let designReview: DesignReview | undefined;
    let codeReview: DesignReview | undefined;
    let autopilot: AutopilotRun | undefined;

    // Scan events in reverse or collect relevant parts
    for (const event of events) {
      if (event.content && Array.isArray(event.content.parts)) {
        // Collect model response text (ignore thoughts or debug)
        const visibleParts = event.content.parts
          .filter((p: any) => !p.thought && typeof p.text === 'string')
          .map((p: any) => p.text);
        if (visibleParts.length > 0) {
          replyText = visibleParts.join('\n\n');
        } else {
          // If all were thought, fallback to any text
          const allParts = event.content.parts
            .filter((p: any) => typeof p.text === 'string')
            .map((p: any) => p.text);
          if (allParts.length > 0 && !replyText) {
            replyText = allParts.join('\n\n');
          }
        }
      }

      // Check actions.stateDelta for requirements, tools, guardrails, open_questions
      if (event.actions?.stateDelta) {
        if (event.actions.stateDelta.requirements) {
          extractedRequirements = event.actions.stateDelta.requirements;
        }
        if ('pending_decisions' in event.actions.stateDelta) {
          pendingDecisions = event.actions.stateDelta.pending_decisions;
        }
        if (event.actions.stateDelta.build_phase) {
          journey = this.toJourney(event.actions.stateDelta.build_phase);
        }
        const delta = event.actions.stateDelta;
        designIdeas = toDesignIdeas(delta.design_ideas) ?? designIdeas;
        designReview = toReview(delta.design_review) ?? designReview;
        codeReview = toReview(delta.code_review) ?? codeReview;
        autopilot = toAutopilot(delta.autopilot) ?? autopilot;
        const arch = event.actions.stateDelta.architecture_spec;
        if (arch && arch.markdown) {
          architectureSpec = {
            project: String(arch.project ?? ''), markdown: String(arch.markdown), leadSystemPrompt: String(arch.lead_system_prompt ?? ''),
            config: arch.config ?? {}, enabledModules: Array.isArray(arch.enabled_modules) ? arch.enabled_modules : [],
          };
        }
      }
    }

    if (!replyText) {
      replyText = 'Agent builder processed your request.';
    }

    // Structured decision cards from the Builder win; legacy markdown parsing is only a fallback.
    const structured = this.structuredDecisionGroup(pendingDecisions);
    if (structured) {
      replyText = replyText.replace(/<!--decisions-->[\s\S]*?<!--\/decisions-->/g, '').trim();
    } else {
      replyText = replyText.replace(/<!--\/?decisions-->/g, '').trim();
    }
    // The compiled specification renders as its own card, so drop the copy pasted into the reply.
    replyText = architectureSpec
      ? replyText.replace(/<!--spec-->[\s\S]*?<!--\/spec-->/g, '').trim()
      : replyText.replace(/<!--\/?spec-->/g, '').trim();
    const decisionGroup = structured ?? (pendingDecisions === undefined ? this.extractDecisionGroup(extractedRequirements, replyText) : undefined);

    // Build ExtractedAgentSpec for 3D visualizer
    const extractedSpec: Partial<ExtractedAgentSpec> = {};
    if (extractedRequirements) {
      if (extractedRequirements.goal) {
        extractedSpec.goal = extractedRequirements.goal;
      }
      if (Array.isArray(extractedRequirements.tools)) {
        extractedSpec.tools = extractedRequirements.tools.map((t: any, idx: number) => ({
          name: typeof t === 'string' ? t : t.name || `tool_${idx + 1}`,
          description: t.description || 'Custom Agent Tool',
          parameters: t.parameters || {},
          returns: t.returns || 'result',
          color: ['#38bdf8', '#818cf8', '#a855f7', '#10b981', '#f59e0b'][idx % 5]
        }));
      }
      if (Array.isArray(extractedRequirements.guardrails)) {
        extractedSpec.guardrails = extractedRequirements.guardrails.map((g: any, idx: number) => ({
          id: `g-${idx}`,
          name: typeof g === 'string' ? g : g.name || 'Safety Rule',
          description: typeof g === 'string' ? g : g.description || 'Enforced Guardrail',
          type: 'safety',
          active: true
        }));
      }
    }

    return {
      reply: replyText,
      decisionGroup,
      extractedSpec: Object.keys(extractedSpec).length > 0 ? extractedSpec : undefined,
      isComplete: extractedRequirements?.is_complete || false,
      journey,
      architectureSpec,
      designIdeas,
      designReview,
      codeReview,
      // Only the turn that built the agent and got its answer shows the autopilot card.
      autopilot: autopilot?.answered ? autopilot : undefined,
      ...this.extractTrace(events),
    };
  }

  /** Who ran in this Builder turn: agent hand-offs, tool / specialist calls, and (via ask_agent) the
   *  agents the Builder reached on the user's behalf, with their own nested steps. */
  private extractTrace(events: any[]): Pick<ChatResponse, 'routedTo' | 'routedAgent' | 'edited'> & { trace: TraceStep[] } {
    const trace: TraceStep[] = [];
    const byCallId = new Map<string, TraceStep>();
    let lastAuthor = '';
    let routedTo: string | undefined;
    let routedAgent: string | undefined;
    let edited: ChatResponse['edited'];
    for (const event of events) {
      const author: string = event.author || '';
      if (author && author !== 'user' && author !== lastAuthor) {
        trace.push({ type: 'agent', agent: author });
        lastAuthor = author;
      }
      for (const part of event.content?.parts ?? []) {
        if (part.functionCall) {
          const fc = part.functionCall;
          const step: TraceStep = { type: 'tool', agent: author, name: fc.name, args: compactJson(fc.args ?? {}) };
          trace.push(step);
          if (fc.id) byCallId.set(fc.id, step);
        }
        if (part.functionResponse) {
          const fr = part.functionResponse;
          const resp = fr.response ?? {};
          const step = fr.id ? byCallId.get(fr.id) : undefined;
          if (step) step.status = typeof resp.status === 'string' ? resp.status : 'done';
          if (fr.name === 'ask_agent' && Array.isArray(resp.trace)) {
            routedTo = resp.target;
            routedAgent = resp.agent;
            for (const inner of resp.trace) trace.push({ ...inner, nested: true });
          }
          if ((fr.name === 'edit_agent' || fr.name === 'undo_agent_edit') && resp.status === 'success' && resp.project) {
            edited = { project: String(resp.project), target: String(resp.target ?? resp.project) };
          }
        }
      }
    }
    return { trace, routedTo, routedAgent, edited };
  }

  // --- Agent directory: every agent reachable from the Builder chat ---
  public async fetchDirectory(): Promise<DirectoryAgent[]> {
    try {
      const res = await fetch('/directory/agents');
      if (!res.ok) return [];
      return (await res.json()).agents ?? [];
    } catch {
      return [];
    }
  }

  /** Talk to one agent directly (a generated project, its sub-agent, or a Builder specialist). */
  public async chatWithAgent(target: string, message: string, sessionKey: string, attachments: ChatAttachment[] = []): Promise<AgentChatResult> {
    const res = await fetch('/directory/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target, message, session_key: sessionKey,
        attachments: attachments.filter((a) => a.data).map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Agent call failed (${res.status})`);
    return data as AgentChatResult;
  }

  // --- Sessions after a page refresh ---
  /** Look up an ADK session: 'missing' when the server no longer has it, 'offline' when it cannot be reached. */
  public async getSession(appName: string, sessionId: string, userId: string = 'default_user'): Promise<SessionLookup> {
    if (this.isMockMode) return { status: 'offline' };
    try {
      const res = await fetch(`/apps/${encodeURIComponent(appName)}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`);
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) return { status: 'offline' };
      return { status: 'ok', session: await res.json() };
    } catch {
      return { status: 'offline' };
    }
  }

  /** Find the turn that started with `text` (sent at `sentAt`, ms) in a session, and whether it has finished. */
  public findTurn(session: AdkSession, text: string, sentAt: number): TurnLookup {
    const events = session.events ?? [];
    // The message's own text: attachments (inline data, or text the server extracted from documents) follow it.
    const textOf = (e: any) => String((e?.content?.parts ?? []).find((p: any) => typeof p.text === 'string')?.text ?? '').trim();
    const since = sentAt / 1000 - 30; // same machine, but allow for clock skew and slow request starts
    let start = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].author === 'user' && (events[i].timestamp ?? 0) >= since && textOf(events[i]) === text.trim()) {
        start = i;
        break;
      }
    }
    if (start < 0) return { status: 'absent', events: [] };
    const invocation = events[start].invocationId;
    const turn = events.slice(start).filter((e: any) => !invocation || e.invocationId === invocation);
    const last = turn[turn.length - 1];
    const parts: any[] = last?.content?.parts ?? [];
    const final = turn.length > 1 && last.author !== 'user'
      && parts.some((p) => typeof p.text === 'string' && p.text.trim() && !p.thought)
      && !parts.some((p) => p.functionCall || p.functionResponse);
    const idleSeconds = typeof last?.timestamp === 'number' ? Date.now() / 1000 - last.timestamp : undefined;
    return { status: final ? 'done' : 'running', events: turn, idleSeconds };
  }

  // --- Conversational agent editing ---
  public async editAgent(target: string, request: string, sessionKey: string): Promise<AgentEditResult> {
    const res = await fetch('/directory/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, request, session_key: sessionKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Edit failed (${res.status})`);
    return data as AgentEditResult;
  }

  public async undoAgentEdit(target: string): Promise<AgentUndoResult> {
    const res = await fetch('/directory/edit/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Undo failed (${res.status})`);
    return data as AgentUndoResult;
  }

  /** Edit history of a project; null when the backend cannot be reached. */
  public async listAgentEdits(project: string): Promise<AgentEditHistory | null> {
    try {
      const res = await fetch(`/directory/edits/${encodeURIComponent(project)}`);
      if (!res.ok) return null;
      return (await res.json()) as AgentEditHistory;
    } catch {
      return null;
    }
  }

  public async deleteDirectoryAgent(id: string): Promise<AgentDeleteResult> {
    const res = await fetch(`/directory/agents/${id.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Delete failed (${res.status})`);
    return data as AgentDeleteResult;
  }

  /** Interview progress and open decision cards from the Builder session's state (after a refresh). */
  public journeyFromState(raw: any): BuilderJourney | undefined {
    return raw ? this.toJourney(raw) : undefined;
  }

  public decisionGroupFromState(pending: any): DecisionGroup | undefined {
    return this.structuredDecisionGroup(pending);
  }

  private toJourney(raw: any): BuilderJourney {
    return {
      stepIndex: Number(raw.step_index ?? 0), total: Number(raw.total ?? 7), completed: raw.completed ?? [],
      approved: !!raw.approved, phase: String(raw.phase ?? ''), planChosen: !!raw.plan_chosen,
      buildStage: typeof raw.build_stage === 'number' ? raw.build_stage : null, steps: raw.steps ?? [],
    };
  }

  /** Map the Builder's pending_decisions state (exact, typed) to a DecisionGroup. */
  private structuredDecisionGroup(pending: any): DecisionGroup | undefined {
    if (!pending || !Array.isArray(pending.questions) || pending.questions.length === 0) return undefined;
    const questions: DecisionQuestion[] = pending.questions.map((q: any) => {
      const options: DecisionOption[] = (q.options ?? []).map((o: any) => ({
        id: String(o.id), label: String(o.label), description: o.description || undefined, isRecommended: !!o.recommended,
      }));
      const rec = options.find((o) => o.isRecommended) ?? options[0];
      // Multi-select checklists start with every recommended option ticked.
      const recommended = options.filter((o) => o.isRecommended).map((o) => o.id);
      return {
        id: String(q.id), title: String(q.title), description: q.why || undefined, why: q.why || undefined,
        category: q.category, multiSelect: !!q.multi_select, allowCustom: q.allow_custom !== false,
        options, selectedOption: rec?.id ?? '',
        selectedOptions: q.multi_select && recommended.length ? recommended : rec ? [rec.id] : [], isCustom: false, customValue: '',
      };
    });
    const step = pending.step;
    return {
      id: String(pending.id ?? `decisions-${Date.now()}`),
      title: String(pending.title ?? 'Design decisions'),
      description: 'Tick your choices (recommended options are pre-selected), or write your own under Other.',
      questions,
      structured: true,
      round: pending.round,
      step: step ? { key: String(step.key), number: Number(step.number), total: Number(step.total), title: String(step.title), phase: String(step.phase) } : undefined,
    };
  }

  // Parse open_questions and questions_for_user into DecisionGroup
  private extractDecisionGroup(requirements: any, replyText: string): DecisionGroup | undefined {
    const rawBlocks: string[] = [];
    const singleLines: string[] = [];

    // Helper to extract options from a multi-line block
    const parseBlockOptions = (blockText: string, qIdx: number): DecisionQuestion | null => {
      const lines = blockText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return null;

      const rawTitle = lines[0]
        .replace(/^#{1,4}\s+/, '')
        .replace(/^\d+[\.\)\s]+/, '')
        .replace(/^[-*•\s]+/, '')
        .replace(/[:?]+$/, '')
        .trim();
      const title = rawTitle || `Preference Question ${qIdx + 1}`;

      const options: DecisionOption[] = [];
      let defaultSelected = '';

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // Match "- [ ] A) ...", "- [x] A) ...", "A) ...", "1) ...", or "* A) ..."
        const match = line.match(/^(?:[-*•]\s*)?(?:\[\s*[xX ]?\s*\]\s*)?(?:\*\*)?([A-Za-z0-9])[\.\)]\s*(.*)$/);
        if (match) {
          const optLetter = match[1].toUpperCase();
          const rest = match[2].replace(/\*\*/g, '').trim();
          if (!rest) continue;

          const isRec = rest.toLowerCase().includes('(recommended)') || rest.toLowerCase().includes('recommended');
          options.push({
            id: optLetter,
            label: `${optLetter}) ${rest}`,
            isRecommended: isRec
          });

          if (isRec && !defaultSelected) {
            defaultSelected = optLetter;
          }
        }
      }

      if (options.length >= 2) {
        if (!defaultSelected) defaultSelected = options[0].id;
        return {
          id: `q_${qIdx}_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}`,
          title,
          options,
          selectedOption: defaultSelected,
          isCustom: false,
          customValue: ''
        };
      }
      return null;
    };

    // Helper to parse single-line questions with 'or' / 'vs' (e.g. 'Local storage method – SQLite DB or JSON files?')
    const parseSingleLineChoice = (line: string, qIdx: number): DecisionQuestion | null => {
      const clean = line.replace(/^[-*•\s]+/, '').replace(/^\d+[\.\)]\s*/, '').trim();
      const sepIdx = clean.search(/[:–—\-]\s+/);
      if (sepIdx !== -1) {
        const title = clean.substring(0, sepIdx).replace(/\*\*/g, '').trim();
        const optPart = clean.substring(sepIdx + 1).replace(/^[:–—\-]\s*/, '').replace(/\?$/, '').trim();

        // Split by ' or ', ', or ', or commas
        const rawOpts = optPart.split(/(?:,\s*or\s+|\s+or\s+|,\s*)/i).map(s => s.trim().replace(/^either\s+/i, '')).filter(Boolean);
        if (rawOpts.length >= 2) {
          const options: DecisionOption[] = rawOpts.map((opt, oIdx) => {
            const letter = String.fromCharCode(65 + oIdx);
            const isRec = oIdx === 0 || opt.toLowerCase().includes('recommended');
            return {
              id: letter,
              label: `${letter}) ${opt}`,
              isRecommended: isRec
            };
          });

          return {
            id: `q_${qIdx}_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}`,
            title,
            options,
            selectedOption: options[0].id,
            isCustom: false,
            customValue: ''
          };
        }
      }
      return null;
    };

    // 1. Gather from requirements.questions_for_user or open_questions
    if (requirements?.questions_for_user && Array.isArray(requirements.questions_for_user) && requirements.questions_for_user.length > 0) {
      requirements.questions_for_user.forEach((item: any) => {
        if (typeof item === 'string') {
          if (item.includes('\n')) rawBlocks.push(item);
          else singleLines.push(item);
        }
      });
    }

    if (requirements?.open_questions && Array.isArray(requirements.open_questions) && requirements.open_questions.length > 0) {
      requirements.open_questions.forEach((item: any) => {
        if (typeof item === 'string') {
          if (item.includes('\n')) rawBlocks.push(item);
          else singleLines.push(item);
        }
      });
    }

    // 2. If nothing from requirements, parse from replyText
    if (rawBlocks.length === 0 && singleLines.length === 0 && replyText) {
      if (replyText.includes('[ ]') || replyText.includes('[x]')) {
        const sections = replyText.split(/(?=(?:#{2,4}\s+|^\d+[\.\)]\s+)[^\n]+)/m);
        for (const sec of sections) {
          if (sec.includes('[ ]') || sec.includes('[x]')) {
            rawBlocks.push(sec.trim());
          }
        }
      }

      // Also check for bulleted questions or Open Decisions sections
      const lines = replyText.split('\n');
      let inDecisionSection = false;
      for (const l of lines) {
        const trimmed = l.trim();
        if (trimmed.match(/open decision|please help us finalize|help us finalize|questions? for you|preferences?:/i)) {
          inDecisionSection = true;
          continue;
        }
        if (inDecisionSection || trimmed.match(/^(?:[-*•]|\d+[\.\)])\s+.*[–—\-:]\s+.*(?:\bor\b|\?)/i)) {
          if (trimmed.match(/^(?:[-*•]|\d+[\.\)])\s+/)) {
            singleLines.push(trimmed);
          } else if (trimmed === '' && singleLines.length > 0) {
            inDecisionSection = false;
          }
        }
      }
    }

    const questions: DecisionQuestion[] = [];
    let qIdx = 0;

    // Process blocks
    for (const block of rawBlocks) {
      const q = parseBlockOptions(block, qIdx++);
      if (q) questions.push(q);
    }

    // Process single lines
    for (const sLine of singleLines) {
      const q = parseSingleLineChoice(sLine, qIdx++);
      if (q) questions.push(q);
    }

    if (questions.length === 0) return undefined;

    return {
      id: `dg-${Date.now()}`,
      title: 'Architectural Preferences & Open Decisions',
      description: 'Select your preferred option for each question below using the checkboxes:',
      questions
    };
  }

  // --- Run Created Agent in Live Sandbox ---
  public async sendRuntimeChat(
    appName: string,
    sessionId: string,
    message: string,
    attachments: ChatAttachment[] = [],
    userId: string = 'default_user'
  ): Promise<RuntimeChatResponse> {
    if (this.isMockMode) {
      await new Promise(r => setTimeout(r, 600));
      return {
        reply: `[Mock Response for ${appName}]: Processed "${message}"`,
        toolCalls: [
          {
            toolName: 'execute_action',
            params: { query: message },
            result: { status: 'success' },
            durationMs: 45
          }
        ]
      };
    }

    const payload = {
      appName,
      userId,
      sessionId,
      newMessage: {
        role: 'user',
        parts: userParts(message, attachments)
      }
    };

    const res = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 404 && errText.includes('Session not found')) throw new SessionMissingError();
      throw new Error(`Agent execution error ${res.status}: ${errText}`);
    }

    return this.parseRuntimeEvents(appName, await res.json());
  }

  /** Reply, tool activity and guardrail hits of one sandbox turn (also turns recovered after a refresh). */
  public parseRuntimeEvents(appName: string, events: any[]): RuntimeChatResponse {
    let reply = '';
    const toolCalls: any[] = [];
    let guardrailTriggered: any = null;

    for (const event of events) {
      // Collect message reply
      if (event.content && Array.isArray(event.content.parts)) {
        const partsText = event.content.parts
          .filter((p: any) => !p.thought && typeof p.text === 'string')
          .map((p: any) => p.text);
        if (partsText.length > 0) {
          reply = partsText.join('\n\n');
        } else {
          const all = event.content.parts
            .filter((p: any) => typeof p.text === 'string')
            .map((p: any) => p.text);
          if (all.length > 0 && !reply) {
            reply = all.join('\n\n');
          }
        }
      }

      // Check for guardrails intervention
      if (event.author === 'guardrails' || (event.nodeInfo?.path && event.nodeInfo.path.includes('guardrails'))) {
        guardrailTriggered = {
          rule: 'Guardrails Filter Active',
          reason: 'Input passed through safety sanitization checks.',
          action: 'sanitized'
        };
      }

      // Check for tool execution events
      if (event.author && event.author !== appName && event.author !== 'user') {
        toolCalls.push({
          toolName: event.author,
          params: event.actions?.stateDelta || {},
          result: event.output || 'Executed',
          durationMs: 40
        });
      }
    }

    if (!reply) {
      reply = `Agent completed execution.`;
    }

    return {
      reply,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      guardrailTriggered
    };
  }

  // --- Confirm decisions and generate agent ---
  public async confirmDecisions(
    sessionId: string,
    payload: ConfirmPayload,
    userId: string = 'default_user'
  ): Promise<{ success: boolean; files: Record<string, string>; message: string }> {
    // Send formatted response to agent_builder to generate the project
    const choicesSummary = Object.entries(payload.decisions)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    const prompt = `Proceed with following finalized choices:\n${choicesSummary}\n${payload.extraNotes ? `Notes: ${payload.extraNotes}\n` : ''}Please build and generate the complete agent files now.`;

    const chatResp = await this.sendBuilderChat(prompt, sessionId, [], userId);

    // Refresh generated agents
    const agents = await this.fetchCreatedAgents();
    const latestAgent = agents[0];
    let files: Record<string, string> = {};
    if (latestAgent) {
      files = await this.fetchAgentFiles(latestAgent.name);
    }

    return {
      success: true,
      message: chatResp.reply || 'Agent generated successfully!',
      files
    };
  }

  // --- System Agents Discovery & Code Updates ---
  public async fetchCreatedAgents(): Promise<CreatedAgent[]> {
    try {
      const res = await fetch('/api/system/agents');
      if (!res.ok) return [];
      const data = await res.json();
      const agents: CreatedAgent[] = data.agents || [];
      // Newest first: callers treat agents[0] as the most recently generated project.
      return agents.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    } catch {
      return [];
    }
  }

  public async fetchAgentFiles(agentName: string): Promise<Record<string, string>> {
    try {
      const res = await fetch(`/api/system/agents/${agentName}/files`);
      if (!res.ok) return {};
      const data = await res.json();
      return data.files || {};
    } catch {
      return {};
    }
  }

  public async saveAgentFile(agentName: string, filePath: string, content: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/system/agents/${agentName}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, content })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update file');
    }
    return await res.json();
  }

  // --- Specific Agent Environment Configuration (Zero-LLM Direct Write) ---
  public async getAgentEnv(agentName: string): Promise<import('../types/agent').AgentEnvConfig> {
    const res = await fetch(`/api/system/agents/${agentName}/env`);
    if (!res.ok) throw new Error(`Failed to fetch env for ${agentName}`);
    return await res.json();
  }

  public async saveAgentEnv(
    agentName: string, 
    apiKey: string, 
    model: string = 'gemini-3.6-flash'
  ): Promise<{ success: boolean; message: string; envPath: string }> {
    const res = await fetch(`/api/system/agents/${agentName}/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to configure .env for ${agentName}`);
    }
    return await res.json();
  }
}

export const api = new ApiService();
