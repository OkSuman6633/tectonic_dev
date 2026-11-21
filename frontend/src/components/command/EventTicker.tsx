import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { LogEntry, LogLevel } from '../../types/telemetry';
import { formatClock } from './agentStateStyles';

export const LEVEL_STYLE: Record<LogLevel, { tag: string; className: string }> = {
  spawn: { tag: 'SPAWN', className: 'text-indigo-300' },
  state: { tag: 'STATE', className: 'text-emerald-400' },
  tool: { tag: 'TOOL', className: 'text-blue-400' },
  a2a: { tag: 'A2A', className: 'text-sky-300' },
  error: { tag: 'ERROR', className: 'text-rose-400' },
  run: { tag: 'RUN', className: 'text-amber-300' },
  module: { tag: 'MODULE', className: 'text-violet-300' },
};

const Line = memo(function Line({ entry, onSelect }: { entry: LogEntry; onSelect: (id: string) => void }) {
  const style = LEVEL_STYLE[entry.level];
  return (
    <button
      type="button"
      onClick={() => entry.agentId && onSelect(entry.agentId)}
      className="flex w-full min-w-0 items-baseline gap-2 truncate px-3 py-[3px] text-left font-mono text-[11px] transition-colors hover:bg-white/[0.03]"
    >
      <span className="shrink-0 tabular-nums text-[var(--studio-text-muted)]">{formatClock(entry.timestamp)}</span>
      <span className={`w-12 shrink-0 text-[9.5px] font-semibold tracking-wider ${style.className}`}>{style.tag}</span>
      <span className="truncate text-[var(--studio-text-secondary)]">{entry.text}</span>
    </button>
  );
});

/** One-line, animated "latest event" for the dock. */
export function LatestEvent({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  const latest = useTelemetryStore((s) => s.logs[s.logs.length - 1]);
  const count = useTelemetryStore((s) => s.logs.length);
  const status = useTelemetryStore((s) => s.status);
  return (
    <div className="flex h-full w-full min-w-0 items-center gap-2">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'open' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--studio-text-muted)]">{count}</span>
      <div className="relative h-6 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {latest ? (
            <motion.div
              key={latest.seq}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 flex items-center"
            >
              <Line entry={latest} onSelect={onSelectAgent} />
            </motion.div>
          ) : (
            <div className="flex h-full items-center px-3 font-mono text-[11px] text-[var(--studio-text-muted)]">Waiting for agent activity…</div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const FILTERS: (LogLevel | 'all')[] = ['all', 'spawn', 'a2a', 'tool', 'module', 'error', 'run'];

/** Full, filterable event log (window body). Auto-follows the tail unless you scroll up. */
export function EventLog({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  const logs = useTelemetryStore((s) => s.logs);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const visible = useMemo(() => (filter === 'all' ? logs : logs.filter((l) => l.level === filter)), [logs, filter]);

  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [visible]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-studio-border px-2 py-1.5 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors ${
              filter === f ? 'bg-sky-400/15 text-sky-300' : 'text-[var(--studio-text-muted)] hover:bg-white/[0.04] hover:text-[var(--studio-text-secondary)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
        }}
        className="min-h-0 flex-1 overflow-y-auto py-1"
      >
        {visible.length === 0 ? (
          <p className="px-3 pt-6 text-center text-[11.5px] text-[var(--studio-text-muted)]">No events yet.</p>
        ) : (
          visible.map((entry) => <Line key={entry.seq} entry={entry} onSelect={onSelectAgent} />)
        )}
      </div>
    </div>
  );
}
