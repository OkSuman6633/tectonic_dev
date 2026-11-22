import type { AgentState } from '../../types/telemetry';

export interface StateStyle {
  label: string;
  color: string; // ring / sparkline stroke
  glow: string; // box-shadow color
  text: string; // tailwind text class
  pulse: boolean;
}

export const STATE_STYLES: Record<AgentState, StateStyle> = {
  idle: { label: 'Ready', color: '#34D399', glow: 'rgba(52,211,153,0.28)', text: 'text-emerald-400', pulse: false },
  running: { label: 'Running', color: '#60A5FA', glow: 'rgba(96,165,250,0.4)', text: 'text-blue-400', pulse: true },
  thinking: { label: 'Thinking', color: '#FBBF24', glow: 'rgba(251,191,36,0.38)', text: 'text-amber-400', pulse: true },
  waiting: { label: 'Waiting', color: '#A78BFA', glow: 'rgba(167,139,250,0.38)', text: 'text-violet-400', pulse: true },
  tool_execution: { label: 'Running', color: '#60A5FA', glow: 'rgba(96,165,250,0.4)', text: 'text-blue-400', pulse: true },
  error: { label: 'Failed', color: '#FB7185', glow: 'rgba(251,113,133,0.4)', text: 'text-rose-400', pulse: false },
  failed: { label: 'Failed', color: '#FB7185', glow: 'rgba(251,113,133,0.4)', text: 'text-rose-400', pulse: false },
  disabled: { label: 'Disabled', color: '#94A3B8', glow: 'rgba(148,163,184,0.24)', text: 'text-slate-400', pulse: false },
  offline: { label: 'Offline', color: '#64748B', glow: 'rgba(100,116,139,0.24)', text: 'text-slate-500', pulse: false },
};

export const normalizeAgentState = (state: AgentState | string): StateStyle => {
  if (state in STATE_STYLES) return STATE_STYLES[state as AgentState];
  return STATE_STYLES.offline;
};

export const formatDuration = (durationMs: number): string => {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '—';
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(2)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = (durationMs % 60_000) / 1000;
  return `${minutes}m ${seconds.toFixed(2)}s`;
};

export const formatClock = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const formatCount = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : `${n}`;

// ---- Agent roles: one definition shared by the graph, roster and 3D office ------------------
export type AgentRole = 'builder' | 'specialist' | 'worker';

export const BUILDER_ID = 'agent_builder';
const BUILDER_SPECIALISTS = new Set(['intent_detection', 'requirement_understanding', 'agent_card_manager', 'code_generator']);

/** The Builder, its fixed specialist sub-agents, or a worker it generated/spun up. */
export const agentRole = (id: string): AgentRole =>
  id === BUILDER_ID ? 'builder' : BUILDER_SPECIALISTS.has(id) ? 'specialist' : 'worker';

export const ROLE_STYLES: Record<AgentRole, { label: string; color: string; chip: string }> = {
  builder: { label: 'Builder', color: '#2DD4FF', chip: 'border-sky-400/40 bg-sky-400/10 text-sky-300' },
  specialist: { label: 'Specialist', color: '#9BA1B0', chip: 'border-slate-500/40 bg-slate-500/10 text-slate-300' },
  worker: { label: 'Worker', color: '#E8EAF0', chip: 'border-slate-200/30 bg-slate-200/5 text-slate-100' },
};
