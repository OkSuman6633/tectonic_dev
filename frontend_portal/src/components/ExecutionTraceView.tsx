import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, ShieldAlert, Clock, CheckCircle2, Zap } from 'lucide-react';
import type { ToolCallItem, TraceStepItem, GuardrailItem } from '../types';

interface Props {
  durationMs?: number;
  toolCalls?: ToolCallItem[];
  trace?: TraceStepItem[];
  guardrail?: GuardrailItem;
}

export const ExecutionTraceView: React.FC<Props> = ({
  durationMs,
  toolCalls = [],
  trace = [],
  guardrail,
}) => {
  const [expanded, setExpanded] = useState(false);

  const hasContent = (toolCalls && toolCalls.length > 0) || (trace && trace.length > 0) || !!guardrail;
  if (!hasContent && !durationMs) return null;

  return (
    <div className="mt-2.5 rounded-lg border border-slate-800 bg-slate-900/60 text-xs">
      {/* Header Bar */}
      <div
        onClick={() => hasContent && setExpanded(!expanded)}
        className={`flex items-center justify-between px-3 py-2 ${
          hasContent ? 'cursor-pointer hover:bg-slate-800/40' : ''
        } transition-colors select-none`}
      >
        <div className="flex items-center gap-2 text-slate-400">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-medium text-slate-300">Execution Info</span>
          {durationMs !== undefined && (
            <span className="flex items-center gap-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-400">
              <Clock className="h-3 w-3 text-sky-400" />
              {durationMs}ms
            </span>
          )}
          {toolCalls && toolCalls.length > 0 && (
            <span className="flex items-center gap-1 rounded bg-sky-950/60 border border-sky-800/40 px-1.5 py-0.5 text-[11px] text-sky-300">
              <Wrench className="h-3 w-3" />
              {toolCalls.length} {toolCalls.length === 1 ? 'tool call' : 'tool calls'}
            </span>
          )}
          {guardrail && (
            <span className="flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 text-[11px] text-emerald-300">
              <ShieldAlert className="h-3 w-3" />
              Guardrail Active
            </span>
          )}
        </div>

        {hasContent && (
          <div className="text-slate-400">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-800/80 p-3 space-y-2.5 bg-slate-950/40">
          {/* Guardrail alert if triggered */}
          {guardrail && (
            <div className="rounded border border-emerald-500/20 bg-emerald-950/20 p-2 text-emerald-300">
              <div className="flex items-center gap-1.5 font-medium">
                <ShieldAlert className="h-3.5 w-3.5 text-emerald-400" />
                {guardrail.rule}
              </div>
              <div className="text-[11px] text-emerald-400/80 mt-0.5">{guardrail.reason}</div>
            </div>
          )}

          {/* Tool Calls List */}
          {toolCalls && toolCalls.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Tools Executed:
              </div>
              {toolCalls.map((t, idx) => (
                <div key={idx} className="rounded border border-slate-800 bg-slate-900/80 p-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-sky-300 font-semibold mb-1">
                    <span className="flex items-center gap-1.5">
                      <Wrench className="h-3 w-3 text-sky-400" />
                      {t.toolName}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-normal">
                      <CheckCircle2 className="h-3 w-3" />
                      {t.status || 'success'}
                    </span>
                  </div>
                  {t.params && Object.keys(t.params).length > 0 && (
                    <div className="text-slate-400 text-[10px] truncate">
                      <span className="text-slate-500">Args:</span> {JSON.stringify(t.params)}
                    </div>
                  )}
                  {t.result && (
                    <div className="text-slate-400 text-[10px] truncate mt-0.5">
                      <span className="text-slate-500">Output:</span> {typeof t.result === 'string' ? t.result : JSON.stringify(t.result)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Trace steps */}
          {trace && trace.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Execution Steps:
              </div>
              <div className="divide-y divide-slate-800/60 rounded border border-slate-800/60 bg-slate-900/40">
                {trace.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-800 px-1 py-0.2 font-mono text-[10px] text-slate-400 uppercase">
                        {s.type}
                      </span>
                      <span>{s.agent ? `@${s.agent}` : s.name || s.detail || 'Step'}</span>
                    </div>
                    {s.status && (
                      <span className="text-[10px] text-slate-400 capitalize">{s.status}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

