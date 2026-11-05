import type { AgentMeta } from '../../types/telemetry';
import { BUILDER_ID } from '../command/agentStateStyles';

export type Vec3 = [number, number, number];

export interface OfficeLayout {
  desks: Record<string, Vec3>;
  stations: Record<string, Vec3>;
  center: Vec3;
  /** Half-extent of the occupied floor, used for the floor size and camera fit. */
  radius: number;
  width: number;
  depth: number;
}

const DESK_SPACING_X = 3.1;
const ROW_SPACING_Z = 2.9;
const PER_ROW = 5;
const STATION_SPACING_X = 4.4;
const STATION_Z = -5.6;
const STATION_ROW_Z = 3.6; // second row of stations sits further back
const STATIONS_PER_ROW = 5;
const BUILDER_POS: Vec3 = [0, 0, -1.4];

/**
 * Floor plan: shared module stations along the back wall, the Builder's command desk in front of
 * them, and every other agent in rows of desks, ordered depth-first so each team sits together.
 * Depends only on topology (ids, parents, module list), so it stays stable across telemetry ticks.
 */
export function layoutOffice(order: string[], agents: Record<string, AgentMeta>, modules: string[]): OfficeLayout {
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of order) {
    const parent = agents[id]?.parentId;
    if (parent && agents[parent]) children.set(parent, [...(children.get(parent) ?? []), id]);
    else roots.push(id);
  }
  const ordered: string[] = [];
  const visit = (id: string) => {
    if (id !== BUILDER_ID) ordered.push(id);
    for (const c of children.get(id) ?? []) visit(c);
  };
  // Builder's team first, then any other root trees (e.g. a generated app running in the sandbox).
  [...roots].sort((a, b) => (a === BUILDER_ID ? -1 : b === BUILDER_ID ? 1 : 0)).forEach(visit);

  const desks: Record<string, Vec3> = {};
  if (agents[BUILDER_ID]) desks[BUILDER_ID] = BUILDER_POS;
  ordered.forEach((id, i) => {
    const row = Math.floor(i / PER_ROW);
    const inRow = Math.min(PER_ROW, ordered.length - row * PER_ROW);
    const col = i % PER_ROW;
    desks[id] = [(col - (inRow - 1) / 2) * DESK_SPACING_X, 0, 1.6 + row * ROW_SPACING_Z];
  });

  const stations: Record<string, Vec3> = {};
  modules.forEach((m, i) => {
    const row = Math.floor(i / STATIONS_PER_ROW);
    const inRow = Math.min(STATIONS_PER_ROW, modules.length - row * STATIONS_PER_ROW);
    const col = i % STATIONS_PER_ROW;
    stations[m] = [(col - (inRow - 1) / 2) * STATION_SPACING_X, 0, STATION_Z - row * STATION_ROW_Z];
  });

  const xs = [...Object.values(desks), ...Object.values(stations)].map((p) => p[0]);
  const zs = [...Object.values(desks), ...Object.values(stations)].map((p) => p[2]);
  const minX = Math.min(-6, ...xs) - 2.5;
  const maxX = Math.max(6, ...xs) + 2.5;
  const minZ = Math.min(STATION_Z, ...zs) - 2.4; // includes every station row
  const maxZ = Math.max(2, ...zs) + 2.6;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  return {
    desks,
    stations,
    center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
    radius: Math.max(width, depth) / 2,
    width,
    depth,
  };
}
