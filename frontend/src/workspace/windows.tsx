import type { ComponentType, ReactNode } from 'react';
import { Activity, BookOpenText, Box, CircleDollarSign, Code2, FileClock, MessageSquareText, Network, ScrollText, Terminal, Variable, type LucideIcon } from 'lucide-react';
import { ArchitectChat } from '../components/chat/ArchitectChat';
import { AgentGraph } from '../components/command/AgentGraph';
import { Office3D } from '../components/office/Office3D';
import { LiveAgentRunner } from '../components/sandbox/LiveAgentRunner';
import { CodeInspector } from '../components/inspector/CodeInspector';
import { AgentActivitySidebar } from '../components/AgentActivitySidebar';
import { EventLog } from '../components/command/EventTicker';
import { KnowledgeWindow } from '../components/platform/KnowledgeWindow';
import { FinOpsWindow } from '../components/platform/FinOpsWindow';
import { PromptOpsWindow } from '../components/platform/PromptOpsWindow';
import { AuditWindow } from '../components/platform/AuditWindow';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { useAgentStudioStore } from '../store/useAgentStudioStore';
import type { WindowId } from './useWorkspaceStore';

export interface WindowDef {
  title: string;
  icon: LucideIcon;
  accent: string;
  minW: number;
  minH: number;
  render: (ctx: { onSelectAgent: (id: string) => void }) => ReactNode;
  /** Live status shown in the title bar. */
  Status?: ComponentType;
  /** Compact live badge shown on the dock chip while minimized. */
  DockBadge?: ComponentType;
}

const pill = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px]';

function LiveStatus() {
  const status = useTelemetryStore((s) => s.status);
  const color = status === 'open' ? '#34D399' : status === 'connecting' ? '#FBBF24' : '#5F6573';
  return (
    <span className={pill} style={{ color }}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === 'open' ? 'animate-pulse' : ''}`} style={{ background: color }} />
      {status === 'open' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
    </span>
  );
}

function WorkingBadge() {
  const working = useTelemetryStore((s) => s.agentOrder.filter((id) => ['thinking', 'tool_execution'].includes(s.agents[id]?.state ?? '')).length);
  if (!working) return null;
  // iOS-style count bubble (amber = agents thinking / working).
  return (
    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-semibold text-black shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
      {working}
    </span>
  );
}

function OfficeStatus() {
  const working = useTelemetryStore((s) => s.agentOrder.filter((id) => ['thinking', 'tool_execution'].includes(s.agents[id]?.state ?? '')).length);
  return working ? <span className={`${pill} text-amber-300`}><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />{working} working</span> : null;
}

function ChatStatus() {
  const loading = useAgentStudioStore((s) => s.isChatLoading);
  return loading ? <span className={`${pill} text-sky-300`}><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />Builder working</span> : null;
}

function BuilderBusyDot() {
  const loading = useAgentStudioStore((s) => s.isChatLoading);
  return loading ? <span className="block h-3 w-3 animate-pulse rounded-full border-2 border-white/80 bg-sky-400 shadow" /> : null;
}

function SandboxStatus() {
  const agent = useAgentStudioStore((s) => s.selectedAgent?.name);
  return agent ? <span className={`${pill} max-w-[160px] truncate text-[var(--studio-text-muted)]`}>{agent}</span> : null;
}

function ModuleBusy({ ids }: { ids: string[] }) {
  const calls = useTelemetryStore((s) => ids.reduce((n, id) => n + (s.modules[id]?.totalCalls ?? 0), 0));
  const busy = useTelemetryStore((s) => ids.some((id) => ['busy', 'booting'].includes(s.modules[id]?.state ?? '')));
  return calls ? (
    <span className={`${pill} ${busy ? 'text-violet-300' : 'text-[var(--studio-text-muted)]'}`}>
      {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300" />}{calls} calls
    </span>
  ) : null;
}

function EventsCount() {
  const n = useTelemetryStore((s) => s.logs.length);
  return n ? <span className={`${pill} text-[var(--studio-text-muted)]`}>{n}</span> : null;
}

export const WINDOWS: Record<WindowId, WindowDef> = {
  chat: { title: 'Architect', icon: MessageSquareText, accent: '#2DD4FF', minW: 5, minH: 8, render: () => <ArchitectChat />, Status: ChatStatus, DockBadge: BuilderBusyDot },
  command: { title: 'Command Center', icon: Network, accent: '#2DD4FF', minW: 6, minH: 6, render: () => <AgentGraph />, Status: LiveStatus, DockBadge: WorkingBadge },
  blueprint: { title: 'Blueprint · 3D Office', icon: Box, accent: '#A78BFA', minW: 6, minH: 6, render: () => <Office3D />, Status: OfficeStatus, DockBadge: WorkingBadge },
  roster: { title: 'Agent Roster', icon: Activity, accent: '#34D399', minW: 4, minH: 5, render: ({ onSelectAgent }) => <AgentActivitySidebar onSelectAgent={onSelectAgent} />, DockBadge: WorkingBadge },
  events: { title: 'Event Log', icon: ScrollText, accent: '#FBBF24', minW: 5, minH: 5, render: ({ onSelectAgent }) => <EventLog onSelectAgent={onSelectAgent} />, Status: EventsCount },
  sandbox: { title: 'Live Sandbox', icon: Terminal, accent: '#34D399', minW: 6, minH: 8, render: () => <LiveAgentRunner />, Status: SandboxStatus },
  inspector: { title: 'ADK Code', icon: Code2, accent: '#60A5FA', minW: 6, minH: 8, render: () => <CodeInspector />, Status: SandboxStatus },
  knowledge: { title: 'Knowledge · RAG + Vectors', icon: BookOpenText, accent: '#2DD4FF', minW: 6, minH: 8, render: () => <KnowledgeWindow />, Status: () => <ModuleBusy ids={['agentic_rag', 'vector_db']} /> },
  finops: { title: 'FinOps', icon: CircleDollarSign, accent: '#34D399', minW: 5, minH: 8, render: () => <FinOpsWindow />, Status: () => <ModuleBusy ids={['finops']} /> },
  promptops: { title: 'PromptOps', icon: Variable, accent: '#A78BFA', minW: 6, minH: 8, render: () => <PromptOpsWindow />, Status: () => <ModuleBusy ids={['promptops']} /> },
  audit: { title: 'Audit Trail', icon: FileClock, accent: '#FBBF24', minW: 6, minH: 6, render: () => <AuditWindow />, Status: () => <ModuleBusy ids={['auditability']} /> },
};
