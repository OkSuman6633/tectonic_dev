import React, { useState, useRef, useEffect } from 'react';
import { AttachButton, AttachmentChips, useAttachments } from '../chat/Attachments';
import {
  Send,
  Bot,
  User,
  ShieldAlert,
  Wrench,

  AlertTriangle,

  Code,
  Terminal,
  Clock,
  ChevronDown,
  Plus,
  Cpu,
  Pencil,
  Play,
  RotateCw,
  Plug
} from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';
import { MarkdownContent } from '../chat/MarkdownContent';

import { ChatbotAvatar } from '../chat/ArchitectChat';
import { GeneratedImages } from '../chat/GeneratedImages';
import { EditResultCard } from './EditResultCard';
import { ConnectorNoticeCard } from '../connectors/ConnectorNoticeCard';
import { ModelSettingsModal } from '../settings/ModelSettingsModal';
import { useWorkspaceStore } from '../../workspace/useWorkspaceStore';

const EDIT_SUGGESTIONS = [
  'Reply in short bullet points',
  'Ask for confirmation before changing or deleting any record',
  'Greet the user by name and keep a friendly, professional tone',
];

export const LiveAgentRunner: React.FC = () => {
  const {
    sandboxMessages,
    sendSandboxMessage,
    isSandboxLoading,
    activeToolTrace,
    activeGuardrailTrace,
    createdAgents,
    selectedAgent,
    setSelectedAgent,
    sandboxSessionId,
    startNewSandboxSession,
    studioSettings,
    loadStudioSettings,
    isEditingAgent,
    editSelectedAgent,
    undoLastAgentEdit,
    continueAfterConnect
  } = useAgentStudioStore();
  const revealWindow = useWorkspaceStore((s) => s.reveal);
  const [showModelSettings, setShowModelSettings] = useState(false);
  // Every workflow runs on the Agent Builder's current model (its default or the user's custom choice).
  const workflowModel = studioSettings?.model ?? 'Builder model';

  const [inputVal, setInputVal] = useState('');
  const attach = useAttachments();
  /** 'run' sends test messages to the agent; 'edit' describes a change to the agent itself. */
  const [mode, setMode] = useState<'run' | 'edit'>('run');
  const busy = isSandboxLoading || isEditingAgent;
  const editing = mode === 'edit' && !!selectedAgent;
  // Undo restores the project's most recent edit: offer it on the latest edit card only.
  const lastEdit = [...sandboxMessages].reverse().find((m) => m.kind === 'edit');
  const undoableId = lastEdit?.edit?.outcome === 'success' && !lastEdit.edit.undone ? lastEdit.id : null;
  const [showRawJson, setShowRawJson] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sandboxMessages, isSandboxLoading, isEditingAgent]);

  useEffect(() => {
    if (!studioSettings) loadStudioSettings();
  }, [studioSettings, loadStudioSettings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const files = editing ? [] : attach.files;  // attachments are for running the agent, not for edit requests
    if ((!inputVal.trim() && files.length === 0) || busy) return;
    const msg = inputVal;
    setInputVal('');
    attach.clear();
    if (editing) editSelectedAgent(msg);
    else sendSandboxMessage(msg, { attachments: files });
  };

  const handleQuickTest = (prompt: string) => {
    if (busy) return;
    sendSandboxMessage(prompt);
  };

  const agentDisplayName = selectedAgent ? selectedAgent.name : 'agent_builder';
  const agentAppFullName = selectedAgent ? selectedAgent.appName : 'agent_builder';

  // Dynamic quick test buttons based on selected agent
  const getQuickTests = () => {
    if (agentDisplayName.includes('attendance')) {
      return [
        { label: '📊 Attendance Report emp101', prompt: 'Show attendance report for user emp101' },
        { label: '🕒 Record Check-in emp101', prompt: 'Record attendance for user emp101 at 09:00 AM today' },
        { label: '🛡️ Test PII Sanitization', prompt: 'Record attendance for emp101 with credit card 4111-2222-3333-4444' }
      ];
    }
    if (agentDisplayName.includes('flight')) {
      return [
        { label: '🔍 Search Mumbai ➔ Delhi', prompt: 'Find flights from Mumbai to Delhi for 2 passengers' },
        { label: '⚠️ Test Guardrail: 12 Passengers', prompt: 'Book 12 passengers on flight AI-802' },
        { label: '🛡️ Confirm Booking Authorization', prompt: 'Confirm booking for flight AI-802' }
      ];
    }
    return [
      { label: '👋 Hello Agent', prompt: `Hello, what capabilities do you support?` },
      { label: '⚡ Run Core Workflow', prompt: `Execute your primary tool or action.` },
      { label: '🛡️ Safety Guardrail Check', prompt: `Show system status and verify security bounds.` }
    ];
  };

  return (
    <div className="flex flex-col h-full bg-studio-surface/40 backdrop-blur-xl relative">
      {/* Sandbox Header */}
      <div className="studio-toolbar z-20 bg-slate-100/90 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />

          {/* Agent Switcher Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 px-2.5 text-left transition-all hover:border-emerald-500/40 shadow-sm dark:shadow-none"
              title={agentAppFullName}
            >
              <span className="truncate text-[12px] font-semibold leading-none text-slate-900 dark:text-slate-100">
                {agentDisplayName}
              </span>
              <span className="hidden truncate font-mono text-[12px] leading-none text-slate-400 dark:text-slate-500 xl:inline">
                {agentAppFullName}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>

            {agentDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl p-1.5 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-white/5">
                  Select Created Agent to Run ({createdAgents.length})
                </div>
                {createdAgents.length === 0 ? (
                  <div className="p-2 text-[12px] text-slate-500 dark:text-slate-400">
                    No generated agents yet. Create one in the Architect Chat!
                  </div>
                ) : (
                  createdAgents.map((ag) => (
                    <button
                      key={ag.name}
                      onClick={() => {
                        setSelectedAgent(ag);
                        setAgentDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded-lg transition-colors flex items-center justify-between ${selectedAgent?.name === ag.name
                        ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 font-medium'
                        : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                        }`}
                    >
                      <div>
                        <span className="typo-agent-name block">{ag.name}</span>
                        <span className="font-mono text-[12px] text-slate-400 dark:text-slate-500">{ag.files.length} files</span>
                      </div>
                      {selectedAgent?.name === ag.name && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* The model every workflow runs on: the Agent Builder's current one */}
          {selectedAgent && (
            <button

              onClick={() => setShowAgentEnvModal(true)}
              className={`typo-status inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 leading-none transition-all ${selectedAgentEnv?.hasKey
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 shadow-sm dark:shadow-none'
                : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 hover:bg-amber-100 dark:hover:bg-amber-500/25 animate-pulse shadow-sm dark:shadow-none'
                }`}
              title={`Configure .env for ${selectedAgent.name}`}
            >
              <Key className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{selectedAgentEnv?.hasKey ? '.env: Configured ✓' : '.env: Missing Key ⚠️'}</span>

            </button>
          )}

          {/* External data sources (Meta Ads, GA4, ...): connected once in the External Tools window */}
          {selectedAgent && (
            <button

              onClick={() => setShowAgentEnvModal(true)}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-2.5 font-mono text-[12px] leading-none text-sky-700 dark:text-sky-300 shadow-sm dark:shadow-none transition-all hover:bg-sky-100 dark:hover:bg-sky-500/20"
              title={`Active Model: ${selectedAgentEnv?.model || 'gemini-3.6-flash'} (Click to change)`}
            >
              <Cpu className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400" />
              <span className="truncate">{selectedAgentEnv?.model || 'gemini-3.6-flash'}</span>

            </button>
          )}

          {/* Session ID badge - visible only on larger displays to prevent toolbar crowding */}
          {sandboxSessionId && (
            <span className="hidden h-[22px] shrink-0 items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 font-mono text-[12px] leading-none text-emerald-600 dark:text-emerald-400 xl:inline-flex">
              sess:{sandboxSessionId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* Right Header Controls - pinned to right edge */}
        <div className="toolbar-end ml-auto flex shrink-0 items-center gap-2">
          {/* Active Tool Trace Indicator */}
          {activeToolTrace && (
            <div className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/20 px-2 font-mono text-[12px] leading-none text-rose-300 animate-pulse">
              <Wrench className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span className="truncate">Tool: {activeToolTrace}()</span>
            </div>
          )}

          {/* Active Guardrail Trace */}
          {activeGuardrailTrace && (
            <div className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/20 px-2 font-mono text-[12px] leading-none text-amber-300 animate-bounce">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="truncate">{activeGuardrailTrace}</span>
            </div>
          )}

          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium leading-none transition-colors ${showRawJson
              ? 'bg-sky-50 dark:bg-sky-500/20 border-sky-300 dark:border-sky-400 text-sky-700 dark:text-sky-300'
              : 'bg-white/80 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm dark:shadow-none'
              }`}
          >
            <Code className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{showRawJson ? 'Hide JSON' : 'Inspect JSON'}</span>
          </button>

          <button
            onClick={() => startNewSandboxSession()}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 text-[12px] font-medium leading-none text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-emerald-500/25 shadow-sm dark:shadow-none"
            title="Start fresh sandbox session for this agent"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>New Session</span>
          </button>
        </div>
      </div>


      {/* Warning banner if particular agent's .env key is missing */}
      {selectedAgent && selectedAgentEnv && !selectedAgentEnv.hasKey && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-[11.5px] leading-tight text-amber-200">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>
              <strong>{selectedAgent.name}</strong> needs a Google API Key before running. It will be configured directly in <code className="font-mono text-[11px] text-amber-300">generated_agents/{selectedAgent.name}/.env</code> with zero LLM interaction.
            </span>
          </div>
          <button
            onClick={() => setShowAgentEnvModal(true)}
            className="h-7 shrink-0 rounded-lg bg-amber-500 px-2.5 text-[11.5px] font-semibold leading-none text-slate-950 transition-colors hover:bg-amber-400"
          >
            Configure API Key
          </button>
        </div>
      )}


      {/* Messages Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {sandboxMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Terminal className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">
                Ready to test {agentDisplayName}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Type a test prompt below or click one of the suggested test cases. It runs on the Agent Builder's model ({workflowModel}).
              </p>
            </div>
          </div>
        ) : (
          sandboxMessages.map((msg) => {
            const isUser = msg.sender === 'user';
            if (msg.kind === 'connector-notice' && msg.connectorNotice) {
              return (
                <div key={msg.id} className="flex gap-3 justify-start">
                  <div className="w-8 h-8 shrink-0" />
                  <div className="max-w-[85%] flex-1">
                    <ConnectorNoticeCard view={msg.connectorNotice} busy={busy}
                      onContinue={() => continueAfterConnect('sandbox', msg.id)} />
                  </div>
                </div>
              );
            }
            if (msg.kind === 'notice') {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="max-w-[90%] min-w-0 text-[12px] text-slate-300 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1 break-words [overflow-wrap:anywhere]">
                    <MarkdownContent content={msg.content} />
                  </div>
                </div>
              );
            }
            if (msg.kind === 'edit' && msg.edit) {
              return (
                <div key={msg.id} className="flex min-w-0 gap-3 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                    <Pencil className="w-4 h-4 text-white" />
                  </div>
                  <div className="max-w-[85%] min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="typo-agent-name text-slate-300">Agent Editor</span>
                      <span className="typo-metadata font-mono text-slate-500">{msg.timestamp}</span>
                    </div>
                    <EditResultCard
                      edit={msg.edit}
                      content={msg.content}
                      canUndo={msg.id === undoableId}
                      busy={busy}
                      onUndo={() => undoLastAgentEdit()}
                    />
                  </div>
                </div>
              );
            }
            if (msg.kind === 'edit-request') {
              return (
                <div key={msg.id} className="flex min-w-0 gap-3 justify-end">
                  <div className="max-w-[85%] min-w-0 flex flex-col items-end">
                    <div className="flex items-center justify-end gap-2 mb-1 flex-wrap">
                      <span className="typo-status px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">✏️ change request</span>
                      <span className="typo-agent-name text-slate-300">You</span>
                      <span className="typo-metadata font-mono text-slate-500">{msg.timestamp}</span>
                    </div>
                    <div className="typo-body max-w-full min-w-0 p-3.5 rounded-2xl rounded-tr-none break-words [overflow-wrap:anywhere] overflow-hidden bg-amber-600/90 text-white">
                      <MarkdownContent content={msg.content} isUser />
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              );
            }
            return (
              <div
                key={msg.id}
                className={`flex min-w-0 gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <ChatbotAvatar className="w-8 h-8" />
                )}

                <div className={`max-w-[85%] min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="typo-agent-name text-slate-300">
                      {isUser ? 'You' : agentDisplayName}
                    </span>
                    <span className="typo-metadata font-mono text-slate-500">{msg.timestamp}</span>
                    {msg.rerun && (
                      <span className="typo-status flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" title="Re-sent automatically to the updated agent">
                        <RotateCw className="w-2.5 h-2.5" /> re-run
                      </span>
                    )}
                    {msg.recovered && (
                      <span className="typo-status px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Finished while the page was being refreshed and was recovered from the server">
                        recovered after refresh
                      </span>
                    )}
                  </div>

                  {/* Guardrail Triggered Banner */}
                  {msg.guardrailTriggered && (
                    <div className="mb-2 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[13px] flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                          <span>Guardrail Filter: {msg.guardrailTriggered.rule}</span>
                          <span className="typo-code uppercase px-1.5 py-0.5 rounded bg-amber-500/20">
                            {msg.guardrailTriggered.action}
                          </span>
                        </div>
                        <p className="typo-metadata text-amber-300/80 mt-0.5">
                          {msg.guardrailTriggered.reason}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Tool Calls Execution Trace */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-2 space-y-1.5">
                      {msg.toolCalls.map((tc, idx) => (
                        <div
                          key={idx}
                          className="typo-code p-2 rounded-lg bg-slate-900/80 border border-sky-500/20 text-slate-300 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-sky-400" />
                            <span className="text-sky-300 font-medium">{tc.toolName}</span>
                            {Object.keys(tc.params).length > 0 && (
                              <span className="text-slate-500">
                                ({Object.keys(tc.params).join(', ')})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[12px] text-slate-400">
                            <Clock className="w-3 h-3 text-emerald-400" />
                            <span>{tc.durationMs}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Content */}
                  <div
                    className={`typo-body max-w-full min-w-0 p-3.5 rounded-2xl break-words [overflow-wrap:anywhere] overflow-hidden ${isUser
                      ? 'bg-sky-600 text-white rounded-tr-none'
                      : 'bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/5 text-slate-800 dark:text-slate-200 rounded-tl-none shadow-sm dark:shadow-none'
                      }`}
                  >
                    {msg.content && <MarkdownContent content={msg.content} isUser={isUser} />}
                    {msg.attachments && <div className="mt-2"><AttachmentChips files={msg.attachments} onDark={isUser} /></div>}
                    <GeneratedImages images={msg.images} />

                    {/* Raw JSON Payload Inspector */}
                    {showRawJson && (msg.toolCalls || msg.cardPayload) && (
                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-white/10">
                        <span className="typo-metadata uppercase text-slate-500 dark:text-slate-400 block mb-1">
                          Tool & Event Payload:
                        </span>
                        <pre className="typo-code p-2 rounded bg-slate-950 text-sky-300 overflow-x-auto max-h-48">
                          {JSON.stringify({ toolCalls: msg.toolCalls, cardPayload: msg.cardPayload }, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 shadow-sm dark:shadow-none">
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {isSandboxLoading && (
          <div className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0 animate-pulse">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/5 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 shadow-sm dark:shadow-none">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
              <span>Running {agentDisplayName} on {workflowModel}…</span>
            </div>
          </div>
        )}

        {isEditingAgent && (
          <div className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0 animate-pulse">
              <Pencil className="w-4 h-4 text-white" />
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-white/[0.04] border border-amber-500/20 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 shadow-sm dark:shadow-none">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]" />
              <span>Editing {agentDisplayName}: reading its code, applying and verifying your change…</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Quick Test Prompts */}
      {/* Test Cases Quick Bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200 dark:border-white/5 bg-slate-50/90 dark:bg-white/[0.02] px-3 py-1.5 no-scrollbar">
        {editing ? (
          <>
            <span className="typo-metadata shrink-0 uppercase leading-none text-slate-500 dark:text-slate-400 font-medium tracking-wider">Try a change:</span>
            {EDIT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInputVal(suggestion)}
                className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 text-[12px] leading-none text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-500/20"
              >
                {suggestion}
              </button>
            ))}
          </>
        ) : (
          <>
            <span className="typo-metadata shrink-0 uppercase leading-none text-slate-500 dark:text-slate-400 font-medium tracking-wider">Test Cases:</span>
            {getQuickTests().map((qt, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickTest(qt.prompt)}
                disabled={busy}
                className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-[12px] leading-none text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40 shadow-sm dark:shadow-none"
              >
                {qt.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Input Test Console */}
      <form onSubmit={handleSubmit} onDrop={editing ? undefined : attach.onDrop} onDragOver={(e) => e.preventDefault()}
        className="p-3 border-t border-slate-200 dark:border-white/10 bg-slate-100/90 dark:bg-black/20">
        {!editing && (attach.files.length > 0 || attach.error) && (
          <div className="mb-2 space-y-1">
            <AttachmentChips files={attach.files} onRemove={attach.remove} />
            {attach.error && <div className="typo-status text-amber-600 dark:text-amber-300">{attach.error}</div>}
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Run the agent, or describe a change to it (applied, verified, then re-run) */}
          <div className="flex h-9 shrink-0 items-center rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-0.5 shadow-sm dark:shadow-none">
            <button
              type="button"
              onClick={() => setMode('run')}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium leading-none transition-colors ${!editing ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
              title="Send test messages to the agent"
            >
              <Play className="h-3.5 w-3.5 shrink-0" /> Run
            </button>
            <button
              type="button"
              onClick={() => setMode('edit')}
              disabled={!selectedAgent}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium leading-none transition-colors disabled:opacity-40 ${editing ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
              title={selectedAgent ? `Describe a change to ${selectedAgent.name}; it is applied, verified and re-run` : 'Select a generated agent to edit'}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0" /> Edit agent
            </button>
          </div>
          <div className="relative flex h-9 flex-1 items-center">
            {!editing && <AttachButton onFiles={attach.add} disabled={busy} className="absolute left-1.5 z-10" />}
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onPaste={editing ? undefined : attach.onPaste}
              disabled={busy}
              placeholder={editing
                ? `Describe a change to ${agentDisplayName} (e.g. “reply in bullet points”)…`
                : `Send query to ${agentDisplayName} in local sandbox...`}
              className={`h-9 w-full rounded-xl border bg-white dark:bg-white/[0.04] text-[14px] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors focus:outline-none font-sans ${editing ? 'pl-3.5' : 'pl-9'} pr-11 ${editing ? 'border-amber-500/30 focus:border-amber-500/60' : 'border-slate-200 dark:border-white/10 focus:border-emerald-500/50 shadow-sm dark:shadow-none'}`}
            />
            <button
              type="submit"
              disabled={(!inputVal.trim() && (editing || attach.files.length === 0)) || busy}
              className={`absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-30 ${editing ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-500 hover:bg-emerald-400'}`}
              title={editing ? 'Apply the change, then re-run the agent' : 'Run'}
            >
              {editing ? <Pencil className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </form>

      {/* Dedicated Modal for Configuring Particular Agent's .env */}
      {showAgentEnvModal && selectedAgent && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-studio-card border border-studio-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md">
                  <Key className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Configure Model & API Key for {selectedAgent.name}
                  </h3>
                  <span className="text-[10px] text-sky-400 font-mono">
                    Direct .env Configuration • Pure File I/O
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowAgentEnvModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Select the Gemini model engine and configure the Google API Key for <strong className="text-emerald-300 font-mono">{selectedAgent.name}</strong>. Settings are saved directly to <code className="text-sky-300 font-mono">generated_agents/{selectedAgent.name}/.env</code>.
            </p>

            <form onSubmit={handleSaveAgentKey} className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-medium flex items-center gap-1.5">
                    <span>GOOGLE_API_KEY</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {selectedAgentEnv?.hasKey ? 'Configured ✓' : 'Missing ⚠️'}
                    </span>
                  </label>
                  {envConfig?.apiKey && envConfig.apiKey !== modalApiKey && (
                    <button
                      type="button"
                      onClick={() => setModalApiKey(envConfig.apiKey)}
                      className="text-[10px] text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1 bg-sky-500/10 hover:bg-sky-500/20 px-2 py-0.5 rounded border border-sky-500/30 transition-colors"
                      title="Auto-fill with master API key from root .env"
                    >
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      <span>Use Workspace Master Key</span>
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={modalApiKey}
                  onChange={(e) => setModalApiKey(e.target.value)}
                  placeholder="Paste your Google AI Studio API Key..."
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-studio-surface border border-white/10 text-slate-200 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-slate-300 font-medium">
                    CHOOSE GEMINI MODEL
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    Active: {modalModel}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {AVAILABLE_GEMINI_MODELS.map((m) => {
                    const isSelected = modalModel === m.id && !isCustomModel;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setModalModel(m.id);
                          setIsCustomModel(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start justify-between ${isSelected
                          ? 'bg-sky-500/20 border-sky-400 text-sky-100 shadow-md shadow-sky-500/10'
                          : 'bg-studio-surface/80 hover:bg-white/5 border-white/5 text-slate-300'
                          }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold font-mono text-xs">{m.name}</span>
                            <span
                              className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-sky-400 text-slate-950 font-bold' : 'bg-white/10 text-slate-400'
                                }`}
                            >
                              {m.tag}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug">
                            {m.description}
                          </p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setIsCustomModel(true)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between ${isCustomModel
                      ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                      : 'bg-studio-surface/80 hover:bg-white/5 border-white/5 text-slate-400'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-mono text-xs">Custom Gemini Model...</span>
                    </div>
                    {isCustomModel && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                </div>

                {isCustomModel && (
                  <div className="mt-2 animate-in fade-in duration-150">
                    <input
                      type="text"
                      value={modalModel}
                      onChange={(e) => setModalModel(e.target.value)}
                      placeholder="e.g. gemini-3.6-flash-exp, gemini-experimental, etc."
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-studio-surface border border-purple-500/50 text-slate-200 focus:outline-none focus:border-purple-400"
                    />
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[11px] leading-relaxed">
                <div className="flex items-center justify-between mb-1">
                  <strong>Target File:</strong>
                  <code className="font-mono text-[10px] text-slate-200">generated_agents/{selectedAgent.name}/.env</code>
                </div>
                <div className="font-mono text-[10px] text-slate-300/80 bg-slate-950/60 p-2 rounded border border-white/5 space-y-0.5">
                  <div>GOOGLE_API_KEY={modalApiKey ? `${modalApiKey.slice(0, 8)}...` : '<not set>'}</div>
                  <div>GEMINI_MODEL={modalModel}</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAgentEnvModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingKey || !modalApiKey.trim()}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all ${keySavedToast
                    ? 'bg-emerald-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 disabled:opacity-40'
                    }`}
                >
                  {keySavedToast ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved & Ready!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingKey ? 'Saving...' : 'Save to .env & Run Agent'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

      )}
    </div>
  );
};
