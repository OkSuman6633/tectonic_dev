import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
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
import { SearchProviderPicker } from './SearchProviderPicker';
import { CallTrace } from './CallTrace';
import { GeneratedImages } from './GeneratedImages';
import { SpecCard } from './SpecCard';
import { MarkdownContent } from './MarkdownContent';
import { StreamingAgentDisplay } from './StreamingAgentDisplay';
import { StreamingCodePanel } from '../StreamingCodePanel';
import { refreshAllViews } from '../../workspace/refreshAllViews';
import { AttachButton, AttachmentChips, useAttachments } from './Attachments';
import { AutopilotAnswerCard, IdeasCard, ReviewCard } from './ReviewCards';
import type { ChatMessage } from '../../types/agent';
import { ConnectorNoticeCard } from '../connectors/ConnectorNoticeCard';

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

/** 3D glossy blue robot chatbot avatar matching the uploaded reference design. */
export const ChatbotAvatar: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${className} shrink-0 select-none drop-shadow-[0_3px_8px_rgba(14,165,233,0.35)]`}>
    <defs>
      <radialGradient id="bot-head-grad" cx="35%" cy="22%" r="75%">
        <stop offset="0%" stopColor="#67E8F9" />
        <stop offset="45%" stopColor="#00B4FF" />
        <stop offset="100%" stopColor="#0277BD" />
      </radialGradient>
      <radialGradient id="bot-ball-grad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#7DD3FC" />
        <stop offset="50%" stopColor="#00B4FF" />
        <stop offset="100%" stopColor="#0284C7" />
      </radialGradient>
      <linearGradient id="bot-ear-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#0369A1" />
      </linearGradient>
      <linearGradient id="bot-screen-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#0F172A" />
      </linearGradient>
    </defs>
    {/* Antenna stem & 3D sphere */}
    <rect x="46" y="20" width="8" height="8" rx="3" fill="url(#bot-ear-grad)" />
    <circle cx="50" cy="14" r="9" fill="url(#bot-ball-grad)" />
    <ellipse cx="47" cy="11" rx="3" ry="2" fill="white" fillOpacity="0.45" />
    {/* Left & Right 3D Ears */}
    <rect x="7" y="42" width="11" height="26" rx="5.5" fill="url(#bot-ear-grad)" />
    <rect x="82" y="42" width="11" height="26" rx="5.5" fill="url(#bot-ear-grad)" />
    {/* Main 3D Rounded Head */}
    <rect x="14" y="25" width="72" height="60" rx="24" fill="url(#bot-head-grad)" />
    {/* Top glossy highlight */}
    <path d="M 28 30 Q 50 26 72 30" stroke="white" strokeOpacity="0.4" strokeWidth="2.5" strokeLinecap="round" />
    {/* Inner dark face screen */}
    <rect x="23" y="34" width="54" height="42" rx="15" fill="url(#bot-screen-grad)" stroke="#0369A1" strokeWidth="1.5" />
    {/* Eyes */}
    <ellipse cx="39" cy="52" rx="5" ry="6.5" fill="#F8FAFC" />
    <ellipse cx="61" cy="52" rx="5" ry="6.5" fill="#F8FAFC" />
    {/* Friendly smile */}
    <path d="M 42.5 63.5 Q 50 69.5 57.5 63.5" stroke="#F8FAFC" strokeWidth="3.8" strokeLinecap="round" fill="none" />
  </svg>
);

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
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all p-1 rounded-md hover:bg-slate-900/10 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
      title="Copy message"
    >
      {done ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
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
    setActiveTab,
    continueAfterConnect
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
-  existing agent or by one the Builder builds on the spot; card answers and @mentions are sent as typed. */
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
    <div className="flex flex-col h-full bg-gradient-to-br from-[#eaf2ff] via-[#f4edff] to-[#dff3ff] dark:from-[#060913] dark:via-[#0b1121] dark:to-[#070b17] border-r border-slate-900/10 dark:border-white/10 relative overflow-hidden">
      {/* Ambient iOS-style refractive glow layer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-sky-300/45 dark:bg-sky-500/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-indigo-300/40 dark:bg-indigo-600/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-cyan-200/50 dark:bg-cyan-500/10 blur-3xl"
      />

      {/* Pinned Collapsible HUD Requirement Card */}
      <div className="relative z-10 shrink-0 border-b border-white/80 dark:border-white/10 bg-white/65 dark:bg-slate-900/55 px-3 py-2.5 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.5)] transition-all">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-sky-500 dark:bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.75)] animate-pulse" />
            <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase leading-none tracking-wider text-sky-700 dark:text-sky-400 truncate">
              <Target className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Architect HUD</span>
            </span>
            {builderSessionId && (
              <span className="hidden xl:inline-flex h-[20px] shrink-0 items-center rounded-md bg-white/75 dark:bg-white/[0.07] px-1.5 font-mono text-[12px] leading-none text-slate-700 dark:text-slate-300 border border-slate-900/10 dark:border-white/15 shadow-sm" title={`Session: ${builderSessionId}`}>
                sid:{builderSessionId.slice(0, 6)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Create Another Agent Button */}
            <button
              onClick={() => startNewBuilderSession()}
              className="flex h-7 items-center gap-1 rounded-full border border-sky-500/35 bg-sky-500/15 dark:bg-sky-500/20 px-2.5 text-[12px] font-semibold leading-none text-sky-800 dark:text-sky-200 shadow-sm backdrop-blur-md transition-all hover:bg-sky-500/25 dark:hover:bg-sky-500/30 hover:text-sky-950 dark:hover:text-white active:scale-95 shrink-0"
              title="Start a new session to create another agent"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">New Agent</span>
            </button>

            <button
              onClick={() => refreshAllViews()}
              disabled={isRefreshing}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-900/10 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white disabled:opacity-60 shrink-0"
              title="Refresh all views (keeps this conversation)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setHudCollapsed(!hudCollapsed)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-900/10 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white shrink-0"
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
          <div className="mt-2.5 max-h-[160px] overflow-y-auto pr-1 space-y-2 animate-in fade-in duration-200 scrollbar-thin">
            {/* Goal */}
            <div className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.05] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-inner backdrop-blur-xl">
              <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Identified Goal</span>
              <p className="typo-secondary text-slate-900 dark:text-slate-100 select-text break-words">
                {spec.goal || 'Describe your agent to establish requirements and architecture...'}
              </p>
            </div>

            {/* Configured Tools & Capabilities */}
            <div className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-white/[0.04] p-2.5 backdrop-blur-xl shadow-sm">
              <div className="mb-1.5 flex items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 truncate">
                  <Wrench className="h-3.5 w-3.5 shrink-0" />
                  Configured Tools ({spec.tools.length})
                </span>
                <span className="typo-status shrink-0 text-sky-800 dark:text-sky-200 bg-sky-500/15 px-2 py-0.5 rounded-full border border-sky-500/30 font-medium">Real-time sync</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {spec.tools.length > 0 ? (
                  spec.tools.map((t) => (
                    <span
                      key={t.name}
                      className="inline-flex h-[22px] items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 font-mono text-[12px] text-sky-900 dark:text-sky-100 shadow-sm"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500 dark:bg-sky-400 shadow-[0_0_6px_rgba(14,165,233,0.8)]" />
                      {t.name}
                    </span>
                  ))
                ) : (
                  <span className="typo-metadata text-slate-600 dark:text-slate-400 italic">No tools configured yet</span>
                )}
              </div>
            </div>

            {/* Safety Guardrails */}
            <div className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-white/[0.04] p-2.5 backdrop-blur-xl shadow-sm">
              <div className="mb-1.5 flex items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 truncate">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  Safety Guardrails ({spec.guardrails.length})
                </span>
                <span className="typo-status shrink-0 text-emerald-800 dark:text-emerald-200 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30 font-medium">Zero-LLM Filter</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {spec.guardrails.length > 0 ? (
                  spec.guardrails.map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex h-[22px] items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 text-[12px] text-emerald-900 dark:text-emerald-100 shadow-sm"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                      {g.name}
                    </span>
                  ))
                ) : (
                  <span className="typo-metadata text-slate-600 dark:text-slate-400 italic">No guardrails active</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages Stream */}
      <div
        ref={chatScrollRef}
        className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-4 scroll-smooth min-h-0"
      >
        {chatMessages.map((msg) => {
          const isUser = msg.sender === 'user';
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="max-w-[85%] min-w-0 text-[12px] font-medium text-slate-800 dark:text-slate-200 bg-white/75 dark:bg-white/[0.08] border border-white/85 dark:border-white/15 backdrop-blur-xl shadow-sm rounded-full px-3.5 py-1 break-words [overflow-wrap:anywhere]">
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            );
          }
          const direct = !isUser && !!msg.agentName;
          return (
            <div
              key={msg.id}
              className={`group flex min-w-0 gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <ChatbotAvatar className="w-8 h-8 mt-0.5" />
              )}

              <div className={`max-w-[85%] min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-center gap-1.5 mb-1 flex-wrap ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <span className="typo-agent-name font-semibold text-slate-900 dark:text-slate-100">
                    {isUser ? 'You (Architect)' : direct ? msg.agentName : 'Meta-Agent Builder'}
                  </span>
                  {msg.agentTarget && (
                    <span className="text-[12px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30 backdrop-blur-md">
                      {isUser ? '→ ' : ''}@{msg.agentTarget}
                    </span>
                  )}
                  <span className="typo-metadata font-mono text-slate-600 dark:text-slate-400">{msg.timestamp}</span>
                  {!isUser && msg.content && <CopyButton text={msg.content} />}
                  {msg.recovered && (
                    <span className="typo-status px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-medium" title="This reply finished while the page was being refreshed and was recovered from the server">
                      recovered
                    </span>
                  )}
                </div>

                {/* Message Body */}
                <div
                  className={`typo-body max-w-full min-w-0 p-3.5 rounded-[22px] break-words [overflow-wrap:anywhere] overflow-hidden ${isUser
                      ? 'bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-white rounded-tr-md shadow-[0_10px_28px_-8px_rgba(14,165,233,0.5)] border border-white/25 dark:border-sky-300/20'
                      : 'bg-white/78 dark:bg-slate-900/65 border border-white/85 dark:border-white/12 text-slate-900 dark:text-slate-100 rounded-tl-md shadow-[0_10px_30px_-10px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl backdrop-saturate-150'
                    }`}
                >
                  {msg.content && <MarkdownContent content={msg.content} isUser={isUser} />}
                  {msg.attachments && <div className="mt-2"><AttachmentChips files={msg.attachments} onDark={isUser} /></div>}
                  <GeneratedImages images={msg.images} />

                  {msg.autopilot && <AutopilotAnswerCard run={msg.autopilot} />}
                  {msg.designIdeas && <IdeasCard ideas={msg.designIdeas} />}
                  {msg.designReview && <ReviewCard review={msg.designReview} />}
                  {msg.codeReview && <ReviewCard review={msg.codeReview} />}

                  {msg.architectureSpec && <SpecCard spec={msg.architectureSpec} />}

                  {!isUser && msg.trace && msg.trace.length > 0 && <CallTrace steps={msg.trace} />}

                  {/* The agent could not get connector data: pop-up pointing to External Tools */}
                  {msg.connectorNotice && (
                    <div className="mt-2">
                      <ConnectorNoticeCard view={msg.connectorNotice} busy={isChatLoading}
                        onContinue={() => continueAfterConnect('chat', msg.id)} />
                    </div>
                  )}

                  {/* If this message contains interactive decisions, render the form */}
                  {msg.decisionGroup && (
                    <DecisionCardGroup decisionGroup={msg.decisionGroup} />
                  )}
                </div>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/90 dark:border-white/15 backdrop-blur-md shadow-sm flex items-center justify-center shrink-0 mt-0.5 text-slate-700 dark:text-slate-200">
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
              <div className="mx-auto mb-2.5 w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-[0_10px_24px_-6px_rgba(14,165,233,0.55)] ring-1 ring-white/40 text-white">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="typo-section-heading font-semibold text-slate-950 dark:text-white">
                Ask anything. Tectonic builds or runs the right agent.
              </h3>
              <p className="typo-secondary text-slate-700 dark:text-slate-300 mt-1 max-w-sm mx-auto">
                With Autopilot, questions route to existing agents or automatically design and deploy a custom ADK agent.
              </p>
            </div>

            <div className="space-y-3.5">
              {/* Quick Prompts (Autopilot) */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  <Zap className="w-3.5 h-3.5 shrink-0" /> Quick Prompts (Autopilot)
                </div>
                <div className="flex flex-col gap-2">
                  {ASK_EXAMPLES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q, [])}
                      className="w-full text-left p-3 rounded-2xl bg-white/70 hover:bg-white/90 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] backdrop-blur-2xl backdrop-saturate-150 border border-white/85 dark:border-white/12 hover:border-sky-500/50 shadow-[0_6px_20px_-8px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)] transition-all group flex items-start justify-between gap-3 active:scale-[0.99]"
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <span className="typo-secondary font-medium text-slate-800 dark:text-slate-100 group-hover:text-slate-950 dark:group-hover:text-white flex-1 break-words transition-colors">
                          {q}
                        </span>
                      </div>
                      <span className="typo-status font-semibold text-sky-800 dark:text-sky-200 bg-sky-500/15 px-2.5 py-0.5 rounded-full border border-sky-500/30 group-hover:bg-sky-600 dark:group-hover:bg-sky-500 group-hover:text-white group-hover:border-sky-600 dark:group-hover:border-sky-500 transition-colors shrink-0 mt-0.5">
                        Ask →
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Guided Agent Builds */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  <Hammer className="w-3.5 h-3.5 shrink-0" /> Guided Agent Builds
                </div>
                <div className="flex flex-col gap-2">
                  {BUILD_EXAMPLES.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => send(b.prompt, [], { guided: true })}
                      title={b.prompt}
                      className="w-full text-left p-3 rounded-2xl bg-white/70 hover:bg-white/90 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] backdrop-blur-2xl backdrop-saturate-150 border border-white/85 dark:border-white/12 hover:border-indigo-500/50 shadow-[0_6px_20px_-8px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)] transition-all group flex items-start gap-2.5 active:scale-[0.99]"
                    >
                      <ChatbotAvatar className="w-7 h-7 mt-0.5 group-hover:scale-105 transition-transform" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="typo-agent-name font-semibold text-indigo-800 dark:text-indigo-300 group-hover:text-indigo-950 dark:group-hover:text-indigo-200 transition-colors">
                            {b.label}
                          </span>
                          <span className="typo-status font-semibold text-indigo-800 dark:text-indigo-200 bg-indigo-500/15 px-2.5 py-0.5 rounded-full border border-indigo-500/30 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-600 dark:group-hover:border-indigo-500 transition-colors shrink-0">
                            Build →
                          </span>
                        </div>
                        <p className="typo-secondary text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 break-words transition-colors">
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
        <div className="relative z-10 flex shrink-0 items-center gap-2 overflow-x-auto border-t border-white/80 dark:border-white/10 bg-white/60 dark:bg-slate-900/55 backdrop-blur-2xl backdrop-saturate-150 px-3 py-1.5 no-scrollbar">
          <span className="typo-metadata shrink-0 uppercase font-semibold leading-none text-slate-600 dark:text-slate-400">Next:</span>
          {followUps(lastAssistant).map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={f.run}
              className="inline-flex h-6 max-w-[280px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/90 dark:border-white/15 bg-white/75 dark:bg-white/[0.07] px-2.5 text-[12px] font-medium leading-none text-slate-800 dark:text-slate-200 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:hover:bg-white/15 hover:text-slate-950 dark:hover:text-white"
              title={f.label}
            >
              <f.icon className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
              <span className="truncate">{f.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Chat Box */}
      <form onSubmit={handleSubmit} onDrop={attach.onDrop} onDragOver={(e) => e.preventDefault()}
        className="relative z-10 p-3 border-t border-white/80 dark:border-white/10 bg-white/65 dark:bg-slate-900/60 backdrop-blur-2xl backdrop-saturate-150 shrink-0 shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.1)] dark:shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.45)]">
        <div className="mb-2 flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <AgentTargetPicker />
          </div>
          <SearchProviderPicker />
          <button
            type="button"
            onClick={toggleAutopilot}
            aria-pressed={autopilot}
            className={`typo-status inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-semibold leading-none transition-all shadow-sm backdrop-blur-md ${autopilot
                ? 'bg-sky-500/15 dark:bg-sky-500/20 text-sky-800 dark:text-sky-200 border-sky-500/40 shadow-[0_0_12px_-4px_rgba(14,165,233,0.65)]'
                : 'bg-white/70 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border-slate-900/10 dark:border-white/15 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-white/10'}`}
            title="Ask anything: Tectonic answers directly, asks one of your agents, or builds an agent only when the job needs one"
          >
            <Zap className={`h-3 w-3 shrink-0 ${autopilot ? 'fill-sky-500 text-sky-500 dark:fill-sky-400 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`} />
            <span className="hidden xs:inline">Autopilot</span>
            <span className="uppercase">{autopilot ? 'on' : 'off'}</span>
          </button>
        </div>
        {(attach.files.length > 0 || attach.error) && (
          <div className="mb-2 space-y-1">
            <AttachmentChips files={attach.files} onRemove={attach.remove} />
            {attach.error && <div className="typo-status font-medium text-amber-700 dark:text-amber-400">{attach.error}</div>}
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
            className="typo-body w-full resize-none bg-white/85 dark:bg-slate-950/70 backdrop-blur-xl border border-slate-900/12 dark:border-white/15 rounded-2xl pl-9 pr-10 py-2.5 text-slate-950 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/25 transition-all min-h-[42px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] dark:shadow-inner"
          />
          <button
            type="submit"
            disabled={(!inputVal.trim() && attach.files.length === 0) || isChatLoading}
            className="absolute bottom-[7px] right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold transition-all disabled:opacity-30 disabled:hover:from-sky-500 disabled:hover:to-blue-600 shadow-md shadow-sky-500/35 active:scale-95"
            title={autopilot && !target ? 'Send (autopilot)' : 'Send'}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};