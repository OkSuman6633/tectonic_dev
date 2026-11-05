import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, Code2, Loader2, Radio, Users, X, XCircle } from 'lucide-react';
import { useTelemetryStore, type SelectionOrigin } from '../../store/useTelemetryStore';
import type { ModuleCallRecord } from '../../types/telemetry';
import { JsonTree } from './JsonTree';
import { MODULE_STATE_STYLES } from './ModuleNode';
import { formatClock } from './agentStateStyles';

type Tab = 'calls' | 'api' | 'agents';
const EMPTY_CALLS: ModuleCallRecord[] = [];

function CallRow({ call, onAgent }: { call: ModuleCallRecord; onAgent: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const icon =
    call.status === 'running' ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-400" />
    : call.status === 'error' ? <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
    : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-studio-border bg-studio-surface/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        {icon}
        <span className="shrink-0 font-mono text-[11.5px] text-[var(--studio-text)]">{call.operation}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[var(--studio-text-muted)]">{call.summary ?? '…'}</span>
        <span className="shrink-0 font-mono text-[10px] text-[var(--studio-text-muted)]">
          {call.durationMs != null ? `${call.durationMs}ms` : formatClock(call.startedAt)}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 border-t border-studio-border px-3 py-2 font-mono text-[11px]">
              <div className="text-[10px] text-[var(--studio-text-muted)]">
                called by{' '}
                <button type="button" onClick={() => onAgent(call.agentId)} className="text-sky-300 hover:underline">{call.agentId}</button>
                {' '}at {formatClock(call.startedAt)}
              </div>
              <div>
                <div className="mb-0.5 text-[9.5px] uppercase tracking-wider text-[var(--studio-text-muted)]">Payload</div>
                <JsonTree value={call.payload} defaultExpandDepth={2} />
              </div>
              <div>
                <div className="mb-0.5 text-[9.5px] uppercase tracking-wider text-[var(--studio-text-muted)]">{call.status === 'error' ? 'Error' : 'Result'}</div>
                {call.status === 'running' ? <span className="text-slate-500">pending…</span>
                  : call.status === 'error' ? <span className="whitespace-pre-wrap text-rose-300">{call.error}</span>
                  : <JsonTree value={call.result} defaultExpandDepth={2} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ModuleTelemetryPanel({ host = 'graph' }: { host?: SelectionOrigin }) {
  const selectedId = useTelemetryStore((s) => s.selectedModuleId);
  const origin = useTelemetryStore((s) => s.selectionOrigin);
  const mod = useTelemetryStore((s) => (s.selectedModuleId ? s.modules[s.selectedModuleId] : undefined));
  const calls = useTelemetryStore((s) => (s.selectedModuleId ? s.moduleCalls[s.selectedModuleId] : undefined)) ?? EMPTY_CALLS;
  const selectModule = useTelemetryStore((s) => s.selectModule);
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const [tab, setTab] = useState<Tab>('calls');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectModule(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectModule]);

  const clients = useMemo(() => {
    const byAgent = new Map<string, { calls: number; errors: number; ops: Set<string> }>();
    for (const c of calls) {
      const row = byAgent.get(c.agentId) ?? { calls: 0, errors: 0, ops: new Set<string>() };
      row.calls += 1;
      if (c.status === 'error') row.errors += 1;
      row.ops.add(c.operation);
      byAgent.set(c.agentId, row);
    }
    return [...byAgent.entries()].sort((a, b) => b[1].calls - a[1].calls);
  }, [calls]);

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'calls', label: `Live calls${calls.length ? ` · ${calls.length}` : ''}`, icon: <Radio className="h-3.5 w-3.5" /> },
    { id: 'api', label: 'API', icon: <Code2 className="h-3.5 w-3.5" /> },
    { id: 'agents', label: `Clients${clients.length ? ` · ${clients.length}` : ''}`, icon: <Users className="h-3.5 w-3.5" /> },
  ];

  return (
    <AnimatePresence>
      {selectedId && origin === host && mod && (
        <motion.aside
          key="module-panel"
          initial={{ x: '100%', opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0.6 }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="absolute bottom-0 right-0 top-0 z-20 flex w-[min(480px,92%)] flex-col border-l border-studio-border bg-[var(--popover-bg)] shadow-2xl backdrop-blur-2xl backdrop-saturate-150"
        >
          <header className="border-b border-studio-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: MODULE_STATE_STYLES[mod.state].color }} />
              <h2 className="flex-1 truncate text-sm font-semibold text-[var(--studio-text)]">{mod.label}</h2>
              <span className="rounded border border-studio-border px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-[var(--studio-text-muted)]">
                {mod.category}
              </span>
              <button type="button" onClick={() => selectModule(null)} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" title="Close (Esc)">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--studio-text-muted)]">
              <span className={MODULE_STATE_STYLES[mod.state].text}>{MODULE_STATE_STYLES[mod.state].label}{mod.stateDetail ? ` · ${mod.stateDetail}` : ''}</span>
              <span>{mod.totalCalls} calls</span>
              <span>{mod.activeCalls} in flight</span>
              {mod.errorCount > 0 && <span className="text-rose-400">{mod.errorCount} errors</span>}
            </div>
            {mod.description && <p className="mt-1.5 text-[11px] text-[var(--studio-text-secondary)]">{mod.description}</p>}
          </header>

          <nav className="flex gap-1 border-b border-studio-border px-2 pt-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-2.5 pb-2 pt-1 text-[11px] font-medium transition-colors ${
                  tab === t.id ? 'text-[var(--studio-text)]' : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text-secondary)]'
                }`}
              >
                {t.icon}
                {t.label}
                {tab === t.id && <motion.span layoutId="module-tab" className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-violet-400" />}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'calls' && (calls.length === 0
              ? <p className="pt-10 text-center text-[11px] text-[var(--studio-text-muted)]">No calls yet. This module boots on first use.</p>
              : <div className="space-y-1.5">{[...calls].reverse().map((c) => <CallRow key={c.callId} call={c} onAgent={selectAgent} />)}</div>)}

            {tab === 'api' && (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--studio-text-secondary)]">
                  Python: <code className="font-mono text-sky-300">get_runtime().invoke("{mod.id}", op, payload, ctx)</code>
                </p>
                {mod.operations.map((op) => (
                  <div key={op.name} className="rounded-lg border border-studio-border bg-studio-surface/60 px-3 py-2">
                    <div className="font-mono text-[11.5px] text-[var(--studio-text)]">
                      {op.name}
                      <span className="text-[var(--studio-text-muted)]">
                        ({op.params.map((p) => `${p.name}${p.required ? '' : '?'}`).join(', ')})
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--studio-text-secondary)]">{op.summary}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'agents' && (clients.length === 0
              ? <p className="pt-10 text-center text-[11px] text-[var(--studio-text-muted)]">No agent has used this module yet.</p>
              : (
                <div className="space-y-1.5">
                  {clients.map(([agentId, row]) => (
                    <button
                      key={agentId}
                      type="button"
                      onClick={() => selectAgent(agentId)}
                      className="flex w-full items-center gap-3 rounded-lg border border-studio-border bg-studio-surface/60 px-3 py-2 text-left hover:border-sky-500/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[11.5px] text-[var(--studio-text)]">{agentId}</span>
                        <span className="block truncate font-mono text-[10px] text-[var(--studio-text-muted)]">{[...row.ops].join(', ')}</span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-[var(--studio-text-secondary)]">{row.calls}</span>
                      {row.errors > 0 && <span className="font-mono text-[10px] text-rose-400">{row.errors} err</span>}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
