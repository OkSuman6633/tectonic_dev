import { memo } from 'react';
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { shallow } from 'zustand/shallow';
import { useTelemetryStore } from '../../store/useTelemetryStore';

export type PacketEdgeData = { lateral?: boolean; module?: boolean };
export type PacketFlowEdge = Edge<PacketEdgeData, 'packet'>;

const TRAVEL_S = 1.15;

function PacketEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<PacketFlowEdge>) {
  const packets = useTelemetryStore((s) => s.packets.filter((p) => p.edgeId === id), shallow);
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const live = packets.length > 0;
  const accent = data?.module ? '#a78bfa' : '#38bdf8';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: live ? accent : 'var(--studio-border)',
          strokeWidth: live ? 1.8 : data?.module ? 0.9 : 1.2,
          strokeDasharray: data?.lateral ? '4 4' : data?.module ? '2 5' : undefined,
          opacity: data?.module && !live ? 0.55 : 1,
          transition: 'stroke 300ms ease, stroke-width 300ms ease',
        }}
      />
      {packets.map((p) => (
        <g key={p.key}>
          <title>{p.label}</title>
          <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur={`${TRAVEL_S}s`} fill="freeze" />
          <circle r={7} fill={accent} opacity={0.25} style={{ filter: 'blur(3px)' }}>
            <animateMotion dur={`${TRAVEL_S}s`} path={path} keyPoints={p.reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" fill="freeze" />
          </circle>
          <circle r={3} fill="#f5f3ff" stroke={accent} strokeWidth={1.2}>
            <animateMotion dur={`${TRAVEL_S}s`} path={path} keyPoints={p.reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" fill="freeze" />
          </circle>
        </g>
      ))}
    </>
  );
}

export const PacketEdge = memo(PacketEdgeImpl);
