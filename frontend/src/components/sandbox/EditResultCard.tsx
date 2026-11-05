import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileCode, MinusCircle, Undo2 } from 'lucide-react';
import type { AgentEditFile, SandboxEditView } from '../../types/agent';
import { MarkdownContent } from '../chat/MarkdownContent';

const OUTCOME = {
  success: { title: 'Agent updated', icon: CheckCircle2, tone: 'border-emerald-500/30 bg-emerald-500/[0.06]', accent: 'text-emerald-300' },
  no_change: { title: 'No change made', icon: MinusCircle, tone: 'border-white/10 bg-white/[0.03]', accent: 'text-slate-300' },
  error: { title: 'Change not applied', icon: AlertTriangle, tone: 'border-rose-500/30 bg-rose-500/[0.06]', accent: 'text-rose-300' },
  undone: { title: 'Edit undone', icon: Undo2, tone: 'border-sky-500/30 bg-sky-500/[0.06]', accent: 'text-sky-300' },
} as const;

const STATUS_MARK: Record<AgentEditFile['status'], string> = { added: 'A', modified: 'M', deleted: 'D' };

const DiffLines: React.FC<{ diff: string }> = ({ diff }) => (
  <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-950/90 p-2 font-mono text-[10.5px] leading-relaxed">
    {diff.split('\n').map((line, i) => {
      const color = line.startsWith('+++') || line.startsWith('---')
        ? 'text-slate-500'
        : line.startsWith('+') ? 'text-emerald-300' : line.startsWith('-') ? 'text-rose-300' : line.startsWith('@@') ? 'text-sky-400' : 'text-slate-400';
      return <div key={i} className={`whitespace-pre ${color}`}>{line || ' '}</div>;
    })}
  </pre>
);

const FileRow: React.FC<{ file: AgentEditFile }> = ({ file }) => {
  const [open, setOpen] = useState(false);
  const counted = file.added + file.removed > 0;
  return (
    <div>
      <button
        type="button"
        onClick={() => file.diff && setOpen(!open)}
        className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left font-mono text-[11px] ${file.diff ? 'hover:bg-white/5' : 'cursor-default'}`}
      >
        {file.diff ? (open ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />) : <FileCode className="h-3 w-3 text-slate-500" />}
        <span className="w-3 text-slate-500">{STATUS_MARK[file.status]}</span>
        <span className="flex-1 truncate text-slate-200">{file.path}</span>
        {counted && (
          <span className="shrink-0">
            <span className="text-emerald-400">+{file.added}</span> <span className="text-rose-400">−{file.removed}</span>
          </span>
        )}
      </button>
      {open && file.diff && <DiffLines diff={file.diff} />}
    </div>
  );
};

/** The outcome of a conversational edit (or undo) in the Live Sandbox. */
export const EditResultCard: React.FC<{ edit: SandboxEditView; content: string; canUndo: boolean; busy: boolean; onUndo: () => void }> = ({
  edit, content, canUndo, busy, onUndo,
}) => {
  const style = OUTCOME[edit.outcome];
  const Icon = style.icon;
  const prompts = (edit.prompts ?? []).filter((p) => p.prompt || p.error);
  return (
    <div className={`w-full rounded-2xl border p-3 text-xs ${style.tone}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${style.accent}`} />
        <span className={`font-semibold ${style.accent}`}>{style.title}</span>
        {edit.undone && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">undone</span>}
        {edit.recovered && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" title="Finished while the page was being refreshed">
            recovered after refresh
          </span>
        )}
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            title="Restore the files this edit changed and re-run the previous version"
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
        )}
      </div>

      <div className="text-slate-200">
        <MarkdownContent content={content} />
      </div>

      {edit.problems && edit.problems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {edit.problems.map((p, i) => (
            <li key={i} className="whitespace-pre-wrap rounded bg-slate-950/70 px-2 py-1 font-mono text-[10.5px] text-rose-200">{p}</li>
          ))}
        </ul>
      )}

      {edit.files.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-1.5">
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            Files changed ({edit.files.length}){edit.files.some((f) => f.diff) ? ' · click to see the diff' : ''}
          </div>
          {edit.files.map((f) => <FileRow key={f.path} file={f} />)}
        </div>
      )}

      {prompts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {prompts.map((p, i) => (
            <span
              key={i}
              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${p.error ? 'border-amber-500/30 text-amber-300' : 'border-violet-500/30 text-violet-300'}`}
              title={p.error ? p.error : p.published ? 'Published and activated in PromptOps' : 'Already the live PromptOps version'}
            >
              {p.error ? `PromptOps: ${p.prompt ?? ''} not updated` : `PromptOps ${p.prompt} → ${p.version}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
