import React, { useEffect, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { BuilderJourney } from '../../types/agent';

/** Fallback step list so the stepper renders before the Builder's first `build_phase` arrives. */
const DEFAULT_STEPS: BuilderJourney['steps'] = [
  { key: 'discovery', title: 'Use-case discovery', phase: 'Phase 1' },
  { key: 'io', title: 'Inputs & outputs', phase: 'Phase 1' },
  { key: 'topology', title: 'Architecture & topology', phase: 'Phase 2' },
  { key: 'agents', title: 'Sub-agent allocation', phase: 'Phase 2' },
  { key: 'modules', title: 'Tooling & pre-built modules', phase: 'Phase 3' },
  { key: 'governance', title: 'Guardrails, data & budget', phase: 'Phase 3' },
  { key: 'compile', title: 'Final compilation', phase: 'Phase 4' },
];
const BUILD_STAGES = ['Validate', 'Agent cards', 'Code', 'Verify', 'Provision', 'Deliver'];
const SHORT: Record<string, string> = {
  discovery: 'Discovery', io: 'Inputs & Outputs', topology: 'Topology', agents: 'Sub-agents',
  modules: 'Modules', governance: 'Governance', compile: 'Compile',
};

type Status = 'done' | 'active' | 'todo';

interface Props {
  journey: BuilderJourney | null;
  busy: boolean;
}

/** The guided build journey: 7 interview steps, then Build and Deploy. */
export const JourneyStepper: React.FC<Props> = ({ journey, busy }) => {
  // Step labels only when the window is wide enough for them not to collide.
  const ref = useRef<HTMLDivElement>(null);
  const [showLabels, setShowLabels] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setShowLabels(entry.contentRect.width >= 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const steps = journey?.steps?.length ? journey.steps : DEFAULT_STEPS;
  const approved = !!journey?.approved;
  const buildStage = journey?.buildStage ?? null;
  const delivered = journey?.phase === 'deliver';
  const started = !!journey;

  const interviewStatus = (i: number): Status => {
    if (!started) return 'todo';
    if (approved || journey!.completed.includes(steps[i].key)) return 'done';
    return i === journey!.stepIndex ? 'active' : 'todo';
  };
  const items: { key: string; label: string; title: string; status: Status; auto?: boolean }[] = [
    ...steps.map((s, i) => ({
      key: s.key, label: SHORT[s.key] ?? s.title, status: interviewStatus(i), auto: s.auto,
      title: `${s.phase} · ${s.title}${s.auto ? ' (decided by the AI)' : ''}`,
    })),
    {
      key: 'build', label: 'Build',
      title: buildStage !== null ? `Build · ${BUILD_STAGES[Math.min(buildStage, 4)]}` : 'Build: cards, code, verification',
      status: !approved ? 'todo' : buildStage !== null && buildStage >= 4 ? 'done' : 'active',
    },
    { key: 'deploy', label: 'Deploy', title: 'Provision on the platform and go live', status: delivered ? 'done' : buildStage === 4 ? 'active' : 'todo' },
  ];
  const activeIndex = items.findIndex((it) => it.status === 'active');
  const caption = !started
    ? 'Describe your agent to start the guided build'
    : !journey!.planChosen && !approved
      ? 'Choose which steps you want to decide; the AI handles the rest'
    : activeIndex >= 0
      ? `${activeIndex < steps.length ? `Step ${activeIndex + 1} of ${steps.length}` : items[activeIndex].label} · ${items[activeIndex].title.split(' · ').pop()}`
      : delivered ? 'Delivered: live in the Sandbox' : '';

  return (
    <div ref={ref} className="mt-3" aria-label="Build journey">
      <ol className={`flex items-center gap-1 ${showLabels ? 'pb-4' : ''}`}>
        {items.map((it, i) => (
          <li key={it.key} className="flex items-center gap-1 flex-1 min-w-0" title={it.title}>
            <span
              className={`relative shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold border transition-colors ${
                it.status === 'done'
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                  : it.status === 'active'
                    ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                    : 'bg-white/[0.03] border-white/10 text-slate-500'
              }`}
            >
              {it.status === 'done' ? <Check className="w-3 h-3" /> : i + 1}
              {it.auto && (
                <Sparkles className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 text-indigo-300" aria-label="decided by the AI" />
              )}
              {it.status === 'active' && busy && <span className="absolute inset-0 rounded-full border border-sky-400 animate-ping" />}
              {showLabels && (
                <span
                  className={`absolute top-full mt-1 whitespace-nowrap text-[9px] font-medium ${
                    i === 0 ? 'left-0' : i === items.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  } ${
                    it.status === 'active' ? 'text-sky-300' : it.status === 'done' ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {it.label}
                </span>
              )}
            </span>
            {i < items.length - 1 && (
              <span className={`h-px flex-1 min-w-[4px] ${it.status === 'done' ? 'bg-emerald-400/40' : 'bg-white/10'}`} />
            )}
          </li>
        ))}
      </ol>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <span className="text-slate-300 truncate">{caption}</span>
        <span className="text-slate-500 font-mono shrink-0">
          {items.filter((it) => it.status === 'done').length}/{items.length}
        </span>
      </div>
    </div>
  );
};
