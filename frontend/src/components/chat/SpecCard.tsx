import React, { useState } from 'react';
import { Braces, Check, Copy, FileText, Layers } from 'lucide-react';
import type { ArchitectureSpec } from '../../types/agent';
import { MarkdownContent } from './MarkdownContent';

type Tab = 'spec' | 'prompt' | 'json';

/** Phase 4: the compiled Agent Architecture Specification (spec, lead system prompt, JSON config). */
export const SpecCard: React.FC<{ spec: ArchitectureSpec }> = ({ spec }) => {
  const [tab, setTab] = useState<Tab>('spec');
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(spec.config, null, 2);
  const copyText = tab === 'json' ? json : tab === 'prompt' ? spec.leadSystemPrompt : spec.markdown;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'spec', label: 'Specification', icon: <Layers className="w-3 h-3" /> },
    { id: 'prompt', label: 'Lead system prompt', icon: <FileText className="w-3 h-3" /> },
    { id: 'json', label: 'JSON config', icon: <Braces className="w-3 h-3" /> },
  ];

  return (
    <div className="mt-3 rounded-xl border border-indigo-400/30 bg-studio-surface/70 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 bg-indigo-500/[0.06]">
        <div className="flex items-center gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
                tab === t.id ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5"
          title="Copy"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {spec.enabledModules.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          {spec.enabledModules.map((m) => (
            <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
              {m}
            </span>
          ))}
        </div>
      )}
      <div className="p-3 max-h-[420px] overflow-auto">
        {tab === 'spec' && <MarkdownContent content={spec.markdown} />}
        {tab === 'prompt' && <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-200 font-mono">{spec.leadSystemPrompt}</pre>}
        {tab === 'json' && <pre className="text-[11px] leading-relaxed text-slate-200 font-mono">{json}</pre>}
      </div>
    </div>
  );
};
