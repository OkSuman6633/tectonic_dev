import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Loader2 } from 'lucide-react';
import { getWebSearchStatus, setWebSearchProvider, type WebSearchStatus } from '../../services/webSearch';

/** Lets the user pick which web-search provider the Builder uses (DuckDuckGo / Tavily / Apify). */
export const SearchProviderPicker: React.FC = () => {
  const [status, setStatus] = useState<WebSearchStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    getWebSearchStatus().then((s) => s && setStatus(s)).catch(() => {});
  };

  useEffect(() => {
    load();
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = async (id: string) => {
    setBusyId(id);
    try {
      setStatus(await setWebSearchProvider(id));
      setOpen(false);
    } catch {
      /* keep the previous selection */
    } finally {
      setBusyId(null);
    }
  };

  const effectiveLabel = status?.providers.find((p) => p.id === status.effective)?.label ?? '…';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200 transition-colors"
        title="Web search provider"
      >
        <Globe className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
        <span className="max-w-[110px] truncate">{status ? effectiveLabel : 'Search'}</span>
        <ChevronDown className="h-3 w-3 text-slate-500" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-studio-card p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-slate-500">
            Web search provider
          </div>
          <button
            type="button"
            onClick={() => choose('auto')}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <span className="flex-1">Auto (best available)</span>
            {status?.selected === 'auto' && <Check className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />}
          </button>
          {status?.providers.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!p.configured || busyId !== null}
              onClick={() => choose(p.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
              title={p.configured ? `Use ${p.label}` : `${p.label} is not configured (set its key in .env)`}
            >
              <span className="flex-1">{p.label}</span>
              {busyId === p.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : !p.configured ? (
                <span className="text-[10px] text-slate-500">no key</span>
              ) : (
                status?.selected === p.id && <Check className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
