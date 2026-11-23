import React, { useState } from 'react';
import { Box, Check, Eye, EyeOff, Loader2, LogIn, Sparkles, UserPlus } from 'lucide-react';
import { signIn } from '../../services/auth';
import { ThemeToggle } from '../ThemeToggle';

const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_.\-]{3,32}$/;

/** Sign in / create an account with local SQLite storage, secure bcrypt, and automatic 7-day Starter trial. */
export const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const registering = mode === 'register';

  // Inline validations
  const isEmailValid = !email || EMAIL_REGEX.test(email.trim());
  const isUsernameValid = !identifier || USERNAME_REGEX.test(identifier.trim());
  const isPasswordLongEnough = password.length >= 8;
  const passwordsMatch = !confirm || password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (registering) {
      if (!USERNAME_REGEX.test(identifier.trim())) {
        setError('Username must be 3-32 characters (letters, digits, _, ., -).');
        return;
      }
      if (email.trim() && !EMAIL_REGEX.test(email.trim())) {
        setError('Please enter a valid email address.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }

    setBusy(true);
    try {
      await signIn(mode, identifier.trim(), password, registering ? email.trim() : undefined);
      window.location.reload(); // reload Studio with this account's workspace & history
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
      setBusy(false);
    }
  };

  const field =
    'h-10 w-full rounded-lg border border-white/10 bg-studio-surface/90 px-3 text-sm leading-none text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none transition-colors';

  return (
    <div className="relative h-screen w-full overflow-y-auto bg-studio-bg font-sans text-[var(--studio-text)]">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-studio-card/90 p-6 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-6 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-sky-300 via-sky-400 to-indigo-500 shadow-md">
              <Box className="h-5 w-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="typo-section-heading text-lg font-bold">Tectonic Agent Studio</h1>
              <div className="typo-secondary text-xs text-slate-400">
                {registering ? 'Create your local workspace' : 'Sign in to your workspace'}
              </div>
            </div>
          </div>

          {registering && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-[11px] text-sky-300">
              <Sparkles className="h-4 w-4 shrink-0 text-sky-400" />
              <span>Includes automatic <strong>7-Day Starter Trial</strong> with local SQLite storage.</span>
            </div>
          )}

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-slate-300">
                {registering ? 'Username' : 'Username or Email'}
              </span>
              <input
                className={`${field} ${registering && identifier && !isUsernameValid ? 'border-rose-500/60' : ''}`}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete={registering ? 'username' : 'username email'}
                autoFocus
                required
                placeholder={registering ? 'e.g., alice_dev' : 'Username or email'}
              />
              {registering && identifier && !isUsernameValid && (
                <span className="mt-1 block text-[11px] text-rose-400">
                  3-32 characters: letters, digits, '_', '.' or '-'
                </span>
              )}
            </label>

            {registering && (
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-slate-300">Email Address</span>
                <input
                  type="email"
                  className={`${field} ${email && !isEmailValid ? 'border-rose-500/60' : ''}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="name@example.com"
                />
                {email && !isEmailValid && (
                  <span className="mt-1 block text-[11px] text-rose-400">
                    Please enter a valid email address
                  </span>
                )}
              </label>
            )}

            <label className="block">
              <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-slate-300">
                <span>Password</span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
                >
                  {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <input
                className={`${field} ${registering && password && !isPasswordLongEnough ? 'border-amber-500/60' : ''}`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={registering ? 'new-password' : 'current-password'}
                required
                placeholder="••••••••"
              />
              {registering && password && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                  {isPasswordLongEnough ? (
                    <span className="text-emerald-400 inline-flex items-center gap-1">
                      <Check className="h-3 w-3" /> Strong password length (8+ chars)
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      Must be at least 8 characters long
                    </span>
                  )}
                </div>
              )}
            </label>

            {registering && (
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-slate-300">Confirm Password</span>
                <input
                  className={`${field} ${confirm && !passwordsMatch ? 'border-rose-500/60' : ''}`}
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                />
                {confirm && !passwordsMatch && (
                  <span className="mt-1 block text-[11px] text-rose-400">
                    Passwords do not match
                  </span>
                )}
              </label>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-3.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300 animate-in fade-in"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || (registering && (!isUsernameValid || !isPasswordLongEnough || !passwordsMatch))}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-400 text-[14px] font-semibold leading-none text-[#05222E] transition-colors hover:bg-sky-300 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : registering ? (
              <UserPlus className="h-4 w-4" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {registering ? 'Create Account' : 'Sign In'}
          </button>

          <p className="mt-4 text-center text-[13px] text-slate-400">
            {registering ? 'Already have an account?' : 'New here?'}{' '}
            <button
              type="button"
              className="font-medium text-sky-400 hover:underline"
              onClick={() => {
                setMode(registering ? 'login' : 'register');
                setError('');
              }}
            >
              {registering ? 'Sign In' : 'Create an Account'}
            </button>
          </p>

          <p className="mt-3 text-center text-[11px] text-slate-500 leading-relaxed">
            Data is stored locally in SQLite with bcrypt password encryption. Private & cloud-independent.
          </p>
        </form>
      </div>
    </div>
  );
};
