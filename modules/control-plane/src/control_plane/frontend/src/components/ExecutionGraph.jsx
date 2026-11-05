import React, { useCallback, useMemo, useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import BrainNode from './BrainNode';
import AgentNode from './AgentNode';
import AnimatedEdge from './AnimatedEdge';
import useMissionStore from '../store/missionStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow } from 'lucide-react';

const nodeTypes = { brain: BrainNode, agent: AgentNode };
const edgeTypes = { animated: AnimatedEdge };

export default function ExecutionGraph() {
  const { tasks, selectTask, completedCount } = useMissionStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Build graph layout
  useEffect(() => {
    if (!tasks || tasks.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const levels = new Map();
    const visited = new Set();

    // Calculate levels (topological depth)
    const calcLevel = (taskId, depth = 0) => {
      if (visited.has(taskId)) return levels.get(taskId) || 0;
      visited.add(taskId);
      const task = taskMap.get(taskId);
      if (!task) return 0;
      const depLevels = (task.dependencies || []).map(d => calcLevel(d, depth + 1) + 1);
      const level = Math.max(0, ...depLevels);
      levels.set(taskId, level);
      return level;
    };

    tasks.forEach(t => calcLevel(t.id));

    // Group by level
    const byLevel = {};
    tasks.forEach(t => {
      const lvl = levels.get(t.id) || 0;
      if (!byLevel[lvl]) byLevel[lvl] = [];
      byLevel[lvl].push(t);
    });

    const maxLevel = Math.max(...Object.keys(byLevel).map(Number), 0);
    const centerX = 400;
    const newNodes = [];
    const newEdges = [];

    // Add brain node
    newNodes.push({
      id: 'brain',
      type: 'brain',
      position: { x: centerX - 96, y: 0 },
      data: { taskCount: tasks.length },
    });

    // Position task nodes
    Object.entries(byLevel).forEach(([level, levelTasks]) => {
      const y = 280 + parseInt(level) * 200;
      const totalWidth = levelTasks.length * 280;
      const startX = centerX - totalWidth / 2 + 140;
      
      levelTasks.forEach((task, idx) => {
        const x = startX + idx * 280 - 128;
        newNodes.push({
          id: task.id,
          type: 'agent',
          position: { x, y },
          data: {
            name: task.name,
            description: task.description,
            status: task.status,
            risk: task.risk_classification,
            capabilities: task.required_capabilities,
            onClick: () => selectTask(task),
          },
        });

        // Connect to brain if no dependencies (root tasks)
        if (!task.dependencies || task.dependencies.length === 0) {
          const isActive = task.status === 'running';
          const isCompleted = task.status === 'completed';
          newEdges.push({
            id: `brain-${task.id}`,
            source: 'brain',
            target: task.id,
            type: 'animated',
            data: { active: isActive, completed: isCompleted },
          });
        }

        // Connect from dependencies
        (task.dependencies || []).forEach(depId => {
          const depTask = taskMap.get(depId);
          const isActive = task.status === 'running';
          const isCompleted = task.status === 'completed';
          newEdges.push({
            id: `${depId}-${task.id}`,
            source: depId,
            target: task.id,
            type: 'animated',
            data: { active: isActive, completed: isCompleted },
          });
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [tasks, setNodes, setEdges, selectTask]);

  // Empty state
  if (!tasks || tasks.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white/40">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-24 h-24 mb-6 rounded-3xl bg-white/5 flex items-center justify-center">
          <Workflow className="w-12 h-12" />
        </motion.div>
        <p className="text-lg font-medium">Launch a mission to visualize the execution flow</p>
        <p className="text-sm mt-2 text-white/30">The Brain will orchestrate ephemeral agents</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" gap={24} size={1} />
        <Controls className="!bg-dark-900/80 !border-white/10 !rounded-xl" />
        <MiniMap nodeColor={(n) => n.type === 'brain' ? '#9333ea' : '#3b82f6'} className="!bg-dark-900/60 !border-white/10 !rounded-xl" />
      </ReactFlow>
      
      {/* Task counter overlay */}
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-4 right-4 px-4 py-2 rounded-xl bg-dark-900/80 border border-white/10 backdrop-blur-lg">
        <span className="text-sm text-white/60">Completed: </span>
        <span className="text-lg font-bold text-green-400">{completedCount}</span>
        <span className="text-white/40"> / {tasks.length}</span>
      </motion.div>
    </div>
  );
}
