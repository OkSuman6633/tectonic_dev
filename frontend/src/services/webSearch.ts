/** Web search provider choice: DuckDuckGo (free), Tavily, Apify. Per account. */

export interface SearchProvider {
  id: 'duckduckgo' | 'tavily' | 'apify';
  label: string;
  configured: boolean;
}

export interface WebSearchStatus {
  providers: SearchProvider[];
  selected: string;   // "auto" | a provider id
  effective: string;  // what would actually run now
  available: string[];
}

export async function getWebSearchStatus(): Promise<WebSearchStatus | null> {
  try {
    const res = await fetch('/api/web-search');
    return res.ok ? ((await res.json()) as WebSearchStatus) : null;
  } catch {
    return null;
  }
}

export async function setWebSearchProvider(provider: string): Promise<WebSearchStatus> {
  const res = await fetch('/api/web-search', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Could not change search provider (${res.status})`);
  return data as WebSearchStatus;
}
