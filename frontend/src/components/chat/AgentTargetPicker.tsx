import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Boxes, ChevronDown, Loader2, Lock, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';
import type { DirectoryAgent } from '../../types/agent';

const KIND_LABEL: Record<DirectoryAgent['kind'], string> = {
  builder: 'Agent Builder',
  builder_sub_agent: 'Builder specialist',
  project: 'Project root',
  sub_agent: 'Sub-agent',
};

/** All descendants of an entry (what a delete takes with it). */
const descendants = (id: string, all: DirectoryAgent[]): DirectoryAgent[] => {
  const byId = new Map(all.map((a) => [a.id, a]));
  const out: DirectoryAgent[] = [];
  const walk = (cur: string) => {
    for (const child of byId.get(cur)?.children ?? []) {
      const c = byId.get(child);
      if (c && !out.includes(c)) {
        out.push(c);
        walk(child);
      }
    }
  };
  walk(id);
  return out;
};

/** "To:" control of the Builder chat: pick which agent receives the message, or delete generated ones. */
export const AgentTargetPicker: React.FC = () => {
  const { agentDirectory, chatTarget, setChatTarget, deleteDirectoryAgent, refreshDirectory, isChatLoading } = useAgentStudioStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    refreshDirectory();
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open, refreshDirectory]);

  const current = agentDirectory.find((a) => a.id === chatTarget);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (a: DirectoryAgent) => !q || a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    const builder = agentDirectory.filter((a) => a.kind.startsWith('builder') && match(a));
    const projects = [...new Set(agentDirectory.filter((a) => a.project).map((a) => a.project as string))]
      .map((p) => ({ project: p, agents: agentDirectory.filter((a) => a.project === p && match(a)) }))
      .filter((g) => g.agents.length > 0);
    return { builder, projects };
  }, [agentDirectory, query]);

  const choose = (a: DirectoryAgent) => {
    setChatTarget(a.kind === 'builder' ? null : a.id);
    setOpen(false);
  };

  const remove = async (a: DirectoryAgent) => {
    setDeleting(a.id);
    setError('');
    try {
      await deleteDirectoryAgent(a.id);
      setConfirming(null);
    } catch (e: any) {
      setError(e.message || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const row = (a: DirectoryAgent) => {
    const selected = (chatTarget ?? 'agent_builder') === a.id;
    const extra = confirming === a.id ? descendants(a.id, agentDirectory) : [];
    return (
      <li key={a.id}>
        <div
          className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-all ${
            selected
              ? 'bg-sky-500/15 dark:bg-sky-500/20 ring-1 ring-sky-500/30 shadow-sm'
              : 'hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06]'
          }`}
          style={{ paddingLeft: 10 + (a.project ? a.depth : Math.min(a.depth, 1)) * 14 }}
        >
          <button type="button" onClick={() => choose(a)} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`typo-agent-name truncate font-semibold ${
                  selected
                    ? 'text-sky-700 dark:text-sky-300'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {a.kind === 'project' ? a.project : a.name}
              </span>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${
                  selected
                    ? 'bg-sky-500/15 text-sky-800 dark:text-sky-200'
                    : 'bg-slate-900/[0.05] dark:bg-white/[0.06] text-slate-600 dark:text-slate-400'
                }`}
              >
                {KIND_LABEL[a.kind]}
              </span>
            </div>
            {a.description && (
              <div className="typo-metadata mt-0.5 text-slate-600 dark:text-slate-400 truncate">
                {a.description}
              </div>
            )}
          </button>
          {a.deletable ? (
            <button
              type="button"
              onClick={() => setConfirming(confirming === a.id ? null : a.id)}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 opacity-70 group-hover:opacity-100 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              title={`Delete ${a.id}`}
              aria-label={`Delete ${a.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span
              title="Part of the Agent Builder: cannot be deleted"
              className="p-1.5 text-slate-400 dark:text-slate-500"
            >
              <Lock className="w-3 h-3" />
            </span>
          )}
        </div>
        {confirming === a.id && (
          <div
            ref={(el) => el?.scrollIntoView({ block: 'nearest' })}
            className="mx-2 mb-1.5 mt-1 rounded-xl border border-rose-500/30 bg-rose-500/10 dark:bg-rose-500/15 backdrop-blur-md p-2.5 text-[11px] text-rose-950 dark:text-rose-100 shadow-sm"
          >
            <div>
              Delete <span className="font-mono font-semibold">{a.id}</span>
              {a.kind === 'project' ? ' and the whole project' : ''}
              {extra.length > 0 ? ` plus ${extra.length} sub-agent${extra.length > 1 ? 's' : ''} (${extra.map((x) => x.name).join(', ')})` : ''}?
              {' '}Its code and its messages in this chat are removed permanently.
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                disabled={!!deleting}
                onClick={() => remove(a)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-sm disabled:opacity-50 transition-colors"
              >
                {deleting === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-900/10 dark:hover:bg-white/10 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="typo-metadata uppercase font-semibold tracking-wider text-slate-600 dark:text-slate-400 shrink-0">
          To
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={isChatLoading}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-1.5 min-w-0 max-w-[240px] text-[12px] px-2.5 py-1 rounded-full border border-white/90 dark:border-white/15 bg-white/75 dark:bg-white/[0.07] hover:bg-white dark:hover:bg-white/[0.12] text-slate-900 dark:text-slate-100 shadow-sm backdrop-blur-md disabled:opacity-50 transition-all font-medium active:scale-[0.98]"
        >
          {current ? (
            <AtSign className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          )}
          <span className="font-mono truncate">{current ? current.id : 'agent_builder'}</span>
          <span className="text-slate-500 dark:text-slate-400 text-[11px] font-normal shrink-0 hidden xs:inline">
            {current ? KIND_LABEL[current.kind] : 'auto-routes'}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
        {current && (
          <button
            type="button"
            onClick={() => setChatTarget(null)}
            className="p-1 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-900/10 dark:hover:bg-white/10 shrink-0 transition-colors"
            title="Back to the Agent Builder"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-30 w-[min(420px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-white/90 dark:border-white/15 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-900/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.02]">
            <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an agent…"
              className="flex-1 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none"
            />
          </div>
          <div className="max-h-[360px] overflow-auto p-2 space-y-2.5 scrollbar-thin">
            {groups.builder.length > 0 && (
              <section>
                <h5 className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Agent Builder
                </h5>
                <ul className="space-y-0.5">{groups.builder.map(row)}</ul>
              </section>
            )}
            {groups.projects.map((g) => (
              <section key={g.project}>
                <h5 className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                  <Boxes className="w-3 h-3" /> {g.project}
                </h5>
                <ul className="space-y-0.5">{g.agents.map(row)}</ul>
              </section>
            ))}
            {groups.builder.length === 0 && groups.projects.length === 0 && (
              <p className="px-2.5 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                No agents match.
              </p>
            )}
          </div>
          {error && (
            <p className="px-3 pb-2 text-[11px] font-medium text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}
          <p className="px-3 py-2 border-t border-slate-900/10 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.03] text-[11px] text-slate-600 dark:text-slate-400">
            Tip: start a message with{' '}
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-200 bg-slate-900/[0.06] dark:bg-white/10 px-1 py-0.5 rounded">
              @agent
            </span>{' '}
            to send it to that agent once.
          </p>
        </div>
      )}
    </div>
  );
};

/** Suggestions while typing "@…" at the start of a message. */
export const MentionSuggestions: React.FC<{ query: string; onPick: (id: string) => void }> = ({ query, onPick }) => {
  const agentDirectory = useAgentStudioStore((s) => s.agentDirectory);
  const q = query.toLowerCase();
  const hits = agentDirectory
    .filter((a) => a.kind !== 'builder' && (a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)))
    .slice(0, 8);
  if (hits.length === 0) return null;
  return (
    <ul
      className="absolute bottom-full mb-2 left-0 z-30 w-[min(380px,calc(100vw-48px))] rounded-2xl border border-white/90 dark:border-white/15 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] p-1.5 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
      role="listbox"
    >
      {hits.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(a.id);
            }}
            className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-900/[0.06] dark:hover:bg-white/[0.07] flex items-center gap-2 transition-colors"
          >
            <AtSign className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
              {a.id}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate ml-auto">
              {KIND_LABEL[a.kind]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};