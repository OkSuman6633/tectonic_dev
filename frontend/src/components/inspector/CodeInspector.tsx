import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Copy,
  Check,
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
    setIsSaving(true);
    try {
      await saveAgentFile(activeFile, fileContent);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error(err);
      alert('Failed to save file: ' + err);
    } finally {
      setIsSaving(false);
    }
  };

  const agentDisplayName = selectedAgent ? selectedAgent.name : 'No Agent Selected';

  return (
    <div className="flex flex-col h-full bg-studio-surface/50 backdrop-blur-xl">
      {/* Top File Tab Selector & Agent Picker */}
      <div className="studio-toolbar z-20 bg-studio-card/80">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
          {/* Agent Selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-studio-surface px-2.5 font-mono text-[11.5px] font-semibold leading-none text-indigo-300 transition-all hover:border-indigo-500/40"
            >
              <Cpu className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              <span className="truncate">{agentDisplayName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>

            {agentDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 rounded-xl bg-studio-card border border-white/10 shadow-2xl p-1.5 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400 border-b border-white/5">
                  Select Agent to Inspect
                </div>
                {createdAgents.map((ag) => (
                  <button
                    key={ag.name}
                    onClick={() => {
                      setSelectedAgent(ag);
                      setAgentDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${selectedAgent?.name === ag.name
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'hover:bg-white/5 text-slate-300'
                      }`}
                  >
                    <span>{ag.name}</span>
                    <span className="text-[10px] text-slate-500">{ag.files.length} files</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-px shrink-0 bg-white/10" />

          {/* File Tabs */}
          {fileKeys.map((name) => (
            <button
              key={name}
              onClick={() => setActiveFile(name)}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[11.5px] leading-none transition-all ${activeFile === name
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                  : 'bg-white/5 text-slate-400 hover:text-white border-white/5'
                }`}
            >
              <FileCode className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              <span>{name.split('/').pop()}</span>
            </button>
          ))}
        </div>

        {/* Action Buttons: Copy & Save */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11.5px] leading-none text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            title="Toggle Edit / Read-Only View"
          >
            {isEditing ? <Eye className="h-3.5 w-3.5 text-sky-400" /> : <Edit3 className="h-3.5 w-3.5 text-sky-400" />}
            <span>{isEditing ? 'View Mode' : 'Edit Mode'}</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11.5px] leading-none text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
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
            className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-semibold leading-none shadow-md transition-all ${saveSuccess
                ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 disabled:opacity-40'
              }`}
            title="Save file changes directly to disk and update agent"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                <span>Saved & Updated!</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save & Update'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content: Split Code Editor & Agent Info Card */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden">
        {/* Code Content Editor View */}
        <div className="flex flex-col overflow-y-auto border-r border-studio-border bg-slate-950/90 p-3 font-mono text-xs lg:col-span-2">
          <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-white/5 pb-2 text-[11px] leading-none text-slate-500">
            <span>File: <strong className="text-slate-300">{activeFile || 'None'}</strong></span>
            <span className="text-[10px] text-emerald-400">Direct disk binding enabled</span>
          </div>
          {isEditing ? (
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="flex-1 w-full bg-transparent text-slate-200 font-mono text-xs leading-relaxed resize-none focus:outline-none p-1 border border-white/5 rounded-lg focus:border-indigo-500/50"
              spellCheck={false}
              placeholder="Select a file to inspect or edit..."
            />
          ) : (
            <pre className="text-slate-300 leading-relaxed overflow-x-auto whitespace-pre flex-1">
              <code>{fileContent}</code>
            </pre>
          )}
        </div>

        {/* Right Info Cards: Agent Manifest & Architecture */}
        <div className="space-y-3 overflow-y-auto bg-studio-card/40 p-3">
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              Agent Manifest Details
            </h4>
            <div className="p-3 rounded-xl bg-studio-surface/80 border border-white/10 text-xs space-y-2">
              <div>
                <span className="text-slate-400 block text-[10px]">AGENT NAME</span>
                <span className="font-mono text-indigo-300 font-semibold">{agentDisplayName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ADK APP MODULE</span>
                <span className="font-mono text-sky-300 text-[11px] break-all">
                  {selectedAgent?.appName || 'agent_builder'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">DISK PATH</span>
                <span className="font-mono text-slate-400 text-[10px] break-all">
                  {selectedAgent?.path || 'generated_agents/'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">LAST MODIFIED</span>
                <span className="font-mono text-slate-300 text-[11px]">
                  {selectedAgent?.lastModified ? new Date(selectedAgent.lastModified).toLocaleString() : 'Recent'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
              Project Files ({fileKeys.length})
            </h4>
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {fileKeys.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFile(f)}
                  className={`w-full text-left p-1.5 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${activeFile === f
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : 'hover:bg-white/5 text-slate-400'
                    }`}
                >
                  <span className="truncate">{f}</span>
                  <span className="text-[10px] text-slate-500">
                    {currentAgentFiles[f]?.length || 0}B
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Update Instructions
            </h4>
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-300 space-y-1 text-[11px] leading-relaxed">
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
