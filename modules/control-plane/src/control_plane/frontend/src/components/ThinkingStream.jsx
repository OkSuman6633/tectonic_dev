import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Brain, Zap, CheckCircle, AlertCircle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';

const typeConfig = {
  thinking: { icon: Brain, color: 'border-brain-500 bg-brain-500/10', label: 'THINKING', iconColor: 'text-brain-400' },
  execution: { icon: Zap, color: 'border-agent-500 bg-agent-500/10', label: 'EXECUTION', iconColor: 'text-agent-400' },
  output: { icon: CheckCircle, color: 'border-green-500 bg-green-500/10', label: 'OUTPUT', iconColor: 'text-green-400' },
  error: { icon: AlertCircle, color: 'border-red-500 bg-red-500/10', label: 'ERROR', iconColor: 'text-red-400' },
};

function ThinkingItem({ item }) {
  const [expanded, setExpanded] = useState(true);
  const config = typeConfig[item.type] || typeConfig.thinking;
  const Icon = config.icon;
  const isLong = item.content && item.content.length > 500;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={clsx('rounded-xl p-4 border-l-4', config.color)}
    >
      <div 
        className="flex items-center gap-2 mb-2 cursor-pointer"
        onClick={() => isLong && setExpanded(!expanded)}
      >
        <Icon className={clsx('w-4 h-4', config.iconColor)} />
        <span className="text-xs font-bold tracking-wider text-white/60">{config.label}</span>
        {item.taskName && item.taskName !== 'system' && (
          <span className="text-xs text-white/40 ml-auto mr-2">{item.taskName}</span>
        )}
        {isLong && (
          expanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </div>
      <motion.div 
        className="markdown-body text-sm text-white/80 overflow-hidden"
        animate={{ height: expanded ? 'auto' : 80 }}
        transition={{ duration: 0.2 }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
      </motion.div>
      {isLong && !expanded && (
        <div className="text-xs text-white/40 mt-2">Click to expand...</div>
      )}
    </motion.div>
  );
}

export default function ThinkingStream() {
  const { thinkingStream, isExecuting, darkMode } = useMissionStore();
  const containerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (containerRef.current && autoScroll) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [thinkingStream, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  if (thinkingStream.length === 0) {
    return (
      <div className={clsx('flex-1 flex flex-col items-center justify-center p-8', darkMode ? 'text-white/40' : 'text-gray-400')}>
        <div className={clsx('w-16 h-16 mb-4 rounded-2xl flex items-center justify-center', darkMode ? 'bg-brain-500/10' : 'bg-brain-100')}>
          <Sparkles className={clsx('w-8 h-8', darkMode ? 'text-brain-400/50' : 'text-brain-500/50')} />
        </div>
        <p className="text-sm text-center">Agent thoughts will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div 
        ref={containerRef} 
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        <AnimatePresence mode="popLayout">
          {thinkingStream.map((item) => (
            <ThinkingItem key={item.id} item={item} />
          ))}
        </AnimatePresence>

        {isExecuting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-brain-400 text-sm p-4"
          >
            <div className="w-2 h-2 rounded-full bg-brain-400 animate-pulse" />
            <span className="typing-cursor">Processing</span>
          </motion.div>
        )}
      </div>
      
      {/* Scroll to bottom button */}
      {!autoScroll && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({
              top: containerRef.current.scrollHeight,
              behavior: 'smooth'
            });
          }}
          className="absolute bottom-4 right-4 p-2 rounded-full bg-brain-500/80 text-white shadow-lg hover:bg-brain-500"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );
}
