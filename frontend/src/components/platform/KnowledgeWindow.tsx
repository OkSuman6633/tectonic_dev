import { useState } from 'react';
import { BookOpenText, Brain, Database, FileUp, GitBranch, Search, Sparkles, Trash2, Waypoints } from 'lucide-react';
import { invokeModule, useAction, useModuleData } from '../../services/platformApi';
import { BackendGate, Button, Card, Chip, Empty, ErrorNote, Input, StatusPill, Tabs, TextArea } from './ui';

interface Hop { hop: number; query: string; backends: string[]; route: string; route_method: string; items: number; groundedness: number; gaps: string; critic: string; reformulated: boolean }
interface Citation { n: number; source: string; location: string; backend: string; score: number; excerpt: string }
interface AskResult { query: string; outcome: string; hops: Hop[]; groundedness: number; threshold: number; citations: Citation[]; answer?: string; answer_model?: string; confidence?: string; namespaces: string[]; context_tokens: number }
interface Stats { backend: string; collection: string | null; embedding_model: string; embedding_mode: string; namespaces: Record<string, number>; total_points: number }
interface Doc { doc_id: string; title: string; namespace: string; chunks: number; owner?: string }
interface Hit { point_id: string; score: number; namespace: string; content: string; title?: string; source_ref?: string }

const BACKEND_META: Record<string, { label: string; icon: typeof Database }> = {
  vector: { label: 'vector', icon: Database },
  knowledge_base: { label: 'knowledge base', icon: BookOpenText },
  memory: { label: 'team memory', icon: Brain },
  vector_db: { label: 'vector', icon: Database },
  graph_db: { label: 'memory', icon: Brain },
};

function Answer({ text }: { text: string }) {
  // Render [n] citation markers as chips.
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--studio-text)]">
      {parts.map((p, i) => /^\[\d+\]$/.test(p)
        ? <span key={i} className="mx-0.5 rounded bg-sky-400/15 px-1 font-mono text-[10.5px] text-sky-300">{p.slice(1, -1)}</span>
        : <span key={i}>{p}</span>)}
    </p>
  );
}

function Trace({ result }: { result: AskResult }) {
  return (
    <ol className="space-y-2">
      {result.hops.map((h) => {
        const pass = h.groundedness >= result.threshold;
        return (
          <li key={h.hop} className="rounded-lg border border-studio-border bg-black/15 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10.5px] text-[var(--studio-text-muted)]">hop {h.hop}</span>
              {h.reformulated && <Chip tone="warn">self-corrected query</Chip>}
              {h.backends.map((b) => { const M = BACKEND_META[b] ?? BACKEND_META.vector; return <Chip key={b} tone="cyan"><M.icon className="h-3 w-3" />{M.label}</Chip>; })}
              <span className="ml-auto text-[10.5px] text-[var(--studio-text-muted)]">route: {h.route_method}</span>
            </div>
            <div className="mt-1.5 font-mono text-[11.5px] text-[var(--studio-text)]">“{h.query}”</div>
            <div className="mt-1 text-[11px] text-[var(--studio-text-secondary)]">{h.route}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-20 shrink-0 text-[10.5px] text-[var(--studio-text-muted)]">groundedness</span>
              <div className="relative h-[6px] flex-1 rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${h.groundedness * 100}%`, background: 'var(--chart-a)' }} />
                <div className="absolute -top-1 h-[14px] w-px bg-[var(--studio-text-secondary)]" style={{ left: `${result.threshold * 100}%` }} title={`threshold ${result.threshold}`} />
              </div>
              <span className="w-24 shrink-0 text-right"><StatusPill status={pass ? 'good' : 'warn'} label={`${h.groundedness.toFixed(2)} ${h.critic}`} /></span>
            </div>
            {!pass && h.gaps && <div className="mt-1 text-[11px] text-amber-300/90">gap: {h.gaps}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function AskTab({ namespaces }: { namespaces: string[] }) {
  const [question, setQuestion] = useState('');
  const [ns, setNs] = useState<string>('');
  const [result, setResult] = useState<AskResult | null>(null);
  const { busy, error, run } = useAction();
  const ask = () => question.trim() && run('ask', async () => {
    setResult(await invokeModule<AskResult>('agentic_rag', 'ask', { question, ...(ns ? { namespaces: [ns] } : {}) }));
  });
  return (
    <div className="space-y-3 p-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the knowledge base… e.g. Who approves refunds over 500 EUR?" />
        <select value={ns} onChange={(e) => setNs(e.target.value)} className="rounded-lg border border-studio-border bg-black/20 px-2 text-[12px] text-[var(--studio-text)]">
          <option value="">all namespaces</option>
          {namespaces.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <Button type="submit" variant="primary" busy={busy === 'ask'}><Sparkles className="h-3.5 w-3.5" />Ask</Button>
      </form>
      <ErrorNote error={error} />
      {!result && !busy && <Empty>Answers are retrieved through routed, self-correcting multi-hop search and cite their sources.</Empty>}
      {result && (
        <>
          <Card title="Answer" icon={Sparkles} actions={<>
            <StatusPill status={result.confidence === 'high' ? 'good' : 'warn'} label={`${result.confidence} confidence`} />
            <Chip>{result.answer_model}</Chip>
          </>}>
            <Answer text={result.answer ?? ''} />
          </Card>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title={`Agentic trace · ${result.outcome.replace(/_/g, ' ')}`} icon={Waypoints}><Trace result={result} /></Card>
            <Card title={`Citations · ${result.context_tokens} context tokens`} icon={BookOpenText}>
              {result.citations.length === 0 ? <Empty>No passages retrieved.</Empty> : (
                <ol className="space-y-2">
                  {result.citations.map((c) => (
                    <li key={c.n} className="rounded-lg border border-studio-border bg-black/15 p-2">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="rounded bg-sky-400/15 px-1 font-mono text-sky-300">{c.n}</span>
                        <span className="truncate font-medium text-[var(--studio-text)]">{c.source}</span>
                        <span className="truncate text-[var(--studio-text-muted)]">{c.location}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[var(--studio-text-muted)]">{BACKEND_META[c.backend]?.label ?? c.backend} · {c.score.toFixed(3)}</span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[11.5px] text-[var(--studio-text-secondary)]">{c.excerpt}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function CorpusTab({ stats, refreshStats }: { stats: Stats | null; refreshStats: () => void }) {
  const docs = useModuleData<{ documents: Doc[] }>('agentic_rag', 'documents_list', {}, ['agentic_rag']);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [ns, setNs] = useState('shared');
  const { busy, error, run } = useAction();
  const [migration, setMigration] = useState<string | null>(null);

  return (
    <div className="space-y-3 p-3">
      {stats && (
        <Card title="Vector store" icon={Database} actions={
          <Button busy={busy === 'migrate'} title="Re-embed every point with the current embedding model behind an alias cut-over"
            onClick={() => void run('migrate', async () => {
              const r = await invokeModule<{ points_migrated: number; target_collection: string }>('vector_db', 'migrate_embeddings', {});
              setMigration(`Re-embedded ${r.points_migrated} points into ${r.target_collection}`);
              refreshStats();
            })}><GitBranch className="h-3.5 w-3.5" />Re-embed</Button>}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] md:grid-cols-4">
            <div><div className="text-[var(--studio-text-muted)]">backend</div><div className="truncate font-mono text-[var(--studio-text)]" title={stats.backend}>{stats.backend.split(' ')[0]}</div></div>
            <div><div className="text-[var(--studio-text-muted)]">embedding model</div><div className="font-mono text-[var(--studio-text)]">{stats.embedding_model}</div></div>
            <div><div className="text-[var(--studio-text-muted)]">mode</div><StatusPill status={stats.embedding_mode === 'gemini' ? 'good' : 'warn'} label={stats.embedding_mode === 'gemini' ? 'Gemini' : 'offline fallback'} /></div>
            <div><div className="text-[var(--studio-text-muted)]">points</div><div className="font-mono text-[var(--studio-text)]">{stats.total_points}</div></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(stats.namespaces).map(([n, c]) => <Chip key={n} tone={n === 'shared' ? 'violet' : 'cyan'}>{n} · {c}</Chip>)}
          </div>
          {migration && <div className="mt-2 text-[11.5px] text-emerald-300">{migration}</div>}
        </Card>
      )}
      <Card title="Add a document" icon={FileUp}>
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !text.trim()) return;
          void run('ingest', async () => {
            await invokeModule('agentic_rag', 'ingest', { title, text, namespace: ns || 'shared' });
            setTitle(''); setText(''); docs.refresh(); refreshStats();
          });
        }}>
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Input value={ns} onChange={(e) => setNs(e.target.value)} placeholder="namespace (team or shared)" className="max-w-[200px]" />
          </div>
          <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste policy, FAQ, requirements… (chunked and embedded automatically)" />
          <div className="flex justify-end"><Button type="submit" variant="primary" busy={busy === 'ingest'}>Ingest</Button></div>
        </form>
      </Card>
      <ErrorNote error={error ?? docs.error} />
      <Card title={`Documents · ${docs.data?.documents.length ?? 0}`} icon={BookOpenText}>
        {!docs.data?.documents.length ? <Empty>No documents yet.</Empty> : (
          <table className="w-full text-left text-[11.5px]">
            <thead className="text-[10.5px] uppercase tracking-wider text-[var(--studio-text-muted)]"><tr><th className="py-1">Title</th><th>Namespace</th><th className="text-right">Chunks</th><th>Owner</th><th /></tr></thead>
            <tbody>
              {docs.data.documents.map((d) => (
                <tr key={d.doc_id} className="border-t border-white/[0.05]">
                  <td className="py-1.5 text-[var(--studio-text)]">{d.title}</td>
                  <td><Chip tone={d.namespace === 'shared' ? 'violet' : 'cyan'}>{d.namespace}</Chip></td>
                  <td className="text-right tabular-nums text-[var(--studio-text-secondary)]">{d.chunks}</td>
                  <td className="font-mono text-[var(--studio-text-muted)]">{d.owner}</td>
                  <td className="text-right">
                    <button type="button" title="Delete document and vectors" className="rounded p-1 text-[var(--studio-text-muted)] hover:bg-rose-500/15 hover:text-rose-300"
                      onClick={() => void run('del', async () => { await invokeModule('agentic_rag', 'delete_document', { doc_id: d.doc_id }); docs.refresh(); refreshStats(); })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function SearchTab() {
  const [q, setQ] = useState('');
  const [hybrid, setHybrid] = useState(true);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const { busy, error, run } = useAction();
  return (
    <div className="space-y-3 p-3">
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void run('s', async () => setHits((await invokeModule<{ hits: Hit[] }>('vector_db', 'search', { query: q, hybrid, top_k: 10 })).hits)); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Raw similarity search" />
        <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-[var(--studio-text-secondary)]">
          <input type="checkbox" checked={hybrid} onChange={(e) => setHybrid(e.target.checked)} /> hybrid (dense+sparse RRF)
        </label>
        <Button type="submit" busy={busy === 's'}><Search className="h-3.5 w-3.5" />Search</Button>
      </form>
      <ErrorNote error={error} />
      {hits && (hits.length === 0 ? <Empty>No matches.</Empty> : (
        <div className="space-y-1.5">
          {hits.map((h) => (
            <div key={h.point_id} className="rounded-lg border border-studio-border bg-studio-card p-2">
              <div className="flex items-center gap-2 text-[11px]">
                <div className="h-[6px] w-24 rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, h.score * 100)}%`, background: 'var(--chart-a)' }} /></div>
                <span className="font-mono tabular-nums text-[var(--studio-text-secondary)]">{h.score.toFixed(3)}</span>
                <Chip tone={h.namespace === 'shared' ? 'violet' : 'cyan'}>{h.namespace}</Chip>
                <span className="truncate text-[var(--studio-text-muted)]">{h.title ?? h.source_ref}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11.5px] text-[var(--studio-text)]">{h.content}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Agentic-RAG + Vector DB. */
export function KnowledgeWindow() {
  const [tab, setTab] = useState<'ask' | 'corpus' | 'search'>('ask');
  const stats = useModuleData<Stats>('vector_db', 'stats', {}, ['vector_db', 'agentic_rag']);
  return (
    <BackendGate error={stats.error} loading={stats.loading && !stats.data}>
      <div className="flex h-full flex-col">
        <Tabs id="knowledge" value={tab} onChange={(t) => setTab(t as typeof tab)} tabs={[
          { id: 'ask', label: 'Ask', icon: Sparkles }, { id: 'corpus', label: 'Corpus', icon: Database }, { id: 'search', label: 'Vector search', icon: Search },
        ]} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'ask' && <AskTab namespaces={Object.keys(stats.data?.namespaces ?? {})} />}
          {tab === 'corpus' && <CorpusTab stats={stats.data} refreshStats={() => void stats.refresh()} />}
          {tab === 'search' && <SearchTab />}
        </div>
      </div>
    </BackendGate>
  );
}
