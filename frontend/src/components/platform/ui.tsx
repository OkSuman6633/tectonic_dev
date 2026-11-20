import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Loader2, OctagonX, type LucideIcon } from 'lucide-react';
import { useTelemetryStore } from '../../store/useTelemetryStore';

export function Tabs<T extends string>({ tabs, value, onChange, id }: { tabs: { id: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (t: T) => void; id: string }) {
  return (
    <div className="relative flex h-9 shrink-0 items-stretch gap-0.5 border-b border-studio-border px-2">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`relative flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors ${value === t.id ? 'text-[var(--studio-text)]' : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text-secondary)]'}`}>
          {t.icon && <t.icon className="h-3.5 w-3.5" />}
          {t.label}
          {value === t.id && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-sky-400" />}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, icon: Icon, actions, children, className = '' }: { title?: string; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-studio-border bg-studio-card p-3 ${className}`}>
      {(title || actions) && (
        <header className="mb-2.5 flex min-h-[18px] items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--studio-text-muted)]" />}
          {title && <h3 className="min-w-0 truncate text-[11px] font-semibold uppercase leading-[18px] tracking-[0.08em] text-[var(--studio-text-secondary)]">{title}</h3>}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
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
      className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium leading-none transition-colors disabled:opacity-50 ${styles}`}>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * One control height (28px) for every input, select and button, so mixed rows
 * always share a common baseline. Text areas opt out and grow vertically.
 */
export const CONTROL_H = 'h-7';
export const controlClass = 'inline-flex items-center rounded-lg border border-studio-border bg-black/20 px-2.5 text-[12.5px] text-[var(--studio-text)] focus:border-sky-400/60 focus:outline-none';

const field = `w-full ${controlClass} placeholder:text-[var(--studio-text-muted)]`;

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${field} ${CONTROL_H} leading-none ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${field} resize-y py-1.5 font-mono text-[11.5px] leading-relaxed ${props.className ?? ''}`} />;
}

/** Custom themed dropdown styled to match `Input` with proper dark/light popover menu and padding. */
export function Select({
  value,
  onChange,
  children,
  className = '',
  disabled,
  title,
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const options: { value: string; label: ReactNode }[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<{ value?: string; children?: ReactNode }>(child) && child.type === 'option') {
      const val = child.props.value !== undefined ? String(child.props.value) : String(child.props.children ?? '');
      options.push({ value: val, label: child.props.children });
    }
  });

  const currentVal = value !== undefined ? String(value) : (options[0]?.value ?? '');
  const selected = options.find((o) => o.value === currentVal) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectValue = (nextVal: string) => {
    setOpen(false);
    if (onChange) {
      const syntheticEvent = {
        target: { value: nextVal },
        currentTarget: { value: nextVal },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-[130px] ${className}`}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`${field} ${CONTROL_H} flex w-full cursor-pointer items-center justify-between gap-2 px-3 text-left leading-none transition-colors hover:border-white/20 disabled:opacity-50`}
      >
        <span className="truncate">{selected?.label ?? currentVal}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--studio-text-muted)] transition-transform duration-150 ${open ? 'rotate-180 text-sky-400' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 max-h-60 min-w-full overflow-y-auto rounded-xl border border-studio-border bg-studio-card p-1.5 shadow-2xl backdrop-blur-2xl"
        >
          {options.map((opt) => {
            const active = opt.value === currentVal;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => selectValue(opt.value)}
                className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                  active
                    ? 'bg-sky-400/15 font-medium text-sky-300'
                    : 'text-[var(--studio-text-secondary)] hover:bg-white/[0.06] hover:text-[var(--studio-text)]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-sky-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
  return <span title={title} className={`inline-flex h-[18px] items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] font-medium leading-none ${tones}`}>{children}</span>;
}

/** Status is never color alone: icon + label + color. */
export function StatusPill({ status, label }: { status: 'good' | 'warn' | 'bad'; label: string }) {
  const Icon = status === 'good' ? CheckCircle2 : status === 'warn' ? AlertTriangle : OctagonX;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium leading-none" style={{ color: `var(--status-${status})` }}>
      <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
    </span>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-card px-3.5 py-2.5">
      <div className="truncate text-[10px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-[var(--studio-text-muted)]" title={label}>
        {label}
      </div>
      <div className="mt-1.5 truncate font-mono text-[18px] font-semibold leading-tight tabular-nums tracking-tight text-[var(--studio-text)]" title={value}>
        {value}
      </div>
      <div className="mt-1 min-h-[14px] truncate text-[11px] leading-[14px] text-[var(--studio-text-secondary)]" title={sub}>
        {sub ?? '\u00A0'}
      </div>
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

/** Single-series vertical bars: structured column tracks with baseline ticks and hover tooltip. */
export function BarSeries({ points, color = 'var(--chart-a)', format, height = 76 }: { points: { label: string; value: number }[]; color?: string; format: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const rawMax = Math.max(...points.map((p) => p.value), 0);
  const max = rawMax || 1;
  const midIdx = points.length > 2 ? Math.floor((points.length - 1) / 2) : -1;

  return (
    <div className="relative pt-1">
      <div
        className="relative flex items-end gap-1.5 border-b border-white/10 px-0.5"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Subtle horizontal reference lines */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-white/[0.05]" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.04]" />

        {points.map((p, i) => {
          const active = p.value > 0;
          const pct = active ? Math.max(8, (p.value / max) * 100) : 0;
          const isHovered = hover === i;
          return (
            <div
              key={p.label}
              className="group relative flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
            >
              {/* Background slot track so each day column reads clearly even at $0 */}
              <div className="relative flex h-full w-full items-end justify-center rounded-t-[4px] bg-white/[0.02] transition-colors group-hover:bg-white/[0.05]">
                <div
                  className="w-full max-w-[18px] rounded-t-[3px] transition-[height,opacity] duration-300"
                  style={{
                    height: active ? `${pct}%` : '2px',
                    background: active ? color : 'rgba(255,255,255,0.12)',
                    opacity: hover === null || isHovered ? 1 : 0.45,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-[var(--studio-text-muted)]">
        <span>{points[0]?.label}</span>
        {midIdx > 0 && <span>{points[midIdx]?.label}</span>}
        <span>{points[points.length - 1]?.label}</span>
      </div>
      {hover !== null && points[hover] && (
        <div
          className="glass pointer-events-none absolute -top-1 z-10 rounded-md px-2 py-1 font-mono text-[10.5px] text-[var(--studio-text)] shadow-lg"
          style={{
            left: `${Math.min(88, Math.max(12, ((hover + 0.5) / points.length) * 100))}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-[9.5px] text-[var(--studio-text-muted)]">{points[hover].label}</div>
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

export const usd = (v: number) => {
  if (!v || Math.abs(v) < 1e-9) return '$0.00';
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
};
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);
