import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, Loader2, Lock, Save, Server, Trash2, UserRound, X } from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';
import { useIsLightTheme } from '../../hooks/useIsLightTheme';
import type { BuilderModelOption, ModelMode, StudioSettings } from '../../types/agent';

const PROVIDERS = {
  anthropic: { title: 'Claude · Anthropic', name: 'Anthropic', accent: 'text-orange-300', accentLight: 'text-orange-700', accentDark: 'text-orange-300', ring: 'border-orange-400 bg-orange-500/15 text-orange-100' },
  google: { title: 'Gemini · Google', name: 'Google', accent: 'text-sky-300', accentLight: 'text-sky-700', accentDark: 'text-sky-300', ring: 'border-sky-400 bg-sky-500/15 text-sky-100' },
} as const;
type Provider = keyof typeof PROVIDERS;

const isClaude = (model: string) => /^(claude-|anthropic\/)/i.test(model.trim());
const providerOf = (model: string): Provider => (isClaude(model) ? 'anthropic' : 'google');
const labelOf = (s: StudioSettings | null, model: string) => s?.catalogue.find((m) => m.id === model)?.label ?? model;

const KeyField: React.FC<{
  label: string; status: React.ReactNode; placeholder: string;
  value: string; onChange: (v: string) => void; help: React.ReactNode; locked?: boolean; isLight?: boolean;
}> = ({ label, status, placeholder, value, onChange, help, locked, isLight }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-slate-300 font-medium">
        <span className="flex items-center gap-1.5 font-mono text-[11px]"><KeyRound className="h-3 w-3" />{label}</span>
        <span className="text-[10px] font-mono">{status}</span>
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
          className={`w-full rounded-lg border px-3 py-2 pr-9 font-mono text-xs leading-none focus:border-sky-500 focus:outline-none disabled:opacity-50 ${
            isLight
              ? 'border-slate-300/90 bg-white text-slate-800 placeholder:text-slate-400 shadow-inner'
              : 'border-white/10 bg-studio-surface text-slate-200 placeholder:text-slate-500'
          }`}
        />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" title={show ? 'Hide' : 'Show'}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{help}</p>
    </div>
  );
};

/** Catalogue cards grouped by provider, plus a free-text model id. */
const ModelPicker: React.FC<{ catalogue: BuilderModelOption[]; model: string; onChange: (m: string) => void; isLight?: boolean }> = ({ catalogue, model, onChange, isLight }) => {
  const groups = useMemo(
    () => (['anthropic', 'google'] as const).map((p) => ({ provider: p, models: catalogue.filter((m) => m.provider === p) })),
    [catalogue],
  );
  const known = catalogue.some((m) => m.id === model);
  return (
    <>
      {groups.map(({ provider, models }) => models.length > 0 && (
        <div key={provider}>
          <div className={`mb-1.5 text-[11px] font-semibold ${isLight ? PROVIDERS[provider].accentLight : PROVIDERS[provider].accentDark}`}>{PROVIDERS[provider].title}</div>
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
          className={`w-full rounded-lg border px-3 py-2 font-mono text-xs leading-none focus:border-sky-500 focus:outline-none ${
            isLight
              ? 'border-slate-300/90 bg-white text-slate-800 placeholder:text-slate-400 shadow-inner'
              : 'border-white/10 bg-studio-surface text-slate-200 placeholder:text-slate-500'
          }`}
        />
        {!known && model.trim() && (
          <p className="mt-1 text-[10px] text-slate-500">Custom model · provider: {PROVIDERS[providerOf(model)].name}</p>
        )}
      </div>
    </>
  );
};

const ErrorBox: React.FC<{ message: string; isLight?: boolean }> = ({ message, isLight }) => (
  <div className={`flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] ${isLight ? 'text-rose-700' : 'text-rose-200'}`}>
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
  const isLight = useIsLightTheme();
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
        <span className="mt-0.5">{icon}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
            {title}
            {active && <span className="rounded bg-emerald-500/20 px-1 text-[9px] uppercase text-emerald-300">Active</span>}
          </span>
          <span className="block truncate text-[10px] text-slate-400">{sub}</span>
        </span>
      </button>
    );
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-md sm:p-5 ${isLight ? 'bg-slate-900/35' : 'bg-black/75'}`}>
      <div
        className={`key-settings-in max-h-[94dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-[24px] border p-4 sm:space-y-5 sm:p-6 ${
          isLight
            ? 'border-emerald-600/20 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(246,249,252,0.98)_52%,rgba(240,252,248,0.98))] shadow-[0_32px_80px_-24px_rgba(15,23,42,0.22),0_0_50px_-28px_rgba(16,185,129,0.25)]'
            : 'border-emerald-300/15 bg-[linear-gradient(145deg,rgba(24,30,34,0.98),rgba(17,19,28,0.98)_52%,rgba(17,25,26,0.98))] shadow-[0_32px_100px_-28px_rgba(0,0,0,0.9),0_0_60px_-32px_rgba(52,211,153,0.5)]'
        }`}
      >
        <div
          className={`relative isolate overflow-hidden rounded-[20px] border p-4 sm:p-5 ${
            isLight
              ? 'border-emerald-600/20 bg-[linear-gradient(115deg,rgba(16,185,129,0.12),rgba(255,255,255,0.85)_52%,rgba(6,184,230,0.09))]'
              : 'border-emerald-200/15 bg-[linear-gradient(115deg,rgba(52,211,153,0.11),rgba(255,255,255,0.035)_52%,rgba(45,212,255,0.08))]'
          }`}
        >
          <div aria-hidden="true" className={`pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full blur-3xl ${isLight ? 'bg-emerald-400/20' : 'bg-emerald-300/10'}`} />
          <div className="relative flex items-start gap-4 sm:gap-5">
            <div className="key-logo-float relative mt-0.5 h-[80px] w-[80px] shrink-0 sm:h-[92px] sm:w-[92px]">
              <span aria-hidden="true" className={`key-logo-halo absolute -inset-3 rounded-[28px] blur-xl ${isLight ? 'bg-emerald-400/25' : 'bg-emerald-300/20'}`} />
              <img
                src="/tectonic-key-shield.png"
                alt="Green shield with a silver key"
                className="absolute left-1/2 top-1/2 h-[180px] w-[180px] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_12px_24px_rgba(16,185,129,0.42)] sm:h-[200px] sm:w-[200px]"
              />
            </div>
            <div>
              <h3 className="typo-panel-heading text-slate-100">Builder model</h3>
              <span className="font-mono text-[10px] text-sky-400">
                Now: {s ? `${labelOf(s, s.model)} · ${mode === 'custom' ? 'your override' : 'platform default'}` : 'loading…'}
              </span>
            </div>
          </div>
          <button onClick={onClose} title="Close" className="absolute right-3 top-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <p className="text-xs leading-relaxed text-slate-300">
          The model that designs your agents and writes their code: the Builder, its specialists and the Agent Editor.
          Switching applies to your account only, from the next step, with no restart.
        </p>

        <div role="radiogroup" aria-label="Model source" className="flex flex-col gap-1 rounded-xl border border-white/10 bg-studio-surface p-1 sm:flex-row">
          {tab('default', <Server className="h-3.5 w-3.5 text-sky-300" />, 'Platform default', s ? labelOf(s, s.default_model ?? s.model) : '…')}
          {tab('custom', <UserRound className="h-3.5 w-3.5 text-orange-300" />, 'Custom override',
            s?.can_customize === false ? 'Sign in to use your own' : s?.custom ? labelOf(s, s.custom.model) : 'Not set up yet')}
        </div>

        {s && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[11px]">
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
          <ErrorBox isLight={isLight} message={`Your override can't run, so the platform default is serving you: ${s.custom_error}`} />
        )}

        {view === 'custom' ? (
          s?.can_customize === false ? (
            <p className="rounded-xl border border-white/10 p-3 text-xs text-slate-400">Sign in to save your own model and key.</p>
          ) : (
            <form onSubmit={saveCustom} className="space-y-4 text-xs">
              {s?.custom && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="text-[11px] text-slate-300">
                    Saved: <span className="font-semibold text-slate-100">{labelOf(s, s.custom.model)}</span>
                    <span className="ml-2 font-mono text-[10px] text-slate-400">
                      {!s.custom.key_readable ? 'saved key unreadable: enter it again'
                        : s.custom.has_own_key ? `your key ${s.custom.key_hint}` : "platform's key"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearCustom}
                    disabled={!!busy}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors disabled:opacity-50 ${confirmClear ? 'bg-rose-500/20 text-rose-200' : 'text-slate-400 hover:bg-white/5 hover:text-rose-300'}`}
                  >
                    {busy === 'clear' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    {confirmClear ? 'Click again to delete model and key' : 'Remove override'}
                  </button>
                </div>
              )}

              <ModelPicker catalogue={catalogue} model={customModel} onChange={setCustomModel} isLight={isLight} />

              <KeyField
                label={`Your ${PROVIDERS[customProvider].name} API key`}
                status={savedKeyUsable ? <span className="text-emerald-400">Saved ✓ {s?.custom?.key_hint}</span>
                  : keyRequired ? <span className="text-amber-300">Required</span>
                  : <span className="text-slate-500">Optional</span>}
                placeholder={savedKeyUsable ? 'Leave blank to keep your saved key'
                  : platformHasKey ? "Leave blank to use the platform's key"
                  : customProvider === 'anthropic' ? 'sk-ant-…' : 'Google AI Studio key'}
                value={customKey}
                onChange={setCustomKey}
                isLight={isLight}
                help={<>Used only for your Builder runs. Checked with {PROVIDERS[customProvider].name} before it is saved, stored encrypted,
                  and never shown again in full. Saving replaces your previous override.</>}
              />

              {error && <ErrorBox isLight={isLight} message={error} />}

              <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                <button type="button" onClick={onClose} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10">
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!!busy || !customModel.trim() || keyRequired}
                  title={keyRequired ? `Add your ${PROVIDERS[customProvider].name} API key first` : undefined}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-indigo-500 px-4 py-1.5 text-xs font-semibold text-white shadow-md transition-all hover:from-orange-400 hover:to-indigo-400 disabled:opacity-50"
                >
                  {busy === 'custom' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking & switching…</>
                    : <><Save className="h-3.5 w-3.5" />Save & use override</>}
                </button>
              </div>
            </form>
          )
        ) : s?.can_edit_default ? (
          <form onSubmit={saveDefault} className="space-y-4 text-xs">
            <p className="text-[11px] text-slate-400">
              Admin: this changes the default for <span className="text-slate-200">every user</span> without an active override,
              and the keys generated agents use. Saved to this server's <code className="font-mono text-sky-300">.env</code>.
            </p>
            <ModelPicker catalogue={catalogue} model={defaultModel} onChange={setDefaultModel} isLight={isLight} />
            <KeyField
              label="ANTHROPIC_API_KEY"
              status={s.has_anthropic_key ? <span className="text-emerald-400">Saved ✓ {s.anthropic_key_hint}</span>
                : defaultClaude ? <span className="text-amber-300">Required for this model</span> : <span className="text-slate-500">Not set</span>}
              placeholder={s.has_anthropic_key ? 'Leave blank to keep the saved key' : 'sk-ant-…'}
              value={anthropicKey}
              onChange={setAnthropicKey}
              isLight={isLight}
              help={<>From the Anthropic Console → API keys. Checked with Anthropic before it is saved.</>}
            />
            <KeyField
              label="GOOGLE_API_KEY"
              status={s.has_google_key ? <span className="text-emerald-400">Saved ✓ {s.google_key_hint}</span>
                : !defaultClaude ? <span className="text-amber-300">Required for this model</span> : <span className="text-slate-500">Not set</span>}
              placeholder={s.has_google_key ? 'Leave blank to keep the saved key' : 'Google AI Studio key'}
              value={googleKey}
              onChange={setGoogleKey}
              isLight={isLight}
              help={<>Also used by generated agents and the platform's knowledge features.</>}
            />
            {error && <ErrorBox isLight={isLight} message={error} />}
            <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
              <button type="button" onClick={onClose} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10">
                Close
              </button>
              <button
                type="submit"
                disabled={!!busy || !defaultModel.trim() || defaultNeedsKey}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-1.5 text-xs font-semibold text-white shadow-md transition-all hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50"
              >
                {busy === 'default' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking & switching…</>
                  : <><Save className="h-3.5 w-3.5" />Save platform default</>}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-300">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                {s?.default_managed_by === 'deployment'
                  ? <>The platform default is set by the deployment (Secret Manager and environment variables), not from the Studio.</>
                  : <>Only an admin can change the platform default.</>}
                {' '}Want a different model? Use <button type="button" className="text-sky-300 underline-offset-2 hover:underline" onClick={() => choose('custom')}>a custom override</button>.
              </span>
            </div>
            {error && <ErrorBox isLight={isLight} message={error} />}
            <div className="flex justify-end border-t border-white/10 pt-3">
              <button type="button" onClick={onClose} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10">
                Close
              </button>
            </div>
          </div>
        )}

        {notice && !error && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
      </div>
    </div>
  );
};
