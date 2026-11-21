import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, Database, Layers, ShieldCheck, Workflow, type LucideIcon } from 'lucide-react';
import { moduleNodeId, useTelemetryStore } from '../../store/useTelemetryStore';
import type { ModuleState } from '../../types/telemetry';
import { MODULE_NODE_HEIGHT, MODULE_NODE_WIDTH } from './graphLayout';

export type ModuleNodeData = { moduleId: string };
export type ModuleFlowNode = Node<ModuleNodeData, 'module'>;

export const MODULE_STATE_STYLES: Record<ModuleState, { label: string; color: string; text: string }> = {
  offline: { label: 'Offline', color: '#64748b', text: 'text-slate-500' },
  booting: { label: 'Spinning up', color: '#2DD4FF', text: 'text-sky-300' },
  idle: { label: 'Ready', color: '#34D399', text: 'text-emerald-400' },
  busy: { label: 'Serving', color: '#A78BFA', text: 'text-violet-300' },
  error: { label: 'Error', color: '#FB7185', text: 'text-rose-400' },
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
  safety: ShieldCheck,
  understanding: Brain,
  memory: Database,
  execution: Workflow,
};

const EMPTY: number[] = new Array(24).fill(0);
/** Module calls often finish in a few ms; keep a desk visibly "serving" briefly so activity is perceptible. */
const SERVING_LINGER_MS = 1100;

function useRecentlyServing(moduleId: string): boolean {
  const lastCall = useTelemetryStore((s) => {
    const calls = s.moduleCalls[moduleId];
    return calls && calls.length ? calls[calls.length - 1].callId : null;
  });
  const [serving, setServing] = useState(false);
  useEffect(() => {
    if (!lastCall) return;
    setServing(true);
    const t = setTimeout(() => setServing(false), SERVING_LINGER_MS);
    return () => clearTimeout(t);
  }, [lastCall]);
  return serving;
}

function ActivityBars({ series, color }: { series: number[]; color: string }) {
  const max = useMemo(() => Math.max(4, ...series), [series]);
  return (
    <div className="flex h-5 items-end gap-[2px]" aria-hidden>
      {series.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm transition-[height] duration-300"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: v > 0 ? 0.85 : 0.18 }}
        />
      ))}
    </div>
  );
}

function ModuleNodeImpl({ data, selected }: NodeProps<ModuleFlowNode>) {
  const mod = useTelemetryStore((s) => s.modules[data.moduleId]);
  const series = useTelemetryStore((s) => s.activity[moduleNodeId(data.moduleId)]) ?? EMPTY;
  const recentlyServing = useRecentlyServing(data.moduleId);
  if (!mod) return null;

  const shownState = mod.state === 'idle' && recentlyServing ? 'busy' : mod.state;
  const style = MODULE_STATE_STYLES[shownState];
  const Icon = CATEGORY_ICON[mod.category] ?? Layers;
  const live = shownState === 'busy' || shownState === 'booting';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: mod.state === 'offline' ? 0.6 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      style={{
        width: MODULE_NODE_WIDTH,
        height: MODULE_NODE_HEIGHT,
        boxShadow: `0 0 0 1px ${selected ? style.color : 'transparent'}, 0 6px 22px -10px ${live ? style.color : 'transparent'}`,
      }}
      className="relative overflow-hidden rounded-lg border border-dashed border-studio-border bg-studio-surface/95 px-3 py-2.5 font-sans select-none"
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500/50" />

      {/* Spinning-up sweep */}
      <AnimatePresence>
        {mod.state === 'booting' && (
          <motion.span
            key="sweep"
            className="absolute inset-y-0 w-1/3"
            style={{ background: `linear-gradient(90deg, transparent, ${style.color}33, transparent)` }}
            initial={{ x: '-100%' }}
            animate={{ x: '300%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </AnimatePresence>

      <div className="relative flex items-center gap-2">
        <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-studio-border bg-studio-card">
          <Icon className="h-3.5 w-3.5" style={{ color: style.color }} />
          {mod.activeCalls > 0 && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-sky-500 px-1 font-mono text-[8.5px] font-bold leading-[14px] text-white">
              {mod.activeCalls}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-[var(--studio-text)]">{mod.label}</div>
          <div className={`flex items-center gap-1 font-mono text-[9.5px] ${style.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse' : ''}`} style={{ background: style.color }} />
            {style.label}
            {shownState === 'busy' && mod.lastOperation && <span className="truncate text-[var(--studio-text-muted)]">· {mod.lastOperation}</span>}
          </div>
        </div>
      </div>

      <div className="relative mt-2 flex items-end justify-between gap-2">
        <div className="font-mono text-[9.5px] leading-tight text-[var(--studio-text-muted)]">
          <div>{mod.totalCalls} calls{mod.errorCount ? <span className="text-rose-400"> · {mod.errorCount} err</span> : null}</div>
          <div className="max-w-[110px] truncate" title={mod.lastAgent}>{mod.lastAgent ? `last: ${mod.lastAgent}` : 'shared module'}</div>
        </div>
        <ActivityBars series={series.slice(-16)} color={style.color} />
      </div>
    </motion.div>
  );
}

export const ModuleNode = memo(ModuleNodeImpl);
