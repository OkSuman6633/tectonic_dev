import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Columns,
  Maximize2,
  Minimize2,
  RotateCcw,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { SimplifiedChat } from '../chat/SimplifiedChat';
import { Office3D } from '../office/Office3D';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';

interface UnifiedStudioTabProps {
  onSelectAgent?: (id: string) => void;
}

export const UnifiedStudioTab: React.FC<UnifiedStudioTabProps> = ({ onSelectAgent }) => {
  // Split ratio: percentage width of the left panel (Chat)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tectonic.studio.split');
      return saved ? parseFloat(saved) : 48;
    } catch {
      return 48;
    }
  });

  const [isDragging, setIsDragging] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState<'chat' | 'office' | null>(null);
  const [mobileTab, setMobileTab] = useState<'chat' | 'office'>('chat');
  const containerRef = useRef<HTMLDivElement>(null);

  // Telemetry counts for live executive header
  const workingCount = useTelemetryStore((s) =>
    s.agentOrder.filter((id) => ['thinking', 'tool_execution'].includes(s.agents[id]?.state ?? '')).length,
  );
  const totalAgents = useTelemetryStore((s) => s.agentOrder.length);
  const activeRuns = useTelemetryStore((s) => s.activeRuns);
  const isSimulating = useTelemetryStore((s) => s.isSimulating);
  const isChatLoading = useAgentStudioStore((s) => s.isChatLoading);

  // Handle divider drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(25, Math.min(75, rawPercent));
      setSplitRatio(clamped);
      try {
        localStorage.setItem('tectonic.studio.split', clamped.toFixed(1));
      } catch {}
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const resetSplit = () => {
    setSplitRatio(48);
    setFullscreenMode(null);
    try {
      localStorage.setItem('tectonic.studio.split', '48');
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-br from-[#eaf2ff] via-[#f4edff] to-[#dff3ff] dark:from-[#060913] dark:via-[#0b1121] dark:to-[#070b17] select-none transition-colors"
    >
      {/* Sub-Header: Studio Context & Split Controls */}
      <div className="z-20 flex h-10 shrink-0 items-center justify-between border-b border-white/80 dark:border-white/10 bg-white/65 dark:bg-slate-900/60 px-4 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)] transition-colors">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-indigo-600 shadow-[0_0_12px_rgba(56,189,248,0.4)]">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="text-[12px] font-semibold tracking-wide text-slate-800 dark:text-white">
              Studio Workspace
            </span>
          </div>

          <span className="h-3 w-px bg-slate-200 dark:bg-white/10" />

          {/* Real-time Status Badge */}
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="hidden sm:inline">3D Blueprint Sync</span>
            <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
              · {workingCount > 0 ? `${workingCount} working` : totalAgents > 0 ? `${totalAgents} ready` : 'Live'}
            </span>
          </div>
        </div>

        {/* Center/Right: Layout Controls */}
        <div className="flex items-center gap-1.5">
          {/* Mobile Tab Switcher */}
          <div className="flex md:hidden rounded-lg bg-slate-200/80 dark:bg-white/[0.08] p-0.5 text-[11px]">
            <button
              onClick={() => setMobileTab('chat')}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                mobileTab === 'chat' ? 'bg-sky-500 text-white shadow' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Architect
            </button>
            <button
              onClick={() => setMobileTab('office')}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                mobileTab === 'office' ? 'bg-indigo-500 text-white shadow' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              3D Office
            </button>
          </div>

          {/* Desktop Split Presets */}
          <div className="hidden md:flex items-center gap-1 rounded-lg bg-slate-100/80 dark:bg-white/[0.05] p-1 border border-slate-200/80 dark:border-white/[0.06]">
            <button
              onClick={() => {
                setFullscreenMode(null);
                setSplitRatio(65);
              }}
              title="Expand Chat (65% / 35%)"
              className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-all ${
                splitRatio > 55 && !fullscreenMode
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06]'
              }`}
            >
              <PanelLeftClose className="h-3 w-3 text-sky-400" />
              <span>Chat</span>
            </button>

            <button
              onClick={() => {
                setFullscreenMode(null);
                setSplitRatio(48);
              }}
              title="Balanced Split (50% / 50%)"
              className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-all ${
                Math.abs(splitRatio - 48) <= 5 && !fullscreenMode
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06]'
              }`}
            >
              <Columns className="h-3 w-3 text-indigo-400" />
              <span>Split</span>
            </button>

            <button
              onClick={() => {
                setFullscreenMode(null);
                setSplitRatio(35);
              }}
              title="Expand 3D Office (35% / 65%)"
              className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-all ${
                splitRatio < 40 && !fullscreenMode
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06]'
              }`}
            >
              <PanelRightClose className="h-3 w-3 text-purple-400" />
              <span>3D Office</span>
            </button>
          </div>

          {/* Fullscreen Toggle Buttons */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setFullscreenMode(fullscreenMode === 'chat' ? null : 'chat')}
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white transition-colors ${
                fullscreenMode === 'chat' ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40' : ''
              }`}
              title={fullscreenMode === 'chat' ? 'Restore split layout' : 'Maximize Chat view'}
            >
              {fullscreenMode === 'chat' ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            <button
              onClick={resetSplit}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white transition-colors"
              title="Reset layout to 50:50 default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split-Screen Content Viewport */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Side: Simplified Architect Chat (Gemini Style) */}
        <div
          style={{
            width: fullscreenMode === 'chat' ? '100%' : fullscreenMode === 'office' ? '0%' : `${splitRatio}%`,
            display: fullscreenMode === 'office' ? 'none' : 'flex',
          }}
          className={`relative h-full flex-col overflow-hidden border-r border-slate-200/80 dark:border-white/[0.08] transition-all duration-75 ${
            mobileTab === 'office' ? 'hidden md:flex' : 'flex w-full md:w-auto'
          }`}
        >
          <SimplifiedChat />
        </div>

        {/* Draggable Resizer Handle (Desktop only) */}
        {!fullscreenMode && (
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={resetSplit}
            title="Drag to resize split view · Double click to reset"
            className={`group relative z-30 hidden md:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors ${
              isDragging ? 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]' : 'bg-transparent hover:bg-sky-400/40'
            }`}
          >
            {/* Visual Grip Handle */}
            <div className="h-10 w-1 rounded-full bg-slate-300 dark:bg-white/20 group-hover:bg-sky-400 transition-colors shadow" />
          </div>
        )}

        {/* Right Side: Blueprint 3D Office Campus */}
        <div
          style={{
            width: fullscreenMode === 'office' ? '100%' : fullscreenMode === 'chat' ? '0%' : `${100 - splitRatio}%`,
            display: fullscreenMode === 'chat' ? 'none' : 'flex',
          }}
          className={`relative h-full flex-1 flex-col overflow-hidden bg-slate-900 dark:bg-slate-950 transition-all duration-75 ${
            mobileTab === 'chat' ? 'hidden md:flex' : 'flex w-full md:w-auto'
          }`}
        >
          {/* Simulation indicator positioned cleanly at top-center so it never overlaps Office3D's top-left HUD pill */}
          {isSimulating && (
            <div className="pointer-events-none absolute left-1/2 top-3.5 z-10 -translate-x-1/2 flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-[#040E26]/85 px-3 py-1 text-[11px] font-mono text-cyan-300 shadow-[0_0_18px_rgba(0,180,255,0.22)] backdrop-blur-xl">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
              <span>Simulation Active</span>
            </div>
          )}

          <div className="h-full w-full">
            <Office3D />
          </div>
        </div>
      </div>
    </div>
  );
};
