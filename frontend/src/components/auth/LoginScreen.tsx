import React, { useState } from 'react';
import { Box, Loader2, LogIn, UserPlus } from 'lucide-react';
import { signIn } from '../../services/auth';

/** Sign in / create an account. Each account has its own agents, sessions, history and live events. */
export const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const registering = mode === 'register';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registering && password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(mode, username.trim(), password);
      window.location.reload(); // load the Studio with this user's own history
    } catch (err: any) {
      setError(err.message || 'Sign-in failed.');
      setBusy(false);
    }
  };

  const field = 'w-full rounded-xl border border-white/10 bg-studio-surface/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none transition-colors';

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-studio-bg px-4 font-sans text-[var(--studio-text)]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-studio-card/90 p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-sky-300 via-sky-400 to-indigo-500">
            <Box className="h-4 w-4 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">Tectonic Agent Studio</div>
            <div className="text-xs text-slate-400">{registering ? 'Create your account' : 'Sign in to your workspace'}</div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Username</span>
            <input className={field} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
                   autoFocus required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.\-]+"
                   title="3-32 characters: letters, digits, '_', '.' or '-'" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Password</span>
            <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                   autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 8 : 1} />
          </label>
          {registering && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Confirm password</span>
              <input className={field} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                     autoComplete="new-password" required minLength={8} />
            </label>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
        )}

        <button type="submit" disabled={busy}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 py-2.5 text-sm font-semibold text-[#05222E] transition-colors hover:bg-sky-300 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : registering ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
          {registering ? 'Create account' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          {registering ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="font-medium text-sky-400 hover:underline"
                  onClick={() => { setMode(registering ? 'login' : 'register'); setError(''); }}>
            {registering ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Your agents, conversations and live activity are private to your account.
        </p>
      </form>
    </div>
  );
};
