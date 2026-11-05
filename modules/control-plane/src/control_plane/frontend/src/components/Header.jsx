import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun, Wifi, WifiOff, Download, StopCircle, Calendar, Clock, Eye, FileText } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';
import { exportMissionReport } from '../utils/exportDocx';

export default function Header() {
  const { connected, mockMode, modelName, darkMode, toggleDarkMode, currentMissionId, missionStatus, isExecuting, setShowFinalOutput } = useMissionStore();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDownload = async () => {
    if (!currentMissionId) return;
    try {
      await exportMissionReport(currentMissionId);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export report: ' + err.message);
    }
  };

  const handleViewOutput = () => {
    if (currentMissionId) setShowFinalOutput(true);
  };

  const handleKill = async () => {
    if (!currentMissionId) return;
    if (!confirm('Are you sure you want to stop this mission?')) return;
    try {
      await fetch(`/api/v1/missions/${currentMissionId}/kill`, { method: 'POST' });
    } catch (err) {
      console.error('Kill failed:', err);
    }
  };

  const bgClass = darkMode 
    ? 'bg-dark-900/80 backdrop-blur-lg border-white/5' 
    : 'bg-white/80 backdrop-blur-lg border-gray-200 shadow-sm';

  return (
    <header className={clsx('h-16 px-6 flex items-center justify-between border-b transition-all duration-300', bgClass)}>
      <div className="flex items-center gap-4">
        <h1 className={clsx('text-xl font-bold tracking-tight', darkMode ? 'text-white' : 'text-gray-900')}>
          AGENTS OFFICE
          <span className={clsx('ml-2 text-xs font-medium px-2 py-0.5 rounded-full', darkMode ? 'bg-brain-500/20 text-brain-400' : 'bg-brain-100 text-brain-600')}>BETA</span>
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
          mockMode ? (darkMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700')
                   : (darkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'))}>
          <span className={clsx('w-2 h-2 rounded-full', mockMode ? 'bg-yellow-400' : 'bg-green-500 animate-pulse')} />
          {mockMode ? 'MOCK' : modelName || 'LIVE'}
        </div>

        <div className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs',
          connected ? (darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600')
                    : (darkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'))}>
          {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        </div>

        {currentMissionId && missionStatus === 'completed' && (
          <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={handleViewOutput}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              darkMode ? 'bg-green-500 hover:bg-green-400 text-white' : 'bg-green-600 hover:bg-green-500 text-white')}>
            <FileText className="w-4 h-4" /> View Final Output
          </motion.button>
        )}

        {isExecuting && (
          <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={handleKill}
            className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              darkMode ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-100 text-red-600 hover:bg-red-200')}>
            <StopCircle className="w-3.5 h-3.5" /> Stop
          </motion.button>
        )}

        <div className={clsx('w-px h-6', darkMode ? 'bg-white/10' : 'bg-gray-200')} />

        <div className={clsx('flex items-center gap-2 text-xs', darkMode ? 'text-white/50' : 'text-gray-500')}>
          <Calendar className="w-4 h-4" />
          {currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>

        <div className={clsx('flex items-center gap-2 text-xs', darkMode ? 'text-white/50' : 'text-gray-500')}>
          <Clock className="w-4 h-4" />
          {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>

        <button onClick={toggleDarkMode} className={clsx('p-2 rounded-lg transition-colors', darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100')}
          title={darkMode ? 'Light mode' : 'Dark mode'}>
          {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-600" />}
        </button>
      </div>
    </header>
  );
}
