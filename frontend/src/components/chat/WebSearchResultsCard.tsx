import React, { useState } from 'react';
import { Globe, ExternalLink, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react';

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResultsCardProps {
  data: {
    status: 'success' | 'no_results' | 'error';
    provider?: string;
    query: string;
    results?: SearchResultItem[];
    note?: string;
    error?: string;
  };
}

export const WebSearchResultsCard: React.FC<WebSearchResultsCardProps> = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  const results = data.results ?? [];
  const displayResults = expanded ? results : results.slice(0, 3);
  const hasMore = results.length > 3;

  const providerLabel = data.provider === 'google'
    ? 'Google Search'
    : data.provider === 'duckduckgo'
    ? 'DuckDuckGo'
    : data.provider
    ? data.provider.charAt(0).toUpperCase() + data.provider.slice(1)
    : 'Web Search';

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20 p-3.5 backdrop-blur-md shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-sky-500/15 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <Globe className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Search: <span className="font-normal italic">"{data.query}"</span>
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-sky-700 dark:text-sky-300 border border-sky-500/20">
          {providerLabel}
        </span>
      </div>

      {/* Fallback Notice Banner */}
      {data.note && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
          <span>{data.note}</span>
        </div>
      )}

      {/* Error state */}
      {data.status === 'error' && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-2.5 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
          <div>
            <div className="font-semibold">Search Failed</div>
            <div className="text-[11px] opacity-90">{data.error || 'Unable to retrieve search results.'}</div>
          </div>
        </div>
      )}

      {/* No results state */}
      {data.status === 'no_results' && (
        <div className="mt-2.5 rounded-xl bg-slate-100 dark:bg-white/5 px-3 py-2 text-center text-xs text-slate-600 dark:text-slate-400">
          No web search results found for this query.
        </div>
      )}

      {/* Result Items */}
      {results.length > 0 && (
        <div className="mt-2.5 space-y-2">
          {displayResults.map((r, i) => (
            <div
              key={i}
              className="group/item rounded-xl border border-white/60 dark:border-white/5 bg-white/70 dark:bg-white/[0.03] p-2.5 hover:bg-white/90 dark:hover:bg-white/[0.06] transition-all"
            >
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-2 text-xs font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200 transition-colors"
              >
                <span className="line-clamp-1">{r.title || r.url}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover/item:opacity-100 transition-opacity" />
              </a>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                {r.url}
              </div>
              {r.snippet && (
                <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                  {r.snippet}
                </p>
              )}
            </div>
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 flex w-full items-center justify-center gap-1 py-1 text-[11px] font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 transition-colors"
            >
              <span>{expanded ? 'Show less' : `Show all ${results.length} sources`}</span>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
