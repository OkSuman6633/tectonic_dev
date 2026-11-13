import React, { useState } from 'react';
import {
  PanelLeft,
  Bot,
  User,
  Pencil,
  Check,
  ChevronDown,
  Sparkles,
  Zap
} from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';

export const ChatHeader: React.FC = () => {
  const {
    sidebarOpen,
    toggleSidebar,
    selectedAgent,
    customAgentName,
    setCustomAgentName,
    agents,
    setSelectedAgent,
    agentStatus,
    lastExecutionDuration,
    currentUser,
    setShowAuthModal,
    setShowRosterModal,
    setShowTraceDrawer,
  } = usePortalStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(customAgentName || selectedAgent?.name || 'Tectonic Architect');
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  const displayName = customAgentName || selectedAgent?.name || 'Tectonic Architect';

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (nameInput.trim()) {
      setCustomAgentName(nameInput.trim());
    }
    setIsEditingName(false);
  };

  return (
    <header className="relative flex h-14 items-center justify-between px-6 border-b border-white/5 bg-[#0e131f]/80 backdrop-blur-md z-30 select-none">
      {/* Left: Sidebar Toggle & Editable Agent Name */}
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            title="Open Sidebar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}

        <div className="relative flex items-center gap-2">
          {/* Agent Avatar Icon */}
          <div
            onClick={() => setShowAgentDropdown(!showAgentDropdown)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
          >
            <Bot className="h-4 w-4" />
          </div>

          {/* Name & In-place Editor */}
          {isEditingName ? (
            <form onSubmit={handleSaveName} className="flex items-center gap-1.5">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
                onBlur={() => handleSaveName()}
                className="rounded-lg border border-sky-500/50 bg-[#151c2c] px-2.5 py-1 text-xs font-semibold text-white focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-sky-500 p-1 text-white hover:bg-sky-400"
              >
                <Check className="h-3 w-3" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <div
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className="flex items-center gap-1.5 cursor-pointer group"
              >
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-100 group-hover:text-sky-300 transition-colors">
                      {displayName}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        agentStatus === 'running'
                          ? 'bg-amber-400 animate-ping'
                          : agentStatus === 'error'
                          ? 'bg-red-400'
                          : 'bg-emerald-400'
                      }`}
                      title={`Status: ${agentStatus}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {selectedAgent?.id === 'agent_builder'
                      ? '⚡ Master Agent Creator (Build any agent)'
                      : selectedAgent?.isGenerated
                      ? `⭐ Project (${selectedAgent.agentType})`
                      : selectedAgent?.agentType || 'Agent'}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition-colors ml-1" />
              </div>

              {/* Edit Name Button */}
              <button
                onClick={() => {
                  setNameInput(displayName);
                  setIsEditingName(true);
                }}
                title="Change Agent Name"
                className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-sky-300 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Dropdown to switch agent */}
          {showAgentDropdown && (
            <div
              onMouseLeave={() => setShowAgentDropdown(false)}
              className="absolute left-0 top-12 z-50 w-72 rounded-2xl border border-white/10 bg-[#151c2c] p-2.5 shadow-2xl backdrop-blur-xl"
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Select Agent
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1">
                {/* 1. Master Agent Creator */}
                {agents.filter((a) => a.id === 'agent_builder' || a.kind === 'builder').map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedAgent(a);
                      setNameInput(a.name);
                      setShowAgentDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-xl p-2 text-left text-xs transition-colors ${
                      selectedAgent?.id === a.id
                        ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30'
                        : 'text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <span>⚡ {a.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">
                        Can create any agent on demand
                      </div>
                    </div>
                    <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[9px] text-sky-300">
                      Creator
                    </span>
                  </button>
                ))}

                {/* 2. Generated Projects */}
                {agents.some((a) => a.isGenerated) && (
                  <div className="pt-1.5">
                    <div className="px-2 py-0.5 text-[9px] font-semibold text-indigo-400 uppercase tracking-wider">
                      Your Created Projects
                    </div>
                    {agents.filter((a) => a.isGenerated).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setSelectedAgent(a);
                          setNameInput(a.name);
                          setShowAgentDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between rounded-xl p-2 text-left text-xs transition-colors ${
                          selectedAgent?.id === a.id
                            ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30'
                            : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="truncate">{a.name}</span>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {a.appName}
                          </div>
                        </div>
                        <span className="rounded bg-indigo-500/20 px-1 py-0.5 font-mono text-[9px] text-indigo-300 flex-shrink-0">
                          {a.agentType}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 3. Specialists */}
                {agents.some((a) => !a.isGenerated && a.id !== 'agent_builder') && (
                  <div className="pt-1.5">
                    <div className="px-2 py-0.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                      Specialists
                    </div>
                    {agents.filter((a) => !a.isGenerated && a.id !== 'agent_builder').map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setSelectedAgent(a);
                          setNameInput(a.name);
                          setShowAgentDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between rounded-xl p-1.5 text-left text-xs transition-colors ${
                          selectedAgent?.id === a.id
                            ? 'bg-sky-500/20 text-sky-300 font-semibold'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                        }`}
                      >
                        <span className="truncate">{a.name}</span>
                        <span className="font-mono text-[9px] text-slate-500">
                          {a.agentType}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-white/5 mt-1.5 pt-1.5">
                <button
                  onClick={() => {
                    setShowAgentDropdown(false);
                    setShowRosterModal(true);
                  }}
                  className="w-full text-center py-1 text-[11px] font-medium text-sky-400 hover:underline"
                >
                  Manage All Projects & Agents
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: VOXA Diamond Credits / Latency Pill & Avatar */}
      <div className="flex items-center gap-3">
        {/* VOXA Diamond Credits / Latency Pill */}
        <button
          onClick={() => setShowTraceDrawer(true)}
          title="Click to view execution trace and tool calls"
          className="flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-950/40 px-3 py-1 text-xs font-medium text-sky-300 hover:bg-sky-950/60 transition-colors"
        >
          <span className="text-sky-400">◆</span>
          <span>{lastExecutionDuration ? `${lastExecutionDuration}ms` : '6/75'}</span>
        </button>

        {/* User Profile Avatar */}
        <button
          onClick={() => setShowAuthModal(true)}
          title={currentUser ? `Signed in as ${currentUser.username}` : 'Sign In'}
          className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-sm ring-2 ring-white/10 hover:ring-sky-500/50 transition-all overflow-hidden"
        >
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120"
            alt="User avatar"
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <User className="h-4 w-4 text-white" />
        </button>
      </div>
    </header>
  );
};
