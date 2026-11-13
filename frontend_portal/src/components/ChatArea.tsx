import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Mic, 
  Search, 
  Sparkles, 
  ThumbsUp, 
  ThumbsDown, 
  Copy, 
  Check, 
  RotateCw, 
  Wrench, 
  Paperclip,
  Loader2,
  Clock,
  Zap,
  Bot
} from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ExecutionTraceView } from './ExecutionTraceView';

export const ChatArea: React.FC = () => {
  const {
    activeSessionId,
    chatHistory,
    selectedAgent,
    isExecuting,
    agentStatus,
    sendMessage,
    regenerateLastTurn,
    toggleMessageReaction,
    setShowTraceDrawer,
  } = usePortalStore();

  const [inputVal, setInputVal] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rawMessages = activeSessionId ? chatHistory[activeSessionId] || [] : [];
  // Filter out any legacy or stored welcome intro cards
  const messages = rawMessages.filter(
    (m) => !m.id.startsWith('welcome_') && !m.content.includes('connected to the shared Tectonic ADK backend')
  );

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isExecuting]);

  const handleSend = async () => {
    if (!inputVal.trim() || isExecuting) return;
    const msg = inputVal;
    setInputVal('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="relative flex flex-1 flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-[#0e131f]">
      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-7 pb-32"
      >
        <div className="mx-auto max-w-2xl space-y-7">
          {messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            const isSystem = msg.sender === 'system';

            if (isSystem) {
              return (
                <div
                  key={msg.id}
                  className="rounded-2xl border border-white/5 bg-[#151c2c]/50 p-4 text-xs text-slate-400 font-sans"
                >
                  <MarkdownRenderer content={msg.content} />
                </div>
              );
            }

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl border border-white/5 bg-[#1a2234] px-5 py-3.5 text-sm text-slate-100 shadow-lg leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Assistant Message
            return (
              <div key={msg.id} className="flex flex-col items-start text-left space-y-3">
                <div className="w-full text-slate-200 text-sm leading-relaxed">
                  <MarkdownRenderer content={msg.content} />
                </div>

                {/* Optional embedded image if returned or generated */}
                {msg.imageUri && (
                  <div className="my-3 overflow-hidden rounded-2xl border border-white/10 shadow-2xl max-w-md">
                    <img
                      src={msg.imageUri}
                      alt="Agent visual output"
                      className="h-auto w-full object-cover"
                    />
                  </div>
                )}

                {/* Execution Trace / Tool calls pill & accordion */}
                {((msg.toolCalls && msg.toolCalls.length > 0) || msg.durationMs) && (
                  <div className="w-full">
                    <ExecutionTraceView
                      durationMs={msg.durationMs}
                      toolCalls={msg.toolCalls}
                      trace={msg.trace}
                      guardrail={msg.guardrail}
                    />
                  </div>
                )}

                {/* Action Icons Row: 👍 👎 📋 🔄 */}
                <div className="flex items-center gap-1 text-slate-400 pt-1">
                  <button
                    onClick={() => toggleMessageReaction(msg.id, 'like')}
                    title="Good response"
                    className={`rounded-lg p-1.5 transition-colors ${
                      msg.reaction === 'like'
                        ? 'text-sky-400 bg-sky-500/10'
                        : 'hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => toggleMessageReaction(msg.id, 'dislike')}
                    title="Poor response"
                    className={`rounded-lg p-1.5 transition-colors ${
                      msg.reaction === 'dislike'
                        ? 'text-red-400 bg-red-500/10'
                        : 'hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => copyToClipboard(msg.id, msg.content)}
                    title="Copy message"
                    className="rounded-lg p-1.5 hover:bg-white/5 hover:text-slate-200 transition-colors"
                  >
                    {copiedId === msg.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() => regenerateLastTurn()}
                    title="Regenerate"
                    className="rounded-lg p-1.5 hover:bg-white/5 hover:text-slate-200 transition-colors"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>

                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <button
                      onClick={() => setShowTraceDrawer(true)}
                      title="Inspect Tool Execution Trace"
                      className="ml-2 flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400 hover:text-sky-300 transition-colors"
                    >
                      <Wrench className="h-3 w-3 text-sky-400" />
                      <span>{msg.toolCalls.length} tools</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing / Running state */}
          {isExecuting && (
            <div className="flex items-center gap-3 text-slate-400 text-xs py-2">
              <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
              <span className="font-medium animate-pulse text-slate-300">
                Generating response...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Floating VOXA Capsule Input Bar */}
      <div className="absolute inset-x-0 bottom-6 z-20 px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center w-full max-w-2xl h-14 rounded-full border border-white/10 bg-[#151c2c] px-3.5 voxa-input-shadow backdrop-blur-xl">
          {/* Left Sparkle / Attachment Icon */}
          <button
            type="button"
            title="Prompt options"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <Sparkles className="h-4 w-4 text-slate-400 hover:text-sky-400 transition-colors" />
          </button>

          {/* Input Field */}
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            placeholder="Ask me something"
            className="flex-1 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />

          {/* Mic Button */}
          <button
            type="button"
            title="Voice input"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:text-white transition-colors mr-1"
          >
            <Mic className="h-4 w-4" />
          </button>

          {/* VOXA Blue Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputVal.trim() || isExecuting}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563eb] text-white shadow-md shadow-blue-500/30 hover:bg-[#1d4ed8] transition-all disabled:opacity-40 disabled:hover:bg-[#2563eb]"
          >
            {isExecuting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 -ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

