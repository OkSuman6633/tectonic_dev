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
        <div className="typo-status mb-2 flex items-center gap-1.5 px-1 text-amber-300">
          <Zap className="h-3 w-3 animate-pulse" /> Agents working
        </div>
      )}

      <div className="space-y-1 overflow-y-auto min-h-0 flex-1">
        {rows.length === 0 && (
          <p className="typo-metadata text-[var(--studio-text-muted)]">
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
              className={`flex min-h-[38px] w-full items-center gap-2 rounded-md border py-1.5 pr-2 text-left transition-colors ${selectedId === id ? 'border-sky-500/40 bg-sky-500/10' : 'border-transparent hover:bg-white/5'
                }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${style.pulse ? 'animate-pulse' : ''}`}
                style={{ background: style.color, boxShadow: style.pulse ? `0 0 6px ${style.color}` : undefined }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="typo-agent-name truncate text-[var(--studio-text)]">{agent.role}</span>
                  <span className={`inline-flex h-[16px] shrink-0 items-center rounded border px-1 font-mono text-[10px] uppercase leading-none tracking-wider ${ROLE_STYLES[agentRole(id)].chip}`}>
                    {ROLE_STYLES[agentRole(id)].label}
                  </span>
                </div>
                <div className={`typo-status truncate ${style.text}`}>
                  {style.label}
                  {agent.tokens.total > 0 && <span className="font-mono font-normal text-[var(--studio-text-muted)]"> · {formatCount(agent.tokens.total)} tok</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 truncate font-mono text-[10px] text-[var(--studio-text-muted)]">
                  <span>{agent.model || 'Model not reported'}</span>
                  <span>· {agent.toolCallCount} tool calls</span>
                  {agent.stub && <span>· snapshot incomplete</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* File Generation Progress */}
      {isGeneratingAgent && pendingFiles.length > 0 && (
        <div className="mt-4 pt-3 border-t border-studio-border">
          <div className="mb-2 flex items-center gap-2">
            <FileCode className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="typo-status text-emerald-300">Generating Files</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
            {pendingFiles.map((f) => (
              <div key={f.path} className="typo-code flex items-center gap-1 truncate text-slate-500">
                <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                {f.path.split('/').pop()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
