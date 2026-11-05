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
  Wand2 } from 'lucide-react';
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
    <div className="flex flex-col h-full bg-studio-surface/50 border-r border-studio-border backdrop-blur-xl relative">
      {/* Pinned Collapsible HUD Requirement Card */}
      <div className="p-3.5 border-b border-studio-border bg-studio-card/75 backdrop-blur-md z-10 transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider uppercase text-sky-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Agent Architect HUD
            </span>
            {builderSessionId && (
              <span className="text-[10px] text-slate-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">
                sid:{builderSessionId.slice(0, 6)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Create Another Agent Button */}
            <button
              onClick={() => startNewBuilderSession()}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 flex items-center gap-1 transition-all shadow-sm font-semibold"
              title="Start a new session to create another agent"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Another Agent</span>
            </button>

            <button
              onClick={() => refreshAllViews()}
              disabled={isRefreshing}
              className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors disabled:opacity-60"
              title="Refresh all views (keeps this conversation)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setHudCollapsed(!hudCollapsed)}
              className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              {hudCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Guided build journey: 7 interview steps, then Build and Deploy */}
        <JourneyStepper journey={builderJourney} busy={isChatLoading || isGeneratingAgent} />

        {/* HUD Content */}
        {!hudCollapsed && (
          <div className="mt-3 space-y-2.5 text-xs animate-in fade-in duration-200">
            {/* Goal */}
            <div className="bg-white/[0.02] border border-white/5 p-2 rounded-lg">
              <span className="text-slate-400 font-medium text-[11px] block mb-0.5">Identified Goal</span>
              <p className="text-slate-200 text-xs leading-relaxed line-clamp-2">
                {spec.goal}
              </p>
            </div>

            {/* Configured Tools & Capabilities */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 font-medium text-[11px] flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-sky-400" />
                  Configured Tools ({spec.tools.length})
                </span>
                <span className="text-[10px] text-sky-400 font-mono">Real-time sync</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {spec.tools.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/10 text-sky-300 border border-sky-500/20 shadow-sm"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    {t.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Safety Guardrails */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 font-medium text-[11px] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Safety Guardrails ({spec.guardrails.length})
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Zero-LLM Input/Output Filter</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {spec.guardrails.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-sm"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {g.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages Stream */}
      <div 
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
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
              className={`group flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${direct ? 'from-emerald-500 to-teal-600 shadow-emerald-500/20' : 'from-sky-500 to-indigo-600 shadow-sky-500/20'} flex items-center justify-center shadow-md shrink-0`}>
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}

              <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-300">
                    {isUser ? 'You (Architect)' : direct ? msg.agentName : 'Meta-Agent Builder'}
                  </span>
                  {msg.agentTarget && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      {isUser ? '→ ' : ''}@{msg.agentTarget}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                  {!isUser && msg.content && <CopyButton text={msg.content} />}
                  {msg.recovered && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="This reply finished while the page was being refreshed and was recovered from the server">
                      recovered after refresh
                    </span>
                  )}
                </div>

                {/* Message Body */}
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-sky-600 text-white rounded-tr-none shadow-md shadow-sky-600/20'
                      : 'bg-studio-card/90 border border-white/5 text-slate-200 rounded-tl-none shadow-sm'
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
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
              )}
            </div>
          );
        })}

        {/* Welcome: what you can do here */}
        {isWelcome && (
          <div className="mx-auto max-w-2xl pt-2 animate-in fade-in duration-300">
            <div className="text-center mb-4">
              <div className="mx-auto mb-2 w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">Ask anything. Tectonic answers, or uses or builds the right agent.</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                With Autopilot on, your question goes to an existing agent, or a new one is designed, reviewed by the critic,
                built and asked for you. Attach images or documents with 📎.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider text-sky-300">
                  <Zap className="w-3 h-3" /> Ask anything (autopilot)
                </div>
                <div className="space-y-1.5">
                  {ASK_EXAMPLES.map((q) => (
                    <button key={q} type="button" onClick={() => send(q, [])}
                            className="w-full text-left text-[11px] leading-snug p-2.5 rounded-xl bg-sky-500/[0.06] hover:bg-sky-500/[0.12] border border-sky-500/15 hover:border-sky-500/35 text-slate-200 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider text-indigo-300">
                  <Hammer className="w-3 h-3" /> Build an agent (guided)
                </div>
                <div className="space-y-1.5">
                  {BUILD_EXAMPLES.map((b) => (
                    <button key={b.label} type="button" onClick={() => send(b.prompt, [], { guided: true })} title={b.prompt}
                            className="w-full text-left text-[11px] leading-snug p-2.5 rounded-xl bg-indigo-500/[0.06] hover:bg-indigo-500/[0.12] border border-indigo-500/15 hover:border-indigo-500/35 text-slate-200 transition-colors">
                      <span className="font-semibold">{b.label}</span>
                      <span className="block text-slate-400 line-clamp-1">{b.prompt}</span>
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
        <div className="px-4 py-2 border-t border-white/5 bg-studio-surface/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] uppercase font-mono text-slate-500 shrink-0">Next:</span>
          {followUps(lastAssistant).map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={f.run}
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 whitespace-nowrap transition-colors max-w-[280px]"
              title={f.label}
            >
              <f.icon className="w-3 h-3 shrink-0" />
              <span className="truncate">{f.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Chat Box */}
      <form onSubmit={handleSubmit} onDrop={attach.onDrop} onDragOver={(e) => e.preventDefault()}
            className="p-3 border-t border-studio-border bg-studio-card/80">
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AgentTargetPicker />
          </div>
          <button
            type="button"
            onClick={toggleAutopilot}
            aria-pressed={autopilot}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${
              autopilot
                ? 'bg-sky-500/20 text-sky-200 border-sky-500/40 shadow-[0_0_12px_-4px_rgba(45,212,255,0.7)]'
                : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-slate-200'}`}
            title="Ask anything: Tectonic answers directly, asks one of your agents, or builds an agent only when the job needs one"
          >
            <Zap className={`w-3 h-3 ${autopilot ? 'fill-sky-300/40' : ''}`} />
            Autopilot {autopilot ? 'on' : 'off'}
          </button>
        </div>
        {(attach.files.length > 0 || attach.error) && (
          <div className="mb-2 space-y-1">
            <AttachmentChips files={attach.files} onRemove={attach.remove} />
            {attach.error && <div className="text-[11px] text-amber-300">{attach.error}</div>}
          </div>
        )}
        <div className="relative flex items-end">
          {mentionQuery !== undefined && (
            <MentionSuggestions query={mentionQuery} onPick={(id) => setInputVal(`@${id} `)} />
          )}
          <AttachButton onFiles={attach.add} disabled={isChatLoading} className="absolute left-1.5 bottom-1.5 z-10" />
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
                ? 'Ask anything: answered directly, by your agents, or by a new one if needed (Shift+Enter for a new line)…'
                : 'Describe an agent to build, or type @ to ask an existing one…'}
            className="w-full resize-none text-xs leading-relaxed bg-studio-surface/90 border border-white/10 rounded-xl pl-9 pr-10 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
          <button
            type="submit"
            disabled={(!inputVal.trim() && attach.files.length === 0) || isChatLoading}
            className="absolute right-2 bottom-1.5 p-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-30 disabled:hover:bg-sky-500 transition-colors"
            title={autopilot && !target ? 'Send (autopilot)' : 'Send'}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
