import React, { useState, useRef, useEffect } from 'react';
import { AttachButton, AttachmentChips, useAttachments } from '../chat/Attachments';
import {
  Send,
  Bot,
  User,
  ShieldAlert,
  Wrench,
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
      <div className="p-3 border-b border-studio-border bg-studio-card/80 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          
          {/* Agent Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-studio-surface border border-white/10 hover:border-emerald-500/40 text-left transition-all"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-100 font-mono">
                    {agentDisplayName}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono block">
                  {agentAppFullName}
                </span>
              </div>
            </button>

            {agentDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 rounded-xl bg-studio-card border border-white/10 shadow-2xl p-1.5 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400 border-b border-white/5">
                  Select Created Agent to Run ({createdAgents.length})
                </div>
                {createdAgents.length === 0 ? (
                  <div className="p-2 text-xs text-slate-400">
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
                      className={`w-full text-left p-2 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                        selectedAgent?.name === ag.name
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'hover:bg-white/5 text-slate-300'
                      }`}
                    >
                      <div>
                        <span className="font-semibold block">{ag.name}</span>
                        <span className="text-[10px] text-slate-500">{ag.files.length} files</span>
                      </div>
                      {selectedAgent?.name === ag.name && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
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
              onClick={() => setShowModelSettings(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 transition-all shadow-sm"
              title="Every workflow runs on the Agent Builder's current model. Click to change it (applies to the Builder and all agents)."
            >
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>{workflowModel}</span>
              <span className="text-[10px] text-sky-400/70">· Builder model</span>
            </button>
          )}

          {/* External data sources (Meta Ads, GA4, ...): connected once in the External Tools window */}
          {selectedAgent && (
            <button
              onClick={() => revealWindow('connectors')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/30 transition-all shadow-sm"
              title="Connect the client's Meta Ads / Google Analytics accounts (used by every workflow)"
            >
              <Plug className="w-3.5 h-3.5 text-pink-400" />
              <span>External Tools</span>
            </button>
          )}

          {/* Session ID badge */}
          {sandboxSessionId && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hidden md:inline-block">
              sess:{sandboxSessionId.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2">
          {/* Active Tool Trace Indicator */}
          {activeToolTrace && (
            <div className="px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-1.5 animate-pulse">
              <Wrench className="w-3.5 h-3.5 text-rose-400" />
              <span>Tool: {activeToolTrace}()</span>
            </div>
          )}

          {/* Active Guardrail Trace */}
          {activeGuardrailTrace && (
            <div className="px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-1.5 animate-bounce">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>{activeGuardrailTrace}</span>
            </div>
          )}

          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              showRawJson
                ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>{showRawJson ? 'Hide JSON' : 'Inspect JSON'}</span>
          </button>

          <button
            onClick={() => startNewSandboxSession()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-colors"
            title="Start fresh sandbox session for this agent"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  <div className="max-w-[90%] text-[11px] text-slate-300 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1">
                    <MarkdownContent content={msg.content} />
                  </div>
                </div>
              );
            }
            if (msg.kind === 'edit' && msg.edit) {
              return (
                <div key={msg.id} className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                    <Pencil className="w-4 h-4 text-white" />
                  </div>
                  <div className="max-w-[85%] flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-300">Agent Editor</span>
                      <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
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
                <div key={msg.id} className="flex gap-3 justify-end">
                  <div className="max-w-[85%] items-end">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">✏️ change request</span>
                      <span className="text-xs font-semibold text-slate-300">You</span>
                      <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                    </div>
                    <div className="p-3.5 rounded-2xl rounded-tr-none text-xs leading-relaxed bg-amber-600/90 text-white">
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
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-300">
                      {isUser ? 'You' : agentDisplayName}
                    </span>
                    <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                    {msg.rerun && (
                      <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" title="Re-sent automatically to the updated agent">
                        <RotateCw className="w-2.5 h-2.5" /> re-run
                      </span>
                    )}
                    {msg.recovered && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Finished while the page was being refreshed and was recovered from the server">
                        recovered after refresh
                      </span>
                    )}
                  </div>

                  {/* Guardrail Triggered Banner */}
                  {msg.guardrailTriggered && (
                    <div className="mb-2 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                          <span>Guardrail Filter: {msg.guardrailTriggered.rule}</span>
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 font-mono">
                            {msg.guardrailTriggered.action}
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-300/80 mt-0.5">
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
                          className="p-2 rounded-lg bg-slate-900/80 border border-sky-500/20 text-[11px] font-mono text-slate-300 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-sky-400" />
                            <span className="text-sky-300 font-semibold">{tc.toolName}</span>
                            {Object.keys(tc.params).length > 0 && (
                              <span className="text-slate-500">
                                ({Object.keys(tc.params).join(', ')})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3 text-emerald-400" />
                            <span>{tc.durationMs}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Content */}
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                      isUser
                        ? 'bg-sky-600 text-white rounded-tr-none'
                        : 'bg-studio-card/90 border border-white/5 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    {msg.content && <MarkdownContent content={msg.content} isUser={isUser} />}
                    {msg.attachments && <div className="mt-2"><AttachmentChips files={msg.attachments} onDark={isUser} /></div>}
                    <GeneratedImages images={msg.images} />

                    {/* Raw JSON Payload Inspector */}
                    {showRawJson && (msg.toolCalls || msg.cardPayload) && (
                      <div className="mt-3 pt-2 border-t border-white/10">
                        <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          Tool & Event Payload:
                        </span>
                        <pre className="p-2 rounded bg-slate-950 font-mono text-[10px] text-sky-300 overflow-x-auto max-h-48">
                          {JSON.stringify({ toolCalls: msg.toolCalls, cardPayload: msg.cardPayload }, null, 2)}
                        </pre>
                      </div>
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
          })
        )}

        {isSandboxLoading && (
          <div className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0 animate-pulse">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="p-3 rounded-2xl bg-studio-card/90 border border-white/5 text-xs text-slate-400 flex items-center gap-2">
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
            <div className="p-3 rounded-2xl bg-studio-card/90 border border-amber-500/20 text-xs text-slate-400 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]" />
              <span>Editing {agentDisplayName}: reading its code, applying and verifying your change…</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Quick Test Prompts */}
      <div className="px-4 py-2 border-t border-white/5 bg-studio-surface/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {editing ? (
          <>
            <span className="text-[10px] uppercase font-mono text-slate-500 shrink-0">Try a change:</span>
            {EDIT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInputVal(suggestion)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 whitespace-nowrap transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </>
        ) : (
          <>
            <span className="text-[10px] uppercase font-mono text-slate-500 shrink-0">Test Cases:</span>
            {getQuickTests().map((qt, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickTest(qt.prompt)}
                disabled={busy}
                className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 whitespace-nowrap transition-colors disabled:opacity-40"
              >
                {qt.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Input Test Console */}
      <form onSubmit={handleSubmit} onDrop={editing ? undefined : attach.onDrop} onDragOver={(e) => e.preventDefault()}
            className="p-3 border-t border-studio-border bg-studio-card/90">
        {!editing && (attach.files.length > 0 || attach.error) && (
          <div className="mb-2 space-y-1">
            <AttachmentChips files={attach.files} onRemove={attach.remove} />
            {attach.error && <div className="text-[11px] text-amber-300">{attach.error}</div>}
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Run the agent, or describe a change to it (applied, verified, then re-run) */}
          <div className="flex shrink-0 items-center rounded-xl bg-studio-surface/90 border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setMode('run')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${!editing ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
              title="Send test messages to the agent"
            >
              <Play className="w-3 h-3" /> Run
            </button>
            <button
              type="button"
              onClick={() => setMode('edit')}
              disabled={!selectedAgent}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${editing ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
              title={selectedAgent ? `Describe a change to ${selectedAgent.name}; it is applied, verified and re-run` : 'Select a generated agent to edit'}
            >
              <Pencil className="w-3 h-3" /> Edit agent
            </button>
          </div>
          <div className="relative flex flex-1 items-center">
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
              className={`w-full text-xs bg-studio-surface/90 border rounded-xl ${editing ? 'pl-3.5' : 'pl-9'} pr-10 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none transition-colors font-sans ${editing ? 'border-amber-500/30 focus:border-amber-500/60' : 'border-white/10 focus:border-emerald-500/50'}`}
            />
            <button
              type="submit"
              disabled={(!inputVal.trim() && (editing || attach.files.length === 0)) || busy}
              className={`absolute right-2 p-1.5 rounded-lg text-white disabled:opacity-30 transition-colors ${editing ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-500 hover:bg-emerald-400'}`}
              title={editing ? 'Apply the change, then re-run the agent' : 'Run'}
            >
              {editing ? <Pencil className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </form>

      {showModelSettings && (
        <ModelSettingsModal onClose={() => { setShowModelSettings(false); loadStudioSettings(); }} />
      )}
    </div>
  );
};
