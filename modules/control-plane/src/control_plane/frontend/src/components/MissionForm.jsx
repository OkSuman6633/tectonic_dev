import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Target, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';

export default function MissionForm({ compact = false }) {
  const { isExecuting, setBudgetLimits, darkMode } = useMissionStore();
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    objective: '',
    risk: 'moderate',
    mode: 'dynamic',
    maxTokens: 50000,
    maxCalls: 20,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.objective.trim() || loading) return;

    setLoading(true);
    setBudgetLimits(formData.maxTokens, formData.maxCalls);

    try {
      const res = await fetch('/api/v1/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: formData.objective,
          risk_classification: formData.risk,
          workflow_mode: formData.mode,
          max_tokens: formData.maxTokens,
          max_api_calls: formData.maxCalls,
        }),
      });

      if (!res.ok) throw new Error('Failed to create mission');
      setFormData(f => ({ ...f, objective: '' }));
    } catch (error) {
      console.error(error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const labelClass = darkMode ? 'text-white/50' : 'text-gray-500';

  return (
    <div className={clsx('rounded-2xl', compact ? 'floating-card p-4' : 'glass p-5')}>
      {!compact && (
        <h2 className={clsx('text-sm font-semibold mb-4 flex items-center gap-2', darkMode ? 'text-brain-300' : 'text-brain-600')}>
          <Target className="w-4 h-4" />
          NEW MISSION
        </h2>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={formData.objective}
          onChange={(e) => setFormData(f => ({ ...f, objective: e.target.value }))}
          rows={compact ? 2 : 3}
          className="input-field resize-none"
          placeholder="Describe your mission objective..."
          disabled={loading || isExecuting}
        />

        {!compact && (
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            className={clsx('flex items-center gap-2 text-xs font-medium', darkMode ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700')}>
            Advanced Options
            <ChevronDown className={clsx('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} />
          </button>
        )}

        {showAdvanced && !compact && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-3 overflow-hidden">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={clsx('block text-xs mb-1', labelClass)}>Risk Level</label>
                <select value={formData.risk} onChange={(e) => setFormData(f => ({ ...f, risk: e.target.value }))} className="input-field" disabled={loading || isExecuting}>
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className={clsx('block text-xs mb-1', labelClass)}>Mode</label>
                <select value={formData.mode} onChange={(e) => setFormData(f => ({ ...f, mode: e.target.value }))} className="input-field" disabled={loading || isExecuting}>
                  <option value="dynamic">Dynamic</option>
                  <option value="static">Static</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={clsx('block text-xs mb-1', labelClass)}>Max Tokens</label>
                <input type="number" value={formData.maxTokens} onChange={(e) => setFormData(f => ({ ...f, maxTokens: parseInt(e.target.value) || 50000 }))} className="input-field" disabled={loading || isExecuting} />
              </div>
              <div>
                <label className={clsx('block text-xs mb-1', labelClass)}>Max API Calls</label>
                <input type="number" value={formData.maxCalls} onChange={(e) => setFormData(f => ({ ...f, maxCalls: parseInt(e.target.value) || 20 }))} className="input-field" disabled={loading || isExecuting} />
              </div>
            </div>
          </motion.div>
        )}

        <motion.button type="submit" disabled={loading || isExecuting || !formData.objective.trim()}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 relative">
          {loading ? (
            <>
              <div className="shimmer absolute inset-0 rounded-lg" />
              Launching...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              {compact ? 'New Mission' : 'Launch Mission'}
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
}

