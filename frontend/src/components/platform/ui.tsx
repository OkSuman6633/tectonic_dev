import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Loader2, OctagonX, type LucideIcon } from 'lucide-react';
import { useTelemetryStore } from '../../store/useTelemetryStore';

export function Tabs<T extends string>({ tabs, value, onChange, id }: { tabs: { id: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (t: T) => void; id: string }) {
  return (
    <div className="relative flex shrink-0 items-center gap-0.5 border-b border-studio-border px-2 pt-1.5">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`relative flex items-center gap-1.5 px-2.5 pb-2 pt-1 text-[12px] font-medium transition-colors ${value === t.id ? 'text-[var(--studio-text)]' : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text-secondary)]'}`}>
          {t.icon && <t.icon className="h-3.5 w-3.5" />}
          {t.label}
          {value === t.id && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-sky-400" />}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, icon: Icon, actions, children, className = '' }: { title?: string; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-studio-border bg-studio-card p-3 ${className}`}>
      {(title || actions) && (
        <header className="mb-2 flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-[var(--studio-text-muted)]" />}
          {title && <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--studio-text-secondary)]">{title}</h3>}
          <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({ children, onClick, busy, variant = 'default', disabled, title, type = 'button' }: {
  children: ReactNode; onClick?: () => void; busy?: boolean; variant?: 'default' | 'primary' | 'danger'; disabled?: boolean; title?: string; type?: 'button' | 'submit';
}) {
  const styles = {
    default: 'bg-white/[0.07] text-[var(--studio-text)] hover:bg-white/[0.12]',
    primary: 'bg-sky-400 text-[#05222E] hover:bg-sky-300',
    danger: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} title={title}
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${styles}`}>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

const field = 'w-full rounded-lg border border-studio-border bg-black/20 px-2.5 py-1.5 text-[12.5px] text-[var(--studio-text)] placeholder:text-[var(--studio-text-muted)] focus:border-sky-400/60 focus:outline-none';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${field} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${field} resize-y font-mono text-[11.5px] leading-relaxed ${props.className ?? ''}`} />;
}

export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'cyan' | 'violet' | 'good' | 'warn' | 'bad'; title?: string }) {
  const tones = {
    neutral: 'border-white/10 bg-white/[0.05] text-[var(--studio-text-secondary)]',
    cyan: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
    violet: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-300',
    good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    bad: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  }[tone];
  return <span title={title} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-px font-mono text-[10px] font-medium ${tones}`}>{children}</span>;
}

/** Status is never color alone: icon + label + color. */
export function StatusPill({ status, label }: { status: 'good' | 'warn' | 'bad'; label: string }) {
  const Icon = status === 'good' ? CheckCircle2 : status === 'warn' ? AlertTriangle : OctagonX;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium" style={{ color: `var(--status-${status})` }}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-studio-border bg-studio-card px-3 py-2.5">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--studio-text-muted)]">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight text-[var(--studio-text)]">{value}</div>
      {sub && <div className="text-[11px] text-[var(--studio-text-secondary)]">{sub}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11.5px] text-rose-300">{error}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-[12px] text-[var(--studio-text-muted)]">{children}</div>;
}

/** Platform windows need the backend; show one clear state instead of a wall of errors. */
export function BackendGate({ error, loading, children }: { error: string | null; loading: boolean; children: ReactNode }) {
  const live = useTelemetryStore((s) => s.status === 'open');
  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--studio-text-muted)]" /></div>;
  if (error && !live) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-[12.5px] text-[var(--studio-text-secondary)]">
      Backend offline. Start it with <code className="mx-1 rounded bg-white/10 px-1 font-mono">python server.py</code> to use this module.
    </div>;
  }
  return <>{children}</>;
}

/** Single-series vertical bars: thin, 4px rounded tops on the baseline, 2px gaps, hover tooltip. */
export function BarSeries({ points, color = 'var(--chart-a)', format, height = 88 }: { points: { label: string; value: number }[]; color?: string; format: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 0) || 1;
  return (
    <div className="relative">
      <div className="flex items-end gap-[2px] border-b border-white/10" style={{ height }} onMouseLeave={() => setHover(null)}>
        {points.map((p, i) => (
          <div key={p.label} className="flex h-full flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)}>
            <div className="mx-auto w-full max-w-[18px] rounded-t-[4px] transition-[height,opacity] duration-300"
              style={{ height: `${Math.max(p.value > 0 ? 3 : 0, (p.value / max) * 100)}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--studio-text-muted)]">
        <span>{points[0]?.label}</span><span>{points[points.length - 1]?.label}</span>
      </div>
      {hover !== null && points[hover] && (
        <div className="glass pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-md px-2 py-1 text-[11px] text-[var(--studio-text)]"
          style={{ left: `${((hover + 0.5) / points.length) * 100}%`, transform: 'translate(-50%, -100%)' }}>
          <div className="text-[var(--studio-text-muted)]">{points[hover].label}</div>
          <div className="font-semibold tabular-nums">{format(points[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal magnitude bars with the value in text ink (never in the series color). */
export function HBarList({ rows, format, color = 'var(--chart-a)' }: { rows: { key: string; label: string; value: number; sub?: string }[]; format: (v: number) => string; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  if (!rows.length) return <Empty>No data yet.</Empty>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.key} title={`${r.label}: ${format(r.value)}`}>
          <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="truncate font-mono text-[var(--studio-text)]">{r.label}</span>
            <span className="shrink-0 tabular-nums text-[var(--studio-text-secondary)]">{format(r.value)}{r.sub ? <span className="text-[var(--studio-text-muted)]"> · {r.sub}</span> : null}</span>
          </div>
          <div className="mt-0.5 h-[6px] rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const usd = (v: number) => (v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : v >= 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(5)}`);
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);
