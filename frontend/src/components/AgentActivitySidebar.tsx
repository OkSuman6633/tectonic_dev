import React from 'react';
import { FileCode, Zap } from 'lucide-react';
import { useAgentStudioStore } from '../store/useAgentStudioStore';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { ROLE_STYLES, STATE_STYLES, agentRole, formatCount } from './command/agentStateStyles';

/** Live roster of every agent reported by /ws/telemetry, ordered as the tree (depth-first). */
export const AgentActivitySidebar: React.FC<{ onSelectAgent: (id: string) => void }> = ({ onSelectAgent }) => {
  const { pendingFiles, isGeneratingAgent } = useAgentStudioStore();
  const agents = useTelemetryStore((s) => s.agents);
  const order = useTelemetryStore((s) => s.agentOrder);
  const selectedId = useTelemetryStore((s) => s.selectedAgentId);

  const rows: { id: string; depth: number }[] = [];
  const visit = (id: string, depth: number) => {
    rows.push({ id, depth });
    order.filter((c) => agents[c]?.parentId === id).forEach((c) => visit(c, depth + 1));
  };
  order.filter((id) => !agents[id]?.parentId || !agents[agents[id].parentId!]).forEach((id) => visit(id, 0));
  const busy = order.some((id) => agents[id]?.state !== 'idle');

  return (
    <div className="flex h-full flex-col p-2.5">
      {busy && (
        <div className="mb-2 flex items-center gap-1.5 px-1 text-[10.5px] text-amber-300">
          <Zap className="h-3 w-3 animate-pulse" /> Agents working
        </div>
      )}

      <div className="space-y-1 overflow-y-auto min-h-0 flex-1">
        {rows.length === 0 && (
          <p className="text-[10.5px] leading-relaxed text-[var(--studio-text-muted)]">
            Agents appear here as they spawn during a run.
          </p>
        )}
        {rows.map(({ id, depth }) => {
          const agent = agents[id];
          const style = STATE_STYLES[agent.state];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectAgent(id)}
              style={{ paddingLeft: 8 + depth * 10 }}
              className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-md border text-left transition-colors ${
                selectedId === id ? 'border-sky-500/40 bg-sky-500/10' : 'border-transparent hover:bg-white/5'
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${style.pulse ? 'animate-pulse' : ''}`}
                style={{ background: style.color, boxShadow: style.pulse ? `0 0 6px ${style.color}` : undefined }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[11px] text-[var(--studio-text)]">{agent.role}</span>
                  <span className={`shrink-0 rounded border px-1 font-mono text-[8px] uppercase tracking-wider ${ROLE_STYLES[agentRole(id)].chip}`}>
                    {ROLE_STYLES[agentRole(id)].label}
                  </span>
                </div>
                <div className={`truncate font-mono text-[9px] ${style.text}`}>
                  {style.label}
                  {agent.tokens.total > 0 && <span className="text-[var(--studio-text-muted)]"> · {formatCount(agent.tokens.total)} tok</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* File Generation Progress */}
      {isGeneratingAgent && pendingFiles.length > 0 && (
        <div className="mt-4 pt-3 border-t border-studio-border">
          <div className="flex items-center gap-2 mb-2">
            <FileCode className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-300">Generating Files</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
            {pendingFiles.map((f) => (
              <div key={f.path} className="text-[9px] font-mono text-slate-500 truncate flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                {f.path.split('/').pop()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
