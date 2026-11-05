import { useCallback, useEffect, useRef, useState } from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';

/** Agent id the server uses for Command Center requests (server.py OPERATOR). */
export const OPERATOR_ID = 'operator';

export interface ModuleEnvelope<T> {
  status: 'success' | 'error';
  module: string;
  operation: string;
  duration_ms: number;
  data?: T;
  error?: string;
}

/** Call a platform module operation as the Command Center operator (POST /modules/{module}/{op}). */
export async function invokeModule<T = unknown>(module: string, operation: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/modules/${module}/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${module}.${operation}: HTTP ${res.status}`);
  const env = (await res.json()) as ModuleEnvelope<T>;
  if (env.status !== 'success') throw new Error(env.error ?? `${module}.${operation} failed`);
  return env.data as T;
}

/**
 * Fetch a module view and keep it fresh: refetches when any of the `watch` modules records new
 * calls (from live telemetry), debounced. Returns data, error, loading and a manual refresh.
 */
export function useModuleData<T>(module: string, operation: string, payload: Record<string, unknown>, watch: string[] = [module]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const payloadKey = JSON.stringify(payload);
  const live = useTelemetryStore((s) => s.status === 'open');
  // Refetch on calls made by agents only: the operator's own reads must not retrigger a fetch
  // (each fetch is itself a module call, which would otherwise loop forever).
  const activity = useTelemetryStore((s) => watch.map((m) => {
    const calls = s.moduleCalls[m];
    if (!calls) return '';
    for (let i = calls.length - 1; i >= 0; i--) if (calls[i].agentId !== OPERATOR_ID) return calls[i].callId;
    return '';
  }).join(','));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await invokeModule<T>(module, operation, JSON.parse(payloadKey) as Record<string, unknown>));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [module, operation, payloadKey]);

  useEffect(() => {
    void refresh();
  }, [refresh, live]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [activity, refresh]);

  return { data, error, loading, refresh, setData };
}

/** Run an action with busy/error state, for buttons. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, run, setError };
}
