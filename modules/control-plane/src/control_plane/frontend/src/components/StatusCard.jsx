import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Coins, Zap, CheckCircle, XCircle, Clock } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';

const statusIcons = {
  planning: Clock,
  executing: Zap,
  completed: CheckCircle,
  failed: XCircle,
};

const statusColors = {
  planning: 'text-yellow-400 bg-yellow-500/10',
  executing: 'text-blue-400 bg-blue-500/10',
  completed: 'text-green-400 bg-green-500/10',
  failed: 'text-red-400 bg-red-500/10',
};

export default function StatusCard() {
  const { missionStatus, missionObjective, budget, completedCount, tasks } = useMissionStore();
  
  if (!missionStatus) {
    return (
      <div className="glass rounded-2xl p-5 text-center">
        <Activity className="w-8 h-8 mx-auto text-white/20 mb-2" />
        <p className="text-sm text-white/40">No active mission</p>
      </div>
    );
  }

  const StatusIcon = statusIcons[missionStatus] || Clock;
  const statusColor = statusColors[missionStatus] || 'text-white/60 bg-white/5';
  const tokensPercent = Math.min((budget.tokensUsed / budget.maxTokens) * 100, 100);
  const callsPercent = Math.min((budget.apiCallsUsed / budget.maxApiCalls) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', statusColor)}>
          <StatusIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate capitalize">{missionStatus}</p>
          <p className="text-xs text-white/50 truncate">{missionObjective?.substring(0, 40)}...</p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-white/50">Tasks</span>
          <span className="text-green-400">{completedCount} / {tasks.length}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-green-500 to-green-400"
            initial={{ width: 0 }}
            animate={{ width: `${tasks.length ? (completedCount / tasks.length) * 100 : 0}%` }}
            transition={{ type: 'spring', stiffness: 100 }}
          />
        </div>
      </div>

      {/* Budget */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-white/50 flex items-center gap-1"><Coins className="w-3 h-3" />Tokens</span>
            <span className="text-brain-400">{budget.tokensUsed.toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-brain-500"
              animate={{ width: `${tokensPercent}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-white/50 flex items-center gap-1"><Zap className="w-3 h-3" />API Calls</span>
            <span className="text-agent-400">{budget.apiCallsUsed}</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-agent-500"
              animate={{ width: `${callsPercent}%` }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
