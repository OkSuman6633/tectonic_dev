import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Cpu, Eye, EyeOff, KeyRound, Loader2, Lock, Save, Server, Trash2, UserRound, X } from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';
import type { BuilderModelOption, ModelMode, StudioSettings } from '../../types/agent';

const PROVIDERS = {
  anthropic: { title: 'Claude · Anthropic', name: 'Anthropic', accent: 'text-orange-300', ring: 'border-orange-400 bg-orange-500/15 text-orange-100' },
  google: { title: 'Gemini · Google', name: 'Google', accent: 'text-sky-300', ring: 'border-sky-400 bg-sky-500/15 text-sky-100' },
} as const;
type Provider = keyof typeof PROVIDERS;

const isClaude = (model: string) => /^(claude-|anthropic\/)/i.test(model.trim());
const providerOf = (model: string): Provider => (isClaude(model) ? 'anthropic' : 'google');
const labelOf = (s: StudioSettings | null, model: string) => s?.catalogue.find((m) => m.id === model)?.label ?? model;

const KeyField: React.FC<{
  label: string; status: React.ReactNode; placeholder: string;
  value: string; onChange: (v: string) => void; help: React.ReactNode; locked?: boolean;
}> = ({ label, status, placeholder, value, onChange, help, locked }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-slate-300 font-medium">

        <span className="flex items-center gap-1.5 font-mono text-[12px]"><KeyRound className="h-3 w-3" />{label}</span>
        <span className={`text-[12px] font-mono ${configured ? 'text-emerald-400' : required ? 'text-amber-300' : 'text-slate-500'}`}>
          {configured ? `Saved ✓ ${hint}` : required ? 'Required for this model' : 'Not set'}
        </span>

      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={locked}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="h-9 w-full rounded-lg border border-white/10 bg-studio-surface pl-3 pr-10 font-mono text-[12px] leading-none text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
        />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-white/5 hover:text-slate-300" title={show ? 'Hide' : 'Show'}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mt-1 typo-metadata text-slate-500">{help}</p>
    </div>
  );
};

/** Catalogue cards grouped by provider, plus a free-text model id. */
const ModelPicker: React.FC<{ catalogue: BuilderModelOption[]; model: string; onChange: (m: string) => void }> = ({ catalogue, model, onChange }) => {
  const groups = useMemo(
    () => (['anthropic', 'google'] as const).map((p) => ({ provider: p, models: catalogue.filter((m) => m.provider === p) })),
    [catalogue],
  );
  const known = catalogue.some((m) => m.id === model);
  return (
    <>
      {groups.map(({ provider, models }) => models.length > 0 && (
        <div key={provider}>
          <div className={`mb-1.5 text-[11px] font-semibold ${PROVIDERS[provider].accent}`}>{PROVIDERS[provider].title}</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(m.id)}
                className={`rounded-lg border p-2 text-left transition-all ${model === m.id ? PROVIDERS[m.provider].ring : 'border-white/5 bg-studio-surface text-slate-300 hover:bg-white/5'}`}
                title={m.description}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{m.label}</span>
                  <span className="shrink-0 rounded bg-white/10 px-1 text-[9px] uppercase text-slate-400">{m.tag}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400">{m.description}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <label className="mb-1 block text-[11px] text-slate-400">Or type any model id</label>
        <input
          type="text"
          value={model}
          onChange={(e) => onChange(e.target.value)}
          placeholder="claude-opus-5-5 or gemini-2.5-pro"
          spellCheck={false}
          className="w-full rounded-lg border border-white/10 bg-studio-surface px-3 py-2 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
        />
        {!known && model.trim() && (
          <p className="mt-1 text-[10px] text-slate-500">Custom model · provider: {PROVIDERS[providerOf(model)].name}</p>
        )}
      </div>
    </>
  );
};

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] text-rose-200">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{message}</span>
  </div>
);

/**
 * The model the Agent Builder runs on for this user: the platform default, or their own custom override
 * (any Claude or Gemini model, optionally with their own API key). The toggle switches between the two
 * without losing the saved override; saving a new override replaces the previous one.
 */
export const ModelSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { studioSettings: s, loadStudioSettings, saveStudioSettings, saveCustomModel, setModelMode, clearCustomModel } = useAgentStudioStore();
  const mode: ModelMode = s?.mode ?? 'default';
  const [view, setView] = useState<ModelMode>(mode);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // Custom override form
  const [customModel, setCustomModel] = useState(s?.custom?.model ?? 'claude-opus-5-5');
  const [customKey, setCustomKey] = useState('');
  // Platform default form (admin on a local server only)
  const [defaultModel, setDefaultModel] = useState(s?.default_model ?? s?.model ?? 'gemini-3.6-flash');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');

  useEffect(() => {
    loadStudioSettings();
  }, [loadStudioSettings]);
  useEffect(() => {
    if (!s) return;
    setView(s.mode ?? 'default');
    if (s.custom?.model) setCustomModel(s.custom.model);
    if (s.default_model) setDefaultModel(s.default_model);
  }, [s?.mode, s?.custom?.model, s?.default_model]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalogue = s?.catalogue ?? [];
  const run = async (what: string, action: () => Promise<StudioSettings>, done: (r: StudioSettings) => string) => {
    setBusy(what);
    setError('');
    setNotice('');
    try {
      const result = await action();
      setNotice(done(result));
      return result;
    } catch (err: any) {
      setError(err.message || 'The request failed.');
      return null;
    } finally {
      setBusy('');
    }
  };

  // --- the toggle -----------------------------------------------------------------------------------
  const choose = async (next: ModelMode) => {
    setConfirmClear(false);
    setView(next);
    if (next === mode) return;
    if (next === 'default') {
      await run('mode', () => setModelMode('default'), (r) => `Back on the platform default: ${labelOf(r, r.model)}. Your override is kept.`);
    } else if (s?.custom) {
      const r = await run('mode', () => setModelMode('custom'), (r) => `Now using your override: ${labelOf(r, r.model)}.`);
      if (!r) setView('custom'); // stay on the form so the user can fix the override (e.g. re-enter a key)
    }
    // No saved override yet: just show the form; saving it switches.
  };

  // --- custom override ------------------------------------------------------------------------------
  const customProvider = providerOf(customModel);
  const platformHasKey = customProvider === 'anthropic' ? !!s?.has_anthropic_key : !!s?.has_google_key;
  const savedKeyUsable = !!(s?.custom?.has_own_key && s.custom.key_readable && s.custom.provider === customProvider);
  const keyRequired = !savedKeyUsable && !platformHasKey && !customKey.trim();

  const saveCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run('custom', () => saveCustomModel(customModel.trim(), customKey.trim() || undefined),
      (r) => `Saved. The Builder now runs on ${labelOf(r, r.model)} (${r.active_key_source === 'user' ? 'your key' : "the platform's key"}).`);
    if (r) setCustomKey('');
  };

  const clearCustom = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    const r = await run('clear', () => clearCustomModel(), (r) => `Override removed. Back on ${labelOf(r, r.model)}.`);
    if (r) setView('default');
  };

  // --- platform default -----------------------------------------------------------------------------
  const defaultClaude = isClaude(defaultModel);
  const defaultNeedsKey = defaultClaude ? !s?.has_anthropic_key && !anthropicKey.trim() : !s?.has_google_key && !googleKey.trim();
  const saveDefault = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run('default', () => saveStudioSettings(defaultModel.trim(), { anthropicApiKey: anthropicKey.trim(), googleApiKey: googleKey.trim() }),
      (r) => `Platform default is now ${labelOf(r, r.default_model ?? r.model)}.`);
    if (r) {
      setAnthropicKey('');
      setGoogleKey('');
    }
  };

  const tab = (value: ModelMode, icon: React.ReactNode, title: string, sub: string) => {
    const active = mode === value;
    const shown = view === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        disabled={!!busy || (value === 'custom' && s?.can_customize === false)}
        onClick={() => choose(value)}
        className={`flex flex-1 items-start gap-2 rounded-lg px-3 py-2 text-left transition-all disabled:opacity-50 ${shown ? 'bg-white/10 ring-1 ring-sky-400/60' : 'hover:bg-white/5'}`}
      >

        <div className="flex items-center justify-between gap-2">
          <span className="typo-agent-name truncate">{m.label}</span>
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium uppercase text-slate-400">{m.tag}</span>
        </div>
        <div className="mt-0.5 line-clamp-2 typo-metadata text-slate-400">{m.description}</div>

      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-studio-border bg-studio-card p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-orange-500 via-sky-500 to-indigo-600 shadow-md">
              <Cpu className="h-4 w-4 text-white" />
            </div>
            <div>

              <h3 className="typo-panel-heading text-slate-100">Builder model & API keys</h3>
              <span className="font-mono text-[12px] text-sky-400">
                Now: {studioSettings ? (catalogue.find((m) => m.id === studioSettings.model)?.label ?? studioSettings.model) : 'loading…'}
              </span>
            </div>
          </div>
          <button onClick={onClose} title="Close" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>

        </div>

        <p className="typo-secondary text-slate-300">
          The model that designs your agents and writes their code: the Builder, its specialists and the Agent Editor.

          It switches immediately, no restart, and only for your account. Keys are saved only in the server's <code className="font-mono text-[12px] text-sky-300">.env</code>.
        </p>

        {studioSettings && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[12px]">

            <span className="text-slate-300">
              Running on <span className="font-semibold text-slate-100">{labelOf(s, s.model)}</span>
            </span>
            <span className="flex items-center gap-1.5 font-mono text-emerald-300" title="First characters of the API key the running Builder actually sends">
              <KeyRound className="h-3 w-3" />
              {s.active_key_hint
                ? `${s.active_key_source === 'user' ? 'Your' : 'Platform'} ${(s.active_key_provider ?? s.provider) === 'anthropic' ? 'Anthropic' : 'Google'} key: ${s.active_key_hint}`
                : 'No key in use'}
            </span>
          </div>
        )}
        {s?.custom_error && (
          <ErrorBox message={`Your override can't run, so the platform default is serving you: ${s.custom_error}`} />
        )}


        <form onSubmit={submit} className="space-y-4 text-[13px]">
          {groups.map(({ provider, models }) => models.length > 0 && (
            <div key={provider}>
              <div className={`mb-1.5 typo-panel-heading ${PROVIDERS[provider].accent}`}>{PROVIDERS[provider].title}</div>
              <div className="grid grid-cols-2 gap-2">{models.map(card)}</div>
            </div>
          ))}

          <div>
            <label className="mb-1 block text-[12px] text-slate-400">Or type any model id</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-opus-5-5 or gemini-2.5-pro"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-white/10 bg-studio-surface px-3 font-mono text-[12px] leading-none text-slate-200 focus:border-sky-500 focus:outline-none"
            />
            {!known && model.trim() && (
              <p className="mt-1 typo-metadata text-slate-500">Custom model · provider: {claude ? 'Anthropic (Claude)' : 'Google (Gemini)'}</p>
            )}

          </div>
        )}


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
            <button type="button" onClick={onClose} className="inline-flex h-9 items-center justify-center rounded-lg bg-white/5 px-3.5 text-xs font-medium leading-none text-slate-300 transition-colors hover:bg-white/10">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !model.trim() || needsKey}
              title={needsKey ? `Add your ${claude ? 'Anthropic' : 'Google'} API key first` : undefined}
              className={`inline-flex h-9 max-w-full items-center justify-center gap-1.5 truncate rounded-lg px-4 text-xs font-semibold leading-none text-white shadow-md transition-all disabled:opacity-50 ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400'}`}
            >
              {saved ? <><Check className="h-3.5 w-3.5" />{saved}</>
                : saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking & switching…</>
                  : <><Save className="h-3.5 w-3.5" />Save & use this model</>}
            </button>

          </div>
        )}
      </div>
    </div>
  );
};
