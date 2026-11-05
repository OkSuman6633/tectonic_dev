import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Cpu, Eye, EyeOff, KeyRound, Loader2, Save, X } from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';
import type { BuilderModelOption } from '../../types/agent';

const PROVIDERS = {
  anthropic: { title: 'Claude · Anthropic', accent: 'text-orange-300', ring: 'border-orange-400 bg-orange-500/15 text-orange-100' },
  google: { title: 'Gemini · Google', accent: 'text-sky-300', ring: 'border-sky-400 bg-sky-500/15 text-sky-100' },
} as const;

const isClaude = (model: string) => /^(claude-|anthropic\/)/i.test(model.trim());

const KeyField: React.FC<{
  label: string; hint: string; configured: boolean; required: boolean; placeholder: string;
  value: string; onChange: (v: string) => void; help: React.ReactNode; locked?: boolean;
}> = ({ label, hint, configured, required, placeholder, value, onChange, help, locked }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-slate-300 font-medium">
        <span className="flex items-center gap-1.5 font-mono text-[11px]"><KeyRound className="h-3 w-3" />{label}</span>
        <span className={`text-[10px] font-mono ${configured ? 'text-emerald-400' : required ? 'text-amber-300' : 'text-slate-500'}`}>
          {configured ? `Saved ✓ ${hint}` : required ? 'Required for this model' : 'Not set'}
        </span>
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={locked}
          placeholder={locked ? 'Managed by your admin' : configured ? 'Leave blank to keep the saved key' : placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-white/10 bg-studio-surface px-3 py-2 pr-9 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
        />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" title={show ? 'Hide' : 'Show'}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{help}</p>
    </div>
  );
};

/** Choose the model the Agent Builder runs on (Claude or Gemini) and provide the provider's API key. */
export const ModelSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { studioSettings, loadStudioSettings, saveStudioSettings } = useAgentStudioStore();
  const [model, setModel] = useState(studioSettings?.model ?? 'claude-opus-5-5');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    loadStudioSettings();
  }, [loadStudioSettings]);
  useEffect(() => {
    if (studioSettings) setModel(studioSettings.model);
  }, [studioSettings?.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalogue = studioSettings?.catalogue ?? [];
  const groups = useMemo(
    () => (['anthropic', 'google'] as const).map((p) => ({ provider: p, models: catalogue.filter((m) => m.provider === p) })),
    [catalogue],
  );
  const claude = isClaude(model);
  const known = catalogue.some((m) => m.id === model);
  const needsKey = claude ? !studioSettings?.has_anthropic_key && !anthropicKey.trim() : !studioSettings?.has_google_key && !googleKey.trim();
  // Keys are shared by every user of the server: only an admin may change them (absent field: an older server).
  const keysLocked = studioSettings?.can_edit_keys === false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const result = await saveStudioSettings(model.trim(), { anthropicApiKey: anthropicKey.trim(), googleApiKey: googleKey.trim() });
      setAnthropicKey('');
      setGoogleKey('');
      const label = result.catalogue.find((m) => m.id === result.model)?.label ?? result.model;
      setSaved(`The Builder now runs on ${label}.`);
      setTimeout(onClose, 1400);
    } catch (err: any) {
      setError(err.message || 'Could not save the settings.');
    } finally {
      setSaving(false);
    }
  };

  const card = (m: BuilderModelOption) => {
    const selected = model === m.id;
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setModel(m.id)}
        className={`rounded-lg border p-2 text-left transition-all ${selected ? PROVIDERS[m.provider].ring : 'border-white/5 bg-studio-surface text-slate-300 hover:bg-white/5'}`}
        title={m.description}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold">{m.label}</span>
          <span className="shrink-0 rounded bg-white/10 px-1 text-[9px] uppercase text-slate-400">{m.tag}</span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400">{m.description}</div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-studio-border bg-studio-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-orange-500 via-sky-500 to-indigo-600 shadow-md">
              <Cpu className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Builder model & API keys</h3>
              <span className="font-mono text-[10px] text-sky-400">
                Now: {studioSettings ? (catalogue.find((m) => m.id === studioSettings.model)?.label ?? studioSettings.model) : 'loading…'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <p className="text-xs leading-relaxed text-slate-300">
          The model that designs your agents and writes their code: the Builder, its specialists and the Agent Editor.
          It switches immediately, no restart, and only for your account. Keys are saved only in the server's <code className="font-mono text-sky-300">.env</code>.
        </p>

        {studioSettings && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[11px]">
            <span className="text-slate-300">
              Running on <span className="font-semibold text-slate-100">{catalogue.find((m) => m.id === studioSettings.model)?.label ?? studioSettings.model}</span>
            </span>
            <span className="flex items-center gap-1.5 font-mono text-emerald-300" title="First characters of the API key the running Builder actually sends">
              <KeyRound className="h-3 w-3" />
              {studioSettings.active_key_hint
                ? `${(studioSettings.active_key_provider ?? studioSettings.provider) === 'anthropic' ? 'ANTHROPIC' : 'GOOGLE'} key in use: ${studioSettings.active_key_hint}`
                : 'No key in use'}
            </span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 text-xs">
          {groups.map(({ provider, models }) => models.length > 0 && (
            <div key={provider}>
              <div className={`mb-1.5 text-[11px] font-semibold ${PROVIDERS[provider].accent}`}>{PROVIDERS[provider].title}</div>
              <div className="grid grid-cols-2 gap-1.5">{models.map(card)}</div>
            </div>
          ))}

          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Or type any model id</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-opus-5-5 or gemini-2.5-pro"
              spellCheck={false}
              className="w-full rounded-lg border border-white/10 bg-studio-surface px-3 py-2 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            />
            {!known && model.trim() && (
              <p className="mt-1 text-[10px] text-slate-500">Custom model · provider: {claude ? 'Anthropic (Claude)' : 'Google (Gemini)'}</p>
            )}
          </div>

          <KeyField
            label="ANTHROPIC_API_KEY"
            hint={studioSettings?.anthropic_key_hint ?? ''}
            configured={!!studioSettings?.has_anthropic_key}
            required={claude}
            placeholder="sk-ant-…"
            value={anthropicKey}
            onChange={setAnthropicKey}
            locked={keysLocked}
            help={keysLocked ? <>Shared by every user: ask an admin to change it.</> : <>From the Anthropic Console → API keys. Checked with Anthropic before it is saved.</>}
          />
          <KeyField
            label="GOOGLE_API_KEY"
            hint={studioSettings?.google_key_hint ?? ''}
            configured={!!studioSettings?.has_google_key}
            required={!claude}
            placeholder="Google AI Studio key"
            value={googleKey}
            onChange={setGoogleKey}
            locked={keysLocked}
            help={keysLocked ? <>Shared by every user: ask an admin to change it.</> : <>Also used by generated agents and the platform's knowledge features, whichever Builder model you pick.</>}
          />

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
            <button type="button" onClick={onClose} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !model.trim() || needsKey}
              title={needsKey ? `Add your ${claude ? 'Anthropic' : 'Google'} API key first` : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-md transition-all disabled:opacity-50 ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400'}`}
            >
              {saved ? <><Check className="h-3.5 w-3.5" />{saved}</>
                : saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking & switching…</>
                : <><Save className="h-3.5 w-3.5" />Save & use this model</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
