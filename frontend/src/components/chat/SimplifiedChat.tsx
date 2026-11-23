import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  User,
  Send,
  Zap,
  Sparkles,
  Paperclip,
  Copy,
  Check,
  Play,
  Wand2,
  MessageSquare,
  Hammer,
  Plus,
  CornerDownLeft,
  Square,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';
import { MarkdownContent } from './MarkdownContent';
import { ChatbotAvatar } from './ArchitectChat';
import { useAttachments, AttachmentChips, AttachButton } from './Attachments';
import { AgentTargetPicker, MentionSuggestions } from './AgentTargetPicker';
import { SearchProviderPicker } from './SearchProviderPicker';
import { DecisionCardGroup } from './DecisionCardGroup';
import { CallTrace } from './CallTrace';
import { GeneratedImages } from './GeneratedImages';
import { SpecCard } from './SpecCard';
import { StreamingAgentDisplay } from './StreamingAgentDisplay';
import { StreamingCodePanel } from '../StreamingCodePanel';
import { AutopilotAnswerCard, IdeasCard, ReviewCard } from './ReviewCards';
import { ConnectorNoticeCard } from '../connectors/ConnectorNoticeCard';
import { WebSearchResultsCard } from './WebSearchResultsCard';
import type { ChatMessage } from '../../types/agent';

const AUTOPILOT_KEY = 'tectonic-autopilot';
const ATTACHED_ONLY = 'Please look at the attached file(s).';

const readAutopilot = (): boolean => {
  try {
    return localStorage.getItem(AUTOPILOT_KEY) !== 'off';
  } catch {
    return true;
  }
};

const PROMPT_SUGGESTIONS = [
  {
    title: 'Attendance Manager Agent',
    desc: 'Logs employee check-ins, tracks shifts & generates daily reports with SQLite',
    icon: Sparkles,
    color: 'from-sky-500/20 to-blue-500/20 text-sky-400 border-sky-500/30',
    prompt: 'Create an attendance manager agent that logs employee check-in and generates reports',
  },
  {
    title: 'Financial Expense Tracker',
    desc: 'Analyzes receipts, enforces PII sanitization & alerts on budget variances',
    icon: Zap,
    color: 'from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30',
    prompt: 'Build a personal finance expense tracker that enforces PII sanitization and daily spend limits',
  },
  {
    title: 'Local Meeting Scheduler',
    desc: 'Schedules calendar appointments, resolves conflicts & sends iCal invites',
    icon: MessageSquare,
    color: 'from-indigo-500/20 to-purple-500/20 text-indigo-400 border-indigo-500/30',
    prompt: 'Create a local meeting scheduler agent with SQLite storage and iCal integration',
  },
  {
    title: 'Multi-Agent Research Pipeline',
    desc: 'Combines RAG search with vector memory for deep domain analysis',
    icon: Hammer,
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
    prompt: 'Design a multi-agent RAG workflow with vector database search and summarizer agent',
  },
];

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }).catch(() => {});
      }}
      className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/10 transition-colors"
      title="Copy response"
    >
      {done ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

export const SimplifiedChat: React.FC = () => {
  const {
    chatMessages,
    sendArchitectMessage,
    stopExecution,
    isChatLoading,
    isGeneratingAgent,
    pendingFiles,
    setCurrentAgentPhase,
    refreshDirectory,
    chatTarget,
    setChatTarget,
    refreshCreatedAgents,
    setSelectedAgent,
    setActiveTab,
    continueAfterConnect,
    startNewBuilderSession,
  } = useAgentStudioStore();

  const [inputVal, setInputVal] = useState('');
  const [autopilot, setAutopilot] = useState(readAutopilot);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attach = useAttachments();

  // Load agent directory once
  useEffect(() => {
    refreshDirectory();
  }, [refreshDirectory]);

  // Auto-resize textarea
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputVal]);

  // Scroll to bottom smoothly when messages or loading state changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages, isChatLoading, isGeneratingAgent]);

  const toggleAutopilot = () => {
    setAutopilot((on) => {
      try { localStorage.setItem(AUTOPILOT_KEY, on ? 'off' : 'on'); } catch {}
      return !on;
    });
  };

  const lastAssistant = [...chatMessages].reverse().find((m) => m.sender === 'assistant');
  const cardPending = !!lastAssistant?.decisionGroup && !lastAssistant.decisionGroup.isSubmitted;
  const isWelcome = chatMessages.length <= 1 && !isChatLoading;

  const send = (text: string, files = attach.files, opts?: { guided?: boolean }) => {
    const typed = text.trim() ? text : files.length ? ATTACHED_ONLY : '';
    if (!typed || isChatLoading) return;
    const asTyped = !!chatTarget || /^\s*@/.test(typed) || typed.includes('DECISIONS_JSON:') || cardPending;
    if (autopilot && !opts?.guided && !asTyped) sendArchitectMessage(`AUTOPILOT: ${typed}`, typed, files);
    else sendArchitectMessage(typed, undefined, files);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputVal.trim() && attach.files.length === 0) || isChatLoading) return;
    const msg = inputVal;
    const files = attach.files;
    setInputVal('');
    attach.clear();
    send(msg, files);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && (isChatLoading || isGeneratingAgent)) {
      e.preventDefault();
      stopExecution();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

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
    return [
      { label: 'Create Another Agent', icon: Plus, run: () => startNewBuilderSession() },
      { label: 'Analyze architecture', icon: Sparkles, run: () => send('Review the agent architecture and suggest improvements', []) },
    ];
  };

  const mentionQuery = inputVal.match(/^@([\w./-]*)$/)?.[1];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-br from-[#eaf2ff] via-[#f4edff] to-[#dff3ff] dark:from-[#060913] dark:via-[#0b1121] dark:to-[#070b17] text-slate-900 dark:text-[var(--studio-text)] transition-colors">
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

      {/* Main Conversation Stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 md:px-8 no-scrollbar scroll-smooth"
      >
        <div className="mx-auto max-w-3xl space-y-6 pb-36">
          <AnimatePresence mode="popLayout">
            {isWelcome ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="flex flex-col items-center pt-8 md:pt-14 text-center"
              >
                {/* Gemini-style Hero Header */}
                <div className="relative mb-6">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 opacity-25 blur-xl animate-pulse" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/70 dark:bg-white/[0.08] border border-white/85 dark:border-white/15 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150">
                    <ChatbotAvatar className="h-10 w-10" />
                  </div>
                </div>

                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-3">
                  Hello, Architect.
                </h1>
                <p className="text-base text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed mb-10">
                  What would you like to build today? Ask anything—Tectonic designs, tests, and deploys agents in real-time.
                </p>

                {/* Prompt Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full text-left">
                  {PROMPT_SUGGESTIONS.map((item, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.015, y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => {
                        setInputVal(item.prompt);
                        inputRef.current?.focus();
                      }}
                      className="group flex flex-col justify-between p-4 rounded-2xl bg-white/70 hover:bg-white/90 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] backdrop-blur-2xl backdrop-saturate-150 border border-white/85 dark:border-white/12 hover:border-sky-500/50 shadow-[0_6px_20px_-8px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)] transition-all text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl bg-gradient-to-br border ${item.color} shrink-0`}>
                          <item.icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
                            {item.title}
                          </h2>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3.5 flex items-center justify-end gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Use template</span>
                        <CornerDownLeft className="w-3 h-3" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isUser = msg.sender === 'user';
                const isSystem = msg.sender === 'system';

                if (isSystem) {
                  return (
                    <div key={msg.id || idx} className="flex justify-center py-2">
                      <div className="rounded-full bg-white/75 dark:bg-white/[0.08] border border-white/85 dark:border-white/15 px-4 py-1 text-xs text-slate-700 dark:text-slate-300 max-w-lg text-center backdrop-blur-xl shadow-sm">
                        <MarkdownContent content={msg.content} isUser={false} />
                      </div>
                    </div>
                  );
                }

                return (
                  <motion.div
                    key={msg.id || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`group flex gap-3.5 md:gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="mt-1 shrink-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 dark:bg-white/[0.08] border border-white/85 dark:border-white/15 shadow-sm backdrop-blur-xl">
                          <ChatbotAvatar className="h-6 w-6" />
                        </div>
                      </div>
                    )}

                    <div className={`flex flex-col min-w-0 max-w-[88%] md:max-w-[82%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                      {/* Message Meta Info */}
                      <div className="flex items-center gap-2 px-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {msg.agentTarget && (
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold backdrop-blur-md">
                            {isUser ? '→ ' : ''}@{msg.agentTarget}
                          </span>
                        )}
                        <span>{msg.timestamp}</span>
                        {!isUser && msg.content && <CopyButton text={msg.content} />}
                      </div>

                      {/* Message Bubble Body */}
                      <div
                        className={`p-4 rounded-[22px] break-words [overflow-wrap:anywhere] text-[14px] md:text-[15px] leading-relaxed transition-all ${
                          isUser
                            ? 'bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-white rounded-tr-md shadow-[0_10px_28px_-8px_rgba(14,165,233,0.5)] border border-white/25 dark:border-sky-300/20 backdrop-blur-xl'
                            : 'bg-white/78 dark:bg-slate-900/65 border border-white/85 dark:border-white/12 text-slate-900 dark:text-slate-100 rounded-tl-md shadow-[0_10px_30px_-10px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl backdrop-saturate-150'
                        }`}
                      >
                        {msg.content && <MarkdownContent content={msg.content} isUser={isUser} />}
                        
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2.5">
                            <AttachmentChips files={msg.attachments} onDark={isUser} />
                          </div>
                        )}

                        <GeneratedImages images={msg.images} />
                        {msg.webSearchResults && <WebSearchResultsCard data={msg.webSearchResults} />}
                        {msg.autopilot && <AutopilotAnswerCard run={msg.autopilot} />}
                        {msg.designIdeas && <IdeasCard ideas={msg.designIdeas} />}
                        {msg.designReview && <ReviewCard review={msg.designReview} />}
                        {msg.codeReview && <ReviewCard review={msg.codeReview} />}
                        {msg.architectureSpec && <SpecCard spec={msg.architectureSpec} />}

                        {!isUser && msg.trace && msg.trace.length > 0 && (
                          <div className="mt-2">
                            <CallTrace steps={msg.trace} />
                          </div>
                        )}

                        {msg.connectorNotice && (
                          <div className="mt-2">
                            <ConnectorNoticeCard
                              view={msg.connectorNotice}
                              busy={isChatLoading}
                              onContinue={() => continueAfterConnect('chat', msg.id)}
                            />
                          </div>
                        )}

                        {msg.decisionGroup && (
                          <div className="mt-3">
                            <DecisionCardGroup decisionGroup={msg.decisionGroup} />
                          </div>
                        )}
                      </div>
                    </div>

                    {isUser && (
                      <div className="mt-1 shrink-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 dark:bg-white/[0.08] border border-white/85 dark:border-white/15 text-slate-700 dark:text-slate-300 shadow-sm backdrop-blur-xl">
                          <User className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}

            {/* AI Generation and Streaming Phase */}
            {(isChatLoading || isGeneratingAgent) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 pt-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/20 border border-sky-400/40 animate-pulse">
                      <ChatbotAvatar className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-400 animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-400 animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-400 animate-bounce" />
                      </div>
                      <span className="text-xs font-mono font-medium text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                        Architect is synthesizing...
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={stopExecution}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/35 hover:border-rose-500/60 backdrop-blur-md shadow-sm transition-all active:scale-95 shrink-0"
                    title="Stop execution and free chat (Esc)"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-white/85 dark:border-white/12 bg-white/75 dark:bg-slate-900/65 p-3.5 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                  <StreamingAgentDisplay
                    isActive={isChatLoading || isGeneratingAgent}
                    onPhaseChange={setCurrentAgentPhase}
                  />
                  {isGeneratingAgent && pendingFiles.length > 0 && (
                    <div className="mt-3">
                      <StreamingCodePanel
                        isActive={true}
                        files={pendingFiles}
                        currentAgent="code_generator"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Bottom Section: Follow-ups + Glassmorphic Input Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#dff3ff] via-[#dff3ff]/95 dark:from-[#070b17] dark:via-[#070b17]/90 to-transparent pb-4 pt-6 px-4 md:px-8 pointer-events-none">
        <div className="mx-auto max-w-3xl pointer-events-auto">
          {/* Follow-up suggestions */}
          {!isWelcome && !isChatLoading && (
            <div className="mb-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-mono uppercase font-semibold text-slate-600 dark:text-slate-400 shrink-0">Next:</span>
              {followUps(lastAssistant).map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={f.run}
                  className="flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-white/90 dark:border-white/15 bg-white/75 dark:bg-white/[0.07] px-2.5 text-[11px] font-medium text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-white/15 hover:text-slate-950 dark:hover:text-white transition-all shadow-sm backdrop-blur-md"
                >
                  <f.icon className="h-3 w-3 text-sky-500 dark:text-sky-400" />
                  <span className="truncate">{f.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Mention Suggestions Popup */}
          {mentionQuery !== undefined && (
            <div className="mb-2">
              <MentionSuggestions
                query={mentionQuery}
                onSelect={(agent) => {
                  setChatTarget(agent.id);
                  setInputVal('');
                  inputRef.current?.focus();
                }}
              />
            </div>
          )}

          {/* Gemini-Style Floating Glass Input Bar */}
          <form
            onSubmit={handleSubmit}
            onDrop={attach.onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="group relative rounded-3xl border border-white/85 dark:border-white/15 bg-white/75 dark:bg-slate-900/65 hover:border-white dark:hover:border-white/25 focus-within:border-sky-500/70 dark:focus-within:border-sky-400/60 focus-within:ring-4 focus-within:ring-sky-500/15 shadow-[0_12px_36px_-8px_rgba(15,23,42,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_12px_36px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150 transition-all"
          >
            {/* Top Toolbar Inside Bar */}
            <div className="flex items-center justify-between border-b border-white/80 dark:border-white/[0.08] px-3.5 py-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <AgentTargetPicker />
                <span className="h-3 w-px bg-slate-300 dark:bg-white/10" />
                <SearchProviderPicker />
              </div>

              <button
                type="button"
                onClick={toggleAutopilot}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-all ${
                  autopilot
                    ? 'border border-sky-500/40 bg-sky-500/15 dark:bg-sky-500/20 text-sky-800 dark:text-sky-200 shadow-[0_0_12px_-4px_rgba(14,165,233,0.65)]'
                    : 'border border-slate-900/10 dark:border-white/15 bg-white/70 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-white/10'
                }`}
                title="Autopilot automatically routes or constructs the needed agent"
              >
                <Zap className={`h-2.5 w-2.5 ${autopilot ? 'fill-sky-500 text-sky-500 dark:fill-sky-400 dark:text-sky-400' : ''}`} />
                <span>Autopilot</span>
                <span>{autopilot ? 'On' : 'Off'}</span>
              </button>
            </div>

            {/* Attached file chips & errors */}
            {(attach.files.length > 0 || attach.error) && (
              <div className="px-3.5 pt-2 space-y-1">
                <AttachmentChips files={attach.files} onRemove={attach.remove} />
                {attach.error && (
                  <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    {attach.error}
                  </div>
                )}
              </div>
            )}

            {/* Input Row */}
            <div className="flex items-end gap-2 px-3 pb-2 pt-2">
              <AttachButton
                onFiles={attach.add}
                disabled={isChatLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:text-slate-950 hover:bg-slate-900/10 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                title="Attach images or documents (PDF, Word, Excel, PowerPoint, text, code, etc.)"
              >
                <Paperclip className="h-4 w-4" />
              </AttachButton>

              <textarea
                ref={inputRef}
                rows={1}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={attach.onPaste}
                placeholder={
                  chatTarget
                    ? `Message @${chatTarget}...`
                    : autopilot
                    ? 'Ask anything or describe an agent to build...'
                    : 'Message the Architect...'
                }
                className="flex-1 resize-none bg-transparent py-1.5 text-sm md:text-base text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none max-h-[180px] leading-relaxed"
              />

              {isChatLoading || isGeneratingAgent ? (
                <button
                  type="button"
                  onClick={stopExecution}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white shadow-md shadow-rose-500/35 transition-all group"
                  title="Stop execution and free chat (Esc)"
                >
                  <Square className="h-4 w-4 fill-current group-hover:scale-90 transition-transform" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputVal.trim() && attach.files.length === 0}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-md shadow-sky-500/35 active:scale-95 transition-all disabled:opacity-30 disabled:shadow-none"
                  title="Send message (Enter)"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>

          {/* Subtext */}
          <div className="mt-2 text-center text-[10px] text-slate-600 dark:text-slate-400">
            <span>Tectonic Architect · Autopilot AI Engine · Real-time 3D Sync</span>
          </div>
        </div>
      </div>
    </div>
  );
};
