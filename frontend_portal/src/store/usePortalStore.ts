import { create } from 'zustand';
import { portalApi } from '../services/api';
import { authService } from '../services/auth';
import { BUILDER_AGENT } from '../types';
import type { PortalAgent, ChatMessage, ChatSession, AuthUser } from '../types';

interface PortalState {
  // Navigation & Layout
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  activeNavTab: 'chats' | 'projects' | 'settings' | 'teams';
  setActiveNavTab: (tab: 'chats' | 'projects' | 'settings' | 'teams') => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Backend Connectivity
  isBackendConnected: boolean;
  lastSyncedAt: number | null;
  checkBackendStatus: () => Promise<void>;

  // Authentication
  isAuthEnabled: boolean;
  currentUser: AuthUser | null;
  showAuthModal: boolean;
  setShowAuthModal: (open: boolean) => void;
  initAuth: () => Promise<void>;
  login: (u: string, p: string) => Promise<void>;
  register: (u: string, p: string) => Promise<void>;
  logout: () => void;

  // Agents & Custom Name
  agents: PortalAgent[];
  isLoadingAgents: boolean;
  selectedAgent: PortalAgent | null;
  customAgentName: string;
  setCustomAgentName: (name: string) => void;
  newAgentAlert: string | null;
  clearNewAgentAlert: () => void;
  fetchAgents: (silent?: boolean) => Promise<void>;
  setSelectedAgent: (agent: PortalAgent | null) => Promise<void>;

  // Sessions & Chats
  sessions: ChatSession[];
  activeSessionId: string | null;
  chatHistory: Record<string, ChatMessage[]>;
  isExecuting: boolean;
  agentStatus: 'ready' | 'running' | 'error';
  lastError: string | null;
  lastExecutionDuration: number | null;

  // Chat Actions
  sendMessage: (content: string) => Promise<void>;
  createNewChat: (agent?: PortalAgent) => Promise<void>;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearCurrentChat: () => Promise<void>;
  regenerateLastTurn: () => Promise<void>;
  toggleMessageReaction: (msgId: string, reaction: 'like' | 'dislike') => void;

  // Modals & Drawers
  showRosterModal: boolean;
  setShowRosterModal: (open: boolean) => void;
  showTraceDrawer: boolean;
  setShowTraceDrawer: (open: boolean) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (open: boolean) => void;
  inspectingAgent: PortalAgent | null;
  inspectingFiles: Record<string, string>;
  inspectingEnv: any;
  isLoadingFiles: boolean;
  openAgentInspector: (agent: PortalAgent) => Promise<void>;
  closeAgentInspector: () => void;
}

const STORAGE_CHATS_KEY = 'tectonic_voxa_chats';
const STORAGE_SESSIONS_KEY = 'tectonic_voxa_sessions';
const STORAGE_AGENT_NAME_KEY = 'tectonic_agent_display_name';

const loadSavedChats = (): Record<string, ChatMessage[]> => {
  try {
    const raw = localStorage.getItem(STORAGE_CHATS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const loadSavedSessions = (): ChatSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const loadSavedAgentName = (): string => {
  try {
    return localStorage.getItem(STORAGE_AGENT_NAME_KEY) || '';
  } catch {
    return '';
  }
};

const persistData = (sessions: ChatSession[], chats: Record<string, ChatMessage[]>) => {
  try {
    localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(chats));
  } catch (err) {
    console.warn('Failed to persist sessions/chats:', err);
  }
};

const DEFAULT_PORTAL_AGENT = BUILDER_AGENT;

export const usePortalStore = create<PortalState>((set, get) => ({
  // Layout
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  activeNavTab: 'chats',
  setActiveNavTab: (tab) => {
    set({ activeNavTab: tab });
    if (tab === 'settings') set({ showSettingsModal: true });
  },

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  isBackendConnected: true,
  lastSyncedAt: null,

  checkBackendStatus: async () => {
    const ok = await portalApi.checkBackendHealth();
    set({ isBackendConnected: ok });
  },

  // Auth
  isAuthEnabled: false,
  currentUser: null,
  showAuthModal: false,
  setShowAuthModal: (open) => set({ showAuthModal: open }),

  initAuth: async () => {
    const enabled = await authService.isAuthEnabled();
    set({ isAuthEnabled: enabled });
    const user = await authService.verifySession();
    if (user) {
      set({ currentUser: user });
    }
  },

  login: async (u, p) => {
    const user = await authService.login(u, p);
    set({ currentUser: user, showAuthModal: false });
    await get().fetchAgents();
  },

  register: async (u, p) => {
    const user = await authService.register(u, p);
    set({ currentUser: user, showAuthModal: false });
    await get().fetchAgents();
  },

  logout: () => {
    authService.clearAuth();
    set({ currentUser: null });
    get().fetchAgents();
  },

  // Agents & Custom Name
  agents: [DEFAULT_PORTAL_AGENT],
  isLoadingAgents: false,
  selectedAgent: DEFAULT_PORTAL_AGENT,
  customAgentName: loadSavedAgentName(),

  setCustomAgentName: (name: string) => {
    const clean = name.trim();
    set((state) => ({
      customAgentName: clean,
      selectedAgent: state.selectedAgent ? { ...state.selectedAgent, name: clean || state.selectedAgent.name } : state.selectedAgent,
    }));
    try {
      if (clean) {
        localStorage.setItem(STORAGE_AGENT_NAME_KEY, clean);
      } else {
        localStorage.removeItem(STORAGE_AGENT_NAME_KEY);
      }
    } catch {}
  },

  newAgentAlert: null,
  clearNewAgentAlert: () => set({ newAgentAlert: null }),

  fetchAgents: async (silent = false) => {
    if (!silent) set({ isLoadingAgents: true });
    try {
      const prevAgents = get().agents;
      const prevIds = new Set(prevAgents.map((a) => a.id));
      const fresh = await portalApi.fetchAvailableAgents();

      if (prevAgents.length > 0) {
        const added = fresh.filter((a) => !prevIds.has(a.id));
        if (added.length > 0) {
          set({ newAgentAlert: added[0].name });
        }
      }

      // Default to Tectonic Architect
      let current = get().selectedAgent;
      if (!current || current.id === 'attendance_manager') {
        const architect = fresh.find((a) => a.id === 'agent_builder') || BUILDER_AGENT;
        current = architect;
      } else {
        const match = fresh.find((a) => a.id === current?.id);
        if (match) current = match;
      }

      set({
        agents: fresh.length > 0 ? fresh : [BUILDER_AGENT],
        selectedAgent: current,
        isLoadingAgents: false,
        isBackendConnected: true,
        lastSyncedAt: Date.now(),
      });

      // Ensure active session exists
      if (!get().activeSessionId) {
        await get().createNewChat(current);
      }
    } catch (err) {
      console.warn('Portal: Error fetching agents:', err);
      set({ isLoadingAgents: false, isBackendConnected: false });
    }
  },

  setSelectedAgent: async (agent) => {
    const target = agent || BUILDER_AGENT;

    set({ selectedAgent: target, customAgentName: '', agentStatus: 'ready', lastError: null });

    // Look for an existing session for this agent
    const existingSession = get().sessions.find((s) => s.agentId === target.id);
    if (existingSession) {
      set({ activeSessionId: existingSession.id });
    } else {
      await get().createNewChat(target);
    }
  },

  // Sessions & Chats
  sessions: loadSavedSessions(),
  activeSessionId: null,
  chatHistory: loadSavedChats(),
  isExecuting: false,
  agentStatus: 'ready',
  lastError: null,
  lastExecutionDuration: null,

  createNewChat: async (targetAgent) => {
    const agent = targetAgent || get().selectedAgent || DEFAULT_PORTAL_AGENT;
    const newSid = await portalApi.createSession(agent.appName);
    const agentTitle = get().customAgentName || agent.name;
    const sessionCount = get().sessions.length + 1;

    const newSession: ChatSession = {
      id: newSid,
      agentId: agent.id,
      title: `New Chat #${sessionCount}`,
      lastActive: Date.now(),
    };

    const updatedSessions = [newSession, ...get().sessions.filter((s) => s.id !== newSid)];
    const updatedChats = {
      ...get().chatHistory,
      [newSid]: [],
    };

    set({
      selectedAgent: { ...agent, name: agentTitle },
      activeSessionId: newSid,
      activeNavTab: 'chats',
      sessions: updatedSessions,
      chatHistory: updatedChats,
      agentStatus: 'ready',
      lastError: null,
    });
    persistData(updatedSessions, updatedChats);
  },

  selectSession: (sessionId: string) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const agent = get().agents.find((a) => a.id === session.agentId) || get().selectedAgent;
    set({
      activeSessionId: sessionId,
      selectedAgent: agent,
      agentStatus: 'ready',
      lastError: null,
    });
  },

  deleteSession: (sessionId: string) => {
    const filtered = get().sessions.filter((s) => s.id !== sessionId);
    const chats = { ...get().chatHistory };
    delete chats[sessionId];

    let nextActiveId = get().activeSessionId;
    if (nextActiveId === sessionId) {
      nextActiveId = filtered.length > 0 ? filtered[0].id : null;
    }

    set({ sessions: filtered, chatHistory: chats, activeSessionId: nextActiveId });
    persistData(filtered, chats);

    if (nextActiveId) {
      get().selectSession(nextActiveId);
    }
  },

  sendMessage: async (content: string) => {
    if (!content.trim()) return;

    // Ensure selected agent exists
    let agent = get().selectedAgent;
    if (!agent) {
      agent = get().agents[0] || DEFAULT_PORTAL_AGENT;
      set({ selectedAgent: agent });
    }

    // Ensure active session exists
    let sid = get().activeSessionId;
    if (!sid) {
      sid = `session_${Date.now()}`;
      const newSession: ChatSession = {
        id: sid,
        agentId: agent.id,
        title: content.slice(0, 24) + '...',
        lastActive: Date.now(),
      };
      set({
        activeSessionId: sid,
        sessions: [newSession, ...get().sessions],
      });
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      content: content.trim(),
      timestamp: timeStr,
      status: 'success',
    };

    const currentMessages = get().chatHistory[sid] || [];
    const updatedMessages = [...currentMessages, userMsg];

    // Update session title dynamically
    const updatedSessions = get().sessions.map((s) => {
      if (s.id === sid && s.title.includes('Chat')) {
        return {
          ...s,
          title: content.slice(0, 28) + (content.length > 28 ? '...' : ''),
          lastActive: Date.now(),
        };
      }
      return s.id === sid ? { ...s, lastActive: Date.now() } : s;
    });

    const updatedChats = {
      ...get().chatHistory,
      [sid]: updatedMessages,
    };

    set({
      chatHistory: updatedChats,
      sessions: updatedSessions,
      isExecuting: true,
      agentStatus: 'running',
      lastError: null,
    });
    persistData(updatedSessions, updatedChats);

    // Call shared backend
    const result = await portalApi.sendChatMessage(agent, sid, content);

    const assistantMsg: ChatMessage = {
      id: `asst_${Date.now()}`,
      sender: 'assistant',
      content: result.reply,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      durationMs: result.durationMs,
      toolCalls: result.toolCalls,
      trace: result.trace,
      guardrail: result.guardrail,
      status: result.status,
      errorMessage: result.errorMessage,
    };

    const finalChats = {
      ...get().chatHistory,
      [sid]: [...(get().chatHistory[sid] || []), assistantMsg],
    };

    set({
      chatHistory: finalChats,
      isExecuting: false,
      agentStatus: result.status === 'success' ? 'ready' : 'error',
      lastError: result.errorMessage || null,
      lastExecutionDuration: result.durationMs,
    });
    persistData(get().sessions, finalChats);

    // If talking to the builder agent, automatically refresh agents to detect any newly generated agent!
    if (agent.kind === 'builder' || agent.id === 'agent_builder') {
      setTimeout(() => {
        get().fetchAgents(true);
      }, 1000);
    }
  },

  clearCurrentChat: async () => {
    const { activeSessionId, chatHistory } = get();
    if (!activeSessionId) return;

    const updatedChats = {
      ...chatHistory,
      [activeSessionId]: [],
    };
    set({ chatHistory: updatedChats, agentStatus: 'ready', lastError: null });
    persistData(get().sessions, updatedChats);
  },

  regenerateLastTurn: async () => {
    const { activeSessionId, chatHistory } = get();
    if (!activeSessionId) return;
    const msgs = chatHistory[activeSessionId] || [];
    const lastUserMsg = [...msgs].reverse().find((m) => m.sender === 'user');
    if (lastUserMsg) {
      await get().sendMessage(lastUserMsg.content);
    }
  },

  toggleMessageReaction: (msgId: string, reaction: 'like' | 'dislike') => {
    const { activeSessionId, chatHistory } = get();
    if (!activeSessionId) return;
    const msgs = (chatHistory[activeSessionId] || []).map((m) => {
      if (m.id === msgId) {
        return {
          ...m,
          reaction: m.reaction === reaction ? undefined : reaction,
        };
      }
      return m;
    });
    const updated = { ...chatHistory, [activeSessionId]: msgs };
    set({ chatHistory: updated });
    persistData(get().sessions, updated);
  },

  // Modals
  showRosterModal: false,
  setShowRosterModal: (open) => set({ showRosterModal: open }),
  showTraceDrawer: false,
  setShowTraceDrawer: (open) => set({ showTraceDrawer: open }),
  showSettingsModal: false,
  setShowSettingsModal: (open) => set({ showSettingsModal: open }),

  inspectingAgent: null,
  inspectingFiles: {},
  inspectingEnv: null,
  isLoadingFiles: false,

  openAgentInspector: async (agent) => {
    set({ inspectingAgent: agent, isLoadingFiles: true, inspectingFiles: {}, inspectingEnv: null });
    const targetKey = agent.systemName || agent.id || agent.name;
    const [files, env] = await Promise.all([
      portalApi.getAgentFiles(targetKey),
      portalApi.getAgentEnv(targetKey),
    ]);
    set({ inspectingFiles: files, inspectingEnv: env, isLoadingFiles: false });
  },

  closeAgentInspector: () => {
    set({ inspectingAgent: null, inspectingFiles: {}, inspectingEnv: null });
  },
}));
