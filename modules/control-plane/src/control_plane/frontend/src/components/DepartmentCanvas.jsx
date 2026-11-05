import React, { useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, CheckCircle, Clock, Loader2, XCircle, Sparkles, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';
import MissionForm from './MissionForm';

const statusConfig = {
  pending: { color: 'border-gray-300 dark:border-gray-600', bg: 'bg-gray-50 dark:bg-gray-800', icon: Clock, iconColor: 'text-gray-400' },
  running: { color: 'border-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30', icon: Loader2, iconColor: 'text-blue-500', spin: true },
  completed: { color: 'border-green-500', bg: 'bg-green-50 dark:bg-green-900/30', icon: CheckCircle, iconColor: 'text-green-500' },
  failed: { color: 'border-red-500', bg: 'bg-red-50 dark:bg-red-900/30', icon: XCircle, iconColor: 'text-red-500' },
};

function BrainNode({ darkMode, taskCount }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={clsx(
        'w-32 h-32 rounded-full flex flex-col items-center justify-center border-4',
        darkMode ? 'bg-gradient-to-br from-brain-600 to-agent-600 border-brain-400' : 'bg-gradient-to-br from-brain-500 to-agent-500 border-brain-300',
        'shadow-lg shadow-brain-500/30'
      )}
    >
      <Brain className="w-10 h-10 text-white mb-1" />
      <span className="text-white text-xs font-bold">BRAIN</span>
      {taskCount > 0 && <span className="text-white/80 text-xs">{taskCount} tasks</span>}
    </motion.div>
  );
}

function AgentCard({ task, index, darkMode, onClick, isLast }) {
  const config = statusConfig[task.status] || statusConfig.pending;
  const Icon = config.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.15, type: 'spring', stiffness: 200 }}
      className="flex items-center gap-4"
    >
      {/* Connector line */}
      <div className={clsx('w-12 h-0.5', task.status === 'completed' ? 'bg-green-500' : task.status === 'running' ? 'bg-blue-500' : (darkMode ? 'bg-gray-600' : 'bg-gray-300'))} />
      
      {/* Card */}
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onClick(task)}
        className={clsx(
          'cursor-pointer rounded-xl p-4 border-2 min-w-[220px] max-w-[280px] transition-all',
          config.color, config.bg,
          darkMode ? 'shadow-lg shadow-black/20' : 'shadow-md',
          'hover:shadow-xl'
        )}
      >
        <div className="flex items-start justify-between mb-2">
          <div className={clsx('p-2 rounded-lg', darkMode ? 'bg-white/10' : 'bg-white')}>
            <Icon className={clsx('w-5 h-5', config.iconColor, config.spin && 'animate-spin')} />
          </div>
          <span className={clsx('text-xs font-medium px-2 py-1 rounded-full', 
            task.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' :
            task.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' :
            task.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' :
            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          )}>
            {task.status?.toUpperCase()}
          </span>
        </div>
        <h3 className={clsx('font-semibold text-sm mb-1 line-clamp-2', darkMode ? 'text-white' : 'text-gray-900')}>
          {task.name}
        </h3>
        <p className={clsx('text-xs line-clamp-2', darkMode ? 'text-white/60' : 'text-gray-500')}>
          {task.description?.substring(0, 80)}...
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className={clsx('text-xs', darkMode ? 'text-white/40' : 'text-gray-400')}>Click to view output</span>
          <ChevronRight className={clsx('w-4 h-4', darkMode ? 'text-white/40' : 'text-gray-400')} />
        </div>
      </motion.div>
      
      {/* Arrow to next */}
      {!isLast && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.15 + 0.1 }}
          className={clsx('w-8 h-0.5', task.status === 'completed' ? 'bg-green-500' : (darkMode ? 'bg-gray-600' : 'bg-gray-300'))}
        />
      )}
    </motion.div>
  );
}

export default function DepartmentCanvas() {
  const { tasks, darkMode, isExecuting, currentMissionId, selectTask, missionStatus, setShowFinalOutput } = useMissionStore();
  const containerRef = useRef(null);

  // Auto-scroll to show new tasks
  useEffect(() => {
    if (containerRef.current && tasks.length > 0) {
      containerRef.current.scrollTo({ left: containerRef.current.scrollWidth, behavior: 'smooth' });
    }
  }, [tasks.length]);

  // Show final output when mission completes
  useEffect(() => {
    if (missionStatus === 'completed' && tasks.length > 0) {
      setTimeout(() => setShowFinalOutput(true), 500);
    }
  }, [missionStatus, tasks.length, setShowFinalOutput]);

  if (!currentMissionId && tasks.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className={clsx('w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center', darkMode ? 'bg-brain-500/20' : 'bg-brain-100')}>
              <Brain className={clsx('w-10 h-10', darkMode ? 'text-brain-400' : 'text-brain-600')} />
            </div>
            <h2 className={clsx('text-2xl font-bold mb-2', darkMode ? 'text-white' : 'text-gray-900')}>Agents Office</h2>
            <p className={clsx('text-sm', darkMode ? 'text-white/60' : 'text-gray-500')}>Launch a mission to see AI agents work</p>
          </div>
          <MissionForm />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Flow visualization */}
      <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden p-8">
        <div className="flex items-center min-h-full gap-2">
          {/* Brain node */}
          <BrainNode darkMode={darkMode} taskCount={tasks.length} />
          
          {/* Task flow */}
          <AnimatePresence>
            {tasks.map((task, index) => (
              <AgentCard
                key={task.id}
                task={task}
                index={index}
                darkMode={darkMode}
                onClick={selectTask}
                isLast={index === tasks.length - 1}
              />
            ))}
          </AnimatePresence>
          
          {/* Processing indicator */}
          {isExecuting && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-4 ml-4"
            >
              <div className={clsx('w-8 h-0.5', darkMode ? 'bg-brain-500' : 'bg-brain-400')} />
              <div className={clsx('p-4 rounded-xl border-2 border-dashed', darkMode ? 'border-brain-500/50 bg-brain-500/10' : 'border-brain-400 bg-brain-50')}>
                <Loader2 className={clsx('w-6 h-6 animate-spin', darkMode ? 'text-brain-400' : 'text-brain-500')} />
              </div>
            </motion.div>
          )}
        </div>
      </div>
      
      {/* Bottom mission form when active */}
      {currentMissionId && !isExecuting && missionStatus !== 'completed' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 border-t border-gray-200 dark:border-white/10">
          <MissionForm compact />
        </motion.div>
      )}
    </div>
  );
}
