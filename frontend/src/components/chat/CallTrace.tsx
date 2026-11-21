import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import type { TraceStep } from '../../types/agent';

/** Builder pipeline tools that are really specialist agents (AgentTool): show them as agents. */
const AGENT_TOOLS = new Set(['intent_detection', 'requirement_understanding', 'agent_card_manager', 'code_generator', 'ask_agent']);

const statusTone = (status?: string) =>
  !status ? 'text-slate-500' : status === 'error' ? 'text-rose-400' : status === 'success' || status === 'done' ? 'text-emerald-400' : 'text-amber-300';

/** Which agents and tools ran for one chat turn: a one-line route, expandable to every step. */
export const CallTrace: React.FC<{ steps: TraceStep[] }> = ({ steps }) => {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  // Route summary: every agent that took part, in order (agent hops + specialist tools + nested agents).
  const route: string[] = [];
  for (const s of steps) {
    const who = s.type === 'agent' ? s.agent : s.name && AGENT_TOOLS.has(s.name) && s.name !== 'ask_agent' ? s.name : null;
    if (who && route[route.length - 1] !== who) route.push(who);
  }
  const toolCount = steps.filter((s) => s.type === 'tool').length;

  return (
    <div className="mt-2.5 rounded-lg border border-white/5 bg-black/10 text-[11px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-slate-400 hover:text-slate-200"
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <span className="font-medium shrink-0">Call trace</span>
        <span className="truncate font-mono text-sky-300/80">{route.join(' → ')}</span>
        <span className="ml-auto shrink-0 text-slate-500">{toolCount} call{toolCount === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <ol className="px-2.5 pb-2 space-y-1 max-h-64 overflow-auto">
          {steps.map((s, i) => (
            <li key={i} className={`flex items-start gap-1.5 ${s.nested ? 'pl-4 border-l border-sky-500/20 ml-1' : ''}`}>
              {s.type === 'agent' || (s.name && AGENT_TOOLS.has(s.name)) ? (
                <Bot className="w-3 h-3 mt-0.5 shrink-0 text-indigo-300" />
              ) : (
                <Wrench className="w-3 h-3 mt-0.5 shrink-0 text-slate-500" />
              )}
              {s.type === 'agent' ? (
                <span className="text-slate-200">
                  <span className="font-mono text-indigo-200">{s.agent}</span>
                  {s.detail && <span className="text-slate-500"> · {s.detail}</span>}
                </span>
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-slate-200">{s.name}</span>
                  {s.args && s.args !== '{}' && <span className="font-mono text-slate-500 break-all"> {s.args}</span>}
                </span>
              )}
              {s.type === 'tool' && <span className={`shrink-0 font-mono ${statusTone(s.status)}`}>{s.status ?? '…'}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
