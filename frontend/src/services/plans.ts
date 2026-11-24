/**
 * Subscription plans client. There is no payment yet: choosing/switching a plan is a free,
 * immediate `PUT /api/plan`. The server enforces the chosen plan's limits the same way it will
 * once billing exists.
 */

export interface PlanSummary {
  id: string;
  name: string;
  tagline: string;
  description: string;
  bullets: string[];
  monthly_tokens: number;      // 0 = unlimited
  max_tokens_per_run: number;  // 0 = unlimited
  max_agents: number;          // 0 = unlimited
  max_seats: number;           // 0 = unlimited
  models: string;
  byok: boolean;
  persistent_memory: boolean;
  rbac: boolean;
  human_in_the_loop: boolean;
  sso_saml: boolean;
  audit_export: boolean;
  private_deployment: boolean;
  sla: string;
  chosen: boolean;
  available?: boolean;
  unavailable_reason?: string | null;
}

export interface PlanUsage {
  monthly_tokens: number;
  monthly_quota: number;   // 0 = unlimited
  agents: number;
  max_agents: number | null;
}

export interface PlanStatus {
  plan_id: string | null;   // null until the user has picked one (the picker then shows)
  effective_plan_id: string;
  plan: PlanSummary;
  allowed_models: string[];
  allowed_modules: string[];
  allowed_connectors: string[];
  allow_byok: boolean;
  usage: PlanUsage;
  subscription_status?: 'active' | 'expired' | 'cancelled';
  plan_started_at?: number;
  plan_expires_at?: number;
  is_expired?: boolean;
}

export async function getPlans(): Promise<PlanSummary[]> {
  const res = await fetch('/api/plans');
  if (!res.ok) throw new Error(`Could not load plans (${res.status})`);
  const data = await res.json().catch(() => {
    throw new Error('The plans API returned an invalid response. Is the backend running?');
  });
  return (data.plans ?? []) as PlanSummary[];
}

export async function getPlan(): Promise<PlanStatus | null> {
  try {
    const res = await fetch('/api/plan');
    return res.ok ? ((await res.json()) as PlanStatus) : null;
  } catch {
    return null;
  }
}

export async function choosePlan(planId: string): Promise<PlanStatus> {
  const res = await fetch('/api/plan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: planId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Could not switch plan (${res.status})`);
  return data as PlanStatus;
}

// --- plan-compliance report (lead-presentable: what was built vs. what the plan allows) ----------
export interface PlanLimits {
  max_agents: number | null;
  max_sub_agents: number | null;
  max_iterations: number | null;
  monthly_tokens: number | null;
  max_tokens_per_run: number | null;
  context_window_tokens: number | null;
  vector_store_bytes: number | null;
  persistent_memory: boolean;
  model_tier: string;
}

export interface ProjectReport {
  project: string;
  plan_id: string;
  plan_name: string;
  built: { agents: number; sub_agents: number; tools: string[]; files: number };
  limits: PlanLimits;
  compliance: {
    agents_within_limit: boolean;
    sub_agents_within_limit: boolean;
    tokens_within_quota: boolean;
  };
  usage: { monthly_tokens: number; monthly_quota: number; total_agents: number };
  allowed_models: string[];
  allowed_modules: string[];
  allowed_connectors: string[];
}

export interface AccountReport {
  plan_id: string | null;
  effective_plan_id: string;
  plan_name: string;
  usage: { monthly_tokens: number; monthly_quota: number; agents: number; max_agents: number | null };
  limits: PlanLimits;
  allowed_models: string[];
  allowed_modules: string[];
  allowed_connectors: string[];
  projects: ProjectReport[];
}

export async function getPlanReport(): Promise<AccountReport | null> {
  try {
    const res = await fetch('/api/plan/report');
    return res.ok ? ((await res.json()) as AccountReport) : null;
  } catch {
    return null;
  }
}

/** "500000" → "500k", "5000000" → "5M", 0/null → "Unlimited". */
export function fmtTokens(n: number | null | undefined): string {
  if (n == null || n <= 0) return 'Unlimited';
  if (n >= 1_000_000_000) return `${trimZero(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${trimZero(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trimZero(n / 1_000)}k`;
  return String(n);
}

/** Bytes → "10 MB" / "1 GB" / "50 GB"; 0/null → "Unlimited". */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null || n <= 0) return 'Unlimited';
  if (n >= 1024 ** 3) return `${trimZero(n / 1024 ** 3)} GB`;
  if (n >= 1024 ** 2) return `${trimZero(n / 1024 ** 2)} MB`;
  if (n >= 1024) return `${trimZero(n / 1024)} KB`;
  return `${n} B`;
}

function trimZero(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}

/** A compact markdown plan-compliance summary for the chat "ready" note. */
export function formatProjectReport(r: ProjectReport): string {
  const ok =
    r.compliance.agents_within_limit &&
    r.compliance.sub_agents_within_limit &&
    r.compliance.tokens_within_quota;
  const tools = r.built.tools.length
    ? r.built.tools.slice(0, 6).map((t) => `\`${t}\``).join(', ') + (r.built.tools.length > 6 ? ', …' : '')
    : 'none';
  return [
    `### 📊 Plan compliance — ${r.plan_name}`,
    `- **Agents**: ${r.built.agents} built (${r.built.sub_agents} sub-agents) · plan allows ${fmtTokens(r.limits.max_agents)}`,
    `- **Tools**: ${r.built.tools.length} — ${tools}`,
    `- **Model tier**: ${r.limits.model_tier} · **memory**: ${r.limits.persistent_memory ? 'persistent' : 'session only'}`,
    `- **Allowance**: ${fmtTokens(r.usage.monthly_quota)} tokens/month (${fmtTokens(r.usage.monthly_tokens)} used)`,
    ok ? '- ✅ **Within plan limits**' : '- ⚠️ **A limit is exceeded — see the plan panel**',
  ].join('\n');
}
