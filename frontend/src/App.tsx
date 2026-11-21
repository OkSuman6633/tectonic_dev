import React, { useState, useEffect } from 'react';
import {
  Box,
  Settings,
  CheckCircle2,
  ChevronDown,
  Plus,
  Layers,
  Sun,
  Moon,
  RotateCcw,
  RefreshCw,
  LogOut,
  UserCircle2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAgentStudioStore, type StudioTab } from './store/useAgentStudioStore';
import { useTelemetryStore } from './store/useTelemetryStore';
import { Workspace } from './workspace/Workspace';
import { Dock } from './workspace/Dock';
import { PRESETS, useWorkspaceStore, type PresetId, type WindowId } from './workspace/useWorkspaceStore';
import { refreshAllViews } from './workspace/refreshAllViews';
import { ModelSettingsModal } from './components/settings/ModelSettingsModal';
import { getUser, signOut } from './services/auth';

// Store code still asks for a "tab" (e.g. after a build: 'sandbox'); in the workspace that means "reveal this window".
const TAB_TO_WINDOW: Record<StudioTab, WindowId> = { command: 'command', visualizer: 'blueprint', sandbox: 'sandbox', inspector: 'inspector' };

function PresetSwitcher() {
  const preset = useWorkspaceStore((s) => s.preset);
  const { applyPreset, resetLayout } = useWorkspaceStore.getState();
  return (
    <div className="flex h-7 shrink-0 items-center gap-1">
      <div className="relative flex h-full items-center rounded-[9px] bg-white/[0.07] p-[2px] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.06)]">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            title={PRESETS[id].description}
            className={`relative z-10 flex h-full items-center rounded-[7px] px-3 text-[12px] font-medium leading-none transition-colors ${preset === id ? 'text-[var(--studio-text)]' : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text-secondary)]'
              }`}
          >
            {preset === id && (
              <motion.span
                layoutId="preset-pill"
                className="absolute inset-0 -z-10 rounded-[7px] bg-white/[0.16] shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_0.5px_0_rgba(255,255,255,0.2)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {PRESETS[id].label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={resetLayout}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--studio-text-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--studio-text)]"
        title="Reset this layout"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}

export const App: React.FC = () => {
  const {
    activeTab,
    tabNonce,
    checkEnvConfig,
    showEnvModal,
    setShowEnvModal,
    studioSettings,
    createdAgents,
    selectedAgent,
    setSelectedAgent,
    refreshCreatedAgents,
    startNewBuilderSession,
    restoreStudio,
    isRefreshing,
  } = useAgentStudioStore();
  const connectTelemetry = useTelemetryStore((s) => s.connect);
  const selectTelemetryAgent = useTelemetryStore((s) => s.selectAgent);

  const reveal = useWorkspaceStore((s) => s.reveal);

  const focusAgent = (id: string) => {
    selectTelemetryAgent(id);
    reveal('command');
  };

  useEffect(() => {
    if (tabNonce) reveal(TAB_TO_WINDOW[activeTab]);
  }, [tabNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const signedIn = getUser();
  const builderModelLabel = studioSettings
    ? (studioSettings.catalogue.find((m) => m.id === studioSettings.model)?.label ?? studioSettings.model)
      + (studioSettings.mode === 'custom' && !studioSettings.custom_error ? ' · custom' : '')
    : '…';
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage or default to dark
    try {
      const saved = localStorage.getItem('theme');
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  // Apply theme to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    try { localStorage.setItem('theme', isDarkMode ? 'dark' : 'light'); } catch { /* not persisted */ }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  // Initialize on mount
  useEffect(() => {
    checkEnvConfig();
    // Reopen the conversations, sessions and agent from before the page refresh (or start fresh).
    restoreStudio();
    connectTelemetry();
  }, []);

  const handleStartNewAgent = () => {
    startNewBuilderSession();
    reveal('chat');
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden font-sans text-[var(--studio-text)] transition-colors duration-300">
      {/* Top Navbar */}
      <header className="menu-bar z-30 flex h-11 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-gradient-to-br from-sky-300 via-sky-400 to-indigo-500 shadow-[0_2px_8px_-2px_rgba(45,212,255,0.6),inset_0_1px_0_rgba(255,255,255,0.4)]">
              <Box className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="typo-panel-heading text-[var(--studio-text)]">Tectonic</span>
              <span className="hidden text-[12px] font-normal text-[var(--studio-text-muted)] sm:inline">Agent Studio</span>
            </div>
          </div>

          {/* Create Another Agent Button */}
          <button
            onClick={handleStartNewAgent}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-sky-400 px-3 text-[12px] font-medium leading-none text-[#05222E] shadow-[0_2px_10px_-3px_rgba(45,212,255,0.7)] transition-colors hover:bg-sky-300"
            title="Start fresh session to create another agent"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Create Another Agent</span>
          </button>

          {/* Created Agents Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="flex h-7 max-w-[240px] items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-[12px] font-medium leading-none text-[var(--studio-text-secondary)] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.13] hover:text-[var(--studio-text)]"
              title="Switch active agent in sandbox"
            >
              <Layers className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              <span className="min-w-0 max-w-[120px] truncate">
                {selectedAgent ? selectedAgent.name : 'Select Agent'}
              </span>
              <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-indigo-500/20 px-1.5 font-mono text-[12px] leading-none text-indigo-300">
                {createdAgents.length}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </button>

            {agentDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-60 rounded-xl bg-studio-card border border-white/10 shadow-2xl p-1.5 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[12px] uppercase tracking-wider text-slate-400 border-b border-white/5 flex items-center justify-between">
                  <span>Created Agents</span>
                  <button
                    onClick={() => refreshCreatedAgents()}
                    className="text-[12px] font-medium normal-case text-sky-400 hover:underline"
                  >
                    Refresh
                  </button>
                </div>
                {createdAgents.length === 0 ? (
                  <div className="p-2 text-[12px] text-slate-400">
                    No agents found in <code className="font-mono">generated_agents/</code>
                  </div>
                ) : (
                  createdAgents.map((ag) => (
                    <button
                      key={ag.name}
                      onClick={() => {
                        setSelectedAgent(ag);
                        setAgentDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded-lg transition-colors flex items-center justify-between ${selectedAgent?.name === ag.name
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'hover:bg-white/5 text-slate-300'
                        }`}
                    >
                      <span className="typo-agent-name truncate">{ag.name}</span>
                      <span className="font-mono text-[12px] text-slate-500 shrink-0">{ag.files.length} files</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: workspace layout presets */}
        <PresetSwitcher />

        {/* Right: Agent Builder Status & Config */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEnvModal(true)}
            className="hidden h-7 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-[12px] font-medium leading-none text-[var(--studio-text-secondary)] transition-colors hover:bg-white/[0.1] hover:text-[var(--studio-text)] lg:flex"
            title="The model the Builder runs on (click to change it or add an API key)"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">Builder · {builderModelLabel}</span>
          </button>

          {/* Re-sync agents, files, sessions and history with the backend (the conversation is kept) */}
          <button
            onClick={() => refreshAllViews()}
            disabled={isRefreshing}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--studio-text-secondary)] transition-colors hover:bg-white/[0.1] hover:text-[var(--studio-text)] disabled:opacity-60"
            title="Refresh all views: sandbox, Command Center, Blueprint, code, platform windows and history (keeps your conversations)"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--studio-text-secondary)] transition-colors hover:bg-white/[0.1] hover:text-[var(--studio-text)]"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={() => setShowEnvModal(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--studio-text-secondary)] transition-colors hover:bg-white/[0.1] hover:text-[var(--studio-text)]"
            title="System & Google Gemini Environment Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* Signed-in user: agents, sessions and history shown here are theirs alone */}
          {signedIn && (
            <div className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-white/[0.06] pl-2.5 pr-1 text-[12px] leading-none text-[var(--studio-text-secondary)]">
              <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              <span className="max-w-[110px] truncate font-medium" title={signedIn.admin ? 'Admin' : undefined}>
                {signedIn.username}
              </span>
              <button
                onClick={signOut}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/[0.1] hover:text-[var(--studio-text)]"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Draggable, resizable window workspace */}
      <Workspace onSelectAgent={focusAgent} />
      <Dock onSelectAgent={focusAgent} />

      {/* Builder model (Claude or Gemini) and provider API keys */}
      {showEnvModal && <ModelSettingsModal onClose={() => setShowEnvModal(false)} />}
    </div>
  );
};

export default App;
