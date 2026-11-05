import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import type {
  AgentTool,
  ExtractedAgentSpec,
  DecisionGroup,
  BuilderJourney,
  ChatMessage,
  DirectoryAgent,
  SandboxChatMessage,
  SandboxEditView,
  AgentEditResult,
  CreatedAgent,
  EnvConfig,
  AgentEnvConfig,
  StudioSettings,
  FileWriteEvent,
  AgentEvent,
  ChatAttachment
} from '../types/agent';
import { api, DEFAULT_MOCK_SPEC, SessionMissingError, type ChatResponse, type RuntimeChatResponse } from '../services/api';
import { storageScope } from '../services/auth';

export type StudioTab = 'command' | 'visualizer' | 'sandbox' | 'inspector';

/** Requests in flight when the page was refreshed; the next load finds their outcome on the server. */
export interface PendingTurns {
  builder?: { sessionId: string; text: string; userMsgId: string; sentAt: number };
  sandbox?: { appName: string; agentName: string; sessionId: string; text: string; sentAt: number };
  edit?: { project: string; request: string; sentAt: number };
}

interface AgentStudioState {
  // Navigation & UI
  activeTab: StudioTab;
  /** Bumped on every tab request so the workspace reveals the window even if the tab is unchanged. */
  tabNonce: number;
  setActiveTab: (tab: StudioTab) => void;
  mockMode: boolean;
  setMockMode: (val: boolean) => void;
  hudCollapsed: boolean;
  setHudCollapsed: (val: boolean) => void;

  // Google Gemini Global Environment & API Key (Zero LLM)
  envConfig: EnvConfig | null;
  isCheckingEnv: boolean;
  showEnvModal: boolean;
  setShowEnvModal: (val: boolean) => void;
  checkEnvConfig: () => Promise<void>;
  saveEnvConfig: (apiKey: string, model?: string) => Promise<{ success: boolean; message: string }>;

  // The model the Agent Builder runs on (Gemini or Claude) and its provider keys
  studioSettings: StudioSettings | null;
  loadStudioSettings: () => Promise<void>;
  /** Validated and applied by the backend at once (no restart); throws with the reason if refused. */
  saveStudioSettings: (model: string, keys: { anthropicApiKey?: string; googleApiKey?: string }) => Promise<StudioSettings>;

  // Specific Agent .env in Sandbox
  selectedAgentEnv: AgentEnvConfig | null;
  showAgentEnvModal: boolean;
  setShowAgentEnvModal: (val: boolean) => void;
  checkSelectedAgentEnv: (agentName?: string) => Promise<AgentEnvConfig | null>;
  saveSelectedAgentEnv: (agentName: string, apiKey: string, model?: string) => Promise<{ success: boolean; message: string }>;

  // Created Agents List
  createdAgents: CreatedAgent[];
  selectedAgent: CreatedAgent | null;
  /** Name of the agent the user last opened (persisted, so a page refresh reopens it). */
  selectedAgentName: string | null;
  /** `keepSession`: reopen the agent's current sandbox conversation instead of starting a new one. */
  setSelectedAgent: (agent: CreatedAgent | null, opts?: { keepSession?: boolean }) => void;
  /** Re-reads generated_agents/. Returns agents that appeared since the last refresh and selects the newest of them. */
  refreshCreatedAgents: () => Promise<CreatedAgent[]>;

  // Unified chat: every agent (Builder specialists, generated projects and their sub-agents)
  agentDirectory: DirectoryAgent[];
  refreshDirectory: () => Promise<void>;
  /** Directory id the chat sends to; null = the Agent Builder (which also routes on its own). */
  chatTarget: string | null;
  setChatTarget: (id: string | null) => void;
  /** Deletes a generated project or sub-agent: its code, its chat history here, and its Studio presence. */
  deleteDirectoryAgent: (id: string) => Promise<void>;
  agentsLoaded: boolean;

  // Sessions
  builderSessionId: string | null;
  sandboxSessionId: string | null;
  /** The agent the sandbox session belongs to. */
  sandboxAgentName: string | null;
  startNewBuilderSession: () => Promise<void>;
  /** `keepHistory`: keep the sandbox conversation on screen and mark the new session with a `note`. */
  startNewSandboxSession: (agentAppName?: string, opts?: { keepHistory?: boolean; note?: string }) => Promise<string>;

  // Refresh: view and history survive a page reload; "Refresh" re-syncs them with the backend
  /** On page load: reconnect the persisted sessions (or replace ones the server lost) and catch up on interrupted requests. */
  restoreStudio: () => Promise<void>;
  /** Re-sync agents, files, sessions and decision cards with the backend, keeping the conversation. */
  refreshStudio: () => Promise<void>;
  isRefreshing: boolean;
  lastRefreshedAt: number | null;
  restoreBuilderSession: () => Promise<void>;
  restoreSandboxSession: () => Promise<void>;
  pendingTurns: PendingTurns;
  recoverPendingTurns: () => Promise<void>;

  // Selected 3D Node Drawer
  selectedToolNode: AgentTool | null;
  setSelectedToolNode: (tool: AgentTool | null) => void;

  // Architect Chat State (No Dummy replies)
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  /** `display` is what the chat shows (e.g. human-readable choices without the DECISIONS_JSON payload). */
  /** `attachments`: images / documents sent with the message (to the Builder or the targeted agent). */
  sendArchitectMessage: (content: string, display?: string, attachments?: ChatAttachment[]) => Promise<void>;

  // Extracted Spec & Live Architecture Preview
  spec: ExtractedAgentSpec;
  updateSpec: (partial: Partial<ExtractedAgentSpec>) => void;

  // Interactive Decisions Group
  currentDecisionGroup: DecisionGroup | null;
  /** Guided interview / build progress from the Builder's `build_phase` state. */
  builderJourney: BuilderJourney | null;
  updateDecisionOption: (questionId: string, optionId: string) => void;
  toggleCustomDecision: (questionId: string, isCustom: boolean) => void;
  setCustomDecisionValue: (questionId: string, val: string) => void;
  setExtraNotes: (notes: string) => void;
  applyRecommendedDefaults: () => void;
  submitDecisions: () => Promise<void>;

  // Generation & ADK Project Status
  isGeneratingAgent: boolean;
  isAgentReady: boolean;
  generatedFiles: Record<string, string>;

  // Inspector & Updating Files
  currentAgentFiles: Record<string, string>;
  selectedFilePath: string;
  setSelectedFilePath: (p: string) => void;
  loadAgentFiles: (agentName: string) => Promise<void>;
  saveAgentFile: (filePath: string, content: string) => Promise<{ success: boolean; message: string }>;

  // Live Agent Sandbox State
  sandboxMessages: SandboxChatMessage[];
  isSandboxLoading: boolean;
  activeToolTrace: string | null;
  activeGuardrailTrace: string | null;
  /** `rerun`: the message is a test re-sent automatically to the updated agent. */
  sendSandboxMessage: (content: string, opts?: { rerun?: boolean; attachments?: ChatAttachment[] }) => Promise<void>;
  resetSandbox: () => void;
  resetDemoToInitial: () => void;

  // Conversational editing of the selected agent (then re-run on the updated code)
  /** Keys the editor's conversation, so follow-up changes refer to the previous ones. */
  editSessionKey: string;
  isEditingAgent: boolean;
  editSelectedAgent: (request: string) => Promise<void>;
  undoLastAgentEdit: () => Promise<void>;
  /** New sandbox session on the updated code; re-sends the last test message if there is one. */
  rerunSandboxWithUpdatedAgent: (note: string) => Promise<void>;

  // Streaming & File Writing State
  isStreaming: boolean;
  streamingText: string;
  currentAgentPhase: string;
  fileWriteEvents: FileWriteEvent[];
  agentEvents: AgentEvent[];
  pendingFiles: { path: string; content: string }[];
  setStreamingState: (isStreaming: boolean, text?: string) => void;
  setCurrentAgentPhase: (phase: string) => void;
  addFileWriteEvent: (event: FileWriteEvent) => void;
  addAgentEvent: (event: AgentEvent) => void;
  setPendingFiles: (files: { path: string; content: string }[]) => void;
  clearStreamingState: () => void;
}

// --- persistence -------------------------------------------------------------------------------
const PERSISTED_KEYS = [
  'builderSessionId', 'chatMessages', 'currentDecisionGroup', 'builderJourney', 'spec', 'chatTarget', 'hudCollapsed',
  'selectedAgentName', 'sandboxSessionId', 'sandboxAgentName', 'sandboxMessages', 'editSessionKey', 'pendingTurns',
] as const;
type PersistedStudio = Pick<AgentStudioState, (typeof PERSISTED_KEYS)[number]>;

const MAX_PERSISTED_MESSAGES = 200;
const pendingWrites = new Map<string, StorageValue<PersistedStudio>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const writeNow = (name: string, value: StorageValue<PersistedStudio>) => {
  // Too big for the quota: keep the most recent messages rather than silently keeping a stale copy.
  for (const keep of [MAX_PERSISTED_MESSAGES, 40, 10]) {
    const state = { ...value.state, chatMessages: value.state.chatMessages.slice(-keep), sandboxMessages: value.state.sandboxMessages.slice(-keep) };
    try {
      localStorage.setItem(name, JSON.stringify({ ...value, state }));
      return;
    } catch { /* quota exceeded or storage blocked: retry smaller */ }
  }
  try { localStorage.removeItem(name); } catch { /* storage blocked: history just isn't persisted */ }
};

const flushWrites = () => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  pendingWrites.forEach((value, name) => writeNow(name, value));
  pendingWrites.clear();
};

if (typeof window !== 'undefined') {
  // A refresh right after sending must still persist that message.
  window.addEventListener('pagehide', flushWrites);
  window.addEventListener('beforeunload', flushWrites);
}

/** Each signed-in user keeps their own copy, so accounts sharing a browser never see each other's history. */
const scoped = (name: string) => (storageScope() ? `${name}:${storageScope()}` : name);

/** localStorage, debounced (state changes often while agents stream) and safe when storage is blocked. */
const studioStorage: PersistStorage<PersistedStudio> = {
  getItem: (name) => {
    try {
      const raw = localStorage.getItem(scoped(name));
      return raw ? (JSON.parse(raw) as StorageValue<PersistedStudio>) : null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    pendingWrites.set(scoped(name), value);
    if (!flushTimer) flushTimer = setTimeout(flushWrites, 400);
  },
  removeItem: (name) => {
    pendingWrites.delete(scoped(name));
    try { localStorage.removeItem(scoped(name)); } catch { /* ignore */ }
  },
};

// --- helpers -------------------------------------------------------------------------------------
const PAGE_LOADED_AT = Date.now();
const STALL_SECONDS = 5 * 60; // an unfinished turn with no new server event for this long was interrupted
const RECOVERY_POLL_MS = 4000;
const RECOVERY_LIMIT_MS = 30 * 60_000;

const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clip = (text: string, n = 90) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** Cards the Builder no longer waits for can't be answered any more: show them as submitted. */
const lockStaleCards = (messages: ChatMessage[], activeId: string | null): ChatMessage[] =>
  messages.map((m) =>
    m.decisionGroup && m.decisionGroup.id !== activeId && !m.decisionGroup.isSubmitted
      ? { ...m, decisionGroup: { ...m.decisionGroup, isSubmitted: true } }
      : m);

const editView = (r: AgentEditResult): SandboxEditView => {
  if (r.status === 'error') {
    return { outcome: 'error', summary: r.error || 'The edit failed.', files: [], problems: r.problems };
  }
  return {
    outcome: r.status, editId: r.edit_id, summary: r.summary || r.reply || (r.status === 'success' ? 'Change applied.' : 'No change was needed.'),
    files: r.files ?? [], prompts: r.prompts,
  };
};

let restoring: Promise<void> | null = null;
let recovering = false;
let sandboxStarting: Promise<string> | null = null;

export const useAgentStudioStore = create<AgentStudioState>()(persist((set, get) => {
  const systemChat = (content: string): ChatMessage => ({ id: newId('msg-system'), sender: 'system', content, timestamp: stamp() });
  const sandboxNotice = (content: string): SandboxChatMessage => ({ id: newId('sb-notice'), sender: 'system', kind: 'notice', content, timestamp: stamp() });

  /** Show a Builder reply (live or recovered after a refresh) and resync what it may have changed. */
  const applyBuilderResponse = async (resp: ChatResponse, userMsgId: string, recovered = false) => {
    const assistantMsg: ChatMessage = {
      id: newId('msg'),
      sender: 'assistant',
      content: resp.reply,
      timestamp: stamp(),
      decisionGroup: resp.decisionGroup,
      architectureSpec: resp.architectureSpec,
      trace: resp.trace,
      agentTarget: resp.routedTo,
      recovered,
      designIdeas: resp.designIdeas,
      designReview: resp.designReview,
      codeReview: resp.codeReview,
      autopilot: resp.autopilot,
    };
    set((state) => ({
      // A question routed to an existing agent belongs to that agent (deleted together with it).
      chatMessages: [
        ...state.chatMessages.map((m) => (m.id === userMsgId && resp.routedTo ? { ...m, agentTarget: resp.routedTo } : m)),
        assistantMsg,
      ],
      isChatLoading: false,
      isStreaming: false,
      currentDecisionGroup: resp.decisionGroup || state.currentDecisionGroup,
      builderJourney: resp.journey ?? state.builderJourney,
      spec: resp.extractedSpec ? { ...state.spec, ...resp.extractedSpec } : state.spec
    }));

    // The Builder can generate, change or delete a project from any chat turn, so resync after every reply.
    const [added] = await Promise.all([get().refreshCreatedAgents(), get().refreshDirectory()]);
    if (added.length > 0) {
      const names = added.map((a) => `**${a.name}**`).join(', ');
      set((state) => ({
        isAgentReady: true,
        chatMessages: [...state.chatMessages, {
          id: newId('msg-agent-ready'),
          sender: 'assistant' as const,
          content: `✅ New agent ${names} is ready: chat with it here as \`@${added[0].name}\`, or in the **Live Sandbox** tab.`,
          timestamp: stamp()
        }]
      }));
    }
    if (resp.edited) await onAgentEdited(resp.edited.project, 'Agent updated from the Builder chat');
  };

  const applySandboxResponse = async (resp: RuntimeChatResponse, recovered = false) => {
    if (resp.toolCalls && resp.toolCalls.length > 0) {
      for (const tc of resp.toolCalls) {
        set({ activeToolTrace: tc.toolName });
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (resp.guardrailTriggered) {
      set({ activeGuardrailTrace: resp.guardrailTriggered.rule });
    }
    const agentMsg: SandboxChatMessage = {
      id: newId('sb-agent'),
      sender: 'agent',
      content: resp.reply,
      timestamp: stamp(),
      toolCalls: resp.toolCalls,
      guardrailTriggered: resp.guardrailTriggered,
      cardPayload: resp.cardPayload,
      recovered,
    };
    set((state) => ({ sandboxMessages: [...state.sandboxMessages, agentMsg], isSandboxLoading: false }));
    setTimeout(() => {
      set({ activeToolTrace: null, activeGuardrailTrace: null });
    }, 3500);
  };

  /** Edit outcomes go to the sandbox of that agent; if the sandbox shows another agent, to the chat. */
  const appendEditOutcome = (project: string, view: SandboxEditView) => {
    if (get().sandboxAgentName === project) {
      const msg: SandboxChatMessage = {
        id: newId('sb-edit'), sender: 'system', kind: 'edit', edit: view, timestamp: stamp(),
        content: view.outcome === 'error' ? `⚠️ ${view.summary}` : view.summary,
      };
      set((state) => ({ sandboxMessages: [...state.sandboxMessages, msg] }));
    } else {
      const icon = view.outcome === 'error' ? '⚠️' : view.outcome === 'undone' ? '↩️' : '✏️';
      set((state) => ({ chatMessages: [...state.chatMessages, systemChat(`${icon} **${project}**: ${clip(view.summary, 200)}`)] }));
    }
  };

  /** After a change to a project's code: reload its files and, if the sandbox shows it, re-run it. */
  const onAgentEdited = async (project: string, note: string) => {
    await Promise.all([get().refreshCreatedAgents(), get().refreshDirectory()]);
    if (get().selectedAgent?.name !== project) return;
    await get().loadAgentFiles(project);
    void get().rerunSandboxWithUpdatedAgent(note);
  };

  // --- recovery of requests interrupted by a page refresh --------------------------------------
  const recoverBuilderTurn = async (t: NonNullable<PendingTurns['builder']>) => {
    const clear = () => set((state) => ({ pendingTurns: { ...state.pendingTurns, builder: undefined }, isChatLoading: false, isStreaming: false }));
    if (t.sessionId !== get().builderSessionId) return clear(); // a new Builder session was started since
    set({ isChatLoading: true, isStreaming: true });
    const found = await api.getSession('agent_builder', t.sessionId);
    if (found.status === 'offline') return; // try again on the next poll
    if (found.status === 'missing') return clear(); // restoreBuilderSession already explained it
    const turn = api.findTurn(found.session, t.text, t.sentAt);
    if (turn.status === 'done') {
      clear();
      await applyBuilderResponse(api.parseBuilderEvents(turn.events), t.userMsgId, true);
      return;
    }
    const interrupted = turn.status === 'running' ? (turn.idleSeconds ?? 0) > STALL_SECONDS : Date.now() - t.sentAt > 60_000;
    if (!interrupted) return;
    clear();
    set((state) => {
      // A card answer that never reached the Builder must be answerable again.
      const reopen = state.currentDecisionGroup?.isSubmitted ? state.currentDecisionGroup.id : null;
      return {
        currentDecisionGroup: reopen ? { ...state.currentDecisionGroup!, isSubmitted: false } : state.currentDecisionGroup,
        chatMessages: [
          ...state.chatMessages.map((m) => (reopen && m.decisionGroup?.id === reopen ? { ...m, decisionGroup: { ...m.decisionGroup, isSubmitted: false } } : m)),
          systemChat('⚠️ Your last message did not finish: the page was refreshed while the Builder was working and the run stopped. Send it again (or say “continue”).'),
        ],
      };
    });
  };

  const recoverSandboxTurn = async (t: NonNullable<PendingTurns['sandbox']>) => {
    const clear = () => set((state) => ({ pendingTurns: { ...state.pendingTurns, sandbox: undefined }, isSandboxLoading: false }));
    if (t.sessionId !== get().sandboxSessionId) return clear();
    set({ isSandboxLoading: true });
    const found = await api.getSession(t.appName, t.sessionId);
    if (found.status === 'offline') return;
    if (found.status === 'missing') return clear();
    const turn = api.findTurn(found.session, t.text, t.sentAt);
    if (turn.status === 'done') {
      clear();
      set({ isSandboxLoading: true });
      await applySandboxResponse(api.parseRuntimeEvents(t.appName, turn.events), true);
      return;
    }
    const interrupted = turn.status === 'running' ? (turn.idleSeconds ?? 0) > STALL_SECONDS : Date.now() - t.sentAt > 60_000;
    if (!interrupted) return;
    clear();
    set((state) => ({ sandboxMessages: [...state.sandboxMessages, sandboxNotice('⚠️ The last test run was interrupted by the page refresh. Send it again to retry.')] }));
  };

  const recoverEdit = async (t: NonNullable<PendingTurns['edit']>) => {
    const clear = () => set((state) => ({ pendingTurns: { ...state.pendingTurns, edit: undefined }, isEditingAgent: false }));
    if (get().agentsLoaded && !get().createdAgents.some((a) => a.name === t.project)) return clear(); // project deleted
    set({ isEditingAgent: true });
    const history = await api.listAgentEdits(t.project);
    if (!history) return;
    const request = t.request.trim();
    const after = (iso?: string | null) => !!iso && Date.parse(iso) >= t.sentAt - 30_000;
    const attempt = history.last_attempt;
    const recorded = history.edits.find((e) => e.request === request && after(e.created_at));
    let view: SandboxEditView | null = null;
    if (attempt && attempt.request === request && after(attempt.finished_at)) {
      const files = history.edits.find((e) => e.id === attempt.edit_id)?.files ?? [];
      view = {
        outcome: attempt.status, editId: attempt.edit_id ?? undefined, recovered: true, problems: attempt.problems,
        summary: (attempt.status === 'error' ? attempt.error : attempt.summary) || (attempt.status === 'success' ? 'Change applied.' : 'No change was made.'),
        files: files.map((path) => ({ path, status: 'modified' as const, added: 0, removed: 0 })),
      };
    } else if (history.editing) {
      return; // still running on the server: poll again
    } else if (recorded) {
      // The server restarted after finishing it (the last attempt is kept in memory, the edit on disk).
      view = { outcome: 'success', editId: recorded.id, recovered: true, summary: recorded.summary || 'Change applied.',
               files: recorded.files.map((path) => ({ path, status: 'modified' as const, added: 0, removed: 0 })) };
    }
    clear();
    if (!view) {
      appendEditOutcome(t.project, { outcome: 'error', summary: 'The edit was interrupted by the page refresh (or a server restart) and nothing was changed. Send it again.', files: [] });
      return;
    }
    appendEditOutcome(t.project, view);
    if (view.outcome === 'success') await onAgentEdited(t.project, 'Agent updated');
  };

  return {
  activeTab: 'command',
  tabNonce: 0,
  setActiveTab: (tab) => set({ activeTab: tab, tabNonce: Date.now() }),
  mockMode: false,
  setMockMode: (val) => {
    api.setMockMode(val);
    set({ mockMode: val });
  },
  hudCollapsed: false,
  setHudCollapsed: (val) => set({ hudCollapsed: val }),

  // Global Google Gemini Environment State
  envConfig: null,
  isCheckingEnv: false,
  showEnvModal: false,
  setShowEnvModal: (val) => set({ showEnvModal: val }),

  checkEnvConfig: async () => {
    set({ isCheckingEnv: true });
    try {
      const cfg = await api.getEnvConfig();
      set({ envConfig: cfg, isCheckingEnv: false });
    } catch {
      set({ isCheckingEnv: false });
    }
  },

  saveEnvConfig: async (apiKey: string, model: string = 'gemini-3.6-flash') => {
    const res = await api.saveEnvConfig(apiKey, model);
    const updated = await api.getEnvConfig();
    set({ envConfig: updated, showEnvModal: false });
    return res;
  },

  studioSettings: null,
  loadStudioSettings: async () => {
    const settings = await api.getStudioSettings();
    if (settings) set({ studioSettings: settings });
  },
  saveStudioSettings: async (model, keys) => {
    const settings = await api.saveStudioSettings(model, keys);
    set({ studioSettings: settings });
    await get().checkEnvConfig(); // the sandbox reads the Google key from the same .env
    return settings;
  },

  // Agent Specific Environment in Sandbox
  selectedAgentEnv: null,
  showAgentEnvModal: false,
  setShowAgentEnvModal: (val) => set({ showAgentEnvModal: val }),

  checkSelectedAgentEnv: async (agentName?: string) => {
    const target = agentName || get().selectedAgent?.name;
    if (!target) return null;
    try {
      const cfg = await api.getAgentEnv(target);
      set({ selectedAgentEnv: cfg });
      return cfg;
    } catch (err) {
      console.warn('Failed to get agent env:', err);
      return null;
    }
  },

  saveSelectedAgentEnv: async (agentName: string, apiKey: string, model: string = 'gemini-3.6-flash') => {
    const res = await api.saveAgentEnv(agentName, apiKey, model);
    const updated = await api.getAgentEnv(agentName);
    set({ selectedAgentEnv: updated, showAgentEnvModal: false });
    return res;
  },

  // Created Agents State
  createdAgents: [],
  selectedAgent: null,
  selectedAgentName: null,
  setSelectedAgent: (agent, opts) => {
    set({ selectedAgent: agent, ...(agent ? { selectedAgentName: agent.name } : {}) });
    if (agent) {
      const { sandboxAgentName, sandboxSessionId } = get();
      if (!(opts?.keepSession && sandboxAgentName === agent.name && sandboxSessionId)) {
        get().startNewSandboxSession(agent.appName);
      }
      get().loadAgentFiles(agent.name);
      get().checkSelectedAgentEnv(agent.name);
    }
  },

  agentsLoaded: false,

  refreshCreatedAgents: async () => {
    const { createdAgents: previous, agentsLoaded } = get();
    const agents = await api.fetchCreatedAgents(); // newest first
    const known = new Set(previous.map((a) => a.name));
    const added = agentsLoaded ? agents.filter((a) => !known.has(a.name)) : [];
    // Keep the selection object current (its file list changes after edits); drop it if the project is gone.
    const current = get().selectedAgent;
    const fresh = current ? agents.find((a) => a.name === current.name) ?? null : null;
    set({ createdAgents: agents, agentsLoaded: true, selectedAgent: fresh });
    if (added.length > 0) {
      // A project was just generated: point the sandbox, inspector and env checks at it.
      get().setSelectedAgent(added[0]);
    } else if (!fresh && agents.length > 0) {
      // After a page refresh: reopen the agent (and its sandbox conversation) the user had open.
      const remembered = agents.find((a) => a.name === get().selectedAgentName);
      if (remembered) get().setSelectedAgent(remembered, { keepSession: true });
      else get().setSelectedAgent(agents[0]);
    }
    return added;
  },

  agentDirectory: [],
  refreshDirectory: async () => {
    const agents = await api.fetchDirectory();
    if (agents.length === 0) return; // backend unreachable: keep what we have
    const target = get().chatTarget;
    set({ agentDirectory: agents, chatTarget: target && agents.some((a) => a.id === target) ? target : null });
  },
  chatTarget: null,
  setChatTarget: (id) => set({ chatTarget: id && id !== 'agent_builder' ? id : null }),

  deleteDirectoryAgent: async (id: string) => {
    const result = await api.deleteDirectoryAgent(id);
    const gone = new Set(result.deleted);
    set((state) => ({
      // Its conversation in this chat goes with it.
      chatMessages: [
        ...state.chatMessages.filter((m) => !(m.agentTarget && gone.has(m.agentTarget))),
        {
          id: newId('msg-deleted'),
          sender: 'system' as const,
          content: result.kind === 'project'
            ? `🗑️ Deleted project **${result.project}** (${result.agents.length} agents) — code, registry and knowledge removed.`
            : `🗑️ Deleted **${result.agents.join(', ')}** from **${result.project}** — code removed and detached from ${(result.detached_from ?? []).join(', ') || 'its parent'}.`,
          timestamp: stamp(),
        },
      ],
      chatTarget: state.chatTarget && gone.has(state.chatTarget) ? null : state.chatTarget,
    }));
    if (result.kind === 'project' && get().selectedAgent?.name === result.project) set({ selectedAgent: null });
    await Promise.all([get().refreshDirectory(), get().refreshCreatedAgents()]);
  },

  // Sessions
  builderSessionId: null,
  sandboxSessionId: null,
  sandboxAgentName: null,

  startNewBuilderSession: async () => {
    set({ isChatLoading: true });
    try {
      const newSid = await api.createSession('agent_builder');
      set((state) => ({
        builderSessionId: newSid,
        chatMessages: [
          {
            id: `msg-welcome-${Date.now()}`,
            sender: 'assistant',
            content: `👋 **Agent Architect Session Initialized!**\n\nI am the Agent Builder. I use sub-agents (**guardrails**, **intent detection**, **requirement understanding**, and **code generator**) to interview you with cross-questions and build your custom Google ADK agent.\n\nTell me: What kind of agent would you like to build? (e.g. *"Create a local attendance manager"* or *"Build an offline flight booking coordinator"*).\n\nTo change an agent you already built, just describe the change (e.g. *"make library_management_system reply in bullet points"*), or use **Edit agent** in the Live Sandbox.`,
            timestamp: stamp()
          }
        ],
        currentDecisionGroup: null,
        builderJourney: null,
        spec: JSON.parse(JSON.stringify(DEFAULT_MOCK_SPEC)),
        pendingTurns: { ...state.pendingTurns, builder: undefined },
        isChatLoading: false,
        isStreaming: false,
      }));
    } catch (err) {
      console.error('Error creating new session:', err);
      set({ isChatLoading: false });
    }
  },

  startNewSandboxSession: async (agentAppName?: string, opts?: { keepHistory?: boolean; note?: string }) => {
    const agent = get().selectedAgent;
    const app = agentAppName || agent?.appName || 'agent_builder';
    const agentName = agent?.name || app;
    const starting = api.createSession(app);
    sandboxStarting = starting;
    const sid = await starting;
    if (sandboxStarting === starting) sandboxStarting = null;
    // The user switched agent while this session was being created: the newer selection wins.
    if (agent && get().selectedAgent?.name !== agent.name) return get().sandboxSessionId ?? sid;
    set((state) => ({
      sandboxSessionId: sid,
      sandboxAgentName: agentName,
      sandboxMessages: opts?.keepHistory
        ? [...state.sandboxMessages, sandboxNotice(`🔄 ${opts.note ?? 'New session'} · session \`${sid.slice(0, 8)}…\``)]
        : [
            {
              id: `sb-welcome-${Date.now()}`,
              sender: 'agent',
              content: `🟢 **Agent Sandbox Online: ${agentName}**\n\nConnected to backend session \`${sid.slice(0, 8)}...\`.\nType a message below to run and test this agent in the local sandbox, or switch to **Edit agent** to change it in plain words.`,
              timestamp: stamp()
            }
          ],
      activeToolTrace: null,
      activeGuardrailTrace: null
    }));
    return sid;
  },

  // --- Refresh -----------------------------------------------------------------------------------
  isRefreshing: false,
  lastRefreshedAt: null,
  pendingTurns: {},

  restoreStudio: () => {
    // React StrictMode runs mount effects twice in development: restore exactly once.
    restoring ??= (async () => {
      await Promise.all([
        (async () => {
          await get().refreshCreatedAgents();
          await get().restoreSandboxSession();
        })(),
        get().restoreBuilderSession(),
        get().refreshDirectory(),
        get().loadStudioSettings(),
      ]);
      void get().recoverPendingTurns();
    })().finally(() => {
      restoring = null;
    });
    return restoring;
  },

  refreshStudio: async () => {
    if (get().isRefreshing) return;
    set({ isRefreshing: true });
    try {
      await Promise.all([
        get().checkEnvConfig(),
        (async () => {
          await get().refreshCreatedAgents();
          await get().restoreSandboxSession();
          const agent = get().selectedAgent;
          if (agent) await Promise.all([get().loadAgentFiles(agent.name), get().checkSelectedAgentEnv(agent.name)]);
        })(),
        get().restoreBuilderSession(),
        get().refreshDirectory(),
        get().loadStudioSettings(),
      ]);
      void get().recoverPendingTurns();
    } finally {
      set({ isRefreshing: false, lastRefreshedAt: Date.now() });
    }
  },

  restoreBuilderSession: async () => {
    if (get().isChatLoading) return; // a reply is on its way and will bring the current state
    const sid = get().builderSessionId;
    if (!sid) {
      await get().startNewBuilderSession();
      return;
    }
    const found = await api.getSession('agent_builder', sid);
    if (found.status === 'offline' || get().builderSessionId !== sid) return; // keep the history until the backend is back
    if (found.status === 'missing') {
      const newSid = await api.createSession('agent_builder');
      set((state) => ({
        builderSessionId: newSid,
        builderJourney: null,
        currentDecisionGroup: null,
        chatMessages: [
          ...lockStaleCards(state.chatMessages, null),
          systemChat('The previous Builder session is no longer on the server, so a new one was started. Your earlier conversation stays here for reference.'),
        ],
        pendingTurns: { ...state.pendingTurns, builder: undefined },
      }));
      return;
    }
    // The session state is authoritative for the interview position and the open decision cards.
    const serverState = found.session.state ?? {};
    const pending = api.decisionGroupFromState(serverState.pending_decisions);
    set((state) => {
      const current = pending
        ? (state.currentDecisionGroup?.id === pending.id ? state.currentDecisionGroup : pending)
        : null;
      return {
        builderJourney: api.journeyFromState(serverState.build_phase) ?? state.builderJourney,
        currentDecisionGroup: current,
        chatMessages: lockStaleCards(state.chatMessages, current?.id ?? null),
      };
    });
  },

  restoreSandboxSession: async () => {
    if (sandboxStarting) await sandboxStarting.catch(() => undefined);
    const { selectedAgent, sandboxSessionId, sandboxAgentName, isSandboxLoading } = get();
    if (!selectedAgent || isSandboxLoading) return;
    if (!sandboxSessionId || sandboxAgentName !== selectedAgent.name) {
      await get().startNewSandboxSession(selectedAgent.appName);
      return;
    }
    const found = await api.getSession(selectedAgent.appName, sandboxSessionId);
    if (found.status === 'missing' && get().sandboxSessionId === sandboxSessionId) {
      await get().startNewSandboxSession(selectedAgent.appName, {
        keepHistory: true, note: 'The previous sandbox session is no longer on the server; continuing in a new one',
      });
    }
  },

  recoverPendingTurns: async () => {
    if (recovering) return;
    recovering = true;
    const started = Date.now();
    try {
      for (;;) {
        // Only requests from before this page load: live requests settle themselves.
        const { builder, sandbox, edit } = get().pendingTurns;
        const work = [
          builder && builder.sentAt < PAGE_LOADED_AT ? recoverBuilderTurn(builder) : null,
          sandbox && sandbox.sentAt < PAGE_LOADED_AT ? recoverSandboxTurn(sandbox) : null,
          edit && edit.sentAt < PAGE_LOADED_AT ? recoverEdit(edit) : null,
        ].filter(Boolean);
        if (work.length === 0) return;
        await Promise.all(work);
        const left = get().pendingTurns;
        if (![left.builder, left.sandbox, left.edit].some((t) => t && t.sentAt < PAGE_LOADED_AT)) return;
        if (Date.now() - started > RECOVERY_LIMIT_MS) {
          set((state) => ({
            pendingTurns: {}, isChatLoading: false, isStreaming: false, isSandboxLoading: false, isEditingAgent: false,
            chatMessages: [...state.chatMessages, systemChat('⚠️ A request from before the page refresh never finished. Send it again if you still need it.')],
          }));
          return;
        }
        await sleep(RECOVERY_POLL_MS);
      }
    } catch (err) {
      console.warn('Recovering interrupted requests failed:', err);
    } finally {
      recovering = false;
    }
  },

  // 3D Node Drawer
  selectedToolNode: null,
  setSelectedToolNode: (tool) => set({ selectedToolNode: tool }),

  // 3D Spec
  spec: JSON.parse(JSON.stringify(DEFAULT_MOCK_SPEC)),
  updateSpec: (partial) => set((state) => ({ spec: { ...state.spec, ...partial } })),

  currentDecisionGroup: null,
  builderJourney: null,

  chatMessages: [
    {
      id: 'msg-welcome-init',
      sender: 'assistant',
      content: `👋 **Google ADK Agent Builder**\n\nReady to build your next AI Agent. What requirements or tools should it have?`,
      timestamp: 'Just now'
    }
  ],
  isChatLoading: false,

  // Real LLM Message Transmission - No Dummy Replies
  sendArchitectMessage: async (content: string, display?: string, attachments: ChatAttachment[] = []) => {
    if (!content.trim() && attachments.length === 0) return;
    if (!content.trim()) content = 'Please look at the attached file(s).';

    let sid = get().builderSessionId;
    if (!sid) {
      sid = await api.createSession('agent_builder');
      set({ builderSessionId: sid });
    }

    // Who is this for? "@agent ..." or the picked target go straight to that agent; everything else
    // (and every decision-card answer) goes to the Agent Builder, which can still route to agents itself.
    const directory = get().agentDirectory;
    let target: DirectoryAgent | undefined;
    let text = content;
    if (!content.includes('DECISIONS_JSON:')) {
      const mention = content.match(/^\s*@([\w./-]+)[\s,:]+([\s\S]+)$/);
      if (mention) {
        const key = mention[1].toLowerCase();
        target = directory.find((a) => a.id.toLowerCase() === key)
          ?? directory.find((a) => a.name.toLowerCase() === key)
          ?? directory.find((a) => a.kind === 'project' && a.project?.toLowerCase() === key);
        if (target) text = mention[2];
      } else if (get().chatTarget) {
        target = directory.find((a) => a.id === get().chatTarget);
      }
      if (target?.kind === 'builder') target = undefined;
    }

    const userMsg: ChatMessage = {
      id: newId('msg'),
      sender: 'user',
      content: display ?? content,
      timestamp: stamp(),
      agentTarget: target?.id,
      // Names only: the file contents are sent once, not kept in the persisted history.
      attachments: attachments.length ? attachments.map(({ name, mimeType, size }) => ({ name, mimeType, size })) : undefined,
    };

    set((state) => ({
      chatMessages: [...state.chatMessages, userMsg],
      isChatLoading: true,
      isStreaming: true,
      currentAgentPhase: 'orchestrator'
    }));

    if (target) {
      try {
        const result = await api.chatWithAgent(target.id, text, sid, attachments);
        set((state) => ({
          chatMessages: [...state.chatMessages, {
            id: newId('msg'),
            sender: 'assistant' as const,
            content: result.reply,
            timestamp: stamp(),
            agentTarget: result.target,
            agentName: result.agent,
            trace: result.trace,
          }],
          isChatLoading: false,
          isStreaming: false,
        }));
      } catch (err: any) {
        set((state) => ({
          chatMessages: [...state.chatMessages, {
            id: newId('msg-err'),
            sender: 'assistant' as const,
            content: `⚠️ **${target!.id}** could not answer: ${err.message || 'agent call failed'}`,
            timestamp: stamp(),
            agentTarget: target!.id,
            agentName: target!.name,
          }],
          isChatLoading: false,
          isStreaming: false,
        }));
      }
      return;
    }

    // Remembered until the reply arrives: if the page is refreshed meanwhile, the next load recovers it.
    const sentAt = Date.now();
    set((state) => ({ pendingTurns: { ...state.pendingTurns, builder: { sessionId: sid!, text: content, userMsgId: userMsg.id, sentAt } } }));
    try {
      // The Agent Builder: builds and edits agents, and routes requests for existing ones through ask_agent.
      let resp: ChatResponse;
      try {
        resp = await api.sendBuilderChat(content, sid, attachments);
      } catch (err) {
        if (!(err instanceof SessionMissingError)) throw err;
        // The server no longer has this session (its data was reset): continue in a new one.
        sid = await api.createSession('agent_builder');
        set((state) => ({
          builderSessionId: sid,
          builderJourney: null,
          currentDecisionGroup: null,
          chatMessages: [...lockStaleCards(state.chatMessages, null), systemChat('The Builder session was no longer on the server; continuing in a new session.')],
          pendingTurns: { ...state.pendingTurns, builder: { sessionId: sid!, text: content, userMsgId: userMsg.id, sentAt } },
        }));
        resp = await api.sendBuilderChat(content, sid, attachments);
      }
      if (get().builderSessionId !== sid) return; // a new Builder session was started meanwhile
      await applyBuilderResponse(resp, userMsg.id);
    } catch (err: any) {
      console.error(err);
      if (get().builderSessionId !== sid) return;
      const errMsg: ChatMessage = {
        id: newId('msg-err'),
        sender: 'assistant',
        content: `⚠️ **Backend Execution Error:**\n${err.message || 'Unable to communicate with agent builder.'}\n\nPlease verify that your Google API Key (GOOGLE_API_KEY) is set in your .env file.`,
        timestamp: stamp()
      };
      set((state) => ({
        chatMessages: [...state.chatMessages, errMsg],
        isChatLoading: false,
        isStreaming: false
      }));
    } finally {
      set((state) => (state.pendingTurns.builder?.userMsgId === userMsg.id
        ? { pendingTurns: { ...state.pendingTurns, builder: undefined } }
        : {}));
    }
  },

  updateDecisionOption: (questionId: string, optionId: string) => {
    set((state) => {
      if (!state.currentDecisionGroup) return state;
      const updatedQuestions = state.currentDecisionGroup.questions.map((q) => {
        if (q.id === questionId) {
          if (q.multiSelect) {
            const current = q.selectedOptions ?? [];
            const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
            return { ...q, selectedOptions: next, selectedOption: next[0] ?? '', isCustom: false };
          }
          return { ...q, selectedOption: optionId, selectedOptions: [optionId], isCustom: false };
        }
        return q;
      });

      const newSpec = { ...state.spec };
      if (questionId.includes('structure') || questionId.includes('architecture')) {
        newSpec.architecture = optionId === 'sub_agents' ? 'sub_agents' : 'coordinator';
      } else if (questionId.includes('storage')) {
        newSpec.storage = optionId === 'sqlite' ? 'sqlite' : 'json';
      } else if (questionId.includes('output')) {
        newSpec.outputFormat = optionId;
      }

      return {
        currentDecisionGroup: {
          ...state.currentDecisionGroup,
          questions: updatedQuestions
        },
        spec: newSpec
      };
    });
  },

  toggleCustomDecision: (questionId: string, isCustom: boolean) => {
    set((state) => {
      if (!state.currentDecisionGroup) return state;
      const updatedQuestions = state.currentDecisionGroup.questions.map((q) => {
        if (q.id === questionId) {
          return {
            ...q,
            isCustom,
            selectedOption: isCustom ? 'custom' : q.options[0]?.id || ''
          };
        }
        return q;
      });
      return {
        currentDecisionGroup: {
          ...state.currentDecisionGroup,
          questions: updatedQuestions
        }
      };
    });
  },

  setCustomDecisionValue: (questionId: string, val: string) => {
    set((state) => {
      if (!state.currentDecisionGroup) return state;
      const updatedQuestions = state.currentDecisionGroup.questions.map((q) => {
        if (q.id === questionId) {
          return { ...q, customValue: val };
        }
        return q;
      });
      return {
        currentDecisionGroup: {
          ...state.currentDecisionGroup,
          questions: updatedQuestions
        }
      };
    });
  },

  setExtraNotes: (notes: string) => {
    set((state) => {
      if (!state.currentDecisionGroup) return state;
      return {
        currentDecisionGroup: {
          ...state.currentDecisionGroup,
          extraNotes: notes
        }
      };
    });
  },

  applyRecommendedDefaults: () => {
    set((state) => {
      if (!state.currentDecisionGroup) return state;
      const updatedQuestions = state.currentDecisionGroup.questions.map((q) => {
        const recommended = q.options.find((opt) => opt.isRecommended) || q.options[0];
        const allRecommended = q.options.filter((opt) => opt.isRecommended).map((opt) => opt.id);
        return {
          ...q,
          selectedOption: recommended ? recommended.id : q.selectedOption,
          selectedOptions: q.multiSelect && allRecommended.length ? allRecommended : recommended ? [recommended.id] : q.selectedOptions,
          isCustom: false,
          customValue: ''
        };
      });

      return {
        currentDecisionGroup: {
          ...state.currentDecisionGroup,
          questions: updatedQuestions
        }
      };
    });
  },

  isGeneratingAgent: false,
  isAgentReady: false,
  generatedFiles: {},

  submitDecisions: async () => {
    const { currentDecisionGroup, spec, builderSessionId } = get();
    if (!currentDecisionGroup) return;

    set({ isGeneratingAgent: true, isStreaming: true, currentAgentPhase: 'orchestrator' });

    let sid = builderSessionId;
    if (!sid) {
      sid = await api.createSession('agent_builder');
      set({ builderSessionId: sid });
    }

    const decisionsMap: Record<string, string> = {};
    const customMap: Record<string, string> = {};

    currentDecisionGroup.questions.forEach((q) => {
      decisionsMap[q.id] = q.selectedOption;
      if (q.isCustom) {
        customMap[q.id] = q.customValue;
      }
    });

    try {
      const resp = await api.confirmDecisions(sid, {
        decisions: decisionsMap,
        customValues: customMap,
        extraNotes: currentDecisionGroup.extraNotes,
        spec
      });

      // Convert generated files to pending files for streaming display
      const pendingFilesArray = Object.entries(resp.files || {}).map(([path, content]) => ({
        path,
        content: typeof content === 'string' ? content : String(content)
      }));
      set({ pendingFiles: pendingFilesArray, currentAgentPhase: 'codegen' });

      // Wait for file streaming animation to complete (simulate real-time writing)
      const totalChars = pendingFilesArray.reduce((sum, f) => sum + f.content.length, 0);
      const streamingTime = Math.min(Math.max(totalChars * 0.015, 3000), 15000);
      await new Promise(r => setTimeout(r, streamingTime));

      // Mark current decision card as locked/submitted
      const updatedMessages = get().chatMessages.map((m) => {
        if (m.decisionGroup && m.decisionGroup.id === currentDecisionGroup.id) {
          return {
            ...m,
            decisionGroup: { ...m.decisionGroup, isSubmitted: true }
          };
        }
        return m;
      });

      const confirmMsg: ChatMessage = {
        id: `msg-confirmed-${Date.now()}`,
        sender: 'assistant',
        content: `🎉 **Agent Build Complete!**\n${resp.message}\n\n✅ Generated ${pendingFilesArray.length} files\n\nSwitched to **Live Sandbox** tab to run your new agent!`,
        timestamp: stamp()
      };

      await get().refreshCreatedAgents();

      set({
        chatMessages: [...updatedMessages, confirmMsg],
        isGeneratingAgent: false,
        isAgentReady: true,
        generatedFiles: resp.files,
        activeTab: 'sandbox',
        tabNonce: Date.now(),
        isStreaming: false,
        pendingFiles: []
      });
    } catch (err: any) {
      console.error(err);
      set({ isGeneratingAgent: false, isStreaming: false, pendingFiles: [] });
    }
  },

  // Inspector & Files
  currentAgentFiles: {},
  selectedFilePath: '',
  setSelectedFilePath: (p) => set({ selectedFilePath: p }),

  loadAgentFiles: async (agentName: string) => {
    const files = await api.fetchAgentFiles(agentName);
    const keys = Object.keys(files);
    const current = get().selectedFilePath;
    set({
      currentAgentFiles: files,
      // Reloading the same agent (after an edit or a refresh) keeps the open file.
      selectedFilePath: current && keys.includes(current) ? current : keys.length > 0 ? keys[0] : ''
    });
  },

  saveAgentFile: async (filePath: string, content: string) => {
    const { selectedAgent } = get();
    if (!selectedAgent) throw new Error('No agent selected to update');
    const res = await api.saveAgentFile(selectedAgent.name, filePath, content);
    await get().loadAgentFiles(selectedAgent.name);
    return res;
  },

  // Sandbox State - 100% Real LLM Replies
  sandboxMessages: [],
  isSandboxLoading: false,
  activeToolTrace: null,
  activeGuardrailTrace: null,

  sendSandboxMessage: async (content: string, opts?: { rerun?: boolean; attachments?: ChatAttachment[] }) => {
    const attachments = opts?.attachments ?? [];
    if (!content.trim() && attachments.length === 0) return;
    if (!content.trim()) content = 'Please look at the attached file(s).';

    const { selectedAgent, selectedAgentEnv } = get();
    const appName = selectedAgent ? selectedAgent.appName : 'agent_builder';
    const agentName = selectedAgent ? selectedAgent.name : appName;

    // Verify particular agent's .env has key before running
    if (selectedAgent) {
      let agentEnv = selectedAgentEnv;
      if (!agentEnv || agentEnv.agentName !== selectedAgent.name) {
        agentEnv = await get().checkSelectedAgentEnv(selectedAgent.name);
      }

      if (!agentEnv?.hasKey) {
        // Must configure API key first
        set({ showAgentEnvModal: true });
        const warnMsg: SandboxChatMessage = {
          id: newId('sb-warn'),
          sender: 'system',
          content: `⚠️ **Google API Key Required:** Please configure the Google API Key for **${selectedAgent.name}** before running it. The key will be saved directly into its \`.env\` file without any LLM interaction.`,
          timestamp: stamp()
        };
        set((state) => ({
          sandboxMessages: [...state.sandboxMessages, warnMsg]
        }));
        return;
      }
    }

    let sid = get().sandboxSessionId;
    if (!sid || get().sandboxAgentName !== agentName) {
      sid = await get().startNewSandboxSession(appName, { keepHistory: true });
    }

    const userMsg: SandboxChatMessage = {
      id: newId('sb-user'),
      sender: 'user',
      content,
      timestamp: stamp(),
      rerun: opts?.rerun,
      attachments: attachments.length ? attachments.map(({ name, mimeType, size }) => ({ name, mimeType, size })) : undefined,
    };

    const sentAt = Date.now();
    set((state) => ({
      sandboxMessages: [...state.sandboxMessages, userMsg],
      isSandboxLoading: true,
      activeToolTrace: null,
      activeGuardrailTrace: null,
      // Remembered until the reply arrives: if the page is refreshed meanwhile, the next load recovers it.
      pendingTurns: { ...state.pendingTurns, sandbox: { appName, agentName, sessionId: sid!, text: content, sentAt } },
    }));

    try {
      // Real backend LLM run
      let resp: RuntimeChatResponse;
      try {
        resp = await api.sendRuntimeChat(appName, sid, content, attachments);
      } catch (err) {
        if (!(err instanceof SessionMissingError)) throw err;
        sid = await get().startNewSandboxSession(appName, { keepHistory: true, note: 'The sandbox session was no longer on the server; continuing in a new one' });
        set((state) => ({ pendingTurns: { ...state.pendingTurns, sandbox: { appName, agentName, sessionId: sid!, text: content, sentAt } } }));
        resp = await api.sendRuntimeChat(appName, sid, content, attachments);
      }
      if (get().sandboxSessionId !== sid) {
        set({ isSandboxLoading: false }); // the user switched agent or session meanwhile: this reply belongs to neither
        return;
      }
      await applySandboxResponse(resp);
    } catch (err: any) {
      console.error(err);
      if (get().sandboxSessionId !== sid) {
        set({ isSandboxLoading: false });
        return;
      }
      const errMsg: SandboxChatMessage = {
        id: newId('sb-err'),
        sender: 'system',
        content: `⚠️ **Agent Execution Error:** ${err.message || 'Execution failed.'}`,
        timestamp: stamp()
      };
      set((state) => ({
        sandboxMessages: [...state.sandboxMessages, errMsg],
        isSandboxLoading: false
      }));
    } finally {
      set((state) => (state.pendingTurns.sandbox?.sentAt === sentAt
        ? { pendingTurns: { ...state.pendingTurns, sandbox: undefined } }
        : {}));
    }
  },

  resetSandbox: () => {
    get().startNewSandboxSession();
  },

  resetDemoToInitial: () => {
    get().startNewBuilderSession();
  },

  // --- Conversational editing ------------------------------------------------------------------
  editSessionKey: `studio-${Math.random().toString(36).slice(2, 10)}`,
  isEditingAgent: false,

  editSelectedAgent: async (request: string) => {
    const agent = get().selectedAgent;
    const text = request.trim();
    if (!agent || !text || get().isEditingAgent || get().isSandboxLoading) return;
    const sentAt = Date.now();
    set((state) => ({
      isEditingAgent: true,
      sandboxMessages: [...state.sandboxMessages, { id: newId('sb-edit-request'), sender: 'user', kind: 'edit-request', content: text, timestamp: stamp() }],
      // Remembered until the outcome arrives: if the page is refreshed meanwhile, the next load recovers it.
      pendingTurns: { ...state.pendingTurns, edit: { project: agent.name, request: text, sentAt } },
    }));
    try {
      const result = await api.editAgent(agent.name, text, get().editSessionKey);
      appendEditOutcome(agent.name, editView(result));
      if (result.status === 'success') await onAgentEdited(agent.name, 'Agent updated');
    } catch (err: any) {
      appendEditOutcome(agent.name, { outcome: 'error', summary: err.message || 'The edit request failed.', files: [] });
    } finally {
      set((state) => ({
        isEditingAgent: false,
        pendingTurns: state.pendingTurns.edit?.sentAt === sentAt ? { ...state.pendingTurns, edit: undefined } : state.pendingTurns,
      }));
    }
  },

  undoLastAgentEdit: async () => {
    const agent = get().selectedAgent;
    if (!agent || get().isEditingAgent || get().isSandboxLoading) return;
    set({ isEditingAgent: true });
    try {
      const result = await api.undoAgentEdit(agent.name);
      set((state) => ({
        sandboxMessages: state.sandboxMessages.map((m) => (m.edit?.editId === result.undone ? { ...m, edit: { ...m.edit, undone: true } } : m)),
      }));
      appendEditOutcome(agent.name, { outcome: 'undone', summary: `Undid “${clip(result.request, 120)}”.`, files: result.files, prompts: result.prompts });
      await onAgentEdited(agent.name, 'Edit undone');
    } catch (err: any) {
      appendEditOutcome(agent.name, { outcome: 'error', summary: `Undo failed: ${err.message || 'unknown error'}`, files: [] });
    } finally {
      set({ isEditingAgent: false });
    }
  },

  rerunSandboxWithUpdatedAgent: async (note: string) => {
    const agent = get().selectedAgent;
    if (!agent) return;
    if (get().isSandboxLoading) {
      // Don't cut off the run in progress (it still uses the previous version).
      set((state) => ({ sandboxMessages: [...state.sandboxMessages, sandboxNotice(`🔄 ${note}. The run in progress uses the previous version; send your message again to test the new one.`)] }));
      return;
    }
    const lastTest = [...get().sandboxMessages].reverse().find((m) => m.sender === 'user' && !m.kind);
    if (!lastTest) {
      await get().startNewSandboxSession(agent.appName, { keepHistory: true, note: `${note} — new session on the updated agent. Send a message to try it` });
      return;
    }
    await get().startNewSandboxSession(agent.appName, { keepHistory: true, note: `${note} — re-running your last test on the updated agent` });
    if (get().selectedAgent?.name === agent.name) await get().sendSandboxMessage(lastTest.content, { rerun: true });
  },

  // Streaming & File Writing State
  isStreaming: false,
  streamingText: '',
  currentAgentPhase: 'orchestrator',
  fileWriteEvents: [],
  agentEvents: [],
  pendingFiles: [],

  setStreamingState: (isStreaming, text) => set({ isStreaming, streamingText: text || '' }),
  setCurrentAgentPhase: (phase) => set({ currentAgentPhase: phase }),
  addFileWriteEvent: (event) => set(s => ({ fileWriteEvents: [...s.fileWriteEvents, event] })),
  addAgentEvent: (event) => set(s => ({ agentEvents: [...s.agentEvents, event] })),
  setPendingFiles: (files) => set({ pendingFiles: files }),
  clearStreamingState: () => set({
    isStreaming: false,
    streamingText: '',
    currentAgentPhase: 'orchestrator',
    fileWriteEvents: [],
    agentEvents: [],
    pendingFiles: []
  })
  };
}, {
  name: 'tectonic-agent-studio',
  version: 1,
  storage: studioStorage,
  // History, sessions and the open agent survive a page refresh; loading flags and live traces do not.
  partialize: (state) => ({
    ...(Object.fromEntries(PERSISTED_KEYS.map((key) => [key, state[key]])) as PersistedStudio),
    chatMessages: state.chatMessages.slice(-MAX_PERSISTED_MESSAGES),
    sandboxMessages: state.sandboxMessages.slice(-MAX_PERSISTED_MESSAGES),
  }),
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<PersistedStudio>;
    return {
      ...current,
      ...saved,
      pendingTurns: saved.pendingTurns ?? {},
      chatMessages: saved.chatMessages?.length ? saved.chatMessages : current.chatMessages,
      sandboxMessages: saved.sandboxMessages ?? current.sandboxMessages,
      editSessionKey: saved.editSessionKey || current.editSessionKey,
    };
  },
}));
