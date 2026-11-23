/** Web search provider choice: DuckDuckGo (free), Tavily, Apify. Per account. */

export interface SearchProvider {
  id: 'google' | 'duckduckgo' | 'tavily' | 'apify';
  label: string;
  configured: boolean;
}

export interface WebSearchStatus {
  providers: SearchProvider[];
  selected: string;   // "auto" | a provider id
  effective: string;  // what would actually run now
  is_gemini_model?: boolean;
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

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  status: 'success' | 'no_results' | 'error';
  provider: string;
  query: string;
  results: WebSearchResultItem[];
  note?: string;
  error?: string;
}

export async function executeWebSearch(
  query: string,
  maxResults = 5,
  provider?: string
): Promise<WebSearchResponse> {
  const res = await fetch('/api/web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: maxResults, provider }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Search failed with status ${res.status}`);
  }
  return (await res.json()) as WebSearchResponse;
}
