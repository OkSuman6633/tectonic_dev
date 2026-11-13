import React from 'react';
import { X, Settings, Server, Key, User, LogOut, ExternalLink, Bot, CheckCircle2 } from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';
import { BACKEND_URL, STUDIO_URL, PORT } from '../config';

export const SettingsModal: React.FC = () => {
  const {
    showSettingsModal,
    setShowSettingsModal,
    currentUser,
    logout,
    setShowAuthModal,
    isBackendConnected,
    lastSyncedAt,
    fetchAgents,
  } = usePortalStore();

  if (!showSettingsModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0e131f] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 bg-[#080b11] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-sky-400">
              <Settings className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-white text-base">Portal Settings</h3>
          </div>
          <button
            onClick={() => setShowSettingsModal(false)}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-300">
          {/* Architecture & Ports */}
          <div className="rounded-2xl border border-white/5 bg-[#151c2c]/70 p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Server className="h-4 w-4 text-sky-400" />
              <span>Service Connections</span>
            </div>
            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex items-center justify-between rounded-lg bg-black/40 p-2 border border-white/5">
                <span className="text-slate-400">Portal Interface:</span>
                <span className="text-sky-300">http://localhost:{PORT}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-black/40 p-2 border border-white/5">
                <span className="text-slate-400">Shared Backend:</span>
                <span className="text-emerald-400">{BACKEND_URL}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-black/40 p-2 border border-white/5">
                <span className="text-slate-400">Agent Studio:</span>
                <a
                  href={STUDIO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-indigo-300 hover:underline"
                >
                  <span>{STUDIO_URL}</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Account status */}
          <div className="rounded-2xl border border-white/5 bg-[#151c2c]/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-white">
                <User className="h-4 w-4 text-amber-400" />
                <span>Workspace Account</span>
              </div>
              {currentUser && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/20">
                  Authenticated
                </span>
              )}
            </div>

            {currentUser ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{currentUser.username}</div>
                  <div className="text-[10px] text-slate-500 font-mono">ID: {currentUser.id}</div>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Running in single-user mode</span>
                <button
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowAuthModal(true);
                  }}
                  className="rounded-xl bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 transition-colors"
                >
                  Sign In
                </button>
              </div>
            )}
          </div>

          {/* Sync Button */}
          <button
            onClick={() => {
              fetchAgents();
            }}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
          >
            <span>Force Sync Agents from Backend</span>
          </button>
        </div>
      </div>
    </div>
  );
};

