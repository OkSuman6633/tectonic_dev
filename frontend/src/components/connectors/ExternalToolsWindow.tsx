import React, { useEffect, useState } from 'react';
import { Lock, Plug, Plus, RefreshCw, Unplug } from 'lucide-react';
import { useConnectorsStore } from '../../store/useConnectorsStore';
import { accountLabel } from '../../services/connectorsApi';
import type { ConnectionSummary, ConnectorSpec } from '../../types/connectors';
import { BackendGate, Button, Chip, ErrorNote, StatusPill } from '../platform/ui';
import { CredentialForm } from './CredentialForm';

const expiresIn = (expiresAt?: number): string => {
  if (!expiresAt) return '';
  const hours = Math.max(0, (expiresAt * 1000 - Date.now()) / 3_600_000);
  return hours >= 1 ? `expires in ${Math.round(hours)} h` : `expires in ${Math.max(1, Math.round(hours * 60))} min`;
};

const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function ConnectionRow({ c, onDisconnect, onReconnect }: { c: ConnectionSummary; onDisconnect: () => Promise<void>; onReconnect: () => void }) {
  const [busy, setBusy] = useState(false);
  const ok = c.status === 'active';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-studio-border bg-black/15 px-2.5 py-2">
      <StatusPill status={ok ? 'good' : 'bad'} label={ok ? 'Connected' : 'Connection failed'} />
      {c.connection !== 'default' && <Chip tone="violet">{c.connection}</Chip>}
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--studio-text)]">{accountLabel(c) || '—'}</span>
      <span className="text-[10.5px] text-[var(--studio-text-muted)]">{ok ? expiresIn(c.expires_at) : 'reconnect to use it'}</span>
      {!ok && <Button onClick={onReconnect}><RefreshCw className="h-3 w-3" /> Reconnect</Button>}
      <Button variant="danger" busy={busy} onClick={async () => { setBusy(true); try { await onDisconnect(); } finally { setBusy(false); } }}
        title="Delete the stored credentials">
        <Unplug className="h-3 w-3" /> Disconnect
      </Button>
      {!ok && c.error && <div className="w-full text-[11px] text-rose-300">{c.error}</div>}
    </div>
  );
}

function ConnectorCard({ spec }: { spec: ConnectorSpec }) {
  const { connections, load, disconnect } = useConnectorsStore();
  const mine = connections.filter((c) => c.connector === spec.name);
  const hasDefault = mine.some((c) => c.connection === 'default');
  // null: form closed; '' : naming another account; otherwise the connection label the form writes.
  const [form, setForm] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const connected = mine.some((c) => c.status === 'active');
  const reads = spec.capabilities.filter((c) => c.kind === 'read');
  const writes = spec.capabilities.filter((c) => c.kind === 'write');

  return (
    <section className="rounded-xl border border-studio-border bg-studio-card p-3">
      <header className="flex items-start gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-[var(--studio-text-muted)]'}`}>
          <Plug className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--studio-text)]">{spec.label}</h3>
            {!mine.length && <Chip>Not connected</Chip>}
          </div>
          <p className="text-[11.5px] leading-snug text-[var(--studio-text-secondary)]">{spec.description}</p>
        </div>
        {form === null && (
          <Button variant={hasDefault ? 'default' : 'primary'} onClick={() => { setForm('default'); setError(null); }}>
            {hasDefault ? 'Reconnect' : 'Connect'}
          </Button>
        )}
      </header>

      <div className="mt-2 flex flex-wrap gap-1" title="What agents can do with this connection">
        {reads.map((c) => <Chip key={c.name} tone="cyan">{spec.tool_prefix}_{c.name}</Chip>)}
        {writes.map((c) => <Chip key={c.name} tone="warn" >{spec.tool_prefix}_{c.name} · paused</Chip>)}
      </div>

      {mine.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {mine.map((c) => (
            <ConnectionRow key={c.connection} c={c} onReconnect={() => setForm(c.connection)}
              onDisconnect={async () => { try { await disconnect(c.connector, c.connection); } catch (e: any) { setError(e?.message); } }} />
          ))}
          {form === null && hasDefault && (
            <button type="button" onClick={() => { setForm(''); setLabel(''); setError(null); }}
              className="flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200">
              <Plus className="h-3 w-3" /> Connect another {spec.label} account (e.g. a second client)
            </button>
          )}
        </div>
      )}

      <ErrorNote error={error} />

      {form !== null && (
        <div className="mt-3 border-t border-studio-border pt-3">
          {form === '' ? (
            <div className="flex items-end gap-2">
              <label className="flex-1 text-[11px] text-[var(--studio-text-secondary)]">
                Name this account (agents use it as <span className="font-mono">connection</span>)
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="client_b"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-studio-surface px-2.5 py-1.5 font-mono text-[11px] text-slate-100 focus:border-sky-500 focus:outline-none" />
              </label>
              <Button variant="primary" disabled={!LABEL_RE.test(label) || label === 'default'} onClick={() => setForm(label)}>Next</Button>
              <Button onClick={() => setForm(null)}>Cancel</Button>
            </div>
          ) : (
            <CredentialForm spec={spec} connection={form}
              submitLabel={form === 'default' ? `Connect ${spec.label}` : `Connect ${form}`}
              onCancel={() => setForm(null)}
              onConnected={async () => { setForm(null); await load(); }} />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * External Tools: every data source agents can use (Meta Ads, Google Analytics 4, and any connector added
 * later). Connect once here; every agentic workflow of this account then uses the connection. Agents only
 * choose what to query — the connection itself is always made here, never in the chat.
 */
export const ExternalToolsWindow: React.FC = () => {
  const { catalog, connections, loaded, error, load } = useConnectorsStore();
  useEffect(() => { load(); }, [load]);
  const active = connections.filter((c) => c.status === 'active').length;

  return (
    <BackendGate loading={!loaded} error={error}>
      <div className="flex h-full flex-col overflow-y-auto p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-[11.5px] leading-relaxed text-[var(--studio-text-secondary)]">
            Connect your clients' data sources once. Every agentic workflow uses these connections; if one is missing
            or fails, the agent tells you in the chat.
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--studio-text-muted)]">{active} connected</span>
        </div>
        <ErrorNote error={loaded && error ? error : null} />
        <div className="space-y-3">
          {catalog.map((spec) => <ConnectorCard key={spec.name} spec={spec} />)}
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-[10.5px] text-[var(--studio-text-muted)]">
          <Lock className="h-3 w-3 shrink-0" /> Credentials are checked with the provider, encrypted and expire automatically.
          The AI model never sees them, only the data it fetches. Meta campaigns agents stage are always paused.
        </p>
      </div>
    </BackendGate>
  );
};

/** Title-bar status: how many connections are live, and whether one failed. */
export function ExternalToolsStatus() {
  const connections = useConnectorsStore((s) => s.connections);
  const failed = connections.filter((c) => c.status !== 'active').length;
  const live = connections.length - failed;
  if (!connections.length) return null;
  return (
    <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] ${failed ? 'text-rose-300' : 'text-emerald-300'}`}>
      {live} connected{failed ? ` · ${failed} failed` : ''}
    </span>
  );
}
