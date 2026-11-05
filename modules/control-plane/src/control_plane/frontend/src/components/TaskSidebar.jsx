import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Brain, CheckCircle, Clock, Loader2, XCircle, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';
import ThinkingStream from './ThinkingStream';

const TABS = [
  { id: 'all', label: 'ALL' },
  { id: 'running', label: 'IN PROGRESS' },
  { id: 'pending', label: 'BACKLOG' },
  { id: 'completed', label: 'DONE' },
];

const statusConfig = {
  pending: { icon: Clock, color: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400', label: 'BACKLOG' },
  running: { icon: Loader2, color: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400', label: 'IN PROGRESS', spin: true },
  completed: { icon: CheckCircle, color: 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400', label: 'DONE' },
  failed: { icon: XCircle, color: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400', label: 'FAILED' },
};

function TaskItem({ task, darkMode, onClick }) {
  const config = statusConfig[task.status] || statusConfig.pending;
  const Icon = config.icon;
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onClick={() => onClick(task)}
      className={clsx('p-4 border-b cursor-pointer transition-colors', darkMode ? 'border-white/5 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50')}>
      <div className="flex items-start gap-3">
        <div className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', config.color)}>
          <Icon className={clsx('w-3 h-3', config.spin && 'animate-spin')} />
          {config.label}
        </div>
      </div>
      <p className={clsx('text-sm font-medium mt-2', darkMode ? 'text-white' : 'text-gray-900')}>{task.name}</p>
      <p className={clsx('text-xs mt-1', darkMode ? 'text-white/50' : 'text-gray-500')}>{task.description?.substring(0, 60)}...</p>
    </motion.div>
  );
}

export default function TaskSidebar() {
  const { tasks, darkMode, selectTask, thinkingStream } = useMissionStore();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showThinking, setShowThinking] = useState(true);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (activeTab !== 'all') result = result.filter(t => t.status === activeTab);
    if (searchQuery) result = result.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return result;
  }, [tasks, activeTab, searchQuery]);

  return (
    <motion.aside initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      className={clsx('w-[380px] flex-shrink-0 flex flex-col overflow-hidden border-l', 
        darkMode ? 'bg-dark-900/95 border-white/5' : 'bg-white border-gray-200 shadow-lg')}>
      
      {/* Header */}
      <div className={clsx('p-4 border-b', darkMode ? 'border-white/5' : 'border-gray-100')}>
        <h2 className={clsx('text-sm font-bold tracking-wider mb-3', darkMode ? 'text-white/80' : 'text-gray-700')}>TASK STATUS</h2>
        <div className="relative">
          <Search className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', darkMode ? 'text-white/40' : 'text-gray-400')} />
          <input type="text" placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className={clsx('w-full pl-10 pr-4 py-2 rounded-lg text-sm', darkMode ? 'bg-white/5 text-white placeholder-white/40 border-white/10' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200', 'border focus:outline-none focus:border-brain-500')} />
        </div>
      </div>

      {/* Filter tabs */}
      <div className={clsx('flex gap-1 p-2 border-b overflow-x-auto', darkMode ? 'border-white/5' : 'border-gray-100')}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={clsx('filter-tab whitespace-nowrap', activeTab === tab.id && 'active')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className={clsx('p-8 text-center', darkMode ? 'text-white/40' : 'text-gray-400')}>
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No tasks yet</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredTasks.map(task => <TaskItem key={task.id} task={task} darkMode={darkMode} onClick={selectTask} />)}
          </AnimatePresence>
        )}
      </div>

      {/* Thinking stream toggle */}
      <div className={clsx('border-t', darkMode ? 'border-white/5' : 'border-gray-100')}>
        <button onClick={() => setShowThinking(!showThinking)}
          className={clsx('w-full p-3 flex items-center justify-between text-sm font-medium', darkMode ? 'text-white/80 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50')}>
          <span className="flex items-center gap-2"><Brain className="w-4 h-4" /> Agent Thinking</span>
          <ChevronDown className={clsx('w-4 h-4 transition-transform', showThinking && 'rotate-180')} />
        </button>
        {showThinking && <div className="h-64 overflow-hidden"><ThinkingStream /></div>}
      </div>
    </motion.aside>
  );
}
