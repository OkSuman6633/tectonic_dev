import React, { useState } from 'react';
import { X, Bot, FileText, Code2, Wrench, Sparkles, MessageSquare, Loader2, ArrowRight } from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';

export const AgentDetailsModal: React.FC = () => {
  const {
    inspectingAgent,
    inspectingFiles,
    isLoadingFiles,
    closeAgentInspector,
    setSelectedAgent,
    setActiveNavTab,
  } = usePortalStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'files'>('overview');
  const [selectedFile, setSelectedFile] = useState<string>('');

  if (!inspectingAgent) return null;

  const fileKeys = Object.keys(inspectingFiles);
  const currentFile = selectedFile || fileKeys[0] || '';
  const currentContent = inspectingFiles[currentFile] || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 shadow-md">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">
                {inspectingAgent.name}
              </h3>
              <p className="font-mono text-xs text-slate-400">
                {inspectingAgent.appName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedAgent(inspectingAgent);
                setActiveNavTab('chats');
                closeAgentInspector();
              }}
              className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 transition-colors shadow"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Open Chat</span>
              <ArrowRight className="h-3 w-3" />
            </button>
            <button
              onClick={closeAgentInspector}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-4 border-b border-white/5 bg-slate-900/80 px-6 pt-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview & Specifications
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'files'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Generated Files ({fileKeys.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Architecture info */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3.5">
                  <div className="text-[11px] font-medium text-slate-400">Architecture</div>
                  <div className="mt-1 font-semibold text-sm text-sky-300">
                    {inspectingAgent.agentType}
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3.5">
                  <div className="text-[11px] font-medium text-slate-400">Kind</div>
                  <div className="mt-1 font-semibold text-sm text-indigo-300 capitalize">
                    {inspectingAgent.kind.replace('_', ' ')}
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3.5">
                  <div className="text-[11px] font-medium text-slate-400">Status</div>
                  <div className="mt-1 font-semibold text-sm text-emerald-400 capitalize">
                    Ready for Execution
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Agent Description
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {inspectingAgent.description}
                </p>
              </div>

              {/* Tools list */}
              {inspectingAgent.tools && inspectingAgent.tools.length > 0 && (
                <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                    <Wrench className="h-3.5 w-3.5 text-amber-400" />
                    Available Tools ({inspectingAgent.tools.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {inspectingAgent.tools.map((t, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg border border-sky-500/20 bg-sky-950/40 px-3 py-1 font-mono text-xs text-sky-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Files summary */}
              <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  <Code2 className="h-3.5 w-3.5 text-indigo-400" />
                  Package Files
                </h4>
                <div className="space-y-1">
                  {fileKeys.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 font-mono text-xs text-slate-300 py-1"
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col sm:flex-row gap-4">
              {/* File list sidebar */}
              <div className="w-full sm:w-60 flex-shrink-0 space-y-1 rounded-xl border border-white/5 bg-slate-950/50 p-2 overflow-y-auto max-h-48 sm:max-h-full">
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Files
                </div>
                {fileKeys.map((f) => (
                  <button
                    key={f}
                    onClick={() => setSelectedFile(f)}
                    className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors ${
                      currentFile === f
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{f}</span>
                  </button>
                ))}
              </div>

              {/* Code viewer */}
              <div className="flex-1 rounded-xl border border-white/10 bg-slate-950 p-4 overflow-auto font-mono text-xs text-slate-200">
                {isLoadingFiles ? (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
                  </div>
                ) : currentContent ? (
                  <pre className="whitespace-pre overflow-x-auto leading-relaxed">
                    {currentContent}
                  </pre>
                ) : (
                  <div className="text-slate-500 italic">No content available for this file.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

