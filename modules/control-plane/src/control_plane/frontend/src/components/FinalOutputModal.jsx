import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, CheckCircle, FileText, Sparkles, ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import useMissionStore from '../store/missionStore';
import { downloadFinalReport } from '../utils/exportDocx';

// Custom markdown components for professional rendering
const MarkdownComponents = ({ darkMode }) => ({
  h1: ({children}) => <h1 className={clsx('text-2xl font-bold mt-6 mb-4 pb-2 border-b', darkMode ? 'text-white border-white/20' : 'text-gray-900 border-gray-200')}>{children}</h1>,
  h2: ({children}) => <h2 className={clsx('text-xl font-bold mt-5 mb-3', darkMode ? 'text-white' : 'text-gray-800')}>{children}</h2>,
  h3: ({children}) => <h3 className={clsx('text-lg font-semibold mt-4 mb-2', darkMode ? 'text-white/90' : 'text-gray-700')}>{children}</h3>,
  h4: ({children}) => <h4 className={clsx('text-base font-semibold mt-3 mb-2', darkMode ? 'text-white/80' : 'text-gray-600')}>{children}</h4>,
  p: ({children}) => <p className={clsx('my-3 leading-relaxed', darkMode ? 'text-white/80' : 'text-gray-700')}>{children}</p>,
  ul: ({children}) => <ul className={clsx('my-3 ml-6 space-y-2 list-disc', darkMode ? 'text-white/80' : 'text-gray-700')}>{children}</ul>,
  ol: ({children}) => <ol className={clsx('my-3 ml-6 space-y-2 list-decimal', darkMode ? 'text-white/80' : 'text-gray-700')}>{children}</ol>,
  li: ({children}) => <li className="leading-relaxed">{children}</li>,
  strong: ({children}) => <strong className={clsx('font-semibold', darkMode ? 'text-white' : 'text-gray-900')}>{children}</strong>,
  em: ({children}) => <em className="italic">{children}</em>,
  blockquote: ({children}) => <blockquote className={clsx('my-4 pl-4 border-l-4 italic', darkMode ? 'border-brain-500 text-white/70 bg-white/5' : 'border-brain-400 text-gray-600 bg-gray-50')} style={{padding: '12px 16px'}}>{children}</blockquote>,
  code: ({inline, children}) => inline 
    ? <code className={clsx('px-1.5 py-0.5 rounded text-sm font-mono', darkMode ? 'bg-white/10 text-green-400' : 'bg-gray-100 text-green-600')}>{children}</code>
    : <pre className={clsx('my-4 p-4 rounded-lg overflow-x-auto text-sm font-mono', darkMode ? 'bg-black/30 text-green-400' : 'bg-gray-900 text-green-400')}><code>{children}</code></pre>,
  table: ({children}) => <div className="my-4 overflow-x-auto"><table className={clsx('min-w-full border-collapse', darkMode ? 'border-white/20' : 'border-gray-300')}>{children}</table></div>,
  th: ({children}) => <th className={clsx('px-4 py-2 text-left font-semibold border', darkMode ? 'bg-white/10 border-white/20 text-white' : 'bg-gray-100 border-gray-300 text-gray-900')}>{children}</th>,
  td: ({children}) => <td className={clsx('px-4 py-2 border', darkMode ? 'border-white/20 text-white/80' : 'border-gray-300 text-gray-700')}>{children}</td>,
  hr: () => <hr className={clsx('my-6', darkMode ? 'border-white/20' : 'border-gray-200')} />,
  a: ({href, children}) => <a href={href} className="text-brain-500 hover:text-brain-400 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
});

function TaskOutputCard({ task, index, darkMode, isExpanded, onToggle }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={clsx('rounded-xl overflow-hidden border', darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200 shadow-sm')}
    >
      <button 
        onClick={onToggle}
        className={clsx('w-full px-5 py-4 flex items-center justify-between text-left transition-colors', darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50')}
      >
        <div className="flex items-center gap-3">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold', darkMode ? 'bg-brain-500/20 text-brain-400' : 'bg-brain-100 text-brain-600')}>
            {index + 1}
          </div>
          <div>
            <h4 className={clsx('font-semibold', darkMode ? 'text-white' : 'text-gray-900')}>{task.name}</h4>
            {task.description && <p className={clsx('text-sm mt-0.5', darkMode ? 'text-white/50' : 'text-gray-500')}>{task.description.substring(0, 80)}...</p>}
          </div>
        </div>
        <div className={clsx('p-2 rounded-lg', darkMode ? 'bg-white/5' : 'bg-gray-100')}>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={clsx('px-5 pb-5 border-t', darkMode ? 'border-white/10' : 'border-gray-100')}>
              <div className={clsx('mt-4 p-4 rounded-lg', darkMode ? 'bg-black/20' : 'bg-gray-50')}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]} 
                  components={MarkdownComponents({ darkMode })}
                >
                  {task.output || 'No output available'}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FinalOutputModal() {
  const { showFinalOutput, setShowFinalOutput, tasks, taskOutputs, missionObjective, darkMode, currentMissionId } = useMissionStore();
  const [expandedTasks, setExpandedTasks] = React.useState({});
  const [showAllTasks, setShowAllTasks] = React.useState(false);

  const toggleTask = (index) => {
    setExpandedTasks(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const finalOutput = useMemo(() => {
    if (!tasks || tasks.length === 0) return null;
    const completedTasks = tasks.filter(t => t.status === 'completed');
    if (completedTasks.length === 0) return null;
    
    const allOutputs = completedTasks.map(task => {
      const output = taskOutputs[task.id];
      return {
        id: task.id,
        name: task.name,
        description: task.description,
        output: output?.output || output?.full_response || '',
        thinking: output?.thinking || '',
        execution: output?.execution || '',
      };
    }).filter(t => t.output);
    
    if (allOutputs.length === 0) return null;
    const lastOutput = allOutputs[allOutputs.length - 1];
    return { taskName: lastOutput.name, output: lastOutput.output, thinking: lastOutput.thinking, allOutputs };
  }, [tasks, taskOutputs]);

  if (!showFinalOutput) return null;
  
  if (!finalOutput) {
    return (
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowFinalOutput(false)}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={clsx('p-8 rounded-2xl text-center max-w-md', darkMode ? 'bg-dark-800' : 'bg-white')} onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center">
              <ListChecks className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className={clsx('text-lg font-bold mb-2', darkMode ? 'text-white' : 'text-gray-900')}>No Outputs Yet</h3>
            <p className={clsx('text-sm mb-6', darkMode ? 'text-white/60' : 'text-gray-500')}>Task outputs will appear here once agents complete their work.</p>
            <button onClick={() => setShowFinalOutput(false)} className={clsx('px-6 py-2 rounded-lg font-medium', darkMode ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}>Close</button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  const handleDownload = async () => {
    try { await downloadFinalReport(currentMissionId, missionObjective, finalOutput); }
    catch (err) { alert('Download failed: ' + err.message); }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowFinalOutput(false)}>
        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className={clsx('w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col', darkMode ? 'bg-dark-800' : 'bg-white shadow-2xl')}
          onClick={e => e.stopPropagation()}>
          
          {/* Header */}
          <div className={clsx('p-6 border-b flex items-center justify-between flex-shrink-0', darkMode ? 'border-white/10 bg-gradient-to-r from-green-600/20 to-emerald-600/20' : 'border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50')}>
            <div className="flex items-center gap-4">
              <div className={clsx('w-14 h-14 rounded-xl flex items-center justify-center', darkMode ? 'bg-green-500/20' : 'bg-green-100')}>
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
              <div>
                <h2 className={clsx('text-2xl font-bold', darkMode ? 'text-white' : 'text-gray-900')}>Mission Complete</h2>
                <p className={clsx('text-sm mt-1', darkMode ? 'text-white/60' : 'text-gray-500')}>{finalOutput.allOutputs.length} task{finalOutput.allOutputs.length > 1 ? 's' : ''} completed successfully</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleDownload}
                className={clsx('flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium shadow-lg', darkMode ? 'bg-green-500 hover:bg-green-400 text-white' : 'bg-green-600 hover:bg-green-500 text-white')}>
                <Download className="w-4 h-4" /> Download Report
              </motion.button>
              <button onClick={() => setShowFinalOutput(false)} className={clsx('p-2.5 rounded-xl', darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100')}>
                <X className={clsx('w-5 h-5', darkMode ? 'text-white/60' : 'text-gray-500')} />
              </button>
            </div>
          </div>
          
          {/* Mission Objective Banner */}
          <div className={clsx('px-6 py-4 border-b flex-shrink-0', darkMode ? 'border-white/10 bg-brain-500/10' : 'border-gray-100 bg-brain-50')}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className={clsx('w-4 h-4', darkMode ? 'text-brain-400' : 'text-brain-500')} />
              <span className={clsx('text-xs font-semibold uppercase tracking-wider', darkMode ? 'text-brain-400' : 'text-brain-600')}>Mission Objective</span>
            </div>
            <p className={clsx('text-sm font-medium', darkMode ? 'text-white' : 'text-gray-800')}>{missionObjective}</p>
          </div>
          
          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              
              {/* Final Result - Primary Output */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-green-500" />
                  <h3 className={clsx('text-lg font-bold', darkMode ? 'text-white' : 'text-gray-900')}>Final Result</h3>
                </div>
                <div className={clsx('rounded-xl p-6 border-l-4 border-green-500', darkMode ? 'bg-green-500/5' : 'bg-green-50/50')}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]} 
                    components={MarkdownComponents({ darkMode })}
                  >
                    {finalOutput.output || 'No output available'}
                  </ReactMarkdown>
                </div>
              </div>
              
              {/* All Task Outputs - Expandable */}
              {finalOutput.allOutputs.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={clsx('text-lg font-bold flex items-center gap-2', darkMode ? 'text-white' : 'text-gray-900')}>
                      <ListChecks className="w-5 h-5 text-brain-500" />
                      All Task Outputs ({finalOutput.allOutputs.length})
                    </h3>
                    <button 
                      onClick={() => setShowAllTasks(!showAllTasks)}
                      className={clsx('text-sm font-medium px-3 py-1.5 rounded-lg', darkMode ? 'text-brain-400 hover:bg-white/10' : 'text-brain-600 hover:bg-gray-100')}
                    >
                      {showAllTasks ? 'Collapse All' : 'Expand All'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {finalOutput.allOutputs.map((task, index) => (
                      <TaskOutputCard 
                        key={task.id || index}
                        task={task}
                        index={index}
                        darkMode={darkMode}
                        isExpanded={showAllTasks || expandedTasks[index]}
                        onToggle={() => toggleTask(index)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
