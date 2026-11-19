import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Bot,
  User,
  Send,
  ChevronDown,
  ChevronUp,
  Wrench,
  ShieldCheck,
  Target,
  RefreshCw,
  Plus,
  Copy,
  Check,
  Zap,
  Hammer,
  Sparkles,
  MessageSquare,
  Play,
  Wand2
} from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';
import { DecisionCardGroup } from './DecisionCardGroup';
import { JourneyStepper } from './JourneyStepper';
import { AgentTargetPicker, MentionSuggestions } from './AgentTargetPicker';
import { CallTrace } from './CallTrace';
import { SpecCard } from './SpecCard';
import { MarkdownContent } from './MarkdownContent';
import { StreamingAgentDisplay } from './StreamingAgentDisplay';
import { StreamingCodePanel } from '../StreamingCodePanel';
import { refreshAllViews } from '../../workspace/refreshAllViews';
import { AttachButton, AttachmentChips, useAttachments } from './Attachments';
import { AutopilotAnswerCard, IdeasCard, ReviewCard } from './ReviewCards';
import type { ChatMessage } from '../../types/agent';

const AUTOPILOT_KEY = 'tectonic-autopilot';
const ATTACHED_ONLY = 'Please look at the attached file(s).';

const ASK_EXAMPLES = [
  'Analyze the attached sales CSV and tell me the top 3 trends',
  'Plan a 3-day Tokyo trip on a $1,500 budget',
  'Draft a polite payment reminder email for an overdue invoice',
];
const BUILD_EXAMPLES = [
  { label: 'Attendance Manager', prompt: 'Create an attendance manager agent that logs employee check-in and generates reports' },
  { label: 'Meeting Scheduler', prompt: 'Create a local meeting scheduler agent with SQLite storage and iCal integration' },
  { label: 'Expense Tracker', prompt: 'Build a personal finance expense tracker that enforces PII sanitization and daily spend limits' },
];

const readAutopilot = (): boolean => {
  try {
    return localStorage.getItem(AUTOPILOT_KEY) !== 'off';
  } catch {
    return true;
  }
};

/** Copies a message's text; shows a tick for a moment. */
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }).catch(() => { /* clipboard blocked */ });
      }}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-200"
      title="Copy message"
    >
      {done ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
};

export const ArchitectChat: React.FC = () => {
  const {
    chatMessages,
    sendArchitectMessage,
    isChatLoading,
    spec,
    hudCollapsed,
    setHudCollapsed,
    startNewBuilderSession,
    builderSessionId,
    isGeneratingAgent,
    pendingFiles,
    setCurrentAgentPhase,
    builderJourney,
    agentDirectory,
    refreshDirectory,
    chatTarget,
    setChatTarget,
    isRefreshing,
    refreshCreatedAgents,
    setSelectedAgent,
    setActiveTab
  } = useAgentStudioStore();

  const [inputVal, setInputVal] = useState('');
  const attach = useAttachments();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [autopilot, setAutopilot] = useState(readAutopilot);

  const toggleAutopilot = () => {
    setAutopilot((on) => {
      try { localStorage.setItem(AUTOPILOT_KEY, on ? 'off' : 'on'); } catch { /* not persisted */ }
      return !on;
    });
  };

  // The textarea grows with its content (up to ~8 lines).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputVal]);

  // Every agent in the Studio is reachable from this chat: load the directory once.
  useEffect(() => {
    refreshDirectory();
  }, [refreshDirectory]);

  const mentionQuery = inputVal.match(/^@([\w./-]*)$/)?.[1];
  const target = agentDirectory.find((a) => a.id === chatTarget);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  const lastAssistant = [...chatMessages].reverse().find((m) => m.sender === 'assistant');
  const cardPending = !!lastAssistant?.decisionGroup && !lastAssistant.decisionGroup.isSubmitted;
  const isWelcome = chatMessages.length <= 1 && !isChatLoading;

  /** Sends to the Builder (or the picked agent). With autopilot on, a plain question is answered by an
   *  existing agent or by one the Builder builds on the spot; card answers and @mentions are sent as typed. */
  const send = (text: string, files = attach.files, opts?: { guided?: boolean }) => {
    const typed = text.trim() ? text : files.length ? ATTACHED_ONLY : '';
    if (!typed || isChatLoading) return;
    const asTyped = !!chatTarget || /^\s*@/.test(typed) || typed.includes('DECISIONS_JSON:') || cardPending;
    if (autopilot && !opts?.guided && !asTyped) sendArchitectMessage(`AUTOPILOT: ${typed}`, typed, files);
    else sendArchitectMessage(typed, undefined, files);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputVal.trim() && attach.files.length === 0) || isChatLoading) return;
    const msg = inputVal;
    const files = attach.files;
    setInputVal('');
    attach.clear();
    send(msg, files);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  /** Follow-up suggestions for the latest reply. */
  const openAgent = async (project: string, tab: 'sandbox' | 'inspector') => {
    await refreshCreatedAgents();
    const agent = useAgentStudioStore.getState().createdAgents.find((a) => a.name === project);
    if (agent) setSelectedAgent(agent);
    setActiveTab(tab);
  };
  const followUps = (m: ChatMessage | undefined): { label: string; icon: React.ElementType; run: () => void }[] => {
    if (cardPending) {
      return [{ label: 'Use AI recommendations', icon: Wand2, run: () => sendArchitectMessage('use defaults') }];
    }
    const agentId = m?.autopilot?.project ?? m?.agentTarget;
    if (agentId) {
      const project = agentId.split('/')[0];
      return [
        { label: `Ask @${agentId} a follow-up`, icon: MessageSquare, run: () => { setChatTarget(agentId); inputRef.current?.focus(); } },
        { label: 'Open in Sandbox', icon: Play, run: () => { void openAgent(project, 'sandbox'); } },
        { label: 'Improve this agent', icon: Wand2, run: () => { setInputVal(`Improve ${project}: `); inputRef.current?.focus(); } },
      ];
    }
    return ASK_EXAMPLES.slice(0, 2).map((q) => ({ label: q, icon: Zap, run: () => send(q, []) }));
  };

  return (
    <div className="flex flex-col h-full bg-transparent border-r border-white/5 relative overflow-hidden">
      {/* Pinned Collapsible HUD Requirement Card */}
      <div className="z-10 shrink-0 border-b border-white/10 bg-slate-900/70 px-3 py-2 backdrop-blur-md transition-all">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(45,212,255,0.7)] animate-pulse" />
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase leading-none tracking-wider text-sky-400 truncate">
              <Target className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Architect HUD</span>
            </span>
            {builderSessionId && (
              <span className="hidden xl:inline-flex h-[18px] shrink-0 items-center rounded bg-white/5 px-1.5 font-mono text-[10px] leading-none text-slate-400 border border-white/10" title={`Session: ${builderSessionId}`}>
                sid:{builderSessionId.slice(0, 6)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Create Another Agent Button */}
            <button
              onClick={() => startNewBuilderSession()}
              className="flex h-7 items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/15 px-2.5 text-[11px] font-semibold leading-none text-sky-300 shadow-sm transition-all hover:bg-sky-500/25 hover:text-sky-200 active:scale-95 shrink-0"
              title="Start a new session to create another agent"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">New Agent</span>
            </button>

            <button
              onClick={() => refreshAllViews()}
              disabled={isRefreshing}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60 shrink-0"
              title="Refresh all views (keeps this conversation)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setHudCollapsed(!hudCollapsed)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white shrink-0"
              title={hudCollapsed ? 'Expand HUD details' : 'Collapse HUD details'}
            >
              {hudCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Guided build journey: 7 interview steps, then Build and Deploy */}
        <JourneyStepper journey={builderJourney} busy={isChatLoading || isGeneratingAgent} />

        {/* HUD Content */}
        {!hudCollapsed && (
          <div className="mt-2.5 max-h-[160px] overflow-y-auto pr-1 space-y-2 text-xs animate-in fade-in duration-200 scrollbar-thin">
            {/* Goal */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 shadow-inner">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Identified Goal</span>
              <p className="text-slate-200 text-xs leading-relaxed select-text font-normal break-words">
                {spec.goal || 'Describe your agent to establish requirements and architecture...'}
              </p>
            </div>

            {/* Configured Tools & Capabilities */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-400 truncate">
                  <Wrench className="h-3.5 w-3.5 shrink-0" />
                  Configured Tools ({spec.tools.length})
                </span>
                <span className="shrink-0 font-mono text-[10px] font-semibold text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">Real-time sync</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {spec.tools.length > 0 ? (
                  spec.tools.map((t) => (
                    <span
                      key={t.name}
                      className="inline-flex h-[20px] items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 font-mono text-[10px] font-medium text-sky-200 shadow-sm"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(45,212,255,0.8)]" />
                      {t.name}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-500 italic">No tools configured yet</span>
                )}
              </div>
            </div>

            {/* Safety Guardrails */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 truncate">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  Safety Guardrails ({spec.guardrails.length})
                </span>
                <span className="shrink-0 font-mono text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Zero-LLM Filter</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {spec.guardrails.length > 0 ? (
                  spec.guardrails.map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex h-[20px] items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-200 shadow-sm"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      {g.name}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-500 italic">No guardrails active</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages Stream */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto p-3.5 space-y-4 scroll-smooth min-h-0"
      >
        {chatMessages.map((msg) => {
          const isUser = msg.sender === 'user';
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="max-w-[85%] text-[11px] text-slate-300 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1">
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            );
          }
          const direct = !isUser && !!msg.agentName;
          return (
            <div
              key={msg.id}
              className={`group flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${direct ? 'from-emerald-500 to-teal-600 shadow-emerald-500/20' : 'from-sky-500 to-indigo-600 shadow-sky-500/20'} flex items-center justify-center shadow-sm shrink-0 mt-0.5`}>
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              )}

              <div className={`max-w-[85%] min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-center gap-1.5 mb-1 flex-wrap ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[11px] font-semibold text-slate-200">
                    {isUser ? 'You (Architect)' : direct ? msg.agentName : 'Meta-Agent Builder'}
                  </span>
                  {msg.agentTarget && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      {isUser ? '→ ' : ''}@{msg.agentTarget}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 font-mono">{msg.timestamp}</span>
                  {!isUser && msg.content && <CopyButton text={msg.content} />}
                  {msg.recovered && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="This reply finished while the page was being refreshed and was recovered from the server">
                      recovered
                    </span>
                  )}
                </div>

                {/* Message Body */}
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed break-words overflow-hidden ${isUser
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-tr-none shadow-md shadow-sky-600/20 border border-sky-400/20'
                      : 'bg-slate-900/80 border border-white/10 text-slate-100 rounded-tl-none shadow-md shadow-black/20 backdrop-blur-md'
                    }`}
                >
                  <MarkdownContent content={msg.content} isUser={isUser} />
                  {msg.attachments && <div className="mt-2"><AttachmentChips files={msg.attachments} onDark={isUser} /></div>}

                  {msg.autopilot && <AutopilotAnswerCard run={msg.autopilot} />}
                  {msg.designIdeas && <IdeasCard ideas={msg.designIdeas} />}
                  {msg.designReview && <ReviewCard review={msg.designReview} />}
                  {msg.codeReview && <ReviewCard review={msg.codeReview} />}

                  {msg.architectureSpec && <SpecCard spec={msg.architectureSpec} />}

                  {!isUser && msg.trace && msg.trace.length > 0 && <CallTrace steps={msg.trace} />}

                  {/* If this message contains interactive decisions, render the form */}
                  {msg.decisionGroup && (
                    <DecisionCardGroup decisionGroup={msg.decisionGroup} />
                  )}
                </div>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 text-slate-300">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}

        {/* Welcome: what you can do here */}
        {isWelcome && (
          <div className="mx-auto max-w-xl py-3 px-1 animate-in fade-in duration-300">
            {/* Hero Header */}
            <div className="text-center mb-4">
              <div className="mx-auto mb-2.5 w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                Ask anything. Tectonic builds or runs the right agent.
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                With Autopilot, questions route to existing agents or automatically design and deploy a custom ADK agent.
              </p>
            </div>

            <div className="space-y-3.5">
              {/* Quick Prompts (Autopilot) */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  <Zap className="w-3.5 h-3.5 shrink-0" /> Quick Prompts (Autopilot)
                </div>
                <div className="flex flex-col gap-2">
                  {ASK_EXAMPLES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q, [])}
                      className="w-full text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-sky-500/40 shadow-sm transition-all group flex items-start justify-between gap-3 active:scale-[0.99]"
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white flex-1 break-words font-medium transition-colors">
                          {q}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-md border border-sky-500/30 group-hover:bg-sky-600 dark:group-hover:bg-sky-500 group-hover:text-white group-hover:border-sky-600 dark:group-hover:border-sky-500 transition-colors shrink-0 mt-0.5">
                        Ask →
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Guided Agent Builds */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  <Hammer className="w-3.5 h-3.5 shrink-0" /> Guided Agent Builds
                </div>
                <div className="flex flex-col gap-2">
                  {BUILD_EXAMPLES.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => send(b.prompt, [], { guided: true })}
                      title={b.prompt}
                      className="w-full text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-indigo-500/40 shadow-sm transition-all group flex items-start gap-2.5 active:scale-[0.99]"
                    >
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-semibold text-xs text-indigo-600 dark:text-indigo-300 group-hover:text-indigo-800 dark:group-hover:text-indigo-200 transition-colors">
                            {b.label}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-md border border-indigo-500/30 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-600 dark:group-hover:border-indigo-500 transition-colors shrink-0">
                            Build →
                          </span>
                        </div>
                        <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 break-words font-normal transition-colors">
                          {b.prompt}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Agent Processing Display */}
        {(isChatLoading || isGeneratingAgent) && (
          <div className="space-y-3 animate-in fade-in duration-300">
            <StreamingAgentDisplay
              isActive={isChatLoading || isGeneratingAgent}
              onPhaseChange={setCurrentAgentPhase}
            />
            {isGeneratingAgent && pendingFiles.length > 0 && (
              <StreamingCodePanel
                isActive={true}
                files={pendingFiles}
                currentAgent="code_generator"
              />
            )}
          </div>
        )}
      </div>

      {/* Follow-ups for the latest reply */}
      {!isWelcome && !isChatLoading && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-slate-900/60 px-3 py-1.5 no-scrollbar">
          <span className="shrink-0 font-mono text-[10px] uppercase leading-none text-slate-400">Next:</span>
          {followUps(lastAssistant).map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={f.run}
              className="inline-flex h-6 max-w-[280px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 text-[11px] leading-none text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              title={f.label}
            >
              <f.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{f.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Chat Box */}
      <form onSubmit={handleSubmit} onDrop={attach.onDrop} onDragOver={(e) => e.preventDefault()}
        className="p-3 border-t border-white/10 bg-slate-900/70 backdrop-blur-md shrink-0 shadow-lg">
        <div className="mb-2 flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <AgentTargetPicker />
          </div>
          <button
            type="button"
            onClick={toggleAutopilot}
            aria-pressed={autopilot}
            className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-bold leading-none transition-all shadow-sm ${autopilot
                ? 'bg-sky-500/20 text-sky-200 border-sky-500/40 shadow-[0_0_12px_-4px_rgba(45,212,255,0.7)]'
                : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-slate-200 hover:bg-white/[0.08]'}`}
            title="Ask anything: Tectonic answers directly, asks one of your agents, or builds an agent only when the job needs one"
          >
            <Zap className={`h-3 w-3 shrink-0 ${autopilot ? 'fill-sky-400 text-sky-400' : 'text-slate-400'}`} />
            <span className="hidden xs:inline">Autopilot</span>
            <span className="uppercase">{autopilot ? 'on' : 'off'}</span>
          </button>
        </div>
        {(attach.files.length > 0 || attach.error) && (
          <div className="mb-2 space-y-1">
            <AttachmentChips files={attach.files} onRemove={attach.remove} />
            {attach.error && <div className="text-[11px] text-amber-400 font-medium">{attach.error}</div>}
          </div>
        )}
        <div className="relative flex items-end">
          {mentionQuery !== undefined && (
            <MentionSuggestions query={mentionQuery} onPick={(id) => setInputVal(`@${id} `)} />
          )}
          <AttachButton onFiles={attach.add} disabled={isChatLoading} className="absolute bottom-[6px] left-1.5 z-10" />
          <textarea
            ref={inputRef}
            rows={1}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={attach.onPaste}
            disabled={isChatLoading}
            placeholder={target
              ? `Message @${target.id}…`
              : autopilot
                ? 'Ask anything or describe an agent to build (Shift+Enter for newline)…'
                : 'Describe an agent to build, or type @ to pick one…'}
            className="w-full resize-none text-xs leading-relaxed bg-slate-950/80 border border-white/10 rounded-xl pl-9 pr-10 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-all min-h-[40px] shadow-inner"
          />
          <button
            type="submit"
            disabled={(!inputVal.trim() && attach.files.length === 0) || isChatLoading}
            className="absolute bottom-[6px] right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition-all disabled:opacity-30 disabled:hover:bg-sky-500 shadow-md shadow-sky-500/20 active:scale-95"
            title={autopilot && !target ? 'Send (autopilot)' : 'Send'}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
