import { useState } from 'react';
import { BarChart3, Bot, Coins, Cpu, Gauge, Lightbulb, Pencil, ShieldAlert, Wand2 } from 'lucide-react';
import { invokeModule, useAction, useModuleData } from '../../services/platformApi';
import { BackendGate, BarSeries, Button, Card, Chip, Empty, ErrorNote, HBarList, Input, Kpi, StatusPill, compact, usd } from './ui';

interface Rate { model: string; input: number; output: number; estimate: boolean; note: string; source: string }
interface TeamReport {
  team: string; total_cost: number; forecast: number | null; events: number;
  budget: null | { policy_id: string; limit: number; alert_threshold: number; enforcement: string; utilisation: number; alert: boolean; blocked: boolean };
  tokens: { input: number; output: number };
  by_agent: { agent: string; cost: number }[];
  by_model: { model: string; cost: number; input_tokens: number; output_tokens: number; rate: Rate }[];
}
interface Report { period: string; total_cost: number; forecast: number; teams: TeamReport[]; timeseries: { day: string; cost: number }[]; estimated_rates: boolean }
interface Rec { team: string; severity: string; kind: string; message: string }

function BudgetRow({ t, onSaved }: { t: TeamReport; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(String(t.budget?.limit ?? 5));
  const [enforcement, setEnforcement] = useState(t.budget?.enforcement ?? 'alert');
  const { busy, error, run } = useAction();
  const b = t.budget;
  const util = b ? Math.min(1, b.utilisation) : 0;
  const status = !b ? null : b.blocked ? { s: 'bad' as const, l: 'Blocked' } : b.alert ? { s: 'warn' as const, l: 'Over alert threshold' } : { s: 'good' as const, l: 'Within budget' };
  return (
    <div className="rounded-lg border border-studio-border bg-black/15 p-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-medium text-[var(--studio-text)]">{t.team}</span>
        {b && <Chip tone={b.enforcement === 'block' ? 'bad' : 'neutral'}>{b.enforcement}</Chip>}
        <span className="ml-auto text-[11.5px] tabular-nums text-[var(--studio-text-secondary)]">
          {usd(t.total_cost)}{b ? ` of ${usd(b.limit)}` : ' · no budget'}
        </span>
        <button type="button" onClick={() => setEditing((v) => !v)} title="Edit budget" className="rounded p-1 text-[var(--studio-text-muted)] hover:bg-white/10 hover:text-[var(--studio-text)]"><Pencil className="h-3.5 w-3.5" /></button>
      </div>
      {b && (
        <>
          <div className="relative mt-2 h-[8px] rounded-full bg-white/[0.06]" title={`${(b.utilisation * 100).toFixed(1)}% used`}>
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${util * 100}%`, background: status ? `var(--status-${status.s})` : 'var(--chart-a)' }} />
            <div className="absolute -top-1 h-[16px] w-px bg-[var(--studio-text-secondary)]" style={{ left: `${b.alert_threshold * 100}%` }} title={`alert at ${(b.alert_threshold * 100).toFixed(0)}%`} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            {status && <StatusPill status={status.s} label={status.l} />}
            <span className="text-[var(--studio-text-muted)]">forecast {t.forecast != null ? usd(t.forecast) : '—'} · alert at {(b.alert_threshold * 100).toFixed(0)}%</span>
          </div>
        </>
      )}
      {editing && (
        <form className="mt-2 flex items-center gap-2" onSubmit={(e) => {
          e.preventDefault();
          void run('save', async () => {
            await invokeModule('finops', 'set_budget', { team: t.team, limit_usd: Number(limit), enforcement });
            setEditing(false); onSaved();
          });
        }}>
          <span className="text-[11px] text-[var(--studio-text-muted)]">USD / month</span>
          <Input type="number" min="0.01" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} className="max-w-[110px]" />
          <select value={enforcement} onChange={(e) => setEnforcement(e.target.value)} className="h-7 rounded-lg border border-studio-border bg-black/20 px-2 text-[12px] text-[var(--studio-text)]">
            <option value="alert">alert</option><option value="block">block</option>
          </select>
          <Button type="submit" variant="primary" busy={busy === 'save'}>Save</Button>
          <ErrorNote error={error} />
        </form>
      )}
    </div>
  );
}

function RateCard({ onChange }: { onChange: () => void }) {
  const rates = useModuleData<{ rates: Rate[] }>('finops', 'rates', {});
  const [edit, setEdit] = useState<{ model: string; input: string; output: string } | null>(null);
  const { busy, error, run } = useAction();
  return (
    <Card title="Rate card · USD per 1M tokens" icon={Coins}>
      <table className="w-full text-left text-[11.5px]">
        <thead className="text-[10.5px] uppercase tracking-wider text-[var(--studio-text-muted)]"><tr><th className="py-1">Model</th><th className="text-right">Input</th><th className="text-right">Output</th><th>Source</th><th /></tr></thead>
        <tbody>
          {(rates.data?.rates ?? []).map((r) => edit?.model === r.model ? (
            <tr key={r.model} className="border-t border-white/[0.05]">
              <td className="py-1 font-mono text-[var(--studio-text)]">{r.model}</td>
              <td><Input type="number" step="0.01" value={edit.input} onChange={(e) => setEdit({ ...edit, input: e.target.value })} /></td>
              <td><Input type="number" step="0.01" value={edit.output} onChange={(e) => setEdit({ ...edit, output: e.target.value })} /></td>
              <td colSpan={2} className="text-right">
                <Button variant="primary" busy={busy === 'rate'} onClick={() => void run('rate', async () => {
                  await invokeModule('finops', 'set_rate', { model: r.model, input_per_mtok: Number(edit.input), output_per_mtok: Number(edit.output) });
                  setEdit(null); rates.refresh(); onChange();
                })}>Confirm</Button>
              </td>
            </tr>
          ) : (
            <tr key={r.model} className="border-t border-white/[0.05]">
              <td className="py-1 font-mono text-[var(--studio-text)]">{r.model}</td>
              <td className="text-right tabular-nums text-[var(--studio-text-secondary)]">${r.input.toFixed(2)}</td>
              <td className="text-right tabular-nums text-[var(--studio-text-secondary)]">${r.output.toFixed(2)}</td>
              <td title={r.note}>{r.estimate ? <Chip tone="warn">estimate</Chip> : <Chip tone="good">confirmed</Chip>}</td>
              <td className="text-right"><button type="button" title="Set confirmed rate" onClick={() => setEdit({ model: r.model, input: String(r.input), output: String(r.output) })}
                className="rounded p-1 text-[var(--studio-text-muted)] hover:bg-white/10 hover:text-[var(--studio-text)]"><Pencil className="h-3.5 w-3.5" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorNote error={error} />
    </Card>
  );
}

export function FinOpsWindow() {
  const report = useModuleData<Report>('finops', 'report', {}, ['finops', 'agentic_rag']);
  const recs = useModuleData<{ recommendations: Rec[] }>('finops', 'recommendations', {}, ['finops']);
  const [team, setTeam] = useState<string>('');
  const { busy, error, run } = useAction();
  const r = report.data;
  const agentRows = (r?.teams ?? []).filter((t) => !team || t.team === team).flatMap((t) => t.by_agent.map((a) => ({ key: `${t.team}/${a.agent}`, label: a.agent, value: a.cost, sub: t.team })))
    .sort((a, b) => b.value - a.value).slice(0, 8);
  const modelMap = new Map<string, { cost: number; tin: number; tout: number }>();
  for (const t of r?.teams ?? []) if (!team || t.team === team) for (const m of t.by_model) {
    const row = modelMap.get(m.model) ?? { cost: 0, tin: 0, tout: 0 };
    modelMap.set(m.model, { cost: row.cost + m.cost, tin: row.tin + m.input_tokens, tout: row.tout + m.output_tokens });
  }
  const tokensIn = (r?.teams ?? []).reduce((s, t) => s + t.tokens.input, 0);
  const tokensOut = (r?.teams ?? []).reduce((s, t) => s + t.tokens.output, 0);

  return (
    <BackendGate error={report.error} loading={report.loading && !r}>
      <div className="h-full space-y-3 overflow-y-auto p-3">
        {r?.estimated_rates && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11.5px] text-amber-200">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />Costs use estimated list prices for some models. Confirm your contracted rates in the rate card.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label={`Spend · ${r?.period ?? 'monthly'}`} value={usd(r?.total_cost ?? 0)} sub={`${r?.teams.length ?? 0} teams`} />
          <Kpi label="Forecast" value={usd(r?.forecast ?? 0)} sub="run-rate to period end" />
          <Kpi label="Input tokens" value={compact(tokensIn)} />
          <Kpi label="Output tokens" value={compact(tokensOut)} />
        </div>
        <Card title="Daily spend · last 14 days" icon={BarChart3}>
          <BarSeries points={(r?.timeseries ?? []).map((p) => ({ label: p.day.slice(5), value: p.cost }))} format={usd} />
        </Card>
        <Card title="Budgets & guardrails" icon={Gauge} actions={
          <Button busy={busy === 'opt'} title="Run the cost-optimisation agent for every team with a budget" onClick={() => void run('opt', async () => {
            for (const t of r?.teams ?? []) if (t.budget) await invokeModule('finops', 'optimise', { team: t.team });
            report.refresh(); recs.refresh();
          })}><Wand2 className="h-3.5 w-3.5" />Optimise</Button>}>
          <div className="space-y-2">
            {(r?.teams ?? []).map((t) => <BudgetRow key={t.team} t={t} onSaved={() => void report.refresh()} />)}
            {!r?.teams.length && <Empty>No spend recorded yet.</Empty>}
          </div>
          <ErrorNote error={error} />
        </Card>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--studio-text-muted)]">Breakdown for</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="h-7 rounded-lg border border-studio-border bg-black/20 px-2 text-[12px] text-[var(--studio-text)]">
            <option value="">all teams</option>
            {(r?.teams ?? []).map((t) => <option key={t.team} value={t.team}>{t.team}</option>)}
          </select>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="By agent" icon={Bot}><HBarList rows={agentRows} format={usd} /></Card>
          <Card title="By model" icon={Cpu}>
            <HBarList rows={[...modelMap.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([m, v]) => ({ key: m, label: m, value: v.cost, sub: `${compact(v.tin)} in / ${compact(v.tout)} out` }))} format={usd} />
          </Card>
        </div>
        <Card title="Token optimisation" icon={Lightbulb}>
          {!recs.data?.recommendations.length ? <Empty>No recommendations: usage looks efficient.</Empty> : (
            <ul className="space-y-1.5">
              {recs.data.recommendations.map((x, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]">
                  <StatusPill status={x.severity === 'high' ? 'bad' : x.severity === 'medium' ? 'warn' : 'good'} label={x.severity} />
                  <span className="text-[var(--studio-text)]"><span className="font-mono text-[var(--studio-text-muted)]">{x.team}</span> · {x.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <RateCard onChange={() => void report.refresh()} />
      </div>
    </BackendGate>
  );
}
