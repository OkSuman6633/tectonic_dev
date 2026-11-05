import React from 'react';
import { getBezierPath } from '@xyflow/react';
import { motion } from 'framer-motion';

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = data?.active;
  const isCompleted = data?.completed;

  return (
    <g>
      {/* Base edge */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: isCompleted ? '#22c55e' : isActive ? '#3b82f6' : '#475569',
          strokeWidth: isActive ? 3 : 2,
          fill: 'none',
          filter: isActive ? 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))' : 'none',
        }}
      />
      
      {/* Animated flow particles */}
      {isActive && (
        <>
          <motion.circle
            r="4"
            fill="#3b82f6"
            filter="url(#glow)"
            initial={{ offsetDistance: '0%' }}
            animate={{ offsetDistance: '100%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            style={{ offsetPath: `path('${edgePath}')` }}
          />
          <motion.circle
            r="4"
            fill="#60a5fa"
            filter="url(#glow)"
            initial={{ offsetDistance: '0%' }}
            animate={{ offsetDistance: '100%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear', delay: 0.5 }}
            style={{ offsetPath: `path('${edgePath}')` }}
          />
          <motion.circle
            r="4"
            fill="#93c5fd"
            filter="url(#glow)"
            initial={{ offsetDistance: '0%' }}
            animate={{ offsetDistance: '100%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear', delay: 1 }}
            style={{ offsetPath: `path('${edgePath}')` }}
          />
        </>
      )}
      
      {/* Dashed animation for pending */}
      {!isActive && !isCompleted && (
        <path
          d={edgePath}
          fill="none"
          stroke="#64748b"
          strokeWidth="2"
          strokeDasharray="8 8"
          className="flow-edge-animated"
          style={{ opacity: 0.5 }}
        />
      )}
      
      {/* Glow filter */}
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </g>
  );
}
