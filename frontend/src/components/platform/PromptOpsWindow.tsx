import { useEffect, useMemo, useState } from 'react';
import { Activity, FlaskConical, GitCommitVertical, History, Plus, Rocket, ScrollText, Sparkles, ThumbsDown, ThumbsUp, Undo2 } from 'lucide-react';
import { invokeModule, useAction, useModuleData } from '../../services/platformApi';
import { BackendGate, Button, Card, Chip, Empty, ErrorNote, Input, StatusPill, TextArea } from './ui';

interface PromptRow { prompt_name: string; versions: number; active_version: string | null; active_version_id: string | null; ab_test_id: string | null }
interface Version { version_id: string; version: string; status: string; parent_version_id: string | null; created_at: string; chars: number; samples: number; pass_rate: number | null; promoted_pass_rate: number | null }
interface AbTest { ab_test_id: string; status: string; version_a_id: string; version_b_id: string; winner_version_id: string | null; p_value: number | null }
interface AbStatus { sample_size_a: number; sample_size_b: number; pass_rate_a: number | null; pass_rate_b: number | null; p_value: number | null; significant: boolean; winner_version_id: string | null; reason: string }

const STATUS_TONE: Record<string, 'good' | 'warn' | 'neutral' | 'cyan'> = { active: 'good', testing: 'warn', draft: 'cyan', archived: 'neutral' };

/** Minimal line diff (LCS) for template review. */
function lineDiff(a: string, b: string): { kind: ' ' | '+' | '-'; text: string }[] {
  const x = a.split('\n'), y = b.split('\n');
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { kind: ' ' | '+' | '-'; text: string }[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ kind: ' ', text: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: '-', text: x[i++] });
    else out.push({ kind: '+', text: y[j++] });
  }
  while (i < x.length) out.push({ kind: '-', text: x[i++] });
  while (j < y.length) out.push({ kind: '+', text: y[j++] });
  return out;
}

function AbPanel({ test, versions, onDone }: { test: AbTest; versions: Version[]; onDone: () => void }) {
  const status = useModuleData<AbStatus>('promptops', 'ab_status', { ab_test_id: test.ab_test_id }, ['promptops']);
  const { busy, error, run } = useAction();
  const name = (id: string) => versions.find((v) => v.version_id === id)?.version ?? id.slice(0, 6);
  const s = status.data;
  const arms = s ? [
    { key: 'A', label: `A · ${name(test.version_a_id)}`, n: s.sample_size_a, rate: s.pass_rate_a, color: 'var(--chart-a)' },
    { key: 'B', label: `B · ${name(test.version_b_id)}`, n: s.sample_size_b, rate: s.pass_rate_b, color: 'var(--chart-b)' },
  ] : [];
  return (
    <Card title="A/B test · running" icon={FlaskConical} actions={
      <Button variant="primary" busy={busy === 'conclude'} disabled={!s?.significant}
        title={s?.significant ? 'Promote the winner (after the evaluation gate)' : 'Needs a statistically significant result'}
        onClick={() => void run('conclude', async () => { await invokeModule('promptops', 'conclude_ab_test', { ab_test_id: test.ab_test_id }); onDone(); })}>
        Conclude
      </Button>}>
      {/* Legend + direct labels: arm identity is never color alone. */}
      <div className="space-y-2">
        {arms.map((a) => (
          <div key={a.key}>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="flex items-center gap-1.5 font-mono text-[var(--studio-text)]"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />{a.label}</span>
              <span className="tabular-nums text-[var(--studio-text-secondary)]">{a.rate != null ? `${(a.rate * 100).toFixed(1)}%` : '—'} · n={a.n}</span>
            </div>
            <div className="mt-1 h-[8px] rounded-full bg-white/[0.06]"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(a.rate ?? 0) * 100}%`, background: a.color }} /></div>
          </div>
        ))}
      </div>
      {s && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
          <StatusPill status={s.significant ? 'good' : 'warn'} label={s.significant ? 'Significant' : 'Not significant yet'} />
          <span className="text-[var(--studio-text-muted)]">p = {s.p_value != null ? s.p_value.toExponential(2) : '—'} (two-proportion z-test, α = 0.05)</span>
          {!s.significant && <span className="text-[var(--studio-text-muted)]">· {s.reason}</span>}
        </div>
      )}
      <ErrorNote error={error ?? status.error} />
    </Card>
  );
}

function PromptDetail({ name, onChange }: { name: string; onChange: () => void }) {
  const detail = useModuleData<{ versions: Version[]; ab_tests: AbTest[] }>('promptops', 'versions', { prompt_name: name }, ['promptops']);
  const [selected, setSelected] = useState<string | null>(null);
  const [template, setTemplate] = useState<string>('');
  const [activeTemplate, setActiveTemplate] = useState<string>('');
  const [draft, setDraft] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const versions = useMemo(() => [...(detail.data?.versions ?? [])].reverse(), [detail.data]);
  const active = versions.find((v) => v.status === 'active');
  const running = detail.data?.ab_tests.find((t) => t.status === 'running');
  const sel = versions.find((v) => v.version_id === selected) ?? active ?? versions[0];

  useEffect(() => {
    if (!sel) return;
    void invokeModule<{ template: string }>('promptops', 'get_version', { version_id: sel.version_id }).then((v) => setTemplate(v.template)).catch(() => setTemplate(''));
  }, [sel?.version_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return;
    void invokeModule<{ template: string }>('promptops', 'get_version', { version_id: active.version_id }).then((v) => setActiveTemplate(v.template)).catch(() => setActiveTemplate(''));
  }, [active?.version_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { void detail.refresh(); onChange(); };
  const diff = sel && active && sel.version_id !== active.version_id ? lineDiff(activeTemplate, template) : null;

  return (
    <div className="space-y-3">
      {running && <AbPanel test={running} versions={versions} onDone={refresh} />}
      <Card title="Versions" icon={GitCommitVertical} actions={<Button onClick={() => setDraft(template)}><Plus className="h-3.5 w-3.5" />New version</Button>}>
        <ol className="space-y-1">
          {versions.map((v) => (
            <li key={v.version_id}>
              <button type="button" onClick={() => setSelected(v.version_id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors ${sel?.version_id === v.version_id ? 'bg-sky-400/10' : 'hover:bg-white/[0.04]'}`}>
                <span className="w-24 truncate font-mono text-[var(--studio-text)]">{v.version}</span>
                <Chip tone={STATUS_TONE[v.status] ?? 'neutral'}>{v.status}</Chip>
                <span className="ml-auto tabular-nums text-[var(--studio-text-secondary)]">{v.pass_rate != null ? `${(v.pass_rate * 100).toFixed(0)}% pass` : 'no outcomes'} · n={v.samples}</span>
                <span className="w-32 text-right text-[10.5px] text-[var(--studio-text-muted)]">{new Date(v.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            </li>
          ))}
        </ol>
      </Card>
      {draft !== null && (
        <Card title={`New draft of ${name}`} icon={Plus}>
          <TextArea rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" busy={busy === 'reg'} onClick={() => void run('reg', async () => {
              const v = await invokeModule<{ version_id: string }>('promptops', 'register', { prompt_name: name, template: draft });
              setDraft(null); setSelected(v.version_id); refresh();
            })}>Save draft</Button>
          </div>
        </Card>
      )}
      {sel && (
        <Card title={`${sel.version} · ${sel.chars.toLocaleString()} chars`} icon={ScrollText} actions={<>
          {sel.status === 'draft' && !running && <Button busy={busy === 'ab'} title="Run this draft against the active version"
            onClick={() => void run('ab', async () => { await invokeModule('promptops', 'start_ab_test', { candidate_version_id: sel.version_id }); refresh(); })}><FlaskConical className="h-3.5 w-3.5" />A/B test</Button>}
          {(sel.status === 'draft' || sel.status === 'testing') && !running && <Button variant="primary" busy={busy === 'promote'}
            onClick={() => void run('promote', async () => { await invokeModule('promptops', 'promote', { version_id: sel.version_id }); refresh(); })}><Rocket className="h-3.5 w-3.5" />Promote</Button>}
          {sel.status === 'archived' && !running && <Button busy={busy === 'rb'} title="Clone this version as a new active version"
            onClick={() => void run('rb', async () => { await invokeModule('promptops', 'rollback', { version_id: sel.version_id }); refresh(); })}><Undo2 className="h-3.5 w-3.5" />Roll back</Button>}
          {sel.status === 'active' && <Button busy={busy === 'drift'} onClick={() => void run('drift', async () => {
            const d = await invokeModule<{ drifted: boolean; reason: string }>('promptops', 'check_drift', { version_id: sel.version_id });
            alert(`${d.drifted ? 'Drift detected' : 'No drift'}: ${d.reason}`);
          })}><Activity className="h-3.5 w-3.5" />Drift</Button>}
          <Button busy={busy === 'reflect'} title="Ask the reasoning model to propose an improved draft" onClick={() => void run('reflect', async () => {
            const p = await invokeModule<{ proposed: boolean; reason?: string; version_id?: string }>('promptops', 'propose_improvement', { version_id: sel.version_id });
            if (p.proposed && p.version_id) { setSelected(p.version_id); refresh(); } else alert(p.reason);
          })}><Sparkles className="h-3.5 w-3.5" />Improve</Button>
        </>}>
          {diff ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-black/25 p-2 font-mono text-[11px] leading-relaxed">
              {diff.map((l, i) => (
                <div key={i} className={l.kind === '+' ? 'bg-emerald-500/10 text-emerald-300' : l.kind === '-' ? 'bg-rose-500/10 text-rose-300 line-through decoration-rose-400/40' : 'text-[var(--studio-text-secondary)]'}>
                  {l.kind} {l.text || ' '}
                </div>
              ))}
            </pre>
          ) : (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/25 p-2 font-mono text-[11px] leading-relaxed text-[var(--studio-text-secondary)]">{template}</pre>
          )}
          {diff && <div className="mt-1 text-[10.5px] text-[var(--studio-text-muted)]">Diff against the active version ({active?.version}).</div>}
          <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[var(--studio-text-muted)]">
            Record an outcome for {sel.version}:
            <Button onClick={() => void run('up', async () => { await invokeModule('promptops', 'record_outcome', { prompt_name: name, passed: true, version_id: sel.version_id }); refresh(); })}><ThumbsUp className="h-3.5 w-3.5" />Pass</Button>
            <Button onClick={() => void run('down', async () => { await invokeModule('promptops', 'record_outcome', { prompt_name: name, passed: false, version_id: sel.version_id }); refresh(); })}><ThumbsDown className="h-3.5 w-3.5" />Fail</Button>
          </div>
        </Card>
      )}
      <ErrorNote error={error ?? detail.error} />
    </div>
  );
}

export function PromptOpsWindow() {
  const prompts = useModuleData<{ prompts: PromptRow[] }>('promptops', 'list_prompts', {});
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const { busy, error, run } = useAction();
  const list = prompts.data?.prompts ?? [];
  const current = selected ?? list[0]?.prompt_name ?? null;

  return (
    <BackendGate error={prompts.error} loading={prompts.loading && !prompts.data}>
      <div className="flex h-full min-h-0">
        <aside className="flex w-56 shrink-0 flex-col border-r border-studio-border">
          <div className="p-2">
            <form className="flex gap-1" onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              void run('new', async () => {
                await invokeModule('promptops', 'register', { prompt_name: newName.trim(), template: 'You are a helpful agent.' });
                setSelected(newName.trim()); setNewName(''); prompts.refresh();
              });
            }}>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new prompt name" />
              <Button type="submit" busy={busy === 'new'}><Plus className="h-3.5 w-3.5" /></Button>
            </form>
            <ErrorNote error={error} />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {list.map((p) => (
              <li key={p.prompt_name}>
                <button type="button" onClick={() => setSelected(p.prompt_name)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${current === p.prompt_name ? 'bg-sky-400/10' : 'hover:bg-white/[0.04]'}`}>
                  <div className="truncate font-mono text-[12px] text-[var(--studio-text)]">{p.prompt_name}</div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <Chip tone="good">{p.active_version ?? 'no active'}</Chip>
                    <span className="text-[10.5px] text-[var(--studio-text-muted)]">{p.versions} versions</span>
                    {p.ab_test_id && <Chip tone="warn">A/B</Chip>}
                  </div>
                </button>
              </li>
            ))}
            {list.length === 0 && <Empty>No managed prompts yet. The Builder registers its own on first run.</Empty>}
          </ul>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto p-3">
          {current ? <PromptDetail key={current} name={current} onChange={() => void prompts.refresh()} /> : <Empty><History className="mx-auto mb-1 h-4 w-4" />Select a prompt.</Empty>}
        </div>
      </div>
    </BackendGate>
  );
}
