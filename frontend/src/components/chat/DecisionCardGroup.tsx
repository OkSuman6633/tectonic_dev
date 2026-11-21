import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  CheckCircle2, 
  HelpCircle, 
  Send, 
  Cpu, 
  Database, 
  Layers, 
  FileText,
  Sliders,
  Edit3,
  Check,
  Zap
} from 'lucide-react';
import type { DecisionGroup } from '../../types/agent';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';

interface DecisionCardGroupProps {
  decisionGroup: DecisionGroup;
}

export const DecisionCardGroup: React.FC<DecisionCardGroupProps> = ({ decisionGroup }) => {
  const {
    currentDecisionGroup,
    updateDecisionOption,
    toggleCustomDecision,
    setCustomDecisionValue,
    setExtraNotes,
    applyRecommendedDefaults,
    sendArchitectMessage,
    isChatLoading,
    isGeneratingAgent
  } = useAgentStudioStore();

  // Use either the store group (if matched) or the message prop
  const activeGroup = (currentDecisionGroup && currentDecisionGroup.id === decisionGroup.id)
    ? currentDecisionGroup
    : decisionGroup;

  const isSubmitted = activeGroup.isSubmitted || false;

  const getQuestionIcon = (id: string) => {
    const lower = id.toLowerCase();
    if (lower.includes('storage') || lower.includes('database')) {
      return <Database className="w-4 h-4 text-sky-400" />;
    } else if (lower.includes('schedule') || lower.includes('data') || lower.includes('dataset')) {
      return <Layers className="w-4 h-4 text-indigo-400" />;
    } else if (lower.includes('structure') || lower.includes('agent') || lower.includes('architecture')) {
      return <Cpu className="w-4 h-4 text-purple-400" />;
    } else if (lower.includes('output') || lower.includes('format') || lower.includes('report')) {
      return <FileText className="w-4 h-4 text-emerald-400" />;
    }
    return <Sliders className="w-4 h-4 text-amber-400" />;
  };

  const chosenIds = (q: typeof activeGroup.questions[number]) =>
    q.multiSelect ? (q.selectedOptions ?? []) : q.selectedOption ? [q.selectedOption] : [];

  const handleSubmitSelected = () => {
    if (isChatLoading || isGeneratingAgent) return;

    const summaryLines = activeGroup.questions.map((q, idx) => {
      let chosenText = '';
      if (q.isCustom) {
        chosenText = `Custom: ${q.customValue || 'User defined preference'}`;
      } else {
        const labels = chosenIds(q).map((id) => q.options.find((o) => o.id === id)?.label ?? id);
        chosenText = labels.join(', ') || 'recommended default';
      }
      return `${idx + 1}. ${q.title}: ${chosenText}`;
    });

    const display = `Selected Preferences:\n${summaryLines.join('\n')}${
      activeGroup.extraNotes ? `\nAdditional Notes: ${activeGroup.extraNotes}` : ''
    }`;
    // Structured groups answer the Builder exactly (no text parsing on the other side).
    const answers = Object.fromEntries(activeGroup.questions.map((q) => [
      q.id,
      q.isCustom ? { custom: q.customValue || 'User defined preference' } : q.multiSelect ? { options: chosenIds(q) } : { option: q.selectedOption },
    ]));
    const msg = activeGroup.structured
      ? `${display}\n\nDECISIONS_JSON: ${JSON.stringify({ answers, notes: activeGroup.extraNotes || '' })}`
      : `${display}\n\nPlease proceed with these choices and generate the agent now.`;

    // Mark as submitted locally in store
    useAgentStudioStore.setState((state) => ({
      currentDecisionGroup: state.currentDecisionGroup
        ? { ...state.currentDecisionGroup, isSubmitted: true }
        : null,
      chatMessages: state.chatMessages.map((m) =>
        m.decisionGroup && m.decisionGroup.id === activeGroup.id
          ? { ...m, decisionGroup: { ...m.decisionGroup, isSubmitted: true } }
          : m
      )
    }));

    sendArchitectMessage(msg, display);
  };

  const handleProceedDefaults = () => {
    if (isChatLoading || isGeneratingAgent) return;
    applyRecommendedDefaults();

    // Mark as submitted locally in store
    useAgentStudioStore.setState((state) => ({
      currentDecisionGroup: state.currentDecisionGroup
        ? { ...state.currentDecisionGroup, isSubmitted: true }
        : null,
      chatMessages: state.chatMessages.map((m) =>
        m.decisionGroup && m.decisionGroup.id === activeGroup.id
          ? { ...m, decisionGroup: { ...m.decisionGroup, isSubmitted: true } }
          : m
      )
    }));

    if (activeGroup.structured) {
      sendArchitectMessage(`Use the recommended defaults.\n\nDECISIONS_JSON: ${JSON.stringify({ defaults: true, notes: activeGroup.extraNotes || '' })}`,
        'Use the recommended defaults.');
    } else {
      sendArchitectMessage('Proceed with recommended defaults. Please build and generate the agent now.');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`mt-4 rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all ${
        isSubmitted
          ? 'bg-slate-900/60 border-emerald-500/30 shadow-emerald-950/20'
          : 'bg-studio-card/85 border-sky-500/30 shadow-sky-950/20'
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>{activeGroup.title}</span>
              {isSubmitted && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Choices Submitted
                </span>
              )}
            </h4>
            {activeGroup.step?.key === 'plan' && (
              <p className="text-[11px] text-sky-300/80 mt-1">
                Tick the steps you want to decide yourself. The AI decides the rest and keeps going without stopping.
              </p>
            )}
            {activeGroup.step && activeGroup.step.key !== 'plan' && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-sky-300/80">{activeGroup.step.phase}</span>
                <div className="flex gap-0.5" aria-label={`Step ${activeGroup.step.number} of ${activeGroup.step.total}`}>
                  {Array.from({ length: activeGroup.step.total }, (_, i) => (
                    <span
                      key={i}
                      className={`h-1 w-4 rounded-full ${
                        i < activeGroup.step!.number - 1 ? 'bg-emerald-400/70' : i === activeGroup.step!.number - 1 ? 'bg-sky-400' : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
            {activeGroup.description && (
              <p className="text-xs text-slate-400 mt-0.5">{activeGroup.description}</p>
            )}
          </div>
        </div>

        {/* Quick Fill Preset Button */}
        {!isSubmitted && (
          <button
            onClick={handleProceedDefaults}
            type="button"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30 transition-all shadow-sm active:scale-95 font-medium"
            title="Automatically accept all AI recommended defaults"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>Use Defaults</span>
          </button>
        )}
      </div>

      {/* Decision Questions List */}
      <div className="space-y-4">
        {activeGroup.questions.map((question, qIdx) => {
          return (
            <div 
              key={question.id} 
              className="rounded-lg bg-studio-surface/70 border border-white/5 p-3 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-white/5">
                    {getQuestionIcon(question.id)}
                  </div>
                  <span className="text-xs font-semibold text-slate-200">
                    <span className="text-sky-400 font-mono mr-1.5">{qIdx + 1}.</span>
                    {question.title}
                  </span>
                </div>
                {question.multiSelect && (
                  <span className="text-[10px] font-mono text-slate-400">choose any</span>
                )}
              </div>
              {question.description && (
                <p className="-mt-1 mb-2.5 text-[11px] leading-relaxed text-slate-400">{question.description}</p>
              )}

              {/* Checkbox Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {question.options.map((option) => {
                  const isSelected = !question.isCustom && (question.multiSelect
                    ? (question.selectedOptions ?? []).includes(option.id)
                    : question.selectedOption === option.id);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isSubmitted}
                      onClick={() => updateDecisionOption(question.id, option.id)}
                      className={`relative flex items-start gap-2.5 p-2.5 rounded-lg text-left text-xs transition-all ${
                        isSelected
                          ? 'bg-sky-500/20 border-sky-400/60 text-white shadow-sm shadow-sky-500/20'
                          : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.05] hover:border-white/15'
                      } border disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {/* Checkbox Square */}
                      <div className="pt-0.5 shrink-0">
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'border-sky-400 bg-sky-500 text-white shadow-sm shadow-sky-500/50' 
                            : 'border-slate-500/80 bg-slate-800/40 text-transparent hover:border-slate-400'
                        }`}>
                          <Check className={`w-3 h-3 stroke-[3] transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                        </div>
                      </div>

                      <div className="flex-1 pr-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-medium leading-relaxed ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {option.label}
                          </span>
                          {option.isRecommended && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Sparkles className="w-2.5 h-2.5" />
                              AI Recommended
                            </span>
                          )}
                        </div>
                        {option.description && (
                          <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{option.description}</div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Always Present "Other / Custom" Option */}
                <button
                  type="button"
                  disabled={isSubmitted}
                  onClick={() => toggleCustomDecision(question.id, !question.isCustom)}
                  className={`relative flex items-center gap-2.5 p-2.5 rounded-lg text-left text-xs transition-all ${
                    question.isCustom
                      ? 'bg-purple-500/20 border-purple-400/60 text-white shadow-sm shadow-purple-500/20'
                      : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.05] hover:border-white/15'
                  } border disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {/* Custom Checkbox Square */}
                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                    question.isCustom 
                      ? 'border-purple-400 bg-purple-500 text-white shadow-sm shadow-purple-500/50' 
                      : 'border-slate-500/80 bg-slate-800/40 text-transparent hover:border-slate-400'
                  }`}>
                    <Check className={`w-3 h-3 stroke-[3] transition-opacity ${question.isCustom ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Edit3 className="w-3 h-3 text-purple-400" />
                    <span className="font-medium">Other / Custom Preference...</span>
                  </div>
                </button>
              </div>

              {/* Custom Input Field (Smooth Expand) */}
              <AnimatePresence>
                {question.isCustom && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mt-2"
                  >
                    <div className="flex items-center gap-2 p-2 rounded-md bg-purple-950/30 border border-purple-500/30">
                      <Edit3 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <input
                        type="text"
                        disabled={isSubmitted}
                        value={question.customValue}
                        onChange={(e) => setCustomDecisionValue(question.id, e.target.value)}
                        placeholder={`Specify custom ${question.title.toLowerCase()} requirement...`}
                        className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Extra Preferences Box */}
      {!isSubmitted && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <label className="text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Additional Business Rules or Details (Optional)</span>
          </label>
          <input
            type="text"
            value={activeGroup.extraNotes || ''}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="e.g. Enforce biometric verification or maximum 5 retries..."
            className="w-full text-xs px-3 py-2 rounded-lg bg-studio-surface/80 border border-white/10 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
        </div>
      )}

      {/* Actions Bar */}
      <div className="mt-4 pt-3 flex items-center justify-between gap-3 border-t border-white/10">
        <span className="text-[11px] text-slate-400">
          {isSubmitted ? 'Preferences submitted to agent architect' : 'Select options with checkboxes, then click submit'}
        </span>

        {!isSubmitted ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isChatLoading || isGeneratingAgent}
              onClick={handleProceedDefaults}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Proceed with Defaults</span>
            </button>

            <button
              type="button"
              disabled={isChatLoading || isGeneratingAgent}
              onClick={handleSubmitSelected}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-sky-500/25 active:scale-95 transition-all disabled:opacity-50"
            >
              {isChatLoading || isGeneratingAgent ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Selected Choices 🚀</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Preferences Locked & Sent</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};
