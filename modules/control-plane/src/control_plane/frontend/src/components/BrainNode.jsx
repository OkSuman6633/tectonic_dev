import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Brain, Sparkles } from 'lucide-react';

const BrainNode = memo(({ data, selected }) => {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className={`
        relative w-48 h-48 rounded-full flex flex-col items-center justify-center
        brain-node cursor-pointer transition-all duration-300
        ${selected ? 'ring-4 ring-brain-400/50' : ''}
      `}
    >
      {/* Glow rings */}
      <div className="absolute inset-0 rounded-full animate-ping-slow opacity-20 bg-brain-500" />
      <div className="absolute inset-4 rounded-full animate-pulse opacity-30 bg-gradient-to-br from-brain-400 to-agent-400" />
      
      {/* Particle effects */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-brain-400"
          animate={{
            y: [-20, -60],
            x: [Math.sin(i * 45 * Math.PI / 180) * 20, Math.sin(i * 45 * Math.PI / 180) * 50],
            opacity: [0, 1, 0],
            scale: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.25,
            ease: 'easeOut',
          }}
        />
      ))}
      
      {/* Icon */}
      <motion.div
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10"
      >
        <Brain className="w-16 h-16 text-brain-300" />
        <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-pulse" />
      </motion.div>
      
      {/* Label */}
      <div className="relative z-10 mt-2 text-center">
        <div className="text-lg font-bold text-white tracking-wide">THE BRAIN</div>
        <div className="text-xs text-brain-300 mt-1">Mission Control</div>
        {data.taskCount > 0 && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mt-2 px-3 py-1 rounded-full bg-brain-500/30 border border-brain-400/50"
          >
            <span className="text-xs font-medium text-brain-200">{data.taskCount} Tasks</span>
          </motion.div>
        )}
      </div>
      
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-4 h-4 !bg-brain-500 !border-2 !border-brain-300"
      />
    </motion.div>
  );
});

BrainNode.displayName = 'BrainNode';

export default BrainNode;
