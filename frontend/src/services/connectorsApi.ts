/**
 * External data connectors. Users connect each data source once in the External Tools window; every
 * agentic workflow then uses that connection. Credentials go straight to the platform vault over this
 * API — never into a chat message — so the AI model, the session history and the telemetry never see them.
 */
import type { ConnectionSummary, ConnectorNotice, ConnectorSpec } from '../types/connectors';

let catalog: Promise<ConnectorSpec[]> | null = null;

const errorText = async (res: Response): Promise<string> => {
  const body = await res.json().catch(() => ({}));
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail.message === 'string') return detail.message;
  return `Request failed (${res.status})`;
};

/** Data sources the platform can connect, with their credential forms (cached for the page). */
export const fetchConnectorCatalog = (): Promise<ConnectorSpec[]> => {
  if (!catalog) {
    catalog = fetch('/connectors/catalog')
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorText(res));
        return ((await res.json()).connectors ?? []) as ConnectorSpec[];
      })
      .catch((err) => {
        catalog = null; // retry on the next call
        throw err;
      });
  }
  return catalog;
};

export const fetchConnections = async (): Promise<ConnectionSummary[]> => {
  const res = await fetch('/connectors/connections');
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()).connections ?? [];
};

/** Validate the credentials against the provider and store them; throws with a readable reason. */
export const connectDataSource = async (
  body: { connector: string; scheme: string; values: Record<string, string>; connection?: string },
): Promise<ConnectionSummary> => {
  const res = await fetch('/connectors/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()).connection as ConnectionSummary;
};

export const disconnectDataSource = async (connector: string, connection = 'default'): Promise<void> => {
  const res = await fetch(`/connectors/connections/${encodeURIComponent(connector)}?connection=${encodeURIComponent(connection)}`,
    { method: 'DELETE' });
  if (!res.ok) throw new Error(await errorText(res));
};

/** Data notices newer than `after` (optionally for one project); `latest` is the next cursor. */
export const fetchConnectorNotices = async (after = 0, project?: string): Promise<{ notices: ConnectorNotice[]; latest: number }> => {
  const params = new URLSearchParams({ after: String(after) });
  if (project) params.set('project', project);
  const res = await fetch(`/connectors/notices?${params}`);
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
};

/** The notice cursor right now: notices after it belong to the turn about to run (null if unreachable). */
export const noticeCursor = async (): Promise<number | null> => {
  try {
    return (await fetchConnectorNotices(Number.MAX_SAFE_INTEGER)).latest;
  } catch {
    return null;
  }
};

/** One readable line for a connected account (ad account name, GA4 property). */
export const accountLabel = (summary: Pick<ConnectionSummary, 'profile' | 'fields'> | undefined): string => {
  const p = (summary?.profile ?? {}) as Record<string, unknown>;
  const f = summary?.fields ?? {};
  const name = (p.account_name as string) || (p.business_name as string);
  const id = (p.account_id as string) || f.ad_account_id || (f.property_id ? `property ${f.property_id}` : '');
  return [name, id].filter(Boolean).join(' · ');
};

const CREDENTIAL_SHAPES: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/"type"\s*:\s*"service_account"/, 'a service account key'],
  [/\bEAA[A-Za-z0-9]{30,}\b/, 'a Meta access token'],
  [/\bya29\.[0-9A-Za-z_-]{20,}/, 'a Google access token'],
  [/\b1\/\/[0-9A-Za-z_-]{20,}/, 'a Google refresh token'],
];

/** Client-side guard: a chat message that contains a credential is not sent at all. */
export const looksLikeCredential = (text: string): string | null => {
  for (const [re, kind] of CREDENTIAL_SHAPES) if (re.test(text)) return kind;
  return null;
};
