import React, { useState } from 'react';
import { ExternalLink, FileJson, Loader2, Lock, Upload } from 'lucide-react';
import { connectDataSource } from '../../services/connectorsApi';
import type { ConnectionSummary, ConnectorSpec, CredentialFieldSpec } from '../../types/connectors';

/**
 * The form that collects one data source's connection credentials (External Tools window). Values live
 * only in this component's state, go straight to POST /connectors/connect (validated live by the provider,
 * then vaulted), and are cleared as soon as the request finishes — never part of a chat message or a store.
 */
export const CredentialForm: React.FC<{
  spec: ConnectorSpec;
  connection?: string;
  submitLabel?: string;
  onConnected: (summary: ConnectionSummary) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}> = ({ spec, connection = 'default', submitLabel, onConnected, onCancel, cancelLabel = 'Cancel' }) => {
  const [schemeId, setSchemeId] = useState(spec.auth_schemes[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileNotes, setFileNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheme = spec.auth_schemes.find((s) => s.id === schemeId) ?? spec.auth_schemes[0];

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  const readFile = (field: CredentialFieldSpec, file: File | undefined) => {
    if (!file) return;
    if (file.size > 32_000) {
      setError(`${file.name} is too large for a ${field.label}.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      set(field.name, text);
      let note = `${file.name} loaded`;
      try {
        const email = JSON.parse(text)?.client_email;
        if (email) note = `${file.name} · ${email}`;
      } catch {
        note = `${file.name} (not valid JSON)`;
      }
      setFileNotes((n) => ({ ...n, [field.name]: note }));
    };
    reader.readAsText(file);
  };

  const missing = scheme?.fields.filter((f) => f.required && !(values[f.name] ?? '').trim()) ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheme || busy || missing.length) return;
    setBusy(true);
    setError(null);
    const payload = Object.fromEntries(scheme.fields.map((f) => [f.name, values[f.name] ?? '']));
    try {
      const summary = await connectDataSource({ connector: spec.name, scheme: scheme.id, values: payload, connection });
      setValues({});
      setFileNotes({});
      onConnected(summary);
    } catch (err: any) {
      setError(err?.message || 'Could not connect');
    } finally {
      setBusy(false);
    }
  };

  if (!scheme) return null;

  return (
    <form onSubmit={submit} className="space-y-2.5 text-xs" autoComplete="off">
      {spec.auth_schemes.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-950/40 border border-white/5 p-0.5">
          {spec.auth_schemes.map((s) => (
            <button key={s.id} type="button" onClick={() => { setSchemeId(s.id); setError(null); }}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors ${s.id === scheme.id ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {scheme.instructions && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          {scheme.instructions}
          {spec.docs_url && (
            <a href={spec.docs_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-sky-400 hover:text-sky-300">
              Guide <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </p>
      )}

      {scheme.fields.map((f) => (
        <label key={f.name} className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
            {f.label}
            {f.secret && <Lock className="w-3 h-3 text-emerald-400" aria-label="secret" />}
            {!f.required && <span className="text-[10px] font-normal text-slate-500">optional</span>}
          </span>
          {f.kind === 'file' ? (
            <span className="flex items-center gap-2">
              <span className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-studio-surface px-2.5 py-1.5 text-[11px] text-slate-200 hover:border-sky-500/50">
                <Upload className="w-3.5 h-3.5 text-sky-400" /> Choose file
                <input type="file" accept={f.accept ?? undefined} className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => { readFile(f, e.target.files?.[0]); e.target.value = ''; }} />
              </span>
              {fileNotes[f.name] && (
                <span className="flex min-w-0 items-center gap-1 text-[11px] text-emerald-300"><FileJson className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{fileNotes[f.name]}</span></span>
              )}
            </span>
          ) : (
            <input
              type={f.secret ? 'password' : 'text'}
              value={values[f.name] ?? ''}
              onChange={(e) => set(f.name, e.target.value)}
              placeholder={f.placeholder}
              autoComplete={f.secret ? 'new-password' : 'off'}
              spellCheck={false}
              className="w-full rounded-lg border border-white/10 bg-studio-surface px-2.5 py-1.5 font-mono text-[11px] text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
            />
          )}
          {f.help && <span className="mt-0.5 block text-[10px] text-slate-500">{f.help}</span>}
        </label>
      ))}

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">{error}</div>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <Lock className="w-3 h-3" /> Verified with {spec.label}, encrypted, never shown to the AI model
        </span>
        <span className="flex items-center gap-1.5">
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-40">
              {cancelLabel}
            </button>
          )}
          <button type="submit" disabled={busy || missing.length > 0}
            title={missing.length ? `Required: ${missing.map((f) => f.label).join(', ')}` : undefined}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-500 disabled:opacity-40">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy ? 'Verifying…' : submitLabel ?? `Connect ${spec.label}`}
          </button>
        </span>
      </div>
    </form>
  );
};
