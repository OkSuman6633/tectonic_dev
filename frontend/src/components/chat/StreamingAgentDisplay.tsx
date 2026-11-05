import React, { useEffect, useRef, useState } from 'react';
import {
  Brain, Network, Search, Shield, Code, GitBranch, ChevronRight, Activity, Lightbulb, ScanSearch,
  CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { ToolCallRecord } from '../../types/telemetry';

// Builder pipeline stages, keyed by the real ADK agent (or tool) names reported over /ws/telemetry.
const STAGES = [
  { id: 'agent_builder', name: 'Orchestrator', icon: Network },
  { id: 'intent_detection', name: 'Intent', icon: Search },
  { id: 'requirement_understanding', name: 'Requirements', icon: Brain },
  { id: 'idea_provider', name: 'Idea Provider', icon: Lightbulb },
  { id: 'design_critic', name: 'Critic', icon: ScanSearch },
  { id: 'guardrails', name: 'Guardrails', icon: Shield, tool: true },
  { id: 'agent_card_manager', name: 'Agent Card', icon: GitBranch },
  { id: 'code_generator', name: 'Code Generator', icon: Code },
] as const;

// What each tool call means, in the user's terms (unknown tools fall back to their name).
const TOOL_LABELS: Record<string, string> = {
  build_status: 'Planning next step',
  start_autopilot: 'Autopilot: building a new agent',
  present_decisions: 'Preparing your choices',
  apply_decisions: 'Applying your choices',
  design_research: 'Researching the design',
  review_design: 'Idea provider + critic review',
  review_code: 'Critic reviewing the code',
  idea_provider: 'Idea provider brainstorming',
  design_critic: 'Critic reviewing',
  compile_specification: 'Compiling the specification',
  intent_detection: 'Understanding your request',
  requirement_understanding: 'Writing the requirements',
  guardrails: 'Safety checks',
  agent_card_manager: 'Designing the agent cards',
  code_generator: 'Generating the code',
  scaffold_project: 'Scaffolding the project',
  write_project_file: 'Writing a file',
  verify_generated_project: 'Verifying the project',
  validate_python_syntax: 'Checking syntax',
  format_python_code: 'Formatting code',
  finalize_build: 'Provisioning on the platform',
  persist_progress: 'Saving progress',
  list_agents: 'Looking for a matching agent',
  ask_agent: 'Asking agent…',
  edit_agent: 'Editing the agent',
  delete_agent: 'Deleting the agent',
};

const labelFor = (call: ToolCallRecord): string => {
  const base = TOOL_LABELS[call.toolName] ?? call.toolName.replace(/_/g, ' ');
  const p = call.payload as Record<string, unknown> | null;
  const detail = p && typeof p === 'object'
    ? (call.toolName === 'ask_agent' && typeof p.agent === 'string' ? `@${p.agent}`
      : call.toolName === 'write_project_file' && typeof p.relative_path === 'string' ? String(p.relative_path).split('/').pop()
        : '')
    : '';
  return detail ? `${base.replace(/…$/, '')} ${detail}` : base;
};

const elapsed = (seconds: number) => (seconds < 60 ? `${seconds.toFixed(seconds < 10 ? 1 : 0)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`);

type StageStatus = 'pending' | 'active' | 'done';

interface Props { isActive: boolean; onPhaseChange?: (phase: string) => void; }

export const StreamingAgentDisplay: React.FC<Props> = ({ isActive, onPhaseChange }) => {
  const [since, setSince] = useState(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const agents = useTelemetryStore((s) => s.agents);
  const toolCalls = useTelemetryStore((s) => s.toolCalls);
  const traces = useTelemetryStore((s) => s.traces);
  const logs = useTelemetryStore((s) => s.logs);
  const logRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) setSince(Date.now() / 1000 - 1);
  }, [isActive]);

  // Running steps show a live clock.
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => setNow(Date.now() / 1000), 500);
    return () => clearInterval(t);
  }, [isActive]);

  const root = agents.agent_builder;
  const statusOf = (stage: (typeof STAGES)[number]): StageStatus => {
    if ('tool' in stage) {
      const calls = (toolCalls.agent_builder ?? []).filter((c) => c.toolName === stage.id && c.startedAt >= since);
      if (calls.some((c) => c.status === 'running')) return 'active';
      return calls.length > 0 ? 'done' : 'pending';
    }
    const agent = agents[stage.id];
    if (!agent || agent.lastActiveAt < since) return 'pending';
    return agent.state === 'idle' ? 'done' : 'active';
  };
  const statuses = STAGES.map(statusOf);

  // The deepest busy stage is the one doing the work (the orchestrator waits on its sub-agents).
  let currentIdx = -1;
  statuses.forEach((s, i) => { if (s === 'active') currentIdx = i; });
  const current = currentIdx >= 0 ? STAGES[currentIdx] : STAGES[0];

  useEffect(() => {
    if (isActive && currentIdx >= 0) onPhaseChange?.(STAGES[currentIdx].id);
  }, [isActive, currentIdx, onPhaseChange]);

  // Every tool call of this turn (Builder and its specialists), oldest first.
  const steps = Object.values(toolCalls).flat()
    .filter((c) => c.startedAt >= since)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-12);

  const recent = logs.filter((l) => l.timestamp >= since).slice(-8);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [recent.length]);
  useEffect(() => { if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight; }, [steps.length]);

  if (!isActive) return null;

  let statusLine = 'Waiting for the orchestrator…';
  if ('tool' in current && current.tool) {
    statusLine = 'Running deterministic guardrail checks';
  } else {
    const agent = agents[current.id];
    const lastText = traces[current.id]?.at(-1)?.text.trim().split('\n').at(-1) ?? '';
    if (agent?.state === 'tool_execution' && agent.stateDetail) statusLine = TOOL_LABELS[agent.stateDetail] ?? `Calling ${agent.stateDetail}`;
    else if (lastText) statusLine = lastText;
    else if (root) statusLine = 'Thinking…';
  }

  return (
    <div className="space-y-3">
      {/* Agent Pipeline */}
      <div className="flex items-center gap-1 p-2 bg-slate-800/40 rounded-lg overflow-x-auto">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const status = statuses[i];
          return (
            <React.Fragment key={stage.id}>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                status === 'active' ? 'bg-sky-500/20 border border-sky-500/50' :
                status === 'done' ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
                <Icon className={`w-3 h-3 ${status === 'active' ? 'text-sky-400 animate-pulse' : status === 'done' ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span className={`text-[9px] font-medium whitespace-nowrap ${status === 'active' ? 'text-sky-300' : status === 'done' ? 'text-emerald-300' : 'text-slate-600'}`}>{stage.name}</span>
              </div>
              {i < STAGES.length - 1 && <ChevronRight className={`w-3 h-3 flex-shrink-0 ${status === 'done' ? 'text-emerald-500' : 'text-slate-700'}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current Agent Status */}
      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 rounded-lg border border-sky-500/20">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center animate-pulse">
          {React.createElement(current.icon, { className: 'w-5 h-5 text-white' })}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-sky-300">{current.name}</div>
          <div className="text-xs text-slate-400 font-mono truncate">{statusLine}<span className="animate-pulse">▋</span></div>
        </div>
        <Activity className="w-5 h-5 text-sky-400 animate-pulse" />
      </div>

      {/* Live step timeline: what actually ran in this turn */}
      {steps.length > 0 && (
        <div ref={timelineRef} className="max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02] p-2">
          <ol className="relative space-y-1.5 border-l border-white/10 ml-1.5 pl-3">
            {steps.map((c) => {
              const secs = c.status === 'running' ? Math.max(0, now - c.startedAt) : (c.durationMs ?? 0) / 1000;
              return (
                <li key={c.callId} className="relative flex items-center gap-2 text-[11px]">
                  <span className="absolute -left-[19px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-studio-card">
                    {c.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
                      : c.status === 'error' ? <XCircle className="h-3 w-3 text-red-400" />
                        : <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                  </span>
                  <span className={`truncate ${c.status === 'running' ? 'text-sky-200' : c.status === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
                    {labelFor(c)}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{secs > 0 ? elapsed(secs) : ''}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Live event stream (same feed as the Command Center ticker) */}
      <div ref={logRef} className="h-20 p-2 bg-slate-900/50 rounded-lg border border-white/5 overflow-y-auto text-[10px] font-mono space-y-0.5 scrollbar-thin">
        {recent.map((l, i) => (
          <div key={l.seq} className={`truncate ${i === recent.length - 1 ? 'text-sky-400' : 'text-slate-500'}`}>
            [{new Date(l.timestamp * 1000).toLocaleTimeString()}] {l.text}
          </div>
        ))}
        {recent.length === 0 && <div className="text-slate-600 animate-pulse">Waiting for agent telemetry…</div>}
      </div>
    </div>
  );
};
