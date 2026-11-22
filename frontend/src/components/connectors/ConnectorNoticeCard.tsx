import React, { useEffect } from 'react';
import { CheckCircle2, CircleSlash, Plug, Play, TriangleAlert } from 'lucide-react';
import { useConnectorsStore } from '../../store/useConnectorsStore';
import { useWorkspaceStore } from '../../workspace/useWorkspaceStore';
import { accountLabel } from '../../services/connectorsApi';
import type { ConnectorNoticeView } from '../../types/connectors';

const COPY: Record<ConnectorNoticeView['notice']['kind'], { title: (l: string) => string; tone: string }> = {
  not_connected: { title: (l) => `${l} is not connected`, tone: 'border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200' },
  connection_failed: { title: (l) => `${l} connection failed`, tone: 'border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200' },
  fetch_failed: { title: (l) => `Could not fetch ${l} data`, tone: 'border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200' },
  no_data: { title: (l) => `No ${l} data found`, tone: 'border-sky-500/30 bg-sky-50 dark:bg-sky-950/20 text-sky-800 dark:text-sky-200' },
};

/**
 * Pops up in the chat when an agent could not get data from a connector: not connected, connection
 * failed, the provider failed, or nothing matched. Connection problems point to the External Tools window;
 * once the source is connected the user can let the agent continue.
 */
export const ConnectorNoticeCard: React.FC<{ view: ConnectorNoticeView; onContinue: () => void; busy?: boolean }> = ({ view, onContinue, busy }) => {
  const { notice } = view;
  const { load, loaded } = useConnectorsStore();
  const active = useConnectorsStore((s) => s.active(notice.connector, notice.connection));
  const reveal = useWorkspaceStore((s) => s.reveal);
  const needsConnection = notice.kind === 'not_connected' || notice.kind === 'connection_failed';
  const copy = COPY[notice.kind];
  const label = notice.label + (notice.connection !== 'default' ? ` (${notice.connection})` : '');
  const Icon = notice.kind === 'no_data' ? CircleSlash : needsConnection ? Plug : TriangleAlert;

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  return (
    <div className={`rounded-xl border px-3 py-2.5 text-xs ${copy.tone}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{copy.title(label)}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-700 dark:text-slate-300">
            {needsConnection
              ? <>{notice.agent} needs {label} data. Connect it in <strong>External Tools</strong> — the agent continues without it until then.</>
              : notice.message}
          </div>
          {needsConnection && notice.kind === 'connection_failed' && (
            <div className="mt-1 text-[10.5px] text-rose-300/90">{notice.message}</div>
          )}
        </div>
      </div>
      {needsConnection && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          {active ? (
            <>
              <span className="flex items-center gap-1 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected{accountLabel(active) ? ` · ${accountLabel(active)}` : ''}
              </span>
              {!view.continued && (
                <button type="button" onClick={onContinue} disabled={busy}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
                  <Play className="h-3 w-3" /> Continue with the data
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => { reveal('connectors'); load(); }}
              className="flex items-center gap-1 rounded-lg bg-slate-200/80 hover:bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15 px-2.5 py-1 text-[11px] font-medium transition-colors">
              <Plug className="h-3 w-3" /> Open External Tools
            </button>
          )}
        </div>
      )}
    </div>
  );
};
