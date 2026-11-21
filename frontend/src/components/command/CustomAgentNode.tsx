import { memo, useMemo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Cpu, Wrench } from 'lucide-react';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { ROLE_STYLES, STATE_STYLES, agentRole, formatCount } from './agentStateStyles';
import { NODE_HEIGHT, NODE_WIDTH } from './graphLayout';

export type AgentNodeData = { agentId: string };
export type AgentFlowNode = Node<AgentNodeData, 'agent'>;

const SPARK_W = 112;
const SPARK_H = 26;

function Sparkline({ series, color }: { series: number[]; color: string }) {
  const { line, area } = useMemo(() => {
    const max = Math.max(4, ...series);
    const step = SPARK_W / Math.max(1, series.length - 1);
    const pts = series.map((v, i) => [i * step, SPARK_H - 2 - (v / max) * (SPARK_H - 4)] as const);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { line: d, area: `${d} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z` };
  }, [series]);
  const gradientId = `spark-${color.slice(1)}`;
  return (
    <svg width={SPARK_W} height={SPARK_H} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const EMPTY_SERIES: number[] = new Array(24).fill(0);

function CustomAgentNodeImpl({ data, selected }: NodeProps<AgentFlowNode>) {
  const agent = useTelemetryStore((s) => s.agents[data.agentId]);
  const series = useTelemetryStore((s) => s.activity[data.agentId]) ?? EMPTY_SERIES;
  const childCount = useTelemetryStore((s) => s.agentOrder.filter((id) => s.agents[id]?.parentId === data.agentId).length);
  if (!agent) return null;

  const style = STATE_STYLES[agent.state];
  const role = agentRole(agent.id);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        boxShadow: `0 0 0 1px ${selected ? style.color : 'transparent'}, 0 8px 28px -10px ${style.glow}`,
      }}
      className="group relative rounded-xl border border-studio-border bg-studio-card/95 backdrop-blur-md px-3.5 py-3 font-sans select-none"
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !border-0 !bg-slate-500/60" />

      {/* State accent rail */}
      <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full" style={{ background: style.color, opacity: 0.85 }} />

      <div className="flex items-start gap-3">
        {/* Status ring */}
        <div className="relative mt-0.5 h-8 w-8 shrink-0">
          {style.pulse && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ border: `1.5px solid ${style.color}` }}
              animate={{ scale: [1, 1.55], opacity: [0.7, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <span className="absolute inset-0 rounded-full" style={{ border: `2px solid ${style.color}` }} />
          <span className="absolute inset-[7px] rounded-full" style={{ background: style.color, opacity: agent.state === 'idle' ? 0.55 : 0.95 }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[12.5px] font-semibold tracking-tight text-[var(--studio-text)]" title={agent.role}>
              {agent.role}
            </span>
            <span className={`shrink-0 rounded border px-1 font-mono text-[8.5px] uppercase tracking-wider ${ROLE_STYLES[role].chip}`}>
              {ROLE_STYLES[role].label}
            </span>
          </div>
          <div className={`mt-0.5 flex items-center gap-1 font-mono text-[10px] ${style.text}`}>
            <span>{style.label}</span>
            {agent.state === 'tool_execution' && agent.stateDetail && (
              <span className="truncate text-[var(--studio-text-secondary)]">· {agent.stateDetail}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1 font-mono text-[9.5px] text-[var(--studio-text-muted)]">
          <span className="flex items-center gap-1" title="Total tokens">
            <Cpu className="h-3 w-3" />
            {formatCount(agent.tokens.total)} tok
          </span>
          <span className="flex items-center gap-1" title="Tool calls">
            <Wrench className="h-3 w-3" />
            {agent.toolCallCount} calls{childCount > 0 ? ` · ${childCount} sub` : ''}
          </span>
        </div>
        <Sparkline series={series} color={style.color} />
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !border-0 !bg-slate-500/60" />
    </motion.div>
  );
}

export const CustomAgentNode = memo(CustomAgentNodeImpl);
