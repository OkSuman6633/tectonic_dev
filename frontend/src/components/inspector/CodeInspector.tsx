import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Copy,
  Check,
  AlertTriangle,
  Save,
  Cpu,
  ShieldCheck,
  ChevronDown,
  Edit3,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';

export const CodeInspector: React.FC = () => {
  const {
    createdAgents,
    selectedAgent,
    setSelectedAgent,
    currentAgentFiles,
    loadAgentFiles,
    saveAgentFile,
  } = useAgentStudioStore();

  const fileKeys = Object.keys(currentAgentFiles);
  const [activeFile, setActiveFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string>('');
  const [pendingSaveApproval, setPendingSaveApproval] = useState<boolean>(false);

  // When files load or change, select first file
  useEffect(() => {
    if (fileKeys.length > 0) {
      const target = fileKeys.includes(activeFile) ? activeFile : fileKeys[0];
      setActiveFile(target);
      setFileContent(currentAgentFiles[target] || '');
    }
  }, [currentAgentFiles]);

  // When activeFile changes
  useEffect(() => {
    if (activeFile && currentAgentFiles[activeFile] !== undefined) {
      setFileContent(currentAgentFiles[activeFile]);
    }
  }, [activeFile]);

  // Ensure files loaded for selected agent
  useEffect(() => {
    if (selectedAgent && fileKeys.length === 0) {
      loadAgentFiles(selectedAgent.name);
    }
  }, [selectedAgent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!activeFile || isSaving) return;
    if (!pendingSaveApproval) {
      setPendingSaveApproval(true);
      setSaveError('');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await saveAgentFile(activeFile, fileContent);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save file.');
    } finally {
      setIsSaving(false);
      setPendingSaveApproval(false);
    }
  };

  const agentDisplayName = selectedAgent ? selectedAgent.name : 'No Agent Selected';

  return (
    <div className="flex flex-col h-full bg-studio-surface/50 backdrop-blur-xl">
      {/* Top File Tab Selector & Agent Picker */}
      <div className="studio-toolbar z-20 bg-slate-100/90 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
          {/* Agent Selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 px-2.5 text-[12px] font-semibold leading-none text-indigo-600 dark:text-indigo-300 transition-all hover:border-indigo-500/40 shadow-sm dark:shadow-none"
            >
              <Cpu className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
              <span className="truncate">{agentDisplayName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>

            {agentDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl p-1.5 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-white/5">
                  Select Agent to Inspect
                </div>
                {createdAgents.map((ag) => (
                  <button
                    key={ag.name}
                    onClick={() => {
                      setSelectedAgent(ag);
                      setAgentDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg transition-colors flex items-center justify-between ${selectedAgent?.name === ag.name
                        ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30'
                        : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                      }`}
                  >
                    <span className="typo-agent-name truncate">{ag.name}</span>
                    <span className="font-mono text-[12px] text-slate-400 dark:text-slate-500 shrink-0">{ag.files.length} files</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10" />

          {/* File Tabs */}
          {fileKeys.map((name) => (
            <button
              key={name}
              onClick={() => setActiveFile(name)}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[12px] leading-none transition-all ${activeFile === name
                  ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-500/40 shadow-sm'
                  : 'bg-white/80 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'
                }`}
            >
              <FileCode className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400" />
              <span>{name.split('/').pop()}</span>
            </button>
          ))}
        </div>

        {/* Action Buttons: Copy & Save */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 px-2.5 text-[12px] font-medium leading-none text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white shadow-sm dark:shadow-none"
            title="Toggle Edit / Read-Only View"
          >
            {isEditing ? <Eye className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" /> : <Edit3 className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />}
            <span>{isEditing ? 'View Mode' : 'Edit Mode'}</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 px-2.5 text-[12px] font-medium leading-none text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white shadow-sm dark:shadow-none"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || !activeFile}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold leading-none shadow-md transition-all ${saveSuccess
                ? 'bg-emerald-600 dark:bg-emerald-500 text-white shadow-emerald-500/20'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 disabled:opacity-40'
              }`}
            title={pendingSaveApproval ? 'Confirm that this file change is approved' : 'Save file changes directly to disk and update agent'}
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                <span>Saved & Updated!</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>{isSaving ? 'Saving...' : pendingSaveApproval ? 'Confirm & Update' : 'Save & Update'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content: Split Code Editor & Agent Info Card */}
      {(pendingSaveApproval || saveError) && (
        <div className={`flex items-start gap-2 border-b px-3 py-2 text-[12px] ${saveError ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-700 dark:text-rose-300' : 'border-amber-500/20 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300'}`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {saveError || 'Approval required: confirm “Confirm & Update” to write this change to the agent and apply it.'}
          </span>
        </div>
      )}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden">
        {/* Code Content Editor View */}
        <div className="flex flex-col overflow-y-auto border-r border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-slate-950/90 p-3 lg:col-span-2 transition-colors">
          <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-white/5 pb-2 text-[12px] leading-none text-slate-500 dark:text-slate-400">
            <span>File: <strong className="font-mono text-slate-800 dark:text-slate-300 font-semibold">{activeFile || 'None'}</strong></span>
            <span className="typo-status text-emerald-600 dark:text-emerald-400">Direct disk binding enabled</span>
          </div>
          {isEditing ? (
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="typo-code flex-1 w-full bg-white dark:bg-transparent text-slate-900 dark:text-slate-200 resize-none focus:outline-none p-3 border border-slate-200/90 dark:border-white/5 rounded-xl focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 shadow-sm dark:shadow-none placeholder-slate-400 dark:placeholder-slate-500 transition-all selection:bg-indigo-500/20"
              spellCheck={false}
              placeholder="Select a file to inspect or edit..."
            />
          ) : (
            <pre className="typo-code text-slate-800 dark:text-slate-300 overflow-x-auto whitespace-pre flex-1 p-3 bg-white dark:bg-transparent rounded-xl border border-slate-200/90 dark:border-white/5 shadow-sm dark:shadow-none">
              <code>{fileContent}</code>
            </pre>
          )}
        </div>

        {/* Right Info Cards: Agent Manifest & Architecture */}
        <div className="space-y-3 overflow-y-auto bg-slate-50/70 dark:bg-transparent p-3">
          <div>
            <h4 className="typo-panel-heading text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              Agent Manifest Details
            </h4>
            <div className="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200/90 dark:border-white/10 space-y-2.5 shadow-sm dark:shadow-none">
              <div>
                <span className="typo-metadata text-slate-500 dark:text-slate-400 block uppercase">Agent Name</span>
                <span className="typo-agent-name text-indigo-600 dark:text-indigo-300">{agentDisplayName}</span>
              </div>
              <div>
                <span className="typo-metadata text-slate-500 dark:text-slate-400 block uppercase">ADK App Module</span>
                <span className="typo-code text-sky-600 dark:text-sky-300 break-all">
                  {selectedAgent?.appName || 'agent_builder'}
                </span>
              </div>
              <div>
                <span className="typo-metadata text-slate-500 dark:text-slate-400 block uppercase">Disk Path</span>
                <span className="typo-code text-slate-600 dark:text-slate-400 break-all">
                  {selectedAgent?.path || 'generated_agents/'}
                </span>
              </div>
              <div>
                <span className="typo-metadata text-slate-500 dark:text-slate-400 block uppercase">Last Modified</span>
                <span className="typo-code text-slate-700 dark:text-slate-300">
                  {selectedAgent?.lastModified ? new Date(selectedAgent.lastModified).toLocaleString() : 'Recent'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="typo-panel-heading text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              Project Files ({fileKeys.length})
            </h4>
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {fileKeys.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFile(f)}
                  className={`typo-code w-full text-left p-1.5 rounded-lg transition-colors flex items-center justify-between ${activeFile === f
                      ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 font-medium'
                      : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 border border-transparent'
                    }`}
                >
                  <span className="truncate">{f}</span>
                  <span className="text-[12px] text-slate-400 dark:text-slate-500">
                    {currentAgentFiles[f]?.length || 0}B
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="typo-panel-heading text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              Update Instructions
            </h4>
            <div className="typo-secondary p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 space-y-1 shadow-sm dark:shadow-none">
              <p>1. Edit code or prompts in the editor pane.</p>
              <p>2. Click <strong>"Save & Update"</strong> to overwrite the file on disk.</p>
              <p>3. Switch to <strong>Live Sandbox</strong> to immediately execute the updated code with Google Gemini!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
