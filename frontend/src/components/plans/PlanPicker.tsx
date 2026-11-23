import React, { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Check, Clock, Crown, FlaskConical, Loader2, RefreshCw, Rocket, X, Zap } from 'lucide-react';
import { choosePlan, fmtTokens, getPlans, resetStarterTrial, simulateExpiration, type PlanSummary } from '../../services/plans';
import { ThemeToggle } from '../ThemeToggle';

/**
 * The plan picker, used in three ways:
 *  * fullscreen right after sign-in (embedded=false);
 *  * when a 7-day Starter plan expires (expired=true) to mandate selecting a plan;
 *  * inside the Studio as a "Change plan" modal (embedded=true).
 */

const TIER_ICON: Record<string, React.ReactNode> = {
  starter: <Zap className="h-5 w-5 text-amber-300" />,
  pro: <Rocket className="h-5 w-5 text-sky-300" />,
  business: <Building2 className="h-5 w-5 text-indigo-300" />,
  enterprise: <Crown className="h-5 w-5 text-fuchsia-300" />,
};

const FEATURE_CELL = (v: string | number | boolean) => (typeof v === 'boolean' ? (v ? 'Yes' : '—') : String(v));

export const PlanPicker: React.FC<{
  embedded?: boolean;
  current?: string | null;
  expired?: boolean;
  onClose?: () => void;
  onSelected?: () => void;
}> = ({ embedded = false, current, expired = false, onClose, onSelected }) => {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch((err) => setError(err.message || 'Could not load plans.'));
  }, []);

  const select = async (planId: string) => {
    setBusyId(planId);
    setError('');
    try {
      await choosePlan(planId);
      if (embedded) onSelected?.();
      else window.location.reload(); // load the Studio with this plan
    } catch (err: any) {
      setError(err.message || 'Could not switch plan.');
      setBusyId(null);
    }
  };

  const handleSimulateExpiration = async () => {
    setSimulating(true);
    try {
      await simulateExpiration();
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Simulation failed');
      setSimulating(false);
    }
  };

  const handleResetTrial = async () => {
    setSimulating(true);
    try {
      await resetStarterTrial();
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Reset failed');
      setSimulating(false);
    }
  };

  const chosenId = current !== undefined ? current : plans?.find((p) => p.chosen)?.id;

  const card = (p: PlanSummary) => {
    const chosen = p.id === chosenId;
    return (
      <div
        key={p.id}
        className={`relative flex flex-col rounded-2xl border p-5 transition-colors ${
          chosen ? 'border-sky-400/70 bg-sky-400/[0.07] ring-1 ring-sky-400/50' : 'border-white/10 bg-studio-card'
        }`}
      >
        {chosen && (
          <span className="absolute -top-2.5 left-4 rounded-full bg-sky-400 px-2 py-0.5 text-[10px] font-semibold text-[#05222E]">
            Current plan
          </span>
        )}
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]">
            {TIER_ICON[p.id]}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">{p.name}</div>
            <div className="text-[11px] text-slate-400">{p.tagline}</div>
          </div>
        </div>

        <ul className="mb-4 flex-1 space-y-1.5">
          {p.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[12px] text-slate-300">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>{b}</span>
            </li>
          ))}
          <li className="flex items-start gap-2 text-[12px] text-slate-400">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/60" />
            <span>
              {fmtTokens(p.monthly_tokens)} tokens/month · {fmtTokens(p.max_tokens_per_run)} per run
            </span>
          </li>
        </ul>

        <button
          type="button"
          disabled={chosen || busyId !== null}
          onClick={() => select(p.id)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
            chosen
              ? 'cursor-default bg-white/10 text-slate-300'
              : 'bg-sky-400 text-[#05222E] hover:bg-sky-300'
          }`}
        >
          {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {chosen ? 'Your plan' : p.id === 'enterprise' ? 'Contact us' : `Choose ${p.name}`}
        </button>
      </div>
    );
  };

  const compare = (label: string, row: (p: PlanSummary) => string | number | boolean) => (
    <tr className="border-b border-white/5">
      <td className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400">{label}</td>
      {(plans ?? []).map((p) => (
        <td key={p.id} className="px-3 py-1.5 text-center text-[11px] text-slate-300">
          {FEATURE_CELL(row(p))}
        </td>
      ))}
    </tr>
  );

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {expired ? 'Renew or Upgrade Your Plan' : embedded ? 'Change your plan' : 'Choose your plan'}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400">
            {expired
              ? 'Your Starter trial period has concluded. Choose an upgraded plan below to resume agent creation, execution, and studio operations.'
              : "Pick the plan that fits how you want to build. You can switch anytime — there is no charge yet, and nothing you've built is lost when you change plans."}
          </p>
        </div>
        {embedded && !expired ? (
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ThemeToggle />
        )}
      </div>

      {expired && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200 animate-in fade-in">
          <div className="flex items-center gap-2 font-semibold text-sm text-amber-300">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <span>7-Day Starter Trial Expired</span>
          </div>
          <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
            Your initial 7-day Starter plan has expired. To reactivate all Studio capabilities and private workspaces, please select a plan below. Your existing agents and chat records are preserved.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {!plans && !error ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
        </div>
      ) : plans ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{plans.map(card)}</div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[560px] border-collapse bg-studio-surface/60">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Compare</th>
                  {plans.map((p) => (
                    <th key={p.id} className="px-3 py-2 text-center text-[11px] font-semibold text-slate-200">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compare('Monthly allowance', (p) => (p.monthly_tokens ? `${fmtTokens(p.monthly_tokens)} tokens` : 'Negotiated'))}
                {compare('AI models', (p) => p.models)}
                {compare('AI assistants', (p) => (p.max_agents ? String(p.max_agents) : 'Unlimited'))}
                {compare('Team seats', (p) => (p.max_seats ? String(p.max_seats) : 'Negotiated'))}
                {compare('Use your own AI key', (p) => p.byok)}
                {compare('Long-term memory', (p) => p.persistent_memory)}
                {compare('Roles & permissions', (p) => p.rbac)}
                {compare('Human approvals', (p) => p.human_in_the_loop)}
                {compare('SSO / private deployment', (p) => p.sso_saml || p.private_deployment)}
                {compare('Audit export', (p) => p.audit_export)}
                {compare('SLA', (p) => p.sla)}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-studio-surface/50 p-3.5 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-sky-400" />
              <span className="font-medium text-slate-300">Subscription Testing & Verification:</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={simulating || busyId !== null}
                onClick={handleSimulateExpiration}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                title="Immediately expire the 7-day Starter subscription for testing"
              >
                {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                <span>Simulate 7-Day Expiry</span>
              </button>
              <button
                type="button"
                disabled={simulating || busyId !== null}
                onClick={handleResetTrial}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                title="Reset back to a fresh 7-day active Starter plan"
              >
                {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>Reset 7-Day Trial</span>
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <div className="h-screen w-full overflow-y-auto bg-studio-bg font-sans text-[var(--studio-text)]">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">{content}</div>
    </div>
  );
};
