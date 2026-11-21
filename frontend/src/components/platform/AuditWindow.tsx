import { useState } from 'react';
import { ChevronRight, Download, Link2, MessageSquareText, ShieldCheck, ShieldX } from 'lucide-react';
import { invokeModule, useAction, useModuleData } from '../../services/platformApi';
import { JsonTree } from '../command/JsonTree';
import type { JsonValue } from '../../types/telemetry';
import { BackendGate, Button, Chip, Empty, ErrorNote, Input } from './ui';

interface AuditEvent { sequence: number; event_type: string; source: string; occurred_at: string; team: string | null; agent_id: string | null; payload: Record<string, JsonValue>; entry_hash: string; prev_hash: string | null }
interface QueryResult { total: number; events: AuditEvent[]; filter?: Record<string, string>; note?: string }
interface Verify { valid: boolean; verified_count: number; break_at_sequence: number | null; head_hash: string | null; algorithm: string }

const TYPES = ['', 'AGENT_REASONING', 'TOOL_CALL_END', 'TOOL_CALL_START', 'A2A_MESSAGE', 'AGENT_STATE_CHANGE', 'AGENT_CREATED', 'AGENT_METRICS', 'MODULE_CALL_END', 'MODULE_ACCESS_DENIED', 'RUN_STARTED', 'RUN_COMPLETED'];
const TYPE_TONE: Record<string, 'cyan' | 'violet' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  AGENT_REASONING: 'warn', TOOL_CALL_END: 'cyan', TOOL_CALL_START: 'cyan', A2A_MESSAGE: 'cyan', MODULE_CALL_END: 'violet',
  MODULE_ACCESS_DENIED: 'bad', AGENT_CREATED: 'good', RUN_COMPLETED: 'neutral', RUN_STARTED: 'neutral',
};

function summary(e: AuditEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.event_type) {
    case 'AGENT_REASONING': return String(p.text ?? '').slice(0, 140);
    case 'TOOL_CALL_START': case 'TOOL_CALL_END': return `${p.tool_name ?? ''} ${p.status ? `· ${p.status}` : ''}`;
    case 'A2A_MESSAGE': return `${p.from_id} → ${p.to_id}: ${String(p.message_summary ?? '').slice(0, 90)}`;
    case 'MODULE_CALL_END': return `${p.module}.${p.operation} · ${p.status} · ${String(p.summary ?? '').slice(0, 80)}`;
    case 'MODULE_ACCESS_DENIED': return String(p.reason ?? '');
    case 'AGENT_STATE_CHANGE': return `${p.id} → ${p.state}${p.detail ? ` (${p.detail})` : ''}`;
    case 'AGENT_METRICS': return `${p.id} · ${p.prompt_tokens} in / ${p.completion_tokens} out · ${p.model ?? ''}`;
    default: return String(p.id ?? p.root_id ?? '');
  }
}

function Row({ e }: { e: AuditEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-white/[0.05]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.03]">
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-[var(--studio-text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="w-10 shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--studio-text-muted)]">#{e.sequence}</span>
        <span className="w-16 shrink-0 font-mono text-[10.5px] text-[var(--studio-text-muted)]">{new Date(e.occurred_at).toLocaleTimeString([], { hour12: false })}</span>
        <span className="w-44 shrink-0"><Chip tone={TYPE_TONE[e.event_type] ?? 'neutral'}>{e.event_type}</Chip></span>
        <span className="w-36 shrink-0 truncate font-mono text-[11px] text-[var(--studio-text-secondary)]">{e.source}</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--studio-text)]">{summary(e)}</span>
        {e.team && <Chip>{e.team}</Chip>}
      </button>
      {open && (
        <div className="space-y-2 bg-black/20 px-9 py-2 font-mono text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-[var(--studio-text-muted)]">
            <span><Link2 className="mr-1 inline h-3 w-3" />hash {e.entry_hash.slice(0, 16)}…</span>
            <span>prev {e.prev_hash ? `${e.prev_hash.slice(0, 16)}…` : '— (genesis)'}</span>
          </div>
          <JsonTree value={e.payload as JsonValue} defaultExpandDepth={1} />
        </div>
      )}
    </li>
  );
}

export function AuditWindow() {
  const [filters, setFilters] = useState({ event_type: '', agent_id: '', team: '' });
  const payload = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
  const trail = useModuleData<QueryResult>('auditability', 'query', { ...payload, limit: 150 }, ['auditability', 'finops', 'agentic_rag', 'promptops', 'vector_db']);
  const verify = useModuleData<Verify>('auditability', 'verify', {}, ['auditability']);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<QueryResult | null>(null);
  const { busy, error, run } = useAction();
  const v = verify.data;
  const rows = asked ?? trail.data;

  const exportPack = () => void run('export', async () => {
    const pack = await invokeModule<{ document_b64: string; pack_id: string }>('auditability', 'export', filters.event_type ? { event_type: filters.event_type } : {});
    const blob = new Blob([Uint8Array.from(atob(pack.document_b64), (c) => c.charCodeAt(0))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-pack-${pack.pack_id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  return (
    <BackendGate error={trail.error} loading={trail.loading && !trail.data}>
      <div className="flex h-full flex-col">
        <div className="shrink-0 space-y-2 border-b border-studio-border p-3">
          {v && (
            <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${v.valid ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-rose-400/40 bg-rose-500/10'}`}>
              {v.valid ? <ShieldCheck className="h-4 w-4" style={{ color: 'var(--status-good)' }} /> : <ShieldX className="h-4 w-4" style={{ color: 'var(--status-bad)' }} />}
              <span className="font-medium text-[var(--studio-text)]">{v.valid ? 'Chain intact' : `Tampering detected at entry #${v.break_at_sequence}`}</span>
              <span className="text-[var(--studio-text-secondary)]">{v.verified_count} entries verified · {v.algorithm}</span>
              {v.head_hash && <span className="ml-auto truncate font-mono text-[10.5px] text-[var(--studio-text-muted)]">head {v.head_hash.slice(0, 20)}…</span>}
              <Button busy={verify.loading} onClick={() => void verify.refresh()}>Re-verify</Button>
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (question.trim()) void run('ask', async () => setAsked(await invokeModule<QueryResult>('auditability', 'ask', { question, limit: 150 }))); }}>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the trail… e.g. which tool calls failed today? who was denied access?" />
            <Button type="submit" busy={busy === 'ask'}><MessageSquareText className="h-3.5 w-3.5" />Ask</Button>
            {asked && <Button onClick={() => { setAsked(null); setQuestion(''); }}>Clear</Button>}
          </form>
          {asked && <div className="text-[11px] text-[var(--studio-text-muted)]">Filter: <span className="font-mono text-[var(--studio-text-secondary)]">{JSON.stringify(asked.filter)}</span> · {asked.note}</div>}
          {!asked && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={filters.event_type} onChange={(e) => setFilters({ ...filters, event_type: e.target.value })} className="h-7 rounded-lg border border-studio-border bg-black/20 px-2 text-[12px] text-[var(--studio-text)]">
                {TYPES.map((t) => <option key={t} value={t}>{t || 'all event types'}</option>)}
              </select>
              <Input value={filters.agent_id} onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })} placeholder="agent" className="max-w-[160px]" />
              <Input value={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.value })} placeholder="team" className="max-w-[160px]" />
              <span className="ml-auto text-[11px] text-[var(--studio-text-muted)]">{rows?.total ?? 0} entries</span>
              <Button busy={busy === 'export'} onClick={exportPack}><Download className="h-3.5 w-3.5" />Export pack</Button>
            </div>
          )}
          <ErrorNote error={error} />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows?.events.map((e) => <Row key={e.sequence} e={e} />)}
          {rows && rows.events.length === 0 && <Empty>No audit entries match.</Empty>}
        </ul>
      </div>
    </BackendGate>
  );
}
