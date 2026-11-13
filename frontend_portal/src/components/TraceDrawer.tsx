import React from 'react';
import { X, Zap, Wrench, ShieldAlert, Clock, Copy, Check, Terminal, Cpu } from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';

export const TraceDrawer: React.FC = () => {
  const {
    showTraceDrawer,
    setShowTraceDrawer,
    activeSessionId,
    selectedAgent,
    lastExecutionDuration,
    chatHistory,
  } = usePortalStore();

  const [copiedSession, setCopiedSession] = React.useState(false);

  if (!showTraceDrawer) return null;

  const messages = activeSessionId ? chatHistory[activeSessionId] || [] : [];
  const latestAssistant = [...messages].reverse().find((m) => m.sender === 'assistant');

  const copySession = () => {
    if (activeSessionId) {
      navigator.clipboard.writeText(activeSessionId);
      setCopiedSession(true);
      setTimeout(() => setCopiedSession(false), 2000);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 border-l border-white/10 bg-[#0c101a] shadow-2xl backdrop-blur-2xl flex flex-col animate-slide-left select-none">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/5 px-5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-sky-400" />
          <h3 className="font-semibold text-white text-sm">Execution Telemetry</h3>
        </div>
        <button
          onClick={() => setShowTraceDrawer(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-300">
        {/* Session ID info */}
        <div className="rounded-2xl border border-white/5 bg-[#151c2c]/80 p-3.5 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Active ADK Session
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-slate-200 bg-black/40 rounded-lg p-2 border border-white/5">
            <span className="truncate">{activeSessionId || 'No active session'}</span>
            {activeSessionId && (
              <button
                onClick={copySession}
                className="ml-2 text-slate-400 hover:text-sky-300"
              >
                {copiedSession ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Selected Agent Runtime Info */}
        {selectedAgent && (
          <div className="rounded-2xl border border-white/5 bg-[#151c2c]/80 p-3.5 space-y-2.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Agent Specifications
            </div>
            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="font-semibold text-white">{selectedAgent.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Type:</span>
                <span className="font-mono text-sky-300">{selectedAgent.agentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Latency:</span>
                <span className="font-mono text-emerald-400">
                  {lastExecutionDuration ? `${lastExecutionDuration}ms` : 'Instant'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Backend:</span>
                <span className="font-mono text-slate-400">127.0.0.1:8000</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Tool Invocations */}
        <div className="rounded-2xl border border-white/5 bg-[#151c2c]/80 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Latest Tool Calls
            </span>
            <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-400">
              {latestAssistant?.toolCalls?.length || 0} calls
            </span>
          </div>

          {latestAssistant?.toolCalls && latestAssistant.toolCalls.length > 0 ? (
            <div className="space-y-2">
              {latestAssistant.toolCalls.map((t, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 font-mono text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between text-sky-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" />
                      {t.toolName}
                    </span>
                    <span className="text-[10px] text-emerald-400">{t.status || 'done'}</span>
                  </div>
                  {t.params && (
                    <div className="text-slate-400 text-[10px] truncate">
                      <span className="text-slate-500">Args:</span> {JSON.stringify(t.params)}
                    </div>
                  )}
                  {t.result && (
                    <div className="text-slate-400 text-[10px] truncate">
                      <span className="text-slate-500">Res:</span> {typeof t.result === 'string' ? t.result : JSON.stringify(t.result)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 italic py-2 text-center text-xs">
              No tools called in the latest turn.
            </div>
          )}
        </div>

        {/* Guardrails Status */}
        <div className="rounded-2xl border border-white/5 bg-[#151c2c]/80 p-3.5 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <ShieldAlert className="h-4 w-4 text-emerald-400" />
            <span>Guardrails & Safety</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Every prompt and tool execution passes through the shared ADK guardrail gates for PII sanitization and authorization enforcement.
          </p>
        </div>
      </div>
    </div>
  );
};

