import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Search, FileText, Code, Shield, Zap, CheckCircle, XCircle, Clock, Loader2, Bot, Sparkles } from 'lucide-react';
import clsx from 'clsx';

const getTaskIcon = (name) => {
  const n = name.toLowerCase();
  if (n.includes('research') || n.includes('search')) return Search;
  if (n.includes('report') || n.includes('document')) return FileText;
  if (n.includes('code') || n.includes('implement')) return Code;
  if (n.includes('security') || n.includes('validate')) return Shield;
  return Zap;
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'completed': return CheckCircle;
    case 'failed': return XCircle;
    case 'running': return Loader2;
    default: return Clock;
  }
};

const getStatusColor = (status) => {
  switch (status) {
    case 'completed': return 'text-green-400 bg-green-500/20';
    case 'failed': return 'text-red-400 bg-red-500/20';
    case 'running': return 'text-blue-400 bg-blue-500/20';
    default: return 'text-slate-400 bg-slate-500/20';
  }
};

const AgentNode = memo(({ data, selected }) => {
  const { name, description, status, risk, capabilities, onClick } = data;
  const TaskIcon = getTaskIcon(name);
  const StatusIcon = getStatusIcon(status);
  const isRunning = status === 'running';
  const isCompleted = status === 'completed';
  
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => onClick?.(data)}
      className={clsx('relative w-64 rounded-2xl p-4 cursor-pointer agent-node', status, selected && 'ring-2 ring-brain-500', isRunning && 'node-active')}
    >
      {(isRunning || isCompleted) && <div className={clsx('absolute inset-0 rounded-2xl opacity-20 blur-xl', isRunning ? 'bg-blue-500' : 'bg-green-500')} />}
      
      <div className="relative flex items-start gap-3 mb-3">
        <motion.div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-brain-500/20 to-agent-500/20 border border-white/10"
          animate={isRunning ? { boxShadow: ['0 0 0 rgba(59,130,246,0)', '0 0 20px rgba(59,130,246,0.5)', '0 0 0 rgba(59,130,246,0)'] } : {}}
          transition={{ duration: 1.5, repeat: isRunning ? Infinity : 0 }}>
          <TaskIcon className="w-6 h-6 text-brain-300" />
        </motion.div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-sm truncate">{name}</h3>
          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1', getStatusColor(status))}>
            <StatusIcon className={clsx('w-3 h-3', isRunning && 'animate-spin')} />
            {status || 'pending'}
          </span>
        </div>
        <Bot className="absolute -top-2 -right-2 w-5 h-5 text-agent-400" />
      </div>
      
      {description && <p className="text-xs text-white/60 line-clamp-2 mb-3">{description}</p>}
      
      <div className="flex items-center justify-between">
        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', risk === 'high' ? 'bg-red-500/20 text-red-400' : risk === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400')}>
          {risk || 'moderate'} risk
        </span>
        {capabilities?.length > 0 && <div className="flex items-center gap-1 text-xs text-white/40"><Sparkles className="w-3 h-3" /><span>{capabilities.length}</span></div>}
      </div>
      
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-agent-500 !border-2 !border-agent-300" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-agent-500 !border-2 !border-agent-300" />
    </motion.div>
  );
});

export default AgentNode;
