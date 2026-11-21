import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Highlight, themes, type Language } from 'prism-react-renderer';
import { Brain, CheckCircle2, ChevronRight, Database, Loader2, ScrollText, TerminalSquare, Wrench, X, XCircle } from 'lucide-react';
import { useTelemetryStore, type SelectionOrigin } from '../../store/useTelemetryStore';
import type { ToolCallRecord, TraceSegment } from '../../types/telemetry';
import { JsonTree } from './JsonTree';
import { STATE_STYLES, formatClock, formatCount } from './agentStateStyles';

type Tab = 'trace' | 'tools' | 'state';

const EMPTY_TRACE: TraceSegment[] = [];
const EMPTY_CALLS: ToolCallRecord[] = [];

// ---- Trace viewer -------------------------------------------------------------------------

function Code({ code, language }: { code: string; language: Language }) {
  return (
    <Highlight code={code.replace(/\n$/, '')} language={language} theme={themes.vsDark}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre className="my-1 overflow-x-auto rounded-md border border-white/5 bg-black/30 px-2.5 py-2 text-[11px] leading-[1.55]">
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, k) => <span key={k} {...getTokenProps({ token })} />)}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

const LANG_ALIASES: Record<string, Language> = { py: 'python', python: 'python', json: 'json', ts: 'typescript', js: 'javascript', bash: 'bash', sh: 'bash', yaml: 'yaml' };

/** Split streamed prose into plain text and fenced/JSON code blocks for highlighting. */
function renderText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const fence = /```(\w+)?\n([\s\S]*?)(```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) out.push(...renderProse(text.slice(last, m.index), out.length));
    out.push(<Code key={`c${out.length}`} code={m[2]} language={LANG_ALIASES[m[1]?.toLowerCase() ?? ''] ?? 'markdown'} />);
    last = m.index + m[0].length;
    if (m[0].length === 0) break;
  }
  if (last < text.length) out.push(...renderProse(text.slice(last), out.length));
  return out;
}

function renderProse(text: string, keyBase: number): ReactNode[] {
  const t = text.trim();
  if ((t.startsWith('{') || t.startsWith('[')) && t.length > 2) {
    let pretty = t;
    try {
      pretty = JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      /* still streaming: highlight as-is */
    }
    return [<Code key={`j${keyBase}`} code={pretty} language="json" />];
  }
  return [<span key={`p${keyBase}`} className="whitespace-pre-wrap">{text}</span>];
}

const Segment = memo(function Segment({ segment }: { segment: TraceSegment }) {
  switch (segment.kind) {
    case 'thought':
      return (
        <div className="my-1.5 border-l-2 border-amber-500/40 pl-2.5 italic text-amber-200/70">
          <span className="mr-1.5 not-italic font-semibold text-amber-400/80 text-[9.5px] uppercase tracking-wider">thought</span>
          <span className="whitespace-pre-wrap">{segment.text}</span>
        </div>
      );
    case 'tool':
      return <div className="my-1 whitespace-pre-wrap text-sky-300">{segment.text}</div>;
    case 'result':
      return <div className="my-1 whitespace-pre-wrap text-slate-500">{segment.text}</div>;
    default:
      return <div className="my-1 text-[var(--studio-text)]">{renderText(segment.text)}</div>;
  }
});

function TraceViewer({ agentId, live }: { agentId: string; live: boolean }) {
  const trace = useTelemetryStore((s) => s.traces[agentId]) ?? EMPTY_TRACE;
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [trace]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="h-full overflow-y-auto bg-black/45 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed"
    >
      {trace.length === 0 ? (
        <div className="text-slate-600">$ awaiting output from {agentId}…</div>
      ) : (
        trace.map((seg, i) => <Segment key={i} segment={seg} />)
      )}
      {live && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-amber-400/80" />}
    </div>
  );
}

// ---- Tool calls ---------------------------------------------------------------------------

function ToolCallRow({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const icon =
    call.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
    : call.status === 'error' ? <XCircle className="h-3.5 w-3.5 text-rose-400" />
    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  return (
    <div className="rounded-lg border border-studio-border bg-studio-surface/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <ChevronRight className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        {icon}
        <span className="flex-1 truncate font-mono text-[11.5px] text-[var(--studio-text)]">{call.toolName}</span>
        <span className="font-mono text-[10px] text-[var(--studio-text-muted)]">
          {call.durationMs != null ? `${call.durationMs}ms` : formatClock(call.startedAt)}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-studio-border px-3 py-2 font-mono text-[11px]">
              <div>
                <div className="mb-0.5 text-[9.5px] uppercase tracking-wider text-[var(--studio-text-muted)]">Input payload</div>
                <JsonTree value={call.payload} defaultExpandDepth={2} />
              </div>
              <div>
                <div className="mb-0.5 text-[9.5px] uppercase tracking-wider text-[var(--studio-text-muted)]">Output</div>
                {call.status === 'running' ? <span className="text-slate-500">pending…</span> : <JsonTree value={call.result} defaultExpandDepth={2} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolCalls({ agentId }: { agentId: string }) {
  const calls = useTelemetryStore((s) => s.toolCalls[agentId]) ?? EMPTY_CALLS;
  if (calls.length === 0) return <Empty icon={<Wrench className="h-4 w-4" />} text="No tool calls yet." />;
  return (
    <div className="h-full space-y-1.5 overflow-y-auto p-3">
      {[...calls].reverse().map((c) => <ToolCallRow key={c.callId} call={c} />)}
    </div>
  );
}

// ---- State inspector ----------------------------------------------------------------------

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-studio-border bg-studio-surface/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <ChevronRight className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-[var(--studio-text-muted)]">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--studio-text-secondary)]">{title}</span>
      </button>
      {open && <div className="border-t border-studio-border px-3 py-2 font-mono text-[11px]">{children}</div>}
    </div>
  );
}

function StateInspector({ agentId }: { agentId: string }) {
  const agent = useTelemetryStore((s) => s.agents[agentId]);
  const memory = useTelemetryStore((s) => s.memory[agentId]);
  const calls = useTelemetryStore((s) => s.toolCalls[agentId]) ?? EMPTY_CALLS;
  const lastCall = calls[calls.length - 1];
  if (!agent) return null;
  return (
    <div className="h-full space-y-2 overflow-y-auto p-3">
      <Section title="System prompt" icon={<ScrollText className="h-3.5 w-3.5" />}>
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[var(--studio-text-secondary)]">
          {agent.systemPrompt || '— not reported —'}
        </pre>
      </Section>
      <Section title="Memory context" icon={<Database className="h-3.5 w-3.5" />}>
        {memory && Object.keys(memory).length > 0 ? <JsonTree value={memory} defaultExpandDepth={1} /> : <span className="text-slate-500">No session state written by this agent.</span>}
      </Section>
      <Section title="Agent metadata" icon={<Brain className="h-3.5 w-3.5" />} defaultOpen={false}>
        <JsonTree
          value={{
            id: agent.id,
            parent_id: agent.parentId,
            model: agent.model,
            description: agent.description,
            state: agent.state,
            tokens: agent.tokens,
            tool_calls: agent.toolCallCount,
            spawned_at: formatClock(agent.createdAt),
          }}
          defaultExpandDepth={2}
        />
      </Section>
      {lastCall && (
        <Section title={`Last tool call · ${lastCall.toolName}`} icon={<Wrench className="h-3.5 w-3.5" />}>
          <JsonTree value={{ input: lastCall.payload, output: lastCall.result ?? null }} defaultExpandDepth={2} />
        </Section>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-[11px] text-[var(--studio-text-muted)]">
      {icon}
      {text}
    </div>
  );
}

// ---- Drawer -------------------------------------------------------------------------------

export function AgentTelemetryPanel({ host = 'graph' }: { host?: SelectionOrigin }) {
  const selectedId = useTelemetryStore((s) => s.selectedAgentId);
  const origin = useTelemetryStore((s) => s.selectionOrigin);
  const agent = useTelemetryStore((s) => (s.selectedAgentId ? s.agents[s.selectedAgentId] : undefined));
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const callCount = useTelemetryStore((s) => (s.selectedAgentId ? s.toolCalls[s.selectedAgentId]?.length ?? 0 : 0));
  const [tab, setTab] = useState<Tab>('trace');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectAgent(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectAgent]);

  const tabs = useMemo(
    () => [
      { id: 'trace' as const, label: 'Trace', icon: <TerminalSquare className="h-3.5 w-3.5" /> },
      { id: 'tools' as const, label: `Tools${callCount ? ` · ${callCount}` : ''}`, icon: <Wrench className="h-3.5 w-3.5" /> },
      { id: 'state' as const, label: 'State', icon: <Database className="h-3.5 w-3.5" /> },
    ],
    [callCount],
  );

  return (
    <AnimatePresence>
      {selectedId && origin === host && agent && (
        <motion.aside
          key="cubicle"
          initial={{ x: '100%', opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0.6 }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="absolute right-0 top-0 bottom-0 z-20 flex w-[min(480px,92%)] flex-col border-l border-studio-border bg-[var(--popover-bg)] shadow-2xl backdrop-blur-2xl backdrop-saturate-150"
        >
          <header className="border-b border-studio-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: STATE_STYLES[agent.state].color, boxShadow: `0 0 8px ${STATE_STYLES[agent.state].color}` }} />
              <h2 className="flex-1 truncate font-mono text-sm font-semibold text-[var(--studio-text)]">{agent.role}</h2>
              <button type="button" onClick={() => selectAgent(null)} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" title="Close (Esc)">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--studio-text-muted)]">
              <span className={STATE_STYLES[agent.state].text}>{STATE_STYLES[agent.state].label}{agent.stateDetail ? ` · ${agent.stateDetail}` : ''}</span>
              {agent.model && <span>{agent.model}</span>}
              <span>{formatCount(agent.tokens.prompt)} in / {formatCount(agent.tokens.completion)} out</span>
              {agent.parentId && <span>parent: {agent.parentId}</span>}
            </div>
            {agent.description && <p className="mt-1.5 line-clamp-2 text-[11px] text-[var(--studio-text-secondary)]">{agent.description}</p>}
          </header>

          <nav className="flex gap-1 border-b border-studio-border px-2 pt-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-2.5 pb-2 pt-1 text-[11px] font-medium transition-colors ${
                  tab === t.id ? 'text-[var(--studio-text)]' : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text-secondary)]'
                }`}
              >
                {t.icon}
                {t.label}
                {tab === t.id && <motion.span layoutId="cubicle-tab" className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-sky-400" />}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1">
            {tab === 'trace' && <TraceViewer agentId={agent.id} live={agent.state === 'thinking'} />}
            {tab === 'tools' && <ToolCalls agentId={agent.id} />}
            {tab === 'state' && <StateInspector agentId={agent.id} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
