import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
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
      title={entry.text}
      onClick={() => entry.agentId && onSelect(entry.agentId)}
      className="flex w-full min-w-0 items-baseline gap-2 truncate px-3 py-[3px] text-left text-[11px] transition-colors hover:bg-white/[0.03]"
    >
      <span className="event-log-mono shrink-0 tabular-nums text-[var(--studio-text-muted)]">{formatClock(entry.timestamp)}</span>
      <span className={`event-log-mono w-12 shrink-0 text-[9.5px] font-semibold tracking-wider ${style.className}`}>{style.tag}</span>
      <span className="playfair-display-platform truncate text-[var(--studio-text-secondary)]">{entry.text}</span>
    </button>
  );
});

/** One-line, animated "latest event" live ticker banner. */
export function LatestEvent({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  const latest = useTelemetryStore((s) => s.logs[s.logs.length - 1]);
  const count = useTelemetryStore((s) => s.logs.length);
  const status = useTelemetryStore((s) => s.status);
  const isSimulating = useTelemetryStore((s) => s.isSimulating);
  const activeRuns = useTelemetryStore((s) => s.activeRuns);
  const isLive = status === 'open' || isSimulating || activeRuns > 0;

  return (
    <div className="flex h-full w-full min-w-0 items-center gap-2">
      <span className="relative flex h-2 w-2 shrink-0">
        {isLive && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: isSimulating || activeRuns > 0 ? '#38bdf8' : '#34d399' }}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            isSimulating || activeRuns > 0 ? 'bg-sky-400' : status === 'open' ? 'bg-emerald-400' : 'bg-slate-500'
          }`}
        />
      </span>
      <span className="event-log-mono shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--studio-text-muted)]">
        {isSimulating || activeRuns > 0 ? 'LIVE' : status === 'open' ? 'READY' : 'SYNC'}
      </span>
      <span className="event-log-mono shrink-0 text-[10px] tabular-nums text-[var(--studio-text-muted)]">({count})</span>
      <div className="relative h-6 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {latest ? (
            <motion.div
              key={latest.id ?? `${latest.seq}-${latest.timestamp}`}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 flex items-center"
            >
              <Line entry={latest} onSelect={onSelectAgent} />
            </motion.div>
          ) : (
            <div className="flex h-full items-center px-2 font-mono text-[11px] text-[var(--studio-text-muted)]">
              Waiting for agent activity…
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const FILTERS: (LogLevel | 'all')[] = ['all', 'spawn', 'state', 'a2a', 'tool', 'module', 'error', 'run'];

/** Full, filterable event log (window body). Auto-follows the live tail unless you scroll up. */
export function EventLog({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  const logs = useTelemetryStore((s) => s.logs);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [isPinned, setIsPinned] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const programmaticScrollRef = useRef(false);

  const visible = useMemo(
    () => (filter === 'all' ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter],
  );

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
      programmaticScrollRef.current = false;
    });
  }, []);

  const pinToLive = useCallback(() => {
    pinnedRef.current = true;
    setIsPinned(true);
    scrollToBottom();
  }, [scrollToBottom]);

  // Keep tail pinned as new events stream in
  useLayoutEffect(() => {
    if (pinnedRef.current) {
      scrollToBottom();
    }
  }, [visible, scrollToBottom]);

  // Also stay pinned if the window itself is resized
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  return (
    <div className="relative flex h-full flex-col">
      {/* Live ticker banner inside the Event Log window */}
      <div className="flex h-8 shrink-0 items-center border-b border-studio-border bg-white/[0.02] px-3">
        <LatestEvent onSelectAgent={onSelectAgent} />
      </div>

      {/* Category filters */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-studio-border px-2 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              pinnedRef.current = true;
              setIsPinned(true);
            }}
            className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 font-mono text-[10px] font-medium uppercase leading-none tracking-wider transition-colors ${
              filter === f
                ? 'bg-sky-400/15 text-sky-300'
                : 'text-[var(--studio-text-muted)] hover:bg-white/[0.04] hover:text-[var(--studio-text-secondary)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Scrollable live event list */}
      <div
        ref={listRef}
        onScroll={(e) => {
          if (programmaticScrollRef.current) return;
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
          if (pinnedRef.current !== atBottom) {
            pinnedRef.current = atBottom;
            setIsPinned(atBottom);
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto py-1"
      >
        {visible.length === 0 ? (
          <p className="px-3 pt-6 text-center text-[11.5px] text-[var(--studio-text-muted)]">No events yet.</p>
        ) : (
          visible.map((entry, idx) => (
            <Line key={entry.id ?? `${entry.seq}-${idx}`} entry={entry} onSelect={onSelectAgent} />
          ))
        )}
      </div>

      {/* Resume live auto-scroll pill when user scrolls up */}
      {!isPinned && visible.length > 0 && (
        <button
          type="button"
          onClick={pinToLive}
          className="absolute bottom-2.5 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-studio-surface/95 px-2.5 py-1 font-mono text-[10px] font-medium text-sky-300 shadow-lg backdrop-blur-md transition-colors hover:bg-sky-400/20"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live · Latest
          <ArrowDown className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
