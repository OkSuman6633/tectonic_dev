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
          className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${selected ? 'bg-sky-500/15' : 'hover:bg-white/5'}`}
          style={{ paddingLeft: 8 + (a.project ? a.depth : Math.min(a.depth, 1)) * 14 }}
        >
          <button type="button" onClick={() => choose(a)} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className={`font-mono text-[11px] truncate ${selected ? 'text-sky-200' : 'text-slate-200'}`}>
                {a.kind === 'project' ? a.project : a.name}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-slate-500 shrink-0">{KIND_LABEL[a.kind]}</span>
            </div>
            {a.description && <div className="text-[10px] text-slate-500 truncate">{a.description}</div>}
          </button>
          {a.deletable ? (
            <button
              type="button"
              onClick={() => setConfirming(confirming === a.id ? null : a.id)}
              className="p-1 rounded text-slate-500 opacity-60 group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10"
              title={`Delete ${a.id}`}
              aria-label={`Delete ${a.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span title="Part of the Agent Builder: cannot be deleted" className="p-1 text-slate-600">
              <Lock className="w-3 h-3" />
            </span>
          )}
        </div>
        {confirming === a.id && (
          <div
            ref={(el) => el?.scrollIntoView({ block: 'nearest' })}
            className="mx-2 mb-1.5 mt-0.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-100">
            <div>
              Delete <span className="font-mono">{a.id}</span>
              {a.kind === 'project' ? ' and the whole project' : ''}
              {extra.length > 0 ? ` plus ${extra.length} sub-agent${extra.length > 1 ? 's' : ''} (${extra.map((x) => x.name).join(', ')})` : ''}?
              {' '}Its code and its messages in this chat are removed permanently.
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                disabled={!!deleting}
                onClick={() => remove(a)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/80 hover:bg-rose-500 text-white disabled:opacity-50"
              >
                {deleting === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="px-2 py-1 rounded-md text-slate-300 hover:bg-white/10">
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
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase font-mono text-slate-500">To</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={isChatLoading}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-1.5 max-w-[320px] text-[11px] px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-50"
        >
          {current ? <AtSign className="w-3 h-3 text-sky-300 shrink-0" /> : <Sparkles className="w-3 h-3 text-indigo-300 shrink-0" />}
          <span className="font-mono truncate">{current ? current.id : 'agent_builder'}</span>
          <span className="text-slate-500 shrink-0">{current ? KIND_LABEL[current.kind] : 'auto-routes'}</span>
          <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
        </button>
        {current && (
          <button type="button" onClick={() => setChatTarget(null)} className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/10" title="Back to the Agent Builder">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-30 w-[min(420px,calc(100vw-48px))] rounded-xl border border-studio-border [background:linear-gradient(var(--popover-bg),var(--popover-bg)),var(--studio-bg)] shadow-2xl">
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/10">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an agent…"
              className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
          </div>
          <div className="max-h-[360px] overflow-auto p-1.5 space-y-2">
            {groups.builder.length > 0 && (
              <section>
                <h5 className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Agent Builder
                </h5>
                <ul>{groups.builder.map(row)}</ul>
              </section>
            )}
            {groups.projects.map((g) => (
              <section key={g.project}>
                <h5 className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Boxes className="w-3 h-3" /> {g.project}
                </h5>
                <ul>{g.agents.map(row)}</ul>
              </section>
            ))}
            {groups.builder.length === 0 && groups.projects.length === 0 && (
              <p className="px-2 py-3 text-[11px] text-slate-500">No agents match.</p>
            )}
          </div>
          {error && <p className="px-3 pb-2 text-[11px] text-rose-300">{error}</p>}
          <p className="px-3 py-2 border-t border-white/10 text-[10px] text-slate-500">
            Tip: start a message with <span className="font-mono text-slate-300">@agent</span> to send it to that agent once.
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
    <ul className="absolute bottom-full mb-2 left-0 z-30 w-[min(380px,calc(100vw-48px))] rounded-xl border border-studio-border [background:linear-gradient(var(--popover-bg),var(--popover-bg)),var(--studio-bg)] shadow-2xl p-1" role="listbox">
      {hits.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(a.id);
            }}
            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 flex items-center gap-2"
          >
            <AtSign className="w-3 h-3 text-sky-300" />
            <span className="font-mono text-[11px] text-slate-200">{a.id}</span>
            <span className="text-[10px] text-slate-500 truncate">{KIND_LABEL[a.kind]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
