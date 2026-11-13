import React, { useState, useEffect } from 'react';
import {
  Bot,
  Folder,
  Search,
  Sparkles,
  RefreshCw,
  Code2,
  Wrench,
  FileText,
  ExternalLink,
  MessageSquare,
  ArrowRight,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  ShieldCheck,
  Cpu,
  ChevronRight,
  FileCode,
  Terminal,
  Loader2,
  Settings2,
  Hash
} from 'lucide-react';
import { usePortalStore } from '../store/usePortalStore';
import { STUDIO_URL } from '../config';
import { portalApi } from '../services/api';
import { BUILDER_AGENT } from '../types';
import type { PortalAgent } from '../types';

export const ProjectsView: React.FC = () => {
  const {
    agents,
    isLoadingAgents,
    fetchAgents,
    setSelectedAgent,
    setActiveNavTab,
    selectedAgent,
    lastSyncedAt,
  } = usePortalStore();

  const [activeProject, setActiveProject] = useState<PortalAgent>(() => {
    return (
      agents.find((a) => a.id === 'agent_builder') ||
      agents.find((a) => a.isGenerated) ||
      agents[0] ||
      BUILDER_AGENT
    );
  });

  const [searchFilter, setSearchFilter] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'generated' | 'specialist'>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'files' | 'runtime'>('overview');

  // File explorer state for active project
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [projectEnv, setProjectEnv] = useState<any>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Sync active project if agents list updates
  useEffect(() => {
    if (agents.length > 0) {
      const match = agents.find((a) => a.id === activeProject.id || a.name === activeProject.name);
      if (match) {
        setActiveProject(match);
      } else if (!activeProject) {
        setActiveProject(agents[0]);
      }
    }
  }, [agents]);

  // Load files and environment info whenever active project changes
  useEffect(() => {
    let isCancelled = false;
    const loadDetails = async () => {
      if (!activeProject) return;
      setIsLoadingFiles(true);
      const targetKey = activeProject.systemName || activeProject.id || activeProject.name;
      try {
        const [files, env] = await Promise.all([
          portalApi.getAgentFiles(targetKey),
          portalApi.getAgentEnv(targetKey),
        ]);
        if (!isCancelled) {
          setProjectFiles(files);
          setProjectEnv(env);
          const keys = Object.keys(files);
          const preferred =
            keys.find((k) => k.endsWith('agent.py')) ||
            keys.find((k) => k.endsWith('.py')) ||
            keys[0] ||
            '';
          setSelectedFile(preferred);
        }
      } catch (err) {
        console.warn('Failed to load project files/env:', err);
      } finally {
        if (!isCancelled) setIsLoadingFiles(false);
      }
    };

    loadDetails();
    return () => {
      isCancelled = true;
    };
  }, [activeProject]);

  // Filtered projects
  const filteredProjects = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      agent.tools.some((t) => t.toLowerCase().includes(searchFilter.toLowerCase())) ||
      agent.agentType.toLowerCase().includes(searchFilter.toLowerCase());

    if (!matchesSearch) return false;
    if (filterType === 'generated') return agent.isGenerated;
    if (filterType === 'specialist') return !agent.isGenerated;
    return true;
  });

  const handleCopyPath = () => {
    if (!activeProject) return;
    navigator.clipboard.writeText(activeProject.appName);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleCopyCode = () => {
    const code = projectFiles[selectedFile] || '';
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleLaunchChat = (agent: PortalAgent) => {
    setSelectedAgent(agent);
    setActiveNavTab('chats');
  };

  const fileKeys = Object.keys(projectFiles);
  const currentCode = projectFiles[selectedFile] || '';

  return (
    <div className="flex flex-1 flex-col h-screen min-w-0 bg-[#0e131f] text-slate-100 overflow-hidden select-none">
      {/* Top Header */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/5 bg-[#080b11]/90 px-6 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md">
            <Folder className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                My Projects & Agents
              </h2>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-mono text-sky-400 border border-sky-500/20">
                {agents.length} Registered
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Shared ADK backend repository • All created agent information, tools, code, and configs are kept in sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchAgents()}
            disabled={isLoadingAgents}
            title="Refresh agents and files from backend"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingAgents ? 'animate-spin text-sky-400' : ''}`} />
            <span>Sync Backend</span>
          </button>

          <a
            href={STUDIO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-sky-500/20 hover:opacity-95 transition-opacity"
          >
            <span>Studio (:5173)</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Main Workspace: 2-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Project Sidebar (Card List) */}
        <div className="w-80 sm:w-96 flex flex-col border-r border-white/5 bg-[#090d16] flex-shrink-0">
          {/* Search & Filter Bar */}
          <div className="p-3.5 border-b border-white/5 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search agents, tools, architecture..."
                className="w-full rounded-xl border border-white/10 bg-[#121826] pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500/40 focus:outline-none transition-colors"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                All ({agents.length})
              </button>
              <button
                onClick={() => setFilterType('generated')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filterType === 'generated'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                Generated Projects ({agents.filter((a) => a.isGenerated).length})
              </button>
              <button
                onClick={() => setFilterType('specialist')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filterType === 'specialist'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                Specialists ({agents.filter((a) => !a.isGenerated).length})
              </button>
            </div>
          </div>

          {/* Projects Card List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredProjects.length > 0 ? (
              filteredProjects.map((agent) => {
                const isSelected = activeProject?.id === agent.id;
                return (
                  <div
                    key={agent.id}
                    onClick={() => setActiveProject(agent)}
                    className={`group relative rounded-2xl border p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-sky-500/40 bg-[#151c2c] shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/20'
                        : 'border-white/5 bg-[#0e131f]/70 hover:border-white/15 hover:bg-[#121826]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 truncate">
                        <div
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                            agent.isGenerated
                              ? 'bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-sm'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="truncate">
                          <h4 className="font-semibold text-xs text-white truncate">
                            {agent.name}
                          </h4>
                          <span className="font-mono text-[10px] text-slate-400">
                            {agent.agentType}
                          </span>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Ready
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {agent.description}
                    </p>

                    {/* Metadata tags */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {agent.isGenerated && (
                        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300 border border-indigo-500/30">
                          ⭐ Generated Project
                        </span>
                      )}
                      {agent.tools && agent.tools.length > 0 && (
                        <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300 border border-amber-500/20">
                          <Wrench className="h-2.5 w-2.5" />
                          <span>{agent.tools.length} Tools</span>
                        </span>
                      )}
                      {agent.files && agent.files.length > 0 && (
                        <span className="flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-300 border border-sky-500/20">
                          <FileCode className="h-2.5 w-2.5" />
                          <span>{agent.files.length} Files</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No matching agents found.
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Dossier Area */}
        {activeProject ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#0c101a]">
            {/* Project Header Banner */}
            <div className="border-b border-white/5 bg-[#0f1422] p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${
                      activeProject.isGenerated
                        ? 'bg-gradient-to-tr from-sky-400 to-indigo-600 shadow-lg shadow-sky-500/20 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Bot className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-lg font-bold text-white tracking-wide">
                        {activeProject.name}
                      </h3>
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                        ● Ready for Execution
                      </span>
                      {activeProject.isGenerated && (
                        <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                          Generated Project
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono text-sky-400">{activeProject.agentType}</span>
                      <span>•</span>
                      <span className="font-mono text-[11px] text-slate-400 truncate max-w-md">
                        {activeProject.appName}
                      </span>
                      <button
                        onClick={handleCopyPath}
                        title="Copy Python dotted app path"
                        className="rounded p-1 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                      >
                        {copiedPath ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => handleLaunchChat(activeProject)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-500/25 hover:opacity-95 transition-all"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Chat with this Agent</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Sub-navigation tabs */}
              <div className="mt-6 flex items-center gap-6 border-b border-white/5 pt-2">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex items-center gap-2 border-b-2 pb-2 text-xs font-medium transition-colors ${
                    activeTab === 'overview'
                      ? 'border-sky-500 text-sky-400 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Overview & Specs</span>
                </button>

                <button
                  onClick={() => setActiveTab('tools')}
                  className={`flex items-center gap-2 border-b-2 pb-2 text-xs font-medium transition-colors ${
                    activeTab === 'tools'
                      ? 'border-sky-500 text-sky-400 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Tools & Capabilities ({activeProject.tools?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('files')}
                  className={`flex items-center gap-2 border-b-2 pb-2 text-xs font-medium transition-colors ${
                    activeTab === 'files'
                      ? 'border-sky-500 text-sky-400 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>Generated Code Files ({fileKeys.length || activeProject.files?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('runtime')}
                  className={`flex items-center gap-2 border-b-2 pb-2 text-xs font-medium transition-colors ${
                    activeTab === 'runtime'
                      ? 'border-sky-500 text-sky-400 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>Runtime & Environment</span>
                </button>
              </div>
            </div>

            {/* Tab Body Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* TAB 1: OVERVIEW & SPECS */}
              {activeTab === 'overview' && (
                <div className="max-w-4xl space-y-6">
                  {/* Metric Cards Grid */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-2xl border border-white/5 bg-[#121826] p-4">
                      <div className="text-[11px] font-medium text-slate-400">Architecture</div>
                      <div className="mt-1 font-semibold text-sm text-sky-300">
                        {activeProject.agentType}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">ADK Multi-turn Engine</div>
                    </div>

                    <div className="rounded-2xl border border-white/5 bg-[#121826] p-4">
                      <div className="text-[11px] font-medium text-slate-400">Tools Bound</div>
                      <div className="mt-1 font-semibold text-sm text-amber-300">
                        {activeProject.tools?.length || 0} Functions
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">Autonomous execution</div>
                    </div>

                    <div className="rounded-2xl border border-white/5 bg-[#121826] p-4">
                      <div className="text-[11px] font-medium text-slate-400">Package Files</div>
                      <div className="mt-1 font-semibold text-sm text-indigo-300">
                        {fileKeys.length || activeProject.files?.length || 0} Source Files
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">On shared backend</div>
                    </div>

                    <div className="rounded-2xl border border-white/5 bg-[#121826] p-4">
                      <div className="text-[11px] font-medium text-slate-400">Live Status</div>
                      <div className="mt-1 font-semibold text-sm text-emerald-400">
                        Ready
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">Session available</div>
                    </div>
                  </div>

                  {/* Description Box */}
                  <div className="rounded-2xl border border-white/5 bg-[#121826] p-5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Agent Purpose & Responsibilities
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {activeProject.description}
                    </p>
                  </div>

                  {/* ADK Registration & Path Details */}
                  <div className="rounded-2xl border border-white/5 bg-[#121826] p-5 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Technical Identification & Storage Path
                    </h4>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between rounded-xl bg-black/40 p-2.5 border border-white/5">
                        <span className="text-slate-400">Dotted App Name:</span>
                        <span className="text-sky-300 truncate max-w-lg">{activeProject.appName}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-black/40 p-2.5 border border-white/5">
                        <span className="text-slate-400">Physical Location:</span>
                        <span className="text-indigo-300 truncate max-w-lg">
                          {activeProject.path || `generated_agents/${activeProject.systemName || activeProject.id}`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-black/40 p-2.5 border border-white/5">
                        <span className="text-slate-400">Backend Port:</span>
                        <span className="text-emerald-400">http://127.0.0.1:8000</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TOOLS & CAPABILITIES */}
              {activeTab === 'tools' && (
                <div className="max-w-4xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-white">
                        Available Agent Tools ({activeProject.tools?.length || 0})
                      </h4>
                      <p className="text-xs text-slate-400">
                        Executable functions registered with this agent on the backend runtime.
                      </p>
                    </div>
                  </div>

                  {activeProject.tools && activeProject.tools.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {activeProject.tools.map((tool, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col justify-between rounded-2xl border border-white/5 bg-[#121826] p-4 hover:border-sky-500/30 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <Wrench className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="font-mono font-semibold text-xs text-amber-300">
                                {tool}()
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                {tool === 'record_attendance'
                                  ? 'Logs check-in and check-out events for users into the database with timestamp.'
                                  : tool === 'query_attendance'
                                  ? 'Performs structured queries over attendance records based on dates and user criteria.'
                                  : tool === 'get_attendance_summary'
                                  ? 'Computes comprehensive attendance statistics and summary metrics.'
                                  : `Custom executable tool for ${tool}`}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span>Status: Verified</span>
                            <span className="text-emerald-400">Callable</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/5 bg-[#121826] p-8 text-center text-xs text-slate-500">
                      No standalone custom tools registered for this agent. It operates using standard conversational reasoning.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: GENERATED CODE FILES */}
              {activeTab === 'files' && (
                <div className="flex h-[calc(100vh-250px)] flex-col sm:flex-row gap-4">
                  {/* File List Navigation */}
                  <div className="w-full sm:w-72 flex-shrink-0 flex flex-col rounded-2xl border border-white/5 bg-[#121826] overflow-hidden">
                    <div className="border-b border-white/5 bg-black/20 p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Project Files ({fileKeys.length})</span>
                      {isLoadingFiles && <Loader2 className="h-3 w-3 animate-spin text-sky-400" />}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {fileKeys.length > 0 ? (
                        fileKeys.map((f) => (
                          <button
                            key={f}
                            onClick={() => setSelectedFile(f)}
                            className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left font-mono text-xs transition-colors ${
                              selectedFile === f
                                ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30'
                                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                            }`}
                          >
                            <FileCode className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{f}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-500">
                          {isLoadingFiles ? 'Loading files...' : 'No files found for this agent.'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Code Viewer */}
                  <div className="flex flex-1 flex-col rounded-2xl border border-white/10 bg-[#070a10] overflow-hidden shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 bg-[#0d121c] px-4 py-2.5">
                      <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                        <FileCode className="h-4 w-4 text-sky-400" />
                        <span className="font-semibold text-white">{selectedFile || 'No file selected'}</span>
                      </div>

                      <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300 leading-relaxed">
                      {isLoadingFiles ? (
                        <div className="flex h-64 items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
                        </div>
                      ) : currentCode ? (
                        <pre className="whitespace-pre overflow-x-auto">
                          {currentCode}
                        </pre>
                      ) : (
                        <div className="flex h-64 items-center justify-center text-slate-500 italic">
                          File is empty or cannot be previewed.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: RUNTIME & ENVIRONMENT */}
              {activeTab === 'runtime' && (
                <div className="max-w-4xl space-y-6">
                  <div className="rounded-2xl border border-white/5 bg-[#121826] p-5 space-y-4">
                    <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Cpu className="h-4 w-4 text-sky-400" />
                      Model & Inference Configuration
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-white/5 bg-black/40 p-3.5">
                        <div className="text-[11px] text-slate-400">Configured Model</div>
                        <div className="mt-1 font-mono font-semibold text-sm text-sky-300">
                          {projectEnv?.model || 'gemini-3.6-flash'}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">Google GenAI / ADK runtime</div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-black/40 p-3.5">
                        <div className="text-[11px] text-slate-400">API Key Authentication</div>
                        <div className="mt-1 flex items-center gap-1.5 font-semibold text-sm text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>{projectEnv?.hasKey ? 'Configured & Active' : 'Server Fallback'}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">Protected securely on backend</div>
                      </div>
                    </div>
                  </div>

                  {/* Environment File Path */}
                  <div className="rounded-2xl border border-white/5 bg-[#121826] p-5 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Environment Settings Path
                    </h4>
                    <div className="rounded-xl bg-black/40 p-3 border border-white/5 font-mono text-xs text-slate-300">
                      {projectEnv?.envPath || `generated_agents/${activeProject.systemName || activeProject.id}/.env`}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      All secrets and custom agent parameters are isolated per generated agent within the shared project directory.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
            Select an agent project on the left to view all its information.
          </div>
        )}
      </div>
    </div>
  );
};

