import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Eraser, LayoutGrid, Play, Radio, Square, Workflow } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useIsLightTheme } from '../../hooks/useIsLightTheme';
import { hierarchyEdgeId, moduleNodeId, useTelemetryStore } from '../../store/useTelemetryStore';
import { cancelSimulation, startSimulation } from '../../services/telemetrySimulator';
import { CustomAgentNode, type AgentFlowNode } from './CustomAgentNode';
import { MODULE_STATE_STYLES, ModuleNode, type ModuleFlowNode } from './ModuleNode';
import { ModuleTelemetryPanel } from './ModuleTelemetryPanel';
import { PacketEdge, type PacketFlowEdge } from './PacketEdge';
import { AgentTelemetryPanel } from './AgentTelemetryPanel';
import { STATE_STYLES } from './agentStateStyles';
import { MODULE_NODE_HEIGHT, MODULE_NODE_WIDTH, NODE_HEIGHT, NODE_WIDTH, layoutAgents, layoutModuleLane } from './graphLayout';

type OfficeNode = AgentFlowNode | ModuleFlowNode;

const nodeTypes = { agent: CustomAgentNode, module: ModuleNode };
const edgeTypes = { packet: PacketEdge };

function Toolbar({ onRelayout }: { onRelayout: () => void }) {
  const status = useTelemetryStore((s) => s.status);
  const agentCount = useTelemetryStore((s) => s.agentOrder.length);
  const busy = useTelemetryStore((s) => s.agentOrder.filter((id) => s.agents[id]?.state !== 'idle').length);
  const activeRuns = useTelemetryStore((s) => s.activeRuns);
  const moduleCount = useTelemetryStore((s) => s.moduleOrder.length);
  // "Busy" = in flight now or served a call in the last ~1s (calls often complete in milliseconds).
  const modulesBusy = useTelemetryStore((s) => {
    const cutoff = Date.now() / 1000 - 1.1;
    return s.moduleOrder.filter((id) => ['busy', 'booting'].includes(s.modules[id]?.state ?? '')
      || (s.moduleCalls[id]?.at(-1)?.startedAt ?? 0) > cutoff).length;
  });
  const isSimulating = useTelemetryStore((s) => s.isSimulating);
  const reset = useTelemetryStore((s) => s.reset);

  const statusColor = status === 'open' ? '#10b981' : status === 'connecting' ? '#f59e0b' : '#64748b';
  const statusLabel = status === 'open' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline';

  const btn = 'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--studio-text-secondary)] hover:bg-white/5 hover:text-[var(--studio-text)] transition-colors disabled:opacity-40';

  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-studio-border bg-studio-surface/85 px-3 py-1.5 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px]" title="Telemetry WebSocket: /ws/telemetry">
          <span className="relative flex h-2 w-2">
            {status === 'open' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: statusColor }} />}
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: statusColor }} />
          </span>
          <span style={{ color: statusColor }}>{statusLabel}</span>
        </div>
        <span className="h-3.5 w-px bg-studio-border" />
        <Metric label="agents" value={agentCount} />
        <Metric label="active" value={busy} accent={busy > 0 ? STATE_STYLES.thinking.color : undefined} />
        <Metric label="runs" value={activeRuns} />
        {moduleCount > 0 && (
          <>
            <span className="h-3.5 w-px bg-studio-border" />
            <Metric label={`of ${moduleCount} modules busy`} value={modulesBusy} accent={modulesBusy > 0 ? MODULE_STATE_STYLES.busy.color : undefined} />
          </>
        )}
      </div>

      <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-studio-border bg-studio-surface/85 p-1 shadow-lg backdrop-blur-md">
        <button type="button" className={btn} onClick={onRelayout} title="Re-run auto layout and fit view">
          <LayoutGrid className="h-3.5 w-3.5" /> Layout
        </button>
        {isSimulating ? (
          <button type="button" className={btn} onClick={cancelSimulation} title="Stop the simulated run">
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        ) : (
          <button type="button" className={btn} onClick={() => void startSimulation()} title={status === 'open' ? 'Run a live office shift on the real shared modules' : 'Replay a scripted run (no backend needed)'}>
            <Play className="h-3.5 w-3.5" /> Simulate
          </button>
        )}
        <button type="button" className={btn} onClick={reset} disabled={isSimulating || agentCount === 0} title="Clear the floorplan">
          <Eraser className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-baseline gap-1 font-mono">
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: accent ?? 'var(--studio-text)' }}>{value}</span>
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--studio-text-muted)]">{label}</span>
    </div>
  );
}

function EmptyState({ compact }: { compact: boolean }) {
  const status = useTelemetryStore((s) => s.status);
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="pointer-events-auto absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-studio-border bg-studio-surface/90 px-3.5 py-2 text-[11.5px] text-[var(--studio-text-secondary)] shadow-lg backdrop-blur-md"
      >
        <Building2 className="h-4 w-4 text-violet-300" />
        <span>Shared modules are on the floor. Agents appear above them as they spawn.</span>
        <button type="button" onClick={() => void startSimulation()} className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20">
          <Play className="h-3 w-3" /> Simulate office
        </button>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="pointer-events-auto max-w-sm rounded-xl border border-studio-border bg-studio-surface/80 p-6 text-center backdrop-blur-md">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-studio-border bg-studio-card">
          {status === 'open' ? <Radio className="h-5 w-5 text-emerald-400" /> : <Workflow className="h-5 w-5 text-slate-400" />}
        </div>
        <h3 className="text-sm font-semibold text-[var(--studio-text)]">No agents on the floor yet</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--studio-text-secondary)]">
          {status === 'open'
            ? 'Telemetry is live. Send a request in the Architect chat or the sandbox, and agents will appear here as they spawn.'
            : 'Telemetry is offline. Start the backend with python server.py, or press Simulate to replay a scripted run.'}
        </p>
        <button
          type="button"
          onClick={() => void startSimulation()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11.5px] font-medium text-sky-300 hover:bg-sky-500/20"
        >
          <Play className="h-3.5 w-3.5" /> Simulate a build run
        </button>
      </div>
    </motion.div>
  );
}

function Canvas() {
  const { fitView } = useReactFlow();
  const isLight = useIsLightTheme();
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const selectModule = useTelemetryStore((s) => s.selectModule);
  const selectedAgentId = useTelemetryStore((s) => s.selectedAgentId);
  const selectedModuleId = useTelemetryStore((s) => s.selectedModuleId);
  const selectedNodeId = selectedModuleId ? moduleNodeId(selectedModuleId) : selectedAgentId;

  // Topology only: re-layout when agents or parents change, never on telemetry ticks.
  const topology = useTelemetryStore(
    (s) => ({
      order: s.agentOrder,
      parents: s.agentOrder.map((id) => s.agents[id]?.parentId ?? '').join('|'),
      extra: s.extraEdges,
      modules: s.moduleOrder,
      moduleLinks: s.moduleLinks,
    }),
    shallow,
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<OfficeNode>([]);
  const [layoutNonce, setLayoutNonce] = useState(0);

  useEffect(() => {
    const { agents, agentOrder, moduleOrder } = useTelemetryStore.getState();
    const positions = layoutAgents(agentOrder, agents);
    const lane = layoutModuleLane(moduleOrder.map(moduleNodeId), positions);
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      // Explicit sizes let fitView include nodes before React Flow has measured them.
      const agentNodes: AgentFlowNode[] = agentOrder.map((id) => ({
        ...(prevById.get(id) as AgentFlowNode | undefined),
        id,
        type: 'agent' as const,
        position: positions[id],
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: { agentId: id },
      }));
      const moduleNodes: ModuleFlowNode[] = moduleOrder.map((m) => ({
        ...(prevById.get(moduleNodeId(m)) as ModuleFlowNode | undefined),
        id: moduleNodeId(m),
        type: 'module' as const,
        position: lane[moduleNodeId(m)],
        width: MODULE_NODE_WIDTH,
        height: MODULE_NODE_HEIGHT,
        data: { moduleId: m },
      }));
      return [...agentNodes, ...moduleNodes];
    });
    const t = setTimeout(() => void fitView({ padding: 0.12, duration: 450, maxZoom: 1.1 }), 120);
    return () => clearTimeout(t);
  }, [topology.order, topology.parents, topology.modules, layoutNonce, setNodes, fitView]);

  useEffect(() => {
    setNodes((prev) => prev.map((n) => (n.selected === (n.id === selectedNodeId) ? n : { ...n, selected: n.id === selectedNodeId })));
  }, [selectedNodeId, setNodes]);

  const edges = useMemo<PacketFlowEdge[]>(() => {
    const { agents } = useTelemetryStore.getState();
    const hierarchy: PacketFlowEdge[] = topology.order
      .filter((id) => agents[id]?.parentId && agents[agents[id].parentId!])
      .map((id) => {
        const parent = agents[id].parentId!;
        return { id: hierarchyEdgeId(parent, id), source: parent, target: id, type: 'packet' as const };
      });
    const lateral: PacketFlowEdge[] = topology.extra.map((x) => ({ ...x, type: 'packet' as const, data: { lateral: true } }));
    const usage: PacketFlowEdge[] = topology.moduleLinks.map((x) => ({ ...x, type: 'packet' as const, data: { module: true }, zIndex: 0 }));
    return [...usage, ...hierarchy, ...lateral];
  }, [topology]);

  const onNodeClick = useCallback<NodeMouseHandler<OfficeNode>>(
    (_, node) => (node.type === 'module' ? selectModule(node.data.moduleId) : selectAgent(node.id)),
    [selectAgent, selectModule],
  );

  return (
    <>
      <ReactFlow<OfficeNode, PacketFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => { selectAgent(null); selectModule(null); }}
        colorMode={isLight ? 'light' : 'dark'}
        nodesConnectable={false}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="command-flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color={isLight ? '#cbd5e1' : '#1e2638'} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(n) => {
            const state = useTelemetryStore.getState();
            if (n.type === 'module') {
              const mod = state.modules[(n as ModuleFlowNode).data.moduleId];
              return mod ? MODULE_STATE_STYLES[mod.state].color : '#64748b';
            }
            const agent = state.agents[(n as AgentFlowNode).data.agentId];
            return agent ? STATE_STYLES[agent.state].color : '#64748b';
          }}
          maskColor={isLight ? 'rgba(241,245,249,0.7)' : 'rgba(7,9,14,0.7)'}
          className="!rounded-lg !border !border-studio-border"
        />
      </ReactFlow>
      <Toolbar onRelayout={() => setLayoutNonce((n) => n + 1)} />
      <AnimatePresence>
        {topology.order.length === 0 && <EmptyState key="empty" compact={topology.modules.length > 0} />}
      </AnimatePresence>
      <AgentTelemetryPanel />
      <ModuleTelemetryPanel />
    </>
  );
}

export function AgentGraph() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
    </div>
  );
}

export default AgentGraph;
