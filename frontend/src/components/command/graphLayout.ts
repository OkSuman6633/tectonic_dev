import dagre from '@dagrejs/dagre';
import type { AgentMeta } from '../../types/telemetry';

export const NODE_WIDTH = 256;
export const NODE_HEIGHT = 118;

export interface Point {
  x: number;
  y: number;
}

/**
 * Hierarchical top-down layout of the agent tree. Only topology (ids + parents) is an input,
 * so callers can memoize on a topology key and skip re-layout for state/telemetry updates.
 */
export function layoutAgents(order: string[], agents: Record<string, AgentMeta>): Record<string, Point> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 56, ranksep: 92, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of order) g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const id of order) {
    const parent = agents[id]?.parentId;
    if (parent && agents[parent]) g.setEdge(parent, id);
  }

  dagre.layout(g);

  const positions: Record<string, Point> = {};
  for (const id of order) {
    const n = g.node(id);
    positions[id] = { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 };
  }
  return positions;
}

export const MODULE_NODE_WIDTH = 212;
export const MODULE_NODE_HEIGHT = 92;
const MODULE_GAP = 28;
const MODULE_LANE_OFFSET = 150;
const MODULES_PER_ROW = 5;

/**
 * Shared modules sit in their own "service floor" lane, centred under the agent tree. Kept out of
 * Dagre so agent→module links (many-to-many) never distort the agent hierarchy.
 */
export function layoutModuleLane(moduleNodeIds: string[], agentPositions: Record<string, Point>): Record<string, Point> {
  const pts = Object.values(agentPositions);
  const minX = pts.length ? Math.min(...pts.map((p) => p.x)) : 0;
  const maxX = pts.length ? Math.max(...pts.map((p) => p.x + NODE_WIDTH)) : 0;
  const bottom = pts.length ? Math.max(...pts.map((p) => p.y + NODE_HEIGHT)) : 0;
  // Wrap into rows of MODULES_PER_ROW so a growing module catalogue never flattens the agent tree.
  const perRow = Math.min(MODULES_PER_ROW, Math.max(1, moduleNodeIds.length));
  const laneWidth = perRow * MODULE_NODE_WIDTH + (perRow - 1) * MODULE_GAP;
  const startX = (minX + maxX) / 2 - laneWidth / 2;
  const y0 = bottom + MODULE_LANE_OFFSET;
  return Object.fromEntries(moduleNodeIds.map((id, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return [id, { x: startX + col * (MODULE_NODE_WIDTH + MODULE_GAP), y: y0 + row * (MODULE_NODE_HEIGHT + MODULE_GAP) }];
  }));
}
