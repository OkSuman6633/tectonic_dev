import { create } from 'zustand';
import { getToken } from '../services/auth';
import type {
  AgentMeta,
  ConnectionStatus,
  JsonObject,
  LogEntry,
  ModuleCallRecord,
  ModuleMeta,
  Packet,
  TelemetryEvent,
  ToolCallRecord,
  TraceSegment,
} from '../types/telemetry';

const ACTIVITY_BUCKETS = 24;
const BUCKET_MS = 1500;
const PACKET_TTL_MS = 1600;
const MAX_LOGS = 400;
const MAX_TRACE_CHARS = 60_000;
const MAX_TOOL_CALLS = 100;
const MAX_MODULE_CALLS = 80;

export type SelectionOrigin = 'graph' | 'office';

export interface ExtraEdge {
  id: string;
  source: string;
  target: string;
}

interface TelemetryData {
  agents: Record<string, AgentMeta>;
  /** Insertion order — drives layout and keeps node identity stable. */
  agentOrder: string[];
  traces: Record<string, TraceSegment[]>;
  toolCalls: Record<string, ToolCallRecord[]>;
  memory: Record<string, JsonObject>;
  activity: Record<string, number[]>;
  extraEdges: ExtraEdge[];
  packets: Packet[];
  logs: LogEntry[];
  activeRuns: number;
  /** Shared core modules: the office's service desks. */
  modules: Record<string, ModuleMeta>;
  moduleOrder: string[];
  moduleCalls: Record<string, ModuleCallRecord[]>;
  /** agent -> module usage links (edge ids from moduleEdgeId). */
  moduleLinks: ExtraEdge[];
}

interface TelemetryState extends TelemetryData {
  status: ConnectionStatus;
  serverId: string | null;
  lastSeq: number;
  selectedAgentId: string | null;
  selectedModuleId: string | null;
  /** Which view the current selection came from; that view hosts the detail drawer. */
  selectionOrigin: SelectionOrigin;
  isSimulating: boolean;

  connect: () => void;
  disconnect: () => void;
  /** Drop everything shown and rebuild it from the server's replay (a fresh socket). */
  resync: () => void;
  ingest: (events: TelemetryEvent[]) => void;
  selectAgent: (id: string | null, origin?: SelectionOrigin) => void;
  selectModule: (id: string | null, origin?: SelectionOrigin) => void;
  reset: () => void;
  setSimulating: (val: boolean) => void;
}

const emptyData = (): TelemetryData => ({
  agents: {},
  agentOrder: [],
  traces: {},
  toolCalls: {},
  memory: {},
  activity: {},
  extraEdges: [],
  packets: [],
  logs: [],
  activeRuns: 0,
  modules: {},
  moduleOrder: [],
  moduleCalls: {},
  moduleLinks: [],
});

/** Module node ids are namespaced: a module and an agent may share a name (e.g. intent_detection). */
export const moduleNodeId = (module: string): string => `mod:${module}`;
export const moduleEdgeId = (agent: string, module: string): string => `m:${agent}->${module}`;

export const hierarchyEdgeId = (parent: string, child: string): string => `h:${parent}->${child}`;

const tokensOf = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

const appendTrace = (segments: TraceSegment[] | undefined, kind: TraceSegment['kind'], text: string): TraceSegment[] => {
  const next = segments ? [...segments] : [];
  const last = next[next.length - 1];
  if (last && last.kind === kind && (kind === 'text' || kind === 'thought')) {
    next[next.length - 1] = { kind, text: last.text + text };
  } else {
    next.push({ kind, text });
  }
  // Keep the trace bounded: drop the oldest segments first.
  let total = next.reduce((n, s) => n + s.text.length, 0);
  while (total > MAX_TRACE_CHARS && next.length > 1) {
    total -= next.shift()!.text.length;
  }
  return next;
};

const compact = (value: unknown, limit = 140): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const flat = (text ?? '').replace(/\s+/g, ' ');
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};

/** Pure reducer: folds a batch of events into a new data snapshot, copying only touched maps. */
function reduce(prev: TelemetryData, events: TelemetryEvent[], now: number): TelemetryData {
  const d: TelemetryData = { ...prev };
  const touched = new Set<keyof TelemetryData>();
  const own = <K extends keyof TelemetryData>(key: K): TelemetryData[K] => {
    if (!touched.has(key)) {
      const v = d[key];
      d[key] = (Array.isArray(v) ? [...v] : { ...(v as object) }) as TelemetryData[K];
      touched.add(key);
    }
    return d[key];
  };
  const log = (e: TelemetryEvent, level: LogEntry['level'], text: string, agentId?: string) => {
    own('logs').push({ seq: e.seq, timestamp: e.timestamp, level, agentId, text });
  };
  const bump = (id: string, amount: number) => {
    const activity = own('activity');
    const series = [...(activity[id] ?? new Array<number>(ACTIVITY_BUCKETS).fill(0))];
    series[series.length - 1] += amount;
    activity[id] = series;
  };
  const patchAgent = (id: string, patch: Partial<AgentMeta>) => {
    const agents = own('agents');
    const current = agents[id];
    if (current) agents[id] = { ...current, ...patch, lastActiveAt: now / 1000 };
  };
  const ensureAgent = (id: string, ts: number) => {
    if (d.agents[id]) return;
    // Events for an agent we never saw spawn (e.g. client joined mid-run): create a stub node.
    own('agents')[id] = {
      id, role: id, parentId: null, systemPrompt: '', description: '', model: '',
      state: 'idle', createdAt: ts, lastActiveAt: now / 1000,
      tokens: { prompt: 0, completion: 0, total: 0 }, toolCallCount: 0, stub: true,
    };
    own('agentOrder').push(id);
  };

  const ensureModule = (id: string) => {
    if (d.modules[id]) return;
    own('modules')[id] = {
      id, label: id.replace(/_/g, ' '), description: '', category: 'core', operations: [],
      state: 'offline', activeCalls: 0, totalCalls: 0, errorCount: 0,
    };
    own('moduleOrder').push(id);
  };

  for (const e of events) {
    switch (e.type) {
      case 'HELLO':
        break;

      case 'AGENT_CREATED': {
        const existing = d.agents[e.id];
        const meta: AgentMeta = {
          id: e.id,
          role: e.role || e.id,
          parentId: e.parent_id && e.parent_id !== e.id ? e.parent_id : null,
          systemPrompt: e.system_prompt ?? '',
          description: e.description ?? '',
          model: e.model ?? '',
          state: existing?.state ?? 'idle',
          createdAt: existing?.createdAt ?? e.timestamp,
          lastActiveAt: now / 1000,
          tokens: existing?.tokens ?? { prompt: 0, completion: 0, total: 0 },
          toolCallCount: existing?.toolCallCount ?? 0,
        };
        own('agents')[e.id] = meta;
        if (!existing) own('agentOrder').push(e.id);
        if (!existing || existing.stub) {
          log(e, 'spawn', meta.parentId ? `${meta.parentId} spawned ${e.id}` : `Root agent ${e.id} online`, e.id);
        }
        break;
      }

      case 'AGENT_DELETED': {
        const gone = new Set(e.ids.filter((id) => d.agents[id]));
        if (gone.size === 0) break;
        const agents = own('agents');
        for (const id of gone) delete agents[id];
        // Children of a deleted agent become roots rather than dangling.
        for (const [id, meta] of Object.entries(agents)) {
          if (meta.parentId && gone.has(meta.parentId)) agents[id] = { ...meta, parentId: null };
        }
        d.agentOrder = d.agentOrder.filter((id) => !gone.has(id));
        d.extraEdges = d.extraEdges.filter((x) => !gone.has(x.source) && !gone.has(x.target));
        d.moduleLinks = d.moduleLinks.filter((x) => !gone.has(x.source));
        log(e, 'state', `Deleted ${[...gone].join(', ')}${e.project ? ` (${e.project})` : ''}`);
        break;
      }

      case 'AGENT_STATE_CHANGE': {
        ensureAgent(e.id, e.timestamp);
        const prevState = d.agents[e.id]?.state;
        patchAgent(e.id, { state: e.state, stateDetail: e.detail });
        bump(e.id, 1);
        if (e.state === 'error') log(e, 'error', `${e.id} error: ${e.detail ?? 'unknown'}`, e.id);
        else if (e.state === 'idle' && prevState && prevState !== 'idle') log(e, 'state', `${e.id} → idle`, e.id);
        break;
      }

      case 'TOOL_CALL_START': {
        ensureAgent(e.id, e.timestamp);
        const calls = own('toolCalls');
        calls[e.id] = [
          ...(calls[e.id] ?? []),
          { callId: e.call_id, toolName: e.tool_name, payload: e.payload, status: 'running' as const, startedAt: e.timestamp },
        ].slice(-MAX_TOOL_CALLS);
        own('traces')[e.id] = appendTrace(d.traces[e.id], 'tool', `→ ${e.tool_name}(${compact(e.payload, 400)})\n`);
        patchAgent(e.id, { toolCallCount: (d.agents[e.id]?.toolCallCount ?? 0) + 1 });
        bump(e.id, 6);
        log(e, 'tool', `${e.id} executing tool: ${e.tool_name}`, e.id);
        break;
      }

      case 'TOOL_CALL_END': {
        ensureAgent(e.id, e.timestamp);
        const calls = own('toolCalls');
        const list = [...(calls[e.id] ?? [])];
        let idx = -1;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].callId === e.call_id || (list[i].toolName === e.tool_name && list[i].status === 'running')) { idx = i; break; }
        }
        const done: ToolCallRecord = {
          callId: e.call_id,
          toolName: e.tool_name,
          payload: e.payload,
          result: e.result,
          status: e.status,
          startedAt: idx >= 0 ? list[idx].startedAt : e.timestamp,
          durationMs: e.duration_ms,
        };
        if (idx >= 0) list[idx] = done; else list.push(done);
        calls[e.id] = list;
        own('traces')[e.id] = appendTrace(d.traces[e.id], 'result', `← ${e.tool_name} [${e.status}${e.duration_ms != null ? ` · ${e.duration_ms}ms` : ''}] ${compact(e.result, 400)}\n`);
        if (e.state_delta && Object.keys(e.state_delta).length > 0) {
          own('memory')[e.id] = { ...(d.memory[e.id] ?? {}), ...e.state_delta };
        }
        if (e.status === 'error') log(e, 'error', `${e.id} tool ${e.tool_name} failed`, e.id);
        break;
      }

      case 'A2A_MESSAGE': {
        ensureAgent(e.from_id, e.timestamp);
        ensureAgent(e.to_id, e.timestamp);
        const from = d.agents[e.from_id];
        const to = d.agents[e.to_id];
        let edgeId: string;
        let reverse = false;
        if (to.parentId === from.id) {
          edgeId = hierarchyEdgeId(from.id, to.id);
        } else if (from.parentId === to.id) {
          edgeId = hierarchyEdgeId(to.id, from.id);
          reverse = true;
        } else if (!to.parentId && from.id !== to.id) {
          // First contact with an orphan: adopt it so the floorplan reflects delegation.
          own('agents')[to.id] = { ...to, parentId: from.id };
          edgeId = hierarchyEdgeId(from.id, to.id);
        } else {
          const [a, b] = [from.id, to.id].sort();
          edgeId = `x:${a}<->${b}`;
          reverse = from.id !== a;
          if (!d.extraEdges.some((x) => x.id === edgeId)) own('extraEdges').push({ id: edgeId, source: a, target: b });
        }
        own('packets').push({ key: `${e.seq}`, edgeId, reverse, label: e.message_summary, bornAt: now });
        bump(e.from_id, 3);
        bump(e.to_id, 3);
        log(e, 'a2a', `${e.from_id} ⇢ ${e.to_id}: ${compact(e.message_summary, 90)}`, e.from_id);
        break;
      }

      case 'TOKEN_STREAM': {
        ensureAgent(e.id, e.timestamp);
        own('traces')[e.id] = appendTrace(d.traces[e.id], e.kind === 'thought' ? 'thought' : 'text', e.chunk);
        bump(e.id, tokensOf(e.chunk));
        patchAgent(e.id, {});
        break;
      }

      case 'AGENT_METRICS': {
        ensureAgent(e.id, e.timestamp);
        const t = d.agents[e.id].tokens;
        patchAgent(e.id, {
          tokens: {
            prompt: t.prompt + e.prompt_tokens,
            completion: t.completion + e.completion_tokens,
            total: t.total + e.total_tokens,
          },
        });
        break;
      }

      case 'MODULE_REGISTERED': {
        const existing = d.modules[e.module];
        own('modules')[e.module] = {
          id: e.module, label: e.label, description: e.description, category: e.category, operations: e.operations,
          state: existing?.state ?? 'offline', activeCalls: existing?.activeCalls ?? 0, totalCalls: existing?.totalCalls ?? 0,
          errorCount: existing?.errorCount ?? 0, lastAgent: existing?.lastAgent, lastOperation: existing?.lastOperation,
        };
        if (!existing) own('moduleOrder').push(e.module);
        break;
      }

      case 'MODULE_STATE': {
        ensureModule(e.module);
        const prevState = d.modules[e.module].state;
        own('modules')[e.module] = {
          ...d.modules[e.module], state: e.state, stateDetail: e.detail, activeCalls: e.active_calls, totalCalls: e.total_calls,
        };
        if (e.state === 'booting' && prevState !== 'booting') log(e, 'module', `${d.modules[e.module].label} spinning up`);
        break;
      }

      case 'MODULE_CALL_START': {
        ensureModule(e.module);
        ensureAgent(e.agent_id, e.timestamp);
        const linkId = moduleEdgeId(e.agent_id, e.module);
        if (!d.moduleLinks.some((l) => l.id === linkId)) {
          own('moduleLinks').push({ id: linkId, source: e.agent_id, target: moduleNodeId(e.module) });
        }
        own('packets').push({ key: `${e.seq}`, edgeId: linkId, reverse: false, label: e.operation, bornAt: now });
        const calls = own('moduleCalls');
        calls[e.module] = [
          ...(calls[e.module] ?? []),
          { callId: e.call_id, module: e.module, operation: e.operation, agentId: e.agent_id, payload: e.payload,
            status: 'running' as const, startedAt: e.timestamp },
        ].slice(-MAX_MODULE_CALLS);
        own('modules')[e.module] = { ...d.modules[e.module], lastAgent: e.agent_id, lastOperation: e.operation };
        bump(moduleNodeId(e.module), 4);
        bump(e.agent_id, 2);
        break;
      }

      case 'MODULE_CALL_END': {
        ensureModule(e.module);
        const calls = own('moduleCalls');
        const list = [...(calls[e.module] ?? [])];
        const idx = list.findIndex((c) => c.callId === e.call_id);
        const base: ModuleCallRecord = idx >= 0
          ? list[idx]
          : { callId: e.call_id, module: e.module, operation: e.operation, agentId: e.agent_id, payload: null, status: 'running', startedAt: e.timestamp };
        const done: ModuleCallRecord = { ...base, status: e.status, durationMs: e.duration_ms, summary: e.summary, result: e.result, error: e.error };
        if (idx >= 0) list[idx] = done; else list.push(done);
        calls[e.module] = list.slice(-MAX_MODULE_CALLS);
        own('packets').push({ key: `${e.seq}`, edgeId: moduleEdgeId(e.agent_id, e.module), reverse: true, label: e.summary, bornAt: now });
        if (e.status === 'error') {
          own('modules')[e.module] = { ...d.modules[e.module], errorCount: d.modules[e.module].errorCount + 1 };
        }
        bump(moduleNodeId(e.module), 2);
        log(e, e.status === 'error' ? 'error' : 'module', `${e.agent_id} → ${e.module}.${e.operation}: ${compact(e.summary, 90)}`, e.agent_id);
        break;
      }

      case 'RUN_STARTED':
        d.activeRuns = prev.activeRuns + 1;
        log(e, 'run', `Run started · ${e.app_name || e.root_id}`, e.root_id);
        break;

      case 'RUN_COMPLETED':
        d.activeRuns = Math.max(0, d.activeRuns - 1);
        log(e, 'run', `Run completed · ${e.app_name || e.root_id}`, e.root_id);
        break;
    }
  }

  if (touched.has('logs') && d.logs.length > MAX_LOGS) d.logs = d.logs.slice(-MAX_LOGS);
  return d;
}

// ---- Connection plumbing (module-scoped so it never triggers renders) ---------------------

let socket: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let pending: TelemetryEvent[] = [];
let frame: number | null = null;
let wanted = false;

// The server replays the latest of these on every (re)connect; they must always be applied.
const STICKY_TYPES = new Set<TelemetryEvent['type']>(['AGENT_CREATED', 'MODULE_REGISTERED', 'MODULE_STATE']);

const telemetryUrl = (): string => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // Browsers cannot set headers on a WebSocket: the sign-in token goes in the query instead.
  const token = getToken();
  return `${proto}://${window.location.host}/ws/telemetry${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

export const useTelemetryStore = create<TelemetryState>((set, get) => {
  const flush = () => {
    frame = null;
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    get().ingest(batch);
  };

  const schedule = (event: TelemetryEvent) => {
    pending.push(event);
    if (frame === null) frame = requestAnimationFrame(flush);
  };

  const startTicker = () => {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      const { activity, packets } = get();
      const now = Date.now();
      const nextActivity: Record<string, number[]> = {};
      for (const [id, series] of Object.entries(activity)) nextActivity[id] = [...series.slice(1), 0];
      set({ activity: nextActivity, packets: packets.filter((p) => now - p.bornAt < PACKET_TTL_MS) });
    }, BUCKET_MS);
  };

  const open = () => {
    if (!wanted) return;
    set({ status: 'connecting' });
    const ws = new WebSocket(telemetryUrl());
    socket = ws;

    ws.onopen = () => {
      retry = 0;
      set({ status: 'open' });
    };
    ws.onmessage = (msg: MessageEvent<string>) => {
      let event: TelemetryEvent;
      try {
        event = JSON.parse(msg.data) as TelemetryEvent;
      } catch {
        return;
      }
      if (event.type === 'HELLO') {
        // A different server id means the backend restarted: its history is a new universe.
        if (get().serverId !== event.server_id) {
          pending = [];
          set({ ...emptyData(), serverId: event.server_id, lastSeq: 0, selectedAgentId: null, selectedModuleId: null });
        }
        return;
      }
      // Reconnects replay a snapshot; skip what we already applied.
      if (!STICKY_TYPES.has(event.type) && event.seq <= get().lastSeq) return;
      schedule(event);
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      set({ status: 'closed' });
      if (!wanted) return;
      const delay = Math.min(15_000, 500 * 2 ** retry++);
      retryTimer = setTimeout(open, delay);
    };
    ws.onerror = () => ws.close();
  };

  return {
    ...emptyData(),
    status: 'closed',
    serverId: null,
    lastSeq: 0,
    selectedAgentId: null,
    selectedModuleId: null,
    selectionOrigin: 'graph',
    isSimulating: false,

    connect: () => {
      if (wanted) return;
      wanted = true;
      startTicker();
      open();
    },

    disconnect: () => {
      wanted = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = null;
      socket?.close();
      socket = null;
    },

    resync: () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      const old = socket;
      socket = null;
      if (old) {
        // Detach first: its close handler would otherwise schedule a second reconnect.
        old.onopen = old.onmessage = old.onclose = old.onerror = null;
        old.close();
      }
      pending = [];
      // serverId null: the HELLO of the new socket is treated as a fresh server and its replay applied in full.
      set({ ...emptyData(), serverId: null, lastSeq: 0, selectedAgentId: null, selectedModuleId: null, status: 'closed' });
      wanted = true;
      retry = 0;
      startTicker();
      open();
    },

    ingest: (events) => {
      if (events.length === 0) return;
      startTicker();
      const state = get();
      const next = reduce(state, events, Date.now());
      const lastSeq = events.reduce((m, e) => Math.max(m, e.seq), state.lastSeq);
      set({ ...next, lastSeq });
    },

    selectAgent: (id, origin = 'graph') => set({ selectedAgentId: id, ...(id ? { selectedModuleId: null, selectionOrigin: origin } : {}) }),

    selectModule: (id, origin = 'graph') => set({ selectedModuleId: id, ...(id ? { selectedAgentId: null, selectionOrigin: origin } : {}) }),

    // Clearing the floor keeps the module registry (the desks stay; their history resets).
    reset: () => set((s) => ({
      ...emptyData(),
      moduleOrder: s.moduleOrder,
      modules: Object.fromEntries(Object.entries(s.modules).map(([k, m]) => [k, { ...m, totalCalls: 0, errorCount: 0, lastAgent: undefined, lastOperation: undefined }])),
      selectedAgentId: null,
      selectedModuleId: null,
    })),

    setSimulating: (val) => set({ isSimulating: val }),
  };
});
