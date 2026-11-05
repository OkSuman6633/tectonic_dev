/**
 * Sign-in for multi-user deployments. When the backend reports `auth: true` (GET /auth/config), the
 * Studio shows the login screen until the user signs in; the token then rides on every same-origin
 * request (and the telemetry WebSocket), so the server runs each call in that user's own workspace.
 * Older / local backends without /auth simply run without sign-in.
 */

export interface AuthUser {
  id: string;
  username: string;
  admin: boolean;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

const STORAGE_KEY = 'tectonic-auth';
let current: StoredAuth | null = null;

const read = (): StoredAuth | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
};

current = read();

export const getToken = (): string | null => current?.token ?? null;
export const getUser = (): AuthUser | null => current?.user ?? null;

/** Keys per-user browser storage (chat history) so two accounts on one browser never share it
 *  ('' without sign-in: a local Studio keeps its existing history). */
export const storageScope = (): string => current?.user.id ?? '';

const save = (auth: StoredAuth | null) => {
  current = auth;
  try {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage blocked: the session lasts until the tab closes */ }
};

/** Sign out and reload into the login screen (the Studio's state belongs to the previous user). */
export const signOut = () => {
  save(null);
  window.location.reload();
};

const isSameOrigin = (input: RequestInfo | URL): boolean => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

/** Adds the bearer token to same-origin requests; a 401 on an API call means the session ended. */
export const installAuthFetch = () => {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getToken();
    if (!token || !isSameOrigin(input)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    const res = await original(input, { ...init, headers });
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href).pathname;
    if (res.status === 401 && !path.startsWith('/auth/')) signOut();
    return res;
  };
};

/** Whether this backend requires sign-in (false for local / older servers without /auth). */
export const authRequired = async (): Promise<boolean> => {
  try {
    const res = await fetch('/auth/config');
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data?.auth === true;
  } catch {
    return false;
  }
};

/** Confirms the stored token is still valid (refreshes the user's details, e.g. admin rights). */
export const verifySession = async (): Promise<boolean> => {
  if (!getToken()) return false;
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) {
      save(null);
      return false;
    }
    const data = await res.json();
    save({ token: getToken()!, user: data.user });
    return true;
  } catch {
    return true; // offline: keep the token, the next request will tell
  }
};

export const signIn = async (mode: 'login' | 'register', username: string, password: string): Promise<AuthUser> => {
  const res = await fetch(`/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Sign-in failed (${res.status})`);
  save({ token: data.token, user: data.user });
  return data.user as AuthUser;
};
