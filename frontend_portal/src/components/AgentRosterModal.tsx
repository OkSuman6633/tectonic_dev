import React from 'react';
import { X, Bot, Sparkles, Wrench, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';

export const AgentRosterModal: React.FC = () => {
  const {
    showRosterModal,
    setShowRosterModal,
    agents,
    selectedAgent,
    setSelectedAgent,
    createNewChat,
    openAgentInspector,
  } = usePortalStore();

  if (!showRosterModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-[#0e131f] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 bg-[#080b11] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 text-white shadow-md">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">
                Available Agents
              </h3>
              <p className="text-xs text-slate-400">
                Connected to shared backend registry ({agents.length} agents)
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRosterModal(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Agents Grid List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {agents.map((agent) => {
            const isSelected = selectedAgent?.id === agent.id;

            return (
              <div
                key={agent.id}
                className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'border-sky-500/40 bg-sky-950/20'
                    : 'border-white/5 bg-[#151c2c]/60 hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-3.5 truncate pr-4">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                    agent.isGenerated
                      ? 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-100">
                        {agent.name}
                      </span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                        {agent.agentType}
                      </span>
                      {agent.isGenerated && (
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300 font-medium border border-indigo-500/30">
                          Generated
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5 max-w-md">
                      {agent.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setShowRosterModal(false);
                      openAgentInspector(agent);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <span>Inspect</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowRosterModal(false);
                    }}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                        : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                  >
                    <span>{isSelected ? 'Active Chat' : 'Start Chat'}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

