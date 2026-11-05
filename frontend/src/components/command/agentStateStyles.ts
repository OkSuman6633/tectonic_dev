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
  thinking: { label: 'Thinking', color: '#FBBF24', glow: 'rgba(251,191,36,0.38)', text: 'text-amber-400', pulse: true },
  tool_execution: { label: 'Calling tool', color: '#60A5FA', glow: 'rgba(96,165,250,0.4)', text: 'text-blue-400', pulse: true },
  error: { label: 'Error', color: '#FB7185', glow: 'rgba(251,113,133,0.4)', text: 'text-rose-400', pulse: false },
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
