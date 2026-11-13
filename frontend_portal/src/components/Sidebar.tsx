import React, { useState } from 'react';
import { 
  SquarePen, 
  PanelLeftClose, 
  PanelLeft, 
  Search, 
  Folder, 
  MessageSquare, 
  MessageSquarePlus, 
  Settings, 
  Users, 
  MoreHorizontal, 
  Trash2, 
  Sparkles,
  Bot,
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';
import { STUDIO_URL } from '../config';

export const Sidebar: React.FC = () => {
  const {
    sidebarOpen,
    toggleSidebar,
    activeNavTab,
    setActiveNavTab,
    searchQuery,
    setSearchQuery,
    sessions,
    activeSessionId,
    selectSession,
    deleteSession,
    createNewChat,
    selectedAgent,
    agents,
    setSelectedAgent,
    isBackendConnected,
    currentUser,
    setShowAuthModal,
    setShowRosterModal,
    setShowSettingsModal,
  } = usePortalStore();

  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);

  // Filtered sessions based on search
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside
      className={`${
        sidebarOpen ? 'w-64 sm:w-72' : 'w-0 -translate-x-full'
      } fixed inset-y-0 left-0 z-30 flex flex-col border-r border-white/5 bg-[#080b11] transition-all duration-300 md:relative md:translate-x-0 overflow-hidden select-none`}
    >
      {/* Top Header: TECTONIC Brand & Action Icons */}
      <div className="flex h-14 items-center justify-between px-5 pt-2">
        <div className="flex items-center gap-2">
          <span className="font-extrabold tracking-wider text-white text-lg font-sans">
            TECTONIC
          </span>
          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-400 border border-sky-500/20">
            :5174
          </span>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={() => {
              createNewChat();
              setActiveNavTab('chats');
            }}
            title="New Chat"
            className="rounded-lg p-1.5 hover:bg-white/5 hover:text-white transition-colors"
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSidebar}
            title="Toggle Sidebar"
            className="rounded-lg p-1.5 hover:bg-white/5 hover:text-white transition-colors"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-white/5 bg-[#121826] pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500/40 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Settings / Main Navigation Links */}
      <div className="px-3 space-y-0.5">
        <div className="px-3 py-1 text-[11px] font-medium text-slate-500">
          Settings
        </div>

        <button
          onClick={() => setActiveNavTab('projects')}
          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
            activeNavTab === 'projects'
              ? 'bg-[#151c2c] text-white font-semibold'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <Folder className="h-4 w-4 text-sky-400" />
          <span>My projects</span>
          <span className="ml-auto text-[10px] text-slate-500 font-mono">
            {agents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveNavTab('chats')}
          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
            activeNavTab === 'chats'
              ? 'bg-[#151c2c] text-white font-semibold'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="h-4 w-4 text-sky-400" />
          <span>Chats</span>
        </button>

        <button
          onClick={() => {
            createNewChat();
            setActiveNavTab('chats');
          }}
          title="Start a new chat session"
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 hover:bg-sky-500/10 hover:text-sky-400 transition-colors group"
        >
          <MessageSquarePlus className="h-4 w-4 text-sky-400 group-hover:scale-110 transition-transform" />
          <span className="font-medium">New chat</span>
          <span className="ml-auto rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] text-sky-400 border border-sky-500/20">
            +
          </span>
        </button>

        <button
          onClick={() => setShowSettingsModal(true)}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
        >
          <Settings className="h-4 w-4 text-slate-400" />
          <span>Settings</span>
        </button>

        <a
          href={STUDIO_URL}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
        >
          <Users className="h-4 w-4 text-slate-400" />
          <span>Teams (Studio :5173)</span>
          <ExternalLink className="ml-auto h-3 w-3 text-slate-500" />
        </a>
      </div>

      {/* Chats Section */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 space-y-1">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[11px] font-medium text-slate-500">Chats</span>
          <span className="text-[10px] text-slate-600 font-mono">
            {sessions.length}
          </span>
        </div>

        {filteredSessions.length > 0 ? (
          filteredSessions.map((session) => {
            const isActive = activeSessionId === session.id;
            const agent = agents.find((a) => a.id === session.agentId);

            return (
              <div
                key={session.id}
                className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#151c2c] text-white font-medium'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
                onClick={() => {
                  selectSession(session.id);
                  setActiveNavTab('chats');
                }}
              >
                <div className="flex items-center gap-2.5 truncate pr-2">
                  <MessageSquare className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                  <span className="truncate">{session.title}</span>
                </div>

                {/* More options menu */}
                <div className="flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuSessionId(
                        activeMenuSessionId === session.id ? null : session.id
                      );
                    }}
                    className={`rounded p-1 text-slate-500 hover:text-slate-200 ${
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>

                  {activeMenuSessionId === session.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-2 top-8 z-50 w-32 rounded-xl border border-white/10 bg-[#151c2c] p-1 shadow-2xl backdrop-blur-xl"
                    >
                      <button
                        onClick={() => {
                          deleteSession(session.id);
                          setActiveMenuSessionId(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-3 py-4 text-center text-xs text-slate-600">
            No chats found
          </div>
        )}
      </div>

      {/* Bottom Upgrade / Workspace Card */}
      <div className="p-3">
        <div
          onClick={() => setShowSettingsModal(true)}
          className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#121826]/80 p-3.5 hover:border-white/10 transition-colors cursor-pointer"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 truncate">
            <div className="font-semibold text-xs text-white">
              {currentUser ? currentUser.username : 'Update the plan'}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {isBackendConnected ? 'Connected to ADK :8000' : 'Backend Offline'}
            </div>
          </div>
          <span
            className={`h-2 w-2 rounded-full ${
              isBackendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
            }`}
          />
        </div>
      </div>
    </aside>
  );
};

