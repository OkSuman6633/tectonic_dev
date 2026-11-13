import type { AuthUser } from '../types';

const STORAGE_KEY = 'tectonic-auth';

interface StoredAuth {
  token: string;
  user: AuthUser;
}

export class AuthService {
  private current: StoredAuth | null = null;

  constructor() {
    this.current = this.loadFromStorage();
  }

  private loadFromStorage(): StoredAuth | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public getToken(): string | null {
    if (!this.current) {
      this.current = this.loadFromStorage();
    }
    return this.current?.token ?? null;
  }

  public getUser(): AuthUser | null {
    if (!this.current) {
      this.current = this.loadFromStorage();
    }
    return this.current?.user ?? null;
  }

  public setAuth(token: string, user: AuthUser) {
    this.current = { token, user };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch (err) {
      console.warn('Failed to save auth to localStorage:', err);
    }
  }

  public clearAuth() {
    this.current = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear auth in localStorage:', err);
    }
  }

  public getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  public async isAuthEnabled(): Promise<boolean> {
    try {
      const res = await fetch('/auth/config');
      if (!res.ok) return false;
      const data = await res.json();
      return data?.auth === true;
    } catch {
      return false;
    }
  }

  public async verifySession(): Promise<AuthUser | null> {
    let token = this.getToken();
    if (!token) {
      try {
        const res = await fetch('/auth/local-token');
        if (res.ok) {
          const data = await res.json();
          if (data?.token && data?.user) {
            this.setAuth(data.token, data.user);
            return data.user;
          }
        }
      } catch {
        // Ignore fallback errors
      }
      return null;
    }
    try {
      const res = await fetch('/auth/me', {
        headers: this.getAuthHeaders(),
      });
      if (!res.ok) {
        try {
          const resLocal = await fetch('/auth/local-token');
          if (resLocal.ok) {
            const data = await resLocal.json();
            if (data?.token && data?.user) {
              this.setAuth(data.token, data.user);
              return data.user;
            }
          }
        } catch {}
        this.clearAuth();
        return null;
      }
      const data = await res.json();
      if (data?.user) {
        this.setAuth(token, data.user);
        return data.user;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async login(username: string, password: string): Promise<AuthUser> {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed. Check your username and password.');
    }

    const data = await res.json();
    this.setAuth(data.token, data.user);
    return data.user;
  }

  public async register(username: string, password: string): Promise<AuthUser> {
    const res = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed.');
    }

    const data = await res.json();
    this.setAuth(data.token, data.user);
    return data.user;
  }
}

export const authService = new AuthService();

