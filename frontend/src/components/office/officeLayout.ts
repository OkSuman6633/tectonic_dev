import type { AgentMeta } from '../../types/telemetry';
import { BUILDER_ID } from '../command/agentStateStyles.ts';

export type Vec3 = [number, number, number];

export type CampusZoneKind = 'command' | 'hub' | 'content' | 'memory' | 'process' | 'tools';

export interface ObstacleRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CampusZone {
  id: string;
  label: string;
  subtitle?: string;
  kind: CampusZoneKind;
  /** Center of the zone floor: [x, topSurfaceY, z]. */
  center: Vec3;
  width: number;
  depth: number;
  /** Top deck elevation above world y = 0. */
  height: number;
  /** Slab thickness for architectural depth. */
  thickness: number;
  /** Primary warm architectural accent color. */
  accent: string;
  /** Secondary subtle accent color. */
  secondaryAccent: string;
  /** Floor / rug surface tint. */
  surfaceTint: string;
  signPlacement: 'top' | 'front';
}

export interface CampusBridge {
  id: string;
  from: Vec3;
  to: Vec3;
  width: number;
  accent: string;
  secondaryAccent?: string;
  hasBeacon?: boolean;
}

export interface SatellitePad {
  id: string;
  center: Vec3;
  width: number;
  depth: number;
  thickness: number;
  accent: string;
  feature: 'lounge' | 'cafe' | 'greenery';
  tetherTo?: Vec3;
}

export interface OfficeLayout {
  /** Desk center coordinates per agent ID. */
  desks: Record<string, Vec3>;
  /** Standing point beside each desk where an employee steps before/after walking. */
  deskStandPoints: Record<string, Vec3>;
  /** Facing yaw (radians) when seated at each desk. */
  deskRotations: Record<string, number>;
  /** Module resource workstation coordinates per module ID. */
  stations: Record<string, Vec3>;
  /** Navigable floor point in front of each module resource where an employee stands/works. */
  stationStandPoints: Record<string, Vec3>;
  /** Facing yaw (radians) when interacting with each module resource. */
  stationFacings: Record<string, number>;
  /** Collaboration seats around the shared conference table for multi-employee meetings. */
  meetingTableCenter: Vec3;
  meetingSeats: { pos: Vec3; yaw: number }[];
  /** Non-walkable furniture/wall footprints used by A* pathfinding. */
  obstacles: ObstacleRect[];
  /** Overall interior floor bounds [minX, maxX, minZ, maxZ]. */
  floorBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  zones: CampusZone[];
  bridges: CampusBridge[];
  satellites: SatellitePad[];
  builderDais: { center: Vec3; baseY: number; topY: number } | null;
  center: Vec3;
  /** Half-extent of the occupied office, used for shadow bounds and camera fit. */
  radius: number;
  width: number;
  depth: number;
}

/** Main unified office floor surface Y (clean single-level oak floor with subtle executive platform). */
export const OFFICE_FLOOR_Y = 0.0;
const BUILDER_PLATFORM_Y = 0.14;

const DESK_SPACING_X = 2.85;
const DESK_SPACING_Z = 2.75;
const DESKS_PER_ROW = 3;

const HUB_MODULES = new Set(['guardrails', 'intent_detection']);
const CONTENT_MODULES = new Set(['image_generation', 'promptops']);
const MEMORY_MODULES = new Set(['short_term_memory', 'long_term_memory', 'agentic_rag', 'vector_db']);
const PROCESS_MODULES = new Set(['auditability', 'finops']);
const TOOL_MODULES = new Set(['tool_orchestration', 'connectors']);

export function moduleZoneKind(moduleId: string): CampusZoneKind {
  if (MEMORY_MODULES.has(moduleId)) return 'memory';
  if (TOOL_MODULES.has(moduleId)) return 'tools';
  if (PROCESS_MODULES.has(moduleId)) return 'process';
  if (CONTENT_MODULES.has(moduleId)) return 'content';
  if (HUB_MODULES.has(moduleId)) return 'hub';
  return 'hub';
}

/**
 * Living 3D Modern AI Office Floorplan (warm isometric sunlit workspace):
 * Single cohesive architectural interior with wide walkable aisles connecting 6 functional areas + break lounge:
 * - Engineering & Agent Workspace (center): ergonomic wood-and-white desks + Architect corner (`agent_builder`)
 * - Operations & Compliance Desk (back-left): glass-partitioned governance & intent terminals
 * - Data & Knowledge Library (back-center): archive server racks, bookshelves & data monitoring consoles
 * - Collaboration & Meeting Room (back-right): glass-walled conference table for A2A & strategy work
 * - Research & Creative Studio (front-left): creative workstation bay alongside cozy lounge & espresso bar
 * - Tooling & Automation Lab (front-right): multi-monitor ops consoles & hardware cabinets
 */
export function layoutOffice(order: string[], agents: Record<string, AgentMeta>, modules: string[]): OfficeLayout {
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of order) {
    const parent = agents[id]?.parentId;
    if (parent && agents[parent]) children.set(parent, [...(children.get(parent) ?? []), id]);
    else roots.push(id);
  }
  const orderedWorkers: string[] = [];
  const visit = (id: string) => {
    if (id !== BUILDER_ID) orderedWorkers.push(id);
    for (const c of children.get(id) ?? []) visit(c);
  };
  [...roots].sort((a, b) => (a === BUILDER_ID ? -1 : b === BUILDER_ID ? 1 : 0)).forEach(visit);

  const workerRows = Math.max(2, Math.ceil(orderedWorkers.length / DESKS_PER_ROW));
  const extraDepth = Math.max(0, workerRows - 2) * DESK_SPACING_Z;

  // Overall sunlit interior floor bounds
  const minX = -11.8;
  const maxX = 11.8;
  const minZ = -9.6;
  const maxZ = 8.4 + extraDepth;

  // 1. Engineering & Agent Workspace (center open-plan desk bay)
  const cmdW = 10.6;
  const cmdD = 7.4 + extraDepth;
  const cmdCenter: Vec3 = [-0.4, OFFICE_FLOOR_Y, 1.3 + extraDepth / 2];

  const desks: Record<string, Vec3> = {};
  const deskStandPoints: Record<string, Vec3> = {};
  const deskRotations: Record<string, number> = {};
  const obstacles: ObstacleRect[] = [];

  const hasBuilder = Boolean(agents[BUILDER_ID]);
  const builderPos: Vec3 = [3.6, BUILDER_PLATFORM_Y, -0.5];
  if (hasBuilder) {
    desks[BUILDER_ID] = builderPos;
    deskRotations[BUILDER_ID] = Math.PI;
    // Step out behind the executive chair into the main corridor
    deskStandPoints[BUILDER_ID] = [builderPos[0], OFFICE_FLOOR_Y, builderPos[2] + 1.35];
    obstacles.push({
      id: `desk-${BUILDER_ID}`,
      minX: builderPos[0] - 1.05,
      maxX: builderPos[0] + 1.05,
      minZ: builderPos[2] - 0.65,
      maxZ: builderPos[2] + 0.55,
    });
  }

  // Place worker desks cleanly in rows with spacious walkways between every row
  const actualRows = Math.max(1, Math.ceil(orderedWorkers.length / DESKS_PER_ROW));
  const gridCenterX = -1.6;
  const gridCenterZ = cmdCenter[2] + 0.2;
  orderedWorkers.forEach((id, i) => {
    const row = Math.floor(i / DESKS_PER_ROW);
    const inRow = Math.min(DESKS_PER_ROW, orderedWorkers.length - row * DESKS_PER_ROW);
    const col = i % DESKS_PER_ROW;
    const x = gridCenterX + (col - (inRow - 1) / 2) * DESK_SPACING_X;
    const z = gridCenterZ + (row - (actualRows - 1) / 2) * DESK_SPACING_Z;
    desks[id] = [x, OFFICE_FLOOR_Y, z];
    deskRotations[id] = Math.PI;
    // Stand/exit position behind the chair so employee walks smoothly into the aisle
    deskStandPoints[id] = [x, OFFICE_FLOOR_Y, z + 1.18];
    obstacles.push({
      id: `desk-${id}`,
      minX: x - 0.88,
      maxX: x + 0.88,
      minZ: z - 0.54,
      maxZ: z + 0.44,
    });
  });

  const commandZone: CampusZone = {
    id: 'workspace-zone',
    label: 'ENGINEERING FLOOR',
    subtitle: 'Active Agent Desks',
    kind: 'command',
    center: cmdCenter,
    width: cmdW,
    depth: cmdD,
    height: OFFICE_FLOOR_Y,
    thickness: 0.55,
    accent: '#2563EB',
    secondaryAccent: '#60A5FA',
    surfaceTint: '#E9DFD1',
    signPlacement: 'front',
  };

  // 2. Operations & Compliance Desk (back-left)
  const hubZone: CampusZone = {
    id: 'operations-zone',
    label: 'OPERATIONS & SAFETY',
    subtitle: 'Guardrails · Intent',
    kind: 'hub',
    center: [-8.1, OFFICE_FLOOR_Y, -5.9],
    width: 6.2,
    depth: 5.4,
    height: OFFICE_FLOOR_Y,
    thickness: 0.55,
    accent: '#0F766E',
    secondaryAccent: '#2DD4BF',
    surfaceTint: '#E5ECE9',
    signPlacement: 'top',
  };

  // 3. Data & Knowledge Library (back-center)
  const memoryZone: CampusZone = {
    id: 'knowledge-zone',
    label: 'DATA & KNOWLEDGE HUB',
    subtitle: 'Memory · RAG · Vector Archive',
    kind: 'memory',
    center: [-0.4, OFFICE_FLOOR_Y, -6.1],
    width: 6.8,
    depth: 5.2,
    height: OFFICE_FLOOR_Y,
    thickness: 0.55,
    accent: '#6D28D9',
    secondaryAccent: '#A78BFA',
    surfaceTint: '#E9E6F2',
    signPlacement: 'top',
  };

  // 4. Collaboration & Meeting Room (back-right glass room)
  const processZone: CampusZone = {
    id: 'meeting-zone',
    label: 'MEETING & STRATEGY',
    subtitle: 'Collaboration · Audit · FinOps',
    kind: 'process',
    center: [7.6, OFFICE_FLOOR_Y, -5.8],
    width: 6.6,
    depth: 5.6,
    height: OFFICE_FLOOR_Y,
    thickness: 0.55,
    accent: '#C2410C',
    secondaryAccent: '#FB923C',
    surfaceTint: '#F0E6DC',
    signPlacement: 'top',
  };

  // 5. Research & Creative Studio (mid-left, adjacent to lounge)
  const contentZone: CampusZone = {
    id: 'research-zone',
    label: 'RESEARCH & STUDIO',
    subtitle: 'PromptOps · Creative',
    kind: 'content',
    center: [-8.4, OFFICE_FLOOR_Y, 0.4],
    width: 5.2,
    depth: 4.8,
    height: OFFICE_FLOOR_Y,
    thickness: 0.55,
    accent: '#0284C7',
    secondaryAccent: '#38BDF8',
    surfaceTint: '#E4ECF3',
    signPlacement: 'top',
  };

  // 6. Tooling & Automation Lab (front-right)
  const toolsZone: CampusZone = {
    id: 'tooling-zone',
    label: 'TOOLING & OPS LAB',
    subtitle: 'Tool Orchestration · Connectors',
    kind: 'tools',
    center: [8.2, OFFICE_FLOOR_Y, 2.5 + extraDepth * 0.35],
    width: 5.6,
    depth: 6.2,
    height: OFFICE_FLOOR_Y,
    thickness: 0.55,
    accent: '#B45309',
    secondaryAccent: '#F59E0B',
    surfaceTint: '#EFE9DC',
    signPlacement: 'front',
  };

  const zones: CampusZone[] = [commandZone, hubZone, contentZone, memoryZone, processZone, toolsZone];

  // Shared conference table center & 6 navigable collaboration seats inside the Meeting Room
  const meetingTableCenter: Vec3 = [processZone.center[0] - 0.1, OFFICE_FLOOR_Y, processZone.center[2] + 0.25];
  obstacles.push({
    id: 'conference-table',
    minX: meetingTableCenter[0] - 1.45,
    maxX: meetingTableCenter[0] + 1.45,
    minZ: meetingTableCenter[2] - 0.8,
    maxZ: meetingTableCenter[2] + 0.8,
  });

  const meetingSeats: { pos: Vec3; yaw: number }[] = [
    { pos: [meetingTableCenter[0] - 0.85, OFFICE_FLOOR_Y, meetingTableCenter[2] + 1.3], yaw: Math.PI },
    { pos: [meetingTableCenter[0] + 0.85, OFFICE_FLOOR_Y, meetingTableCenter[2] + 1.3], yaw: Math.PI },
    { pos: [meetingTableCenter[0] - 0.85, OFFICE_FLOOR_Y, meetingTableCenter[2] - 1.3], yaw: 0 },
    { pos: [meetingTableCenter[0] + 0.85, OFFICE_FLOOR_Y, meetingTableCenter[2] - 1.3], yaw: 0 },
    { pos: [meetingTableCenter[0] - 1.95, OFFICE_FLOOR_Y, meetingTableCenter[2]], yaw: Math.PI / 2 },
    { pos: [meetingTableCenter[0] + 1.95, OFFICE_FLOOR_Y, meetingTableCenter[2]], yaw: -Math.PI / 2 },
  ];

  // Cozy Lounge & Espresso Cafe furniture obstacles in front-left corner
  const loungeCenter: Vec3 = [-8.2, OFFICE_FLOOR_Y, 5.7 + extraDepth * 0.6];
  const cafeCenter: Vec3 = [-3.2, OFFICE_FLOOR_Y, 6.9 + extraDepth * 0.85];
  obstacles.push(
    { id: 'lounge-sofa', minX: loungeCenter[0] - 1.8, maxX: loungeCenter[0] + 0.8, minZ: loungeCenter[2] - 0.5, maxZ: loungeCenter[2] + 1.1 },
    { id: 'lounge-table', minX: loungeCenter[0] - 0.7, maxX: loungeCenter[0] + 0.6, minZ: loungeCenter[2] - 1.55, maxZ: loungeCenter[2] - 0.75 },
    { id: 'cafe-counter', minX: cafeCenter[0] - 1.5, maxX: cafeCenter[0] + 1.5, minZ: cafeCenter[2] - 0.45, maxZ: cafeCenter[2] + 0.55 },
  );

  // Place live Tectonic module workstations along each room's functional wall with clear front standing points
  const grouped: Record<Exclude<CampusZoneKind, 'command'>, string[]> = {
    hub: [],
    content: [],
    memory: [],
    process: [],
    tools: [],
  };
  for (const m of modules) {
    const k = moduleZoneKind(m);
    if (k !== 'command') grouped[k].push(m);
  }

  const stations: Record<string, Vec3> = {};
  const stationStandPoints: Record<string, Vec3> = {};
  const stationFacings: Record<string, number> = {};

  interface StationSlot {
    ox: number;
    oz: number;
    standDx: number;
    standDz: number;
    yaw: number;
  }

  const placeOnZone = (ids: string[], zone: CampusZone, slots: StationSlot[]) => {
    ids.forEach((m, idx) => {
      const slot = slots[idx % slots.length];
      const sx = zone.center[0] + slot.ox;
      const sz = zone.center[2] + slot.oz;
      stations[m] = [sx, OFFICE_FLOOR_Y, sz];
      stationStandPoints[m] = [sx + slot.standDx, OFFICE_FLOOR_Y, sz + slot.standDz];
      stationFacings[m] = slot.yaw;
      obstacles.push({
        id: `station-${m}`,
        minX: sx - 0.72,
        maxX: sx + 0.72,
        minZ: sz - 0.52,
        maxZ: sz + 0.52,
      });
    });
  };

  placeOnZone(grouped.hub, hubZone, [
    { ox: -1.45, oz: -1.45, standDx: 0, standDz: 1.08, yaw: Math.PI },
    { ox: 1.35, oz: -1.45, standDx: 0, standDz: 1.08, yaw: Math.PI },
    { ox: -1.85, oz: 0.95, standDx: 1.05, standDz: 0, yaw: -Math.PI / 2 },
    { ox: 1.55, oz: 0.95, standDx: 0, standDz: 1.05, yaw: Math.PI },
  ]);

  placeOnZone(grouped.content, contentZone, [
    { ox: -1.45, oz: -1.1, standDx: 1.08, standDz: 0, yaw: -Math.PI / 2 },
    { ox: -1.45, oz: 1.15, standDx: 1.08, standDz: 0, yaw: -Math.PI / 2 },
    { ox: 0.7, oz: -1.35, standDx: 0, standDz: 1.05, yaw: Math.PI },
  ]);

  placeOnZone(grouped.memory, memoryZone, [
    { ox: -2.2, oz: -1.45, standDx: 0, standDz: 1.08, yaw: Math.PI },
    { ox: -0.75, oz: -1.45, standDx: 0, standDz: 1.08, yaw: Math.PI },
    { ox: 0.75, oz: -1.45, standDx: 0, standDz: 1.08, yaw: Math.PI },
    { ox: 2.2, oz: -1.45, standDx: 0, standDz: 1.08, yaw: Math.PI },
  ]);

  placeOnZone(grouped.process, processZone, [
    { ox: -1.9, oz: -1.95, standDx: 0, standDz: 1.02, yaw: Math.PI },
    { ox: 1.9, oz: -1.95, standDx: 0, standDz: 1.02, yaw: Math.PI },
    { ox: 2.35, oz: 1.75, standDx: -1.02, standDz: 0, yaw: Math.PI / 2 },
    { ox: -2.2, oz: 1.75, standDx: 1.02, standDz: 0, yaw: -Math.PI / 2 },
  ]);

  placeOnZone(grouped.tools, toolsZone, [
    { ox: 1.45, oz: -1.3, standDx: -1.1, standDz: 0, yaw: Math.PI / 2 },
    { ox: 1.45, oz: 1.35, standDx: -1.1, standDz: 0, yaw: Math.PI / 2 },
    { ox: -1.05, oz: -1.8, standDx: 0, standDz: 1.05, yaw: Math.PI },
    { ox: -1.05, oz: 1.8, standDx: 0, standDz: -1.05, yaw: 0 },
  ]);

  // Architectural floor walkway markers linking functional zones (kept in bridges array for layout compatibility)
  const bridges: CampusBridge[] = [
    { id: 'aisle-main-north', from: [-6.5, OFFICE_FLOOR_Y, -2.5], to: [6.5, OFFICE_FLOOR_Y, -2.5], width: 1.8, accent: '#D6C7B2' },
    { id: 'aisle-west', from: [-5.3, OFFICE_FLOOR_Y, -5.0], to: [-5.3, OFFICE_FLOOR_Y, 5.2], width: 1.7, accent: '#D6C7B2' },
    { id: 'aisle-east', from: [5.3, OFFICE_FLOOR_Y, -5.0], to: [5.3, OFFICE_FLOOR_Y, 5.2], width: 1.7, accent: '#D6C7B2' },
    { id: 'aisle-center-south', from: [-5.3, OFFICE_FLOOR_Y, 4.9 + extraDepth * 0.45], to: [5.3, OFFICE_FLOOR_Y, 4.9 + extraDepth * 0.45], width: 1.6, accent: '#D6C7B2' },
  ];

  // Living office amenity corners (lounge sofa, coffee & water bar, indoor greenery cluster)
  const satellites: SatellitePad[] = [
    {
      id: 'amenity-lounge',
      center: loungeCenter,
      width: 5.0,
      depth: 3.8,
      thickness: 0.04,
      accent: '#D97706',
      feature: 'lounge',
    },
    {
      id: 'amenity-cafe',
      center: cafeCenter,
      width: 4.2,
      depth: 2.2,
      thickness: 0.04,
      accent: '#78350F',
      feature: 'cafe',
    },
    {
      id: 'amenity-greenery',
      center: [8.4, OFFICE_FLOOR_Y, 6.8 + extraDepth * 0.7],
      width: 3.4,
      depth: 2.4,
      thickness: 0.04,
      accent: '#15803D',
      feature: 'greenery',
    },
  ];

  const builderDais = hasBuilder
    ? {
        center: builderPos,
        baseY: OFFICE_FLOOR_Y,
        topY: BUILDER_PLATFORM_Y,
      }
    : null;

  const width = maxX - minX;
  const depth = maxZ - minZ;

  return {
    desks,
    deskStandPoints,
    deskRotations,
    stations,
    stationStandPoints,
    stationFacings,
    meetingTableCenter,
    meetingSeats,
    obstacles,
    floorBounds: { minX, maxX, minZ, maxZ },
    zones,
    bridges,
    satellites,
    builderDais,
    center: [(minX + maxX) / 2, 0.85, (minZ + maxZ) / 2],
    radius: Math.max(width, depth) * 0.48,
    width,
    depth,
  };
}



