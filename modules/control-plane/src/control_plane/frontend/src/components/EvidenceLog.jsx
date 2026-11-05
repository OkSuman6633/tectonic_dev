import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';

const levelColors = {
  info: 'text-blue-400',
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
};

export default function EvidenceLog() {
  const { evidenceLog } = useMissionStore();
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [evidenceLog]);

  return (
    <div className="border-t border-white/5">
      <div className="px-4 py-3 flex items-center gap-2 bg-orange-500/5 border-b border-white/5">
        <ScrollText className="w-4 h-4 text-orange-400" />
        <span className="text-xs font-semibold text-orange-300 tracking-wide">EVIDENCE LOG</span>
        <span className="ml-auto text-xs text-white/30">{evidenceLog.length} events</span>
      </div>

      <div ref={containerRef} className="h-40 overflow-y-auto p-2 bg-black/20 font-mono text-xs">
        <AnimatePresence mode="popLayout">
          {evidenceLog.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 py-1.5 px-2 border-b border-white/5 last:border-0"
            >
              <span className="text-white/25 min-w-[60px]">
                {item.timestamp.toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span className={clsx('min-w-[70px] font-semibold uppercase', levelColors[item.level] || 'text-white/50')}>
                {item.type}
              </span>
              <span className="text-white/60 flex-1">{item.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {evidenceLog.length === 0 && (
          <div className="text-center text-white/30 py-4">No events recorded yet</div>
        )}
      </div>
    </div>
  );
}
