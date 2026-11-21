import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Gauge } from 'lucide-react';
import { fmtBytes, fmtTokens, getPlanReport, type AccountReport, type ProjectReport } from '../../services/plans';

/**
 * The single place where the current plan's live consumption is shown: monthly tokens and agent
 * count against the plan's limits, plus one compliance card per generated project (what was built
 * vs. what the plan allows). Rendered inside the "Plan" modal.
 */

const Meter: React.FC<{ label: string; used: string; cap: string; pct: number }> = ({ label, used, cap, pct }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-200">
        {used} <span className="text-slate-500">/ {cap}</span>
      </span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  </div>
);

const ProjectCard: React.FC<{ report: ProjectReport }> = ({ report }) => {
  const ok =
    report.compliance.agents_within_limit &&
    report.compliance.sub_agents_within_limit &&
    report.compliance.tokens_within_quota;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-semibold text-slate-100">{report.project}</span>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
        }`}>
          {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {ok ? 'Within plan' : 'Limit exceeded'}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex justify-between"><dt className="text-slate-400">Agents</dt><dd className="text-slate-200">{report.built.agents} <span className="text-slate-500">/ {fmtTokens(report.limits.max_agents)}</span></dd></div>
        <div className="flex justify-between"><dt className="text-slate-400">Sub-agents</dt><dd className="text-slate-200">{report.built.sub_agents} <span className="text-slate-500">/ {fmtTokens(report.limits.max_sub_agents)}</span></dd></div>
        <div className="flex justify-between"><dt className="text-slate-400">Tools</dt><dd className="text-slate-200">{report.built.tools.length}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-400">Files</dt><dd className="text-slate-200">{report.built.files}</dd></div>
      </dl>
    </div>
  );
};

export const PlanReportPanel: React.FC = () => {
  const [report, setReport] = useState<AccountReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPlanReport()
      .then((r) => (r ? setReport(r) : setError('Could not load the usage report.')))
      .catch(() => setError('Could not load the usage report.'));
  }, []);

  if (error) {
    return <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>;
  }
  if (!report) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
      </div>
    );
  }

  const tokenPct = report.usage.monthly_quota > 0 ? (report.usage.monthly_tokens / report.usage.monthly_quota) * 100 : 0;
  const agentPct = report.usage.max_agents ? (report.usage.agents / report.usage.max_agents) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-slate-100">Plan usage — {report.plan_name}</h3>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <Meter
          label="Monthly tokens"
          used={fmtTokens(report.usage.monthly_tokens)}
          cap={report.usage.monthly_quota > 0 ? fmtTokens(report.usage.monthly_quota) : 'Unlimited'}
          pct={tokenPct}
        />
        <Meter
          label="AI assistants (agents)"
          used={String(report.usage.agents)}
          cap={report.usage.max_agents ? String(report.usage.max_agents) : 'Unlimited'}
          pct={agentPct}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
        {[
          ['Model tier', report.limits.model_tier],
          ['Tokens per run', fmtTokens(report.limits.max_tokens_per_run)],
          ['Iterations per run', fmtTokens(report.limits.max_iterations)],
          ['Context window', fmtTokens(report.limits.context_window_tokens)],
          ['Memory', report.limits.persistent_memory ? 'Persistent' : 'Session only'],
          ['Knowledge store', fmtBytes(report.limits.vector_store_bytes)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
            <div className="text-slate-500">{k}</div>
            <div className="font-medium text-slate-200">{v}</div>
          </div>
        ))}
      </div>

      {report.projects.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Generated projects ({report.projects.length})
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {report.projects.map((p) => (
              <ProjectCard key={p.project} report={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
