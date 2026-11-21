import React, { useState } from 'react';
import {
  AlertOctagon, AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, Code2, Info, Lightbulb, MessageSquare,
  Play, ScanSearch, Sparkles,
} from 'lucide-react';
import type { AutopilotRun, DesignIdeas, DesignReview } from '../../types/agent';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';

const scoreColor = (score: number) => (score >= 8 ? '#34D399' : score >= 6 ? '#FBBF24' : '#F87171');

/** 0-10 score as a ring. */
const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0" role="img" aria-label={`Score ${score} out of 10`}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(score / 10) * c} ${c}`} transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="700" fill={scoreColor(score)}>{Math.round(score * 10) / 10}</text>
    </svg>
  );
};

const SEVERITY = {
  blocker: { label: 'Blocker', icon: AlertOctagon, cls: 'text-red-300 bg-red-500/10 border-red-500/25' },
  major: { label: 'Major', icon: AlertTriangle, cls: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  minor: { label: 'Minor', icon: Info, cls: 'text-slate-300 bg-white/[0.04] border-white/10' },
} as const;

/** The Critic's review of the design or of the generated code. */
export const ReviewCard: React.FC<{ review: DesignReview }> = ({ review }) => {
  const [open, setOpen] = useState(review.verdict === 'revise');
  const counts = (['blocker', 'major', 'minor'] as const).map((s) => [s, review.issues.filter((i) => i.severity === s).length] as const);
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/[0.03] transition-colors">
        <ScoreRing score={review.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {review.stage === 'code' ? <Code2 className="w-3.5 h-3.5 text-indigo-300" /> : <ScanSearch className="w-3.5 h-3.5 text-indigo-300" />}
            <span className="text-[11px] font-semibold text-slate-200">Critic · {review.stage === 'code' ? 'code review' : 'design review'}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${review.verdict === 'approve'
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' : 'text-amber-300 bg-amber-500/10 border-amber-500/25'}`}>
              {review.verdict === 'approve' ? 'Approved' : 'Revised'}
            </span>
            {counts.filter(([, n]) => n > 0).map(([s, n]) => (
              <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${SEVERITY[s].cls}`}>{n} {SEVERITY[s].label.toLowerCase()}</span>
            ))}
          </div>
          {review.summary && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{review.summary}</p>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 text-[11px]">
          {review.strengths.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Strengths</div>
              <ul className="space-y-0.5">
                {review.strengths.map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-slate-300"><CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-400 shrink-0" />{s}</li>
                ))}
              </ul>
            </div>
          )}
          {review.issues.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Issues & fixes</div>
              <div className="space-y-1.5">
                {(['blocker', 'major', 'minor'] as const).flatMap((sev) => review.issues.filter((i) => i.severity === sev)).map((issue, i) => {
                  const S = SEVERITY[issue.severity];
                  return (
                    <div key={i} className={`rounded-lg border p-2 ${S.cls}`}>
                      <div className="flex items-center gap-1.5 font-medium">
                        <S.icon className="w-3 h-3 shrink-0" />
                        <span>{issue.problem}</span>
                        {issue.area && <span className="ml-auto text-[9px] font-mono opacity-70 shrink-0">{issue.area}</span>}
                      </div>
                      {issue.fix && <div className="mt-1 text-slate-300"><span className="text-slate-500">Fix: </span>{issue.fix}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {review.acceptedIdeas.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ideas adopted</div>
              <div className="flex flex-wrap gap-1">
                {review.acceptedIdeas.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-200">
                    <Lightbulb className="w-3 h-3" />{t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const IMPACT = {
  high: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  medium: 'text-sky-300 bg-sky-500/10 border-sky-500/25',
  low: 'text-slate-400 bg-white/[0.04] border-white/10',
} as const;

/** Improvements the Idea Provider proposed. */
export const IdeasCard: React.FC<{ ideas: DesignIdeas }> = ({ ideas }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? ideas.ideas : ideas.ideas.slice(0, 3);
  return (
    <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
        <span className="text-[11px] font-semibold text-slate-200">Idea Provider</span>
        <span className="text-[10px] text-slate-500">{ideas.ideas.length} idea{ideas.ideas.length === 1 ? '' : 's'}</span>
      </div>
      {ideas.summary && <p className="text-[11px] text-slate-400 mb-2">{ideas.summary}</p>}
      <div className="space-y-1.5">
        {shown.map((idea, i) => (
          <div key={i} className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3 h-3 text-indigo-300 shrink-0" />
              <span className="text-[11px] font-medium text-slate-200">{idea.title}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${IMPACT[idea.impact]}`}>{idea.impact} impact</span>
              {idea.area && <span className="text-[9px] font-mono text-slate-500">{idea.area}</span>}
            </div>
            {idea.description && <p className="text-[11px] text-slate-400 mt-0.5">{idea.description}</p>}
          </div>
        ))}
      </div>
      {ideas.ideas.length > 3 && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-[10px] text-sky-400 hover:underline">
          {open ? 'Show fewer' : `Show all ${ideas.ideas.length}`}
        </button>
      )}
    </div>
  );
};

/** A new agent the Builder built on its own to answer the user's question. */
export const AutopilotAnswerCard: React.FC<{ run: AutopilotRun }> = ({ run }) => {
  const { setChatTarget, refreshCreatedAgents, setSelectedAgent, setActiveTab } = useAgentStudioStore();
  const [busy, setBusy] = useState(false);

  const open = async (tab: 'sandbox' | 'inspector') => {
    setBusy(true);
    try {
      await refreshCreatedAgents();
      const agent = useAgentStudioStore.getState().createdAgents.find((a) => a.name === run.project);
      if (agent) setSelectedAgent(agent);
      setActiveTab(tab);
    } finally {
      setBusy(false);
    }
  };
  const btn = 'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-colors disabled:opacity-50';

  return (
    <div className="mt-3 rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] to-sky-500/[0.05] p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-[11px] font-semibold text-emerald-200">Autopilot built a new agent</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">@{run.project}</span>
        <span className="text-[10px] text-slate-500">built just now · verified · live</span>
      </div>
      {run.question && (
        <div className="mt-2 text-[11px] text-slate-400 flex gap-1.5">
          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">Asked: “{run.question}”</span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setChatTarget(run.project)}
                className={`${btn} bg-emerald-500/15 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25`}>
          <MessageSquare className="w-3 h-3" /> Chat with @{run.project}
        </button>
        <button type="button" disabled={busy} onClick={() => open('sandbox')}
                className={`${btn} bg-white/[0.05] text-slate-200 border-white/10 hover:bg-white/10`}>
          <Play className="w-3 h-3" /> Open in Sandbox
        </button>
        <button type="button" disabled={busy} onClick={() => open('inspector')}
                className={`${btn} bg-white/[0.05] text-slate-200 border-white/10 hover:bg-white/10`}>
          <Code2 className="w-3 h-3" /> View code
        </button>
      </div>
    </div>
  );
};
