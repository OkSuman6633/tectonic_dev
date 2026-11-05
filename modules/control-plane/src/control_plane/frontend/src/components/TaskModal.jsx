import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, CheckCircle, XCircle, Clock, Loader2, Shield, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';

export default function TaskModal() {
  const { selectedTask, showTaskModal, closeTaskModal, taskOutputs, darkMode } = useMissionStore();

  if (!showTaskModal || !selectedTask) return null;

  const output = taskOutputs[selectedTask.id];
  const status = selectedTask.status;

  const StatusIcon = {
    completed: CheckCircle,
    failed: XCircle,
    running: Loader2,
    pending: Clock,
  }[status] || Clock;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={closeTaskModal}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className={clsx('w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl', darkMode ? 'glass-strong' : 'bg-white shadow-2xl')}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={clsx('p-6 border-b', darkMode ? 'border-white/10' : 'border-gray-200')}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={clsx(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  status === 'completed' ? (darkMode ? 'bg-green-500/20' : 'bg-green-100') :
                  status === 'failed' ? (darkMode ? 'bg-red-500/20' : 'bg-red-100') :
                  status === 'running' ? (darkMode ? 'bg-blue-500/20' : 'bg-blue-100') : (darkMode ? 'bg-white/5' : 'bg-gray-100')
                )}>
                  <StatusIcon className={clsx(
                    'w-6 h-6',
                    status === 'completed' ? (darkMode ? 'text-green-400' : 'text-green-600') :
                    status === 'failed' ? (darkMode ? 'text-red-400' : 'text-red-600') :
                    status === 'running' ? 'text-blue-500 animate-spin' : (darkMode ? 'text-white/40' : 'text-gray-400')
                  )} />
                </div>
                <div>
                  <h2 className={clsx('text-xl font-bold', darkMode ? 'text-white' : 'text-gray-900')}>{selectedTask.name}</h2>
                  <p className={clsx('text-sm mt-1', darkMode ? 'text-white/60' : 'text-gray-500')}>{selectedTask.description}</p>
                </div>
              </div>
              <button onClick={closeTaskModal} className={clsx('p-2 rounded-lg transition-colors', darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100')}>
                <X className={clsx('w-5 h-5', darkMode ? 'text-white/60' : 'text-gray-500')} />
              </button>
            </div>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className={clsx('px-3 py-1 rounded-full text-xs font-medium',
                selectedTask.risk_classification === 'high' ? 'bg-red-500/20 text-red-400' :
                selectedTask.risk_classification === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-green-500/20 text-green-400'
              )}>
                <Shield className="w-3 h-3 inline mr-1" />
                {selectedTask.risk_classification} risk
              </span>
              {selectedTask.required_capabilities?.map((cap, i) => (
                <span key={i} className="px-3 py-1 rounded-full text-xs bg-brain-500/20 text-brain-300">
                  <Sparkles className="w-3 h-3 inline mr-1" />{cap}
                </span>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[50vh] overflow-y-auto space-y-4">
            {output?.thinking && (
              <div className="rounded-xl p-4 border-l-4 border-brain-500 bg-brain-500/10">
                <h3 className="text-xs font-bold tracking-wider text-brain-300 mb-2">THINKING</h3>
                <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{output.thinking}</ReactMarkdown></div>
              </div>
            )}
            {output?.execution && (
              <div className="rounded-xl p-4 border-l-4 border-agent-500 bg-agent-500/10">
                <h3 className="text-xs font-bold tracking-wider text-agent-300 mb-2">EXECUTION</h3>
                <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{output.execution}</ReactMarkdown></div>
              </div>
            )}
            {output?.output && (
              <div className="rounded-xl p-4 border-l-4 border-green-500 bg-green-500/10">
                <h3 className="text-xs font-bold tracking-wider text-green-300 mb-2">OUTPUT</h3>
                <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{output.output}</ReactMarkdown></div>
              </div>
            )}
            {!output && <p className={clsx('text-center py-8', darkMode ? 'text-white/40' : 'text-gray-400')}>No output available yet</p>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
