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
  /** Target external infrastructure zone ID this bridge connects to. */
  zoneId: string;
  /** Target zone kind (hub | memory | process | content | tools). */
  zoneKind: Exclude<CampusZoneKind, 'command'>;
  /** Bridge deck start anchored at the office exterior threshold [x, y, z]. */
  from: Vec3;
  /** Bridge deck end anchored at the external platform edge [x, y, z]. */
  to: Vec3;
  /** Navigable doorway staging point just inside the office floor (y = 0). */
  officeEntry: Vec3;
  /** Navigable landing point just on the external platform (y = platform.height). */
  platformEntry: Vec3;
  /** Which office perimeter side the portal opens onto. */
  wallSide: 'north' | 'west' | 'east';
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
  /** Desk center coordinates per agent ID (inside the central human office). */
  desks: Record<string, Vec3>;
  /** Standing point beside each desk where an employee steps before/after walking. */
  deskStandPoints: Record<string, Vec3>;
  /** Facing yaw (radians) when seated at each desk. */
  deskRotations: Record<string, number>;
  /** Module resource installation coordinates per module ID (on external futuristic platforms). */
  stations: Record<string, Vec3>;
  /** Navigable standing point in front of each external module installation (at platform elevation). */
  stationStandPoints: Record<string, Vec3>;
  /** Facing yaw (radians) when interacting with each external module installation. */
  stationFacings: Record<string, number>;
  /** Maps each module ID to its external platform zone ID for bridge routing & live labels. */
  stationZoneIds: Record<string, string>;
  /** Collaboration seats around the shared conference table inside the central office. */
  meetingTableCenter: Vec3;
  meetingSeats: { pos: Vec3; yaw: number }[];
  /** Non-walkable interior furniture/wall footprints used by A* pathfinding inside the office. */
  obstacles: ObstacleRect[];
  /** Central human office interior floor bounds [minX, maxX, minZ, maxZ]. */
  floorBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Outer campus bounds encompassing central office + all external infrastructure platforms. */
  campusBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  zones: CampusZone[];
  /** Convenience lookup: only the external elevated futuristic infrastructure platforms. */
  externalZones: CampusZone[];
  bridges: CampusBridge[];
  satellites: SatellitePad[];
  builderDais: { center: Vec3; baseY: number; topY: number } | null;
  center: Vec3;
  /** Half-extent of the full connected campus (office + external platforms), used for Fit camera & shadows. */
  radius: number;
  width: number;
  depth: number;
}

/** Main unified central office floor surface Y (clean oak floor with subtle executive platform). */
export const OFFICE_FLOOR_Y = 0.0;
const BUILDER_PLATFORM_Y = 0.14;

const DESK_SPACING_X = 2.85;
const DESK_SPACING_Z = 2.75;
const DESKS_PER_ROW = 4;

const HUB_MODULES = new Set(['guardrails', 'intent_detection']);
const CONTENT_MODULES = new Set(['image_generation', 'promptops']);
const MEMORY_MODULES = new Set(['short_term_memory', 'long_term_memory', 'agentic_rag', 'vector_db']);
const PROCESS_MODULES = new Set(['auditability', 'finops']);
const TOOL_MODULES = new Set(['tool_orchestration', 'connectors', 'external_connectors']);

export function moduleZoneKind(moduleId: string): CampusZoneKind {
  if (MEMORY_MODULES.has(moduleId)) return 'memory';
  if (TOOL_MODULES.has(moduleId)) return 'tools';
  if (PROCESS_MODULES.has(moduleId)) return 'process';
  if (CONTENT_MODULES.has(moduleId)) return 'content';
  if (HUB_MODULES.has(moduleId)) return 'hub';
  return 'hub';
}

/**
 * Connected Human Office + External AI Infrastructure Campus Layout:
 *
 * A. CENTRAL HUMAN OFFICE (warm sunlit oak workplace, preserved from Image 1):
 *    - Engineering & Agent Desks (center-left), Architect Executive Corner (`agent_builder`),
 *      Glass-partitioned Meeting & Strategy Room (back-right), Break Lounge Sofa & Coffee Table (front-left),
 *      Espresso Coffee Bar & Water Dispenser (front-center), Bookshelves, Cabinets, Whiteboard, Indoor Trees & Plants.
 *    - ZERO backend servers or AI infrastructure machinery inside the office.
 *
 * B. EXTERNAL FUTURISTIC AI INFRASTRUCTURE (5 elevated luminous platforms surrounding the office, Image 2):
 *    - North (`knowledge-zone`): DATA & KNOWLEDGE · Memory, Agentic RAG, Vector DB (Purple Memory Architecture)
 *    - North-West (`operations-zone`): OPERATIONS & SAFETY · Guardrails, Intent Detection (Electric Cyan-Blue)
 *    - North-East (`process-zone`): PROCESSING & GOVERNANCE · Auditability, FinOps (Pink/Magenta Processing)
 *    - West (`content-zone`): PROMPTOPS & CREATIVE AI · PromptOps, Image Generation (Cyan + Pink Holographic)
 *    - East (`tooling-zone`): TOOL ORCHESTRATION · Tool Orchestration, External Connectors (Golden Architecture)
 *
 * C. PHYSICAL ILLUMINATED BRIDGES:
 *    - 5 structurally supported skybridges connect the central office portals directly to each elevated platform,
 *      providing smooth elevation-aware, collision-free walking paths for human employees.
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

  // Central Human Office interior bounds (expanded, spacious, enterprise workplace)
  const minX = -13.2;
  const maxX = 13.2;
  const minZ = -9.2;
  const maxZ = 9.8 + extraDepth;

  // 1. Central Human Office Workplace Zone
  const cmdW = maxX - minX;
  const cmdD = maxZ - minZ;
  const cmdCenter: Vec3 = [0, OFFICE_FLOOR_Y, (minZ + maxZ) / 2];

  const desks: Record<string, Vec3> = {};
  const deskStandPoints: Record<string, Vec3> = {};
  const deskRotations: Record<string, number> = {};
  const obstacles: ObstacleRect[] = [];

  const hasBuilder = Boolean(agents[BUILDER_ID]);
  const builderPos: Vec3 = [7.8, BUILDER_PLATFORM_Y, 1.8];
  if (hasBuilder) {
    desks[BUILDER_ID] = builderPos;
    deskRotations[BUILDER_ID] = Math.PI;
    deskStandPoints[BUILDER_ID] = [builderPos[0], OFFICE_FLOOR_Y, builderPos[2] + 1.32];
    obstacles.push({
      id: `desk-${BUILDER_ID}`,
      minX: builderPos[0] - 1.05,
      maxX: builderPos[0] + 1.05,
      minZ: builderPos[2] - 0.65,
      maxZ: builderPos[2] + 0.55,
    });
  }

  // Worker desks arranged neatly in the expansive central-left engineering area with wide walkways to every bridge portal
  const actualRows = Math.max(1, Math.ceil(orderedWorkers.length / DESKS_PER_ROW));
  const gridCenterX = -3.8;
  const gridCenterZ = -0.55 + extraDepth * 0.45;
  orderedWorkers.forEach((id, i) => {
    const row = Math.floor(i / DESKS_PER_ROW);
    const inRow = Math.min(DESKS_PER_ROW, orderedWorkers.length - row * DESKS_PER_ROW);
    const col = i % DESKS_PER_ROW;
    const x = gridCenterX + (col - (inRow - 1) / 2) * DESK_SPACING_X;
    const z = gridCenterZ + (row - (actualRows - 1) / 2) * DESK_SPACING_Z;
    desks[id] = [x, OFFICE_FLOOR_Y, z];
    deskRotations[id] = Math.PI;
    deskStandPoints[id] = [x, OFFICE_FLOOR_Y, z + 1.15];
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
    label: 'HUMAN AI OFFICE',
    subtitle: 'Central Workplace & Team Desks',
    kind: 'command',
    center: cmdCenter,
    width: cmdW,
    depth: cmdD,
    height: OFFICE_FLOOR_Y,
    thickness: 0.58,
    accent: '#2563EB',
    secondaryAccent: '#38BDF8',
    surfaceTint: '#E9DFD1',
    signPlacement: 'front',
  };

  // Shared Meeting & Strategy conference room inside back-right of the central human office
  const meetingTableCenter: Vec3 = [7.8, OFFICE_FLOOR_Y, -4.8];
  obstacles.push({
    id: 'conference-table',
    minX: meetingTableCenter[0] - 1.5,
    maxX: meetingTableCenter[0] + 1.5,
    minZ: meetingTableCenter[2] - 0.85,
    maxZ: meetingTableCenter[2] + 0.85,
  });

  const meetingSeats: { pos: Vec3; yaw: number }[] = [
    { pos: [meetingTableCenter[0] - 0.95, OFFICE_FLOOR_Y, meetingTableCenter[2] + 1.38], yaw: Math.PI },
    { pos: [meetingTableCenter[0] + 0.95, OFFICE_FLOOR_Y, meetingTableCenter[2] + 1.38], yaw: Math.PI },
    { pos: [meetingTableCenter[0] - 0.95, OFFICE_FLOOR_Y, meetingTableCenter[2] - 1.38], yaw: 0 },
    { pos: [meetingTableCenter[0] + 0.95, OFFICE_FLOOR_Y, meetingTableCenter[2] - 1.38], yaw: 0 },
    { pos: [meetingTableCenter[0] - 2.05, OFFICE_FLOOR_Y, meetingTableCenter[2]], yaw: Math.PI / 2 },
    { pos: [meetingTableCenter[0] + 2.05, OFFICE_FLOOR_Y, meetingTableCenter[2]], yaw: -Math.PI / 2 },
  ];

  // Cozy Lounge & Espresso Cafe furniture inside front-left / front-center of the central human office
  const loungeCenter: Vec3 = [-7.6, OFFICE_FLOOR_Y, 6.8 + extraDepth * 0.65];
  const cafeCenter: Vec3 = [0.2, OFFICE_FLOOR_Y, 7.6 + extraDepth * 0.82];
  obstacles.push(
    { id: 'lounge-sofa', minX: loungeCenter[0] - 1.75, maxX: loungeCenter[0] + 0.85, minZ: loungeCenter[2] - 0.48, maxZ: loungeCenter[2] + 1.05 },
    { id: 'lounge-table', minX: loungeCenter[0] - 0.72, maxX: loungeCenter[0] + 0.62, minZ: loungeCenter[2] - 1.52, maxZ: loungeCenter[2] - 0.72 },
    { id: 'cafe-counter', minX: cafeCenter[0] - 1.55, maxX: cafeCenter[0] + 1.55, minZ: cafeCenter[2] - 0.45, maxZ: cafeCenter[2] + 0.55 },
  );

  // =========================================================================================
  // EXTERNAL FUTURISTIC AI INFRASTRUCTURE PLATFORMS (RESTING DIRECTLY ON THE GROUND FLOOR)
  // =========================================================================================

  // 2. DATA & KNOWLEDGE · Memory Core (North / Back-Center — Purple Memory Architecture)
  const memoryH = 0.0;
  const memoryZone: CampusZone = {
    id: 'knowledge-zone',
    label: 'SHORT-TERM & LONG-TERM MEMORY',
    subtitle: 'DATA & KNOWLEDGE REPOSITORY',
    kind: 'memory',
    center: [0.0, memoryH, -20.2],
    width: 14.4,
    depth: 8.8,
    height: memoryH,
    thickness: 0.12,
    accent: '#A855F7',
    secondaryAccent: '#38BDF8',
    surfaceTint: '#111633',
    signPlacement: 'front',
  };

  // 3. OPERATIONS & SAFETY (North-West / Back-Left — Electric Cyan-Blue Security Architecture)
  const hubH = 0.0;
  const hubZone: CampusZone = {
    id: 'operations-zone',
    label: 'OPERATIONS & SAFETY',
    subtitle: 'GUARDRAILS · INTENT DETECTION',
    kind: 'hub',
    center: [-22.5, hubH, -16.2],
    width: 11.0,
    depth: 8.6,
    height: hubH,
    thickness: 0.12,
    accent: '#00E5FF',
    secondaryAccent: '#3B82F6',
    surfaceTint: '#0C1A38',
    signPlacement: 'front',
  };

  // 4. PROCESSING & GOVERNANCE (North-East / Back-Right — Pink/Magenta Compute Architecture)
  const processH = 0.0;
  const processZone: CampusZone = {
    id: 'process-zone',
    label: 'PROCESS STUDIO',
    subtitle: 'PROCESSING & GOVERNANCE',
    kind: 'process',
    center: [22.5, processH, -16.2],
    width: 11.0,
    depth: 8.6,
    height: processH,
    thickness: 0.12,
    accent: '#EC4899',
    secondaryAccent: '#F472B6',
    surfaceTint: '#1A1130',
    signPlacement: 'front',
  };

  // 5. PROMPTOPS & CREATIVE AI (West / Left-Side — Cyan + Pink Holographic Architecture)
  const contentH = 0.0;
  const contentZone: CampusZone = {
    id: 'content-zone',
    label: 'CONTENT STUDIO - RCP',
    subtitle: 'PROMPTOPS & CREATIVE AI',
    kind: 'content',
    center: [-22.8, contentH, 1.8],
    width: 10.2,
    depth: 8.8,
    height: contentH,
    thickness: 0.12,
    accent: '#06B6D4',
    secondaryAccent: '#EC4899',
    surfaceTint: '#0E1C36',
    signPlacement: 'front',
  };

  // 6. TOOL ORCHESTRATION (East / Right-Side — Golden Orchestration Architecture)
  const toolsH = 0.0;
  const toolsZone: CampusZone = {
    id: 'tooling-zone',
    label: 'TOOL ORCHESTRATION',
    subtitle: 'AUTOMATION & CONNECTORS',
    kind: 'tools',
    center: [22.8, toolsH, 1.8],
    width: 10.4,
    depth: 8.8,
    height: toolsH,
    thickness: 0.12,
    accent: '#F59E0B',
    secondaryAccent: '#FDE047',
    surfaceTint: '#1B1726',
    signPlacement: 'front',
  };

  const externalZones: CampusZone[] = [hubZone, contentZone, memoryZone, processZone, toolsZone];
  const zones: CampusZone[] = [commandZone, ...externalZones];

  // =========================================================================================
  // PHYSICAL GROUND-LEVEL ILLUMINATED PROMENADES CONNECTING OFFICE ↔ MODULE PLATFORMS
  // =========================================================================================
  const bridges: CampusBridge[] = [
    {
      id: 'bridge-knowledge',
      zoneId: memoryZone.id,
      zoneKind: 'memory',
      from: [0.0, OFFICE_FLOOR_Y, minZ],
      to: [0.0, OFFICE_FLOOR_Y, memoryZone.center[2] + memoryZone.depth / 2],
      officeEntry: [0.0, OFFICE_FLOOR_Y, minZ + 1.1],
      platformEntry: [0.0, OFFICE_FLOOR_Y, memoryZone.center[2] + memoryZone.depth / 2 - 0.9],
      wallSide: 'north',
      width: 2.35,
      accent: '#A855F7',
      secondaryAccent: '#00E5FF',
      hasBeacon: true,
    },
    {
      id: 'bridge-operations',
      zoneId: hubZone.id,
      zoneKind: 'hub',
      from: [-9.2, OFFICE_FLOOR_Y, minZ],
      to: [hubZone.center[0] + hubZone.width / 2 - 1.2, OFFICE_FLOOR_Y, hubZone.center[2] + hubZone.depth / 2],
      officeEntry: [-9.2, OFFICE_FLOOR_Y, minZ + 1.1],
      platformEntry: [hubZone.center[0] + hubZone.width / 2 - 1.6, OFFICE_FLOOR_Y, hubZone.center[2] + hubZone.depth / 2 - 0.95],
      wallSide: 'north',
      width: 2.05,
      accent: '#00E5FF',
      secondaryAccent: '#3B82F6',
      hasBeacon: true,
    },
    {
      id: 'bridge-process',
      zoneId: processZone.id,
      zoneKind: 'process',
      from: [9.2, OFFICE_FLOOR_Y, minZ],
      to: [processZone.center[0] - processZone.width / 2 + 1.2, OFFICE_FLOOR_Y, processZone.center[2] + processZone.depth / 2],
      officeEntry: [9.2, OFFICE_FLOOR_Y, minZ + 1.1],
      platformEntry: [processZone.center[0] - processZone.width / 2 + 1.6, OFFICE_FLOOR_Y, processZone.center[2] + processZone.depth / 2 - 0.95],
      wallSide: 'north',
      width: 2.05,
      accent: '#EC4899',
      secondaryAccent: '#00E5FF',
      hasBeacon: true,
    },
    {
      id: 'bridge-content',
      zoneId: contentZone.id,
      zoneKind: 'content',
      from: [minX, OFFICE_FLOOR_Y, 1.8],
      to: [contentZone.center[0] + contentZone.width / 2, OFFICE_FLOOR_Y, 1.8],
      officeEntry: [minX + 1.1, OFFICE_FLOOR_Y, 1.8],
      platformEntry: [contentZone.center[0] + contentZone.width / 2 - 0.9, OFFICE_FLOOR_Y, 1.8],
      wallSide: 'west',
      width: 2.05,
      accent: '#06B6D4',
      secondaryAccent: '#EC4899',
      hasBeacon: true,
    },
    {
      id: 'bridge-tools',
      zoneId: toolsZone.id,
      zoneKind: 'tools',
      from: [maxX, OFFICE_FLOOR_Y, 1.8],
      to: [toolsZone.center[0] - toolsZone.width / 2, OFFICE_FLOOR_Y, 1.8],
      officeEntry: [maxX - 1.1, OFFICE_FLOOR_Y, 1.8],
      platformEntry: [toolsZone.center[0] - toolsZone.width / 2 + 0.9, OFFICE_FLOOR_Y, 1.8],
      wallSide: 'east',
      width: 2.25,
      accent: '#F59E0B',
      secondaryAccent: '#00E5FF',
      hasBeacon: true,
    },
  ];

  // =========================================================================================
  // PLACE ALL REGISTERED MODULES ON THEIR EXTERNAL FUTURISTIC PLATFORMS
  // =========================================================================================
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
  const stationZoneIds: Record<string, string> = {};

  interface StationSlot {
    ox: number;
    oz: number;
    standDx: number;
    standDz: number;
    yaw: number;
  }

  const placeOnExternalPlatform = (ids: string[], zone: CampusZone, slots: StationSlot[]) => {
    ids.forEach((m, idx) => {
      const slot = slots[idx % slots.length];
      const sx = zone.center[0] + slot.ox;
      const sy = zone.height;
      const sz = zone.center[2] + slot.oz;
      stations[m] = [sx, sy, sz];
      stationStandPoints[m] = [sx + slot.standDx, sy, sz + slot.standDz];
      stationFacings[m] = slot.yaw;
      stationZoneIds[m] = zone.id;
    });
  };

  // DATA & KNOWLEDGE (4 modules: short_term_memory, long_term_memory, agentic_rag, vector_db)
  placeOnExternalPlatform(grouped.memory, memoryZone, [
    { ox: -3.7, oz: -1.1, standDx: 0, standDz: 1.55, yaw: Math.PI },
    { ox: -1.25, oz: -1.4, standDx: 0, standDz: 1.55, yaw: Math.PI },
    { ox: 1.25, oz: -1.4, standDx: 0, standDz: 1.55, yaw: Math.PI },
    { ox: 3.7, oz: -1.1, standDx: 0, standDz: 1.55, yaw: Math.PI },
  ]);

  // OPERATIONS & SAFETY (guardrails, intent_detection + any fallback modules)
  placeOnExternalPlatform(grouped.hub, hubZone, [
    { ox: -1.9, oz: -0.95, standDx: 0.45, standDz: 1.5, yaw: Math.PI },
    { ox: 1.5, oz: -1.25, standDx: 0, standDz: 1.5, yaw: Math.PI },
    { ox: -2.1, oz: 1.3, standDx: 1.45, standDz: 0, yaw: -Math.PI / 2 },
    { ox: 1.9, oz: 1.15, standDx: -1.35, standDz: 0, yaw: Math.PI / 2 },
  ]);

  // PROCESSING & GOVERNANCE (auditability, finops)
  placeOnExternalPlatform(grouped.process, processZone, [
    { ox: -1.5, oz: -1.25, standDx: 0, standDz: 1.5, yaw: Math.PI },
    { ox: 1.9, oz: -0.95, standDx: -0.45, standDz: 1.5, yaw: Math.PI },
    { ox: 2.0, oz: 1.25, standDx: -1.45, standDz: 0, yaw: Math.PI / 2 },
    { ox: -1.9, oz: 1.2, standDx: 1.4, standDz: 0, yaw: -Math.PI / 2 },
  ]);

  // PROMPTOPS & CREATIVE AI (promptops, image_generation)
  placeOnExternalPlatform(grouped.content, contentZone, [
    { ox: -1.2, oz: -1.65, standDx: 1.45, standDz: 0.2, yaw: -Math.PI / 2 },
    { ox: -1.2, oz: 1.65, standDx: 1.45, standDz: -0.2, yaw: -Math.PI / 2 },
    { ox: 0.9, oz: -1.8, standDx: 0, standDz: 1.45, yaw: Math.PI },
  ]);

  // TOOL ORCHESTRATION (tool_orchestration, external_connectors)
  placeOnExternalPlatform(grouped.tools, toolsZone, [
    { ox: 1.35, oz: -1.75, standDx: -1.5, standDz: 0.2, yaw: Math.PI / 2 },
    { ox: 1.35, oz: 1.75, standDx: -1.5, standDz: -0.2, yaw: Math.PI / 2 },
    { ox: -0.8, oz: -2.1, standDx: 0, standDz: 1.45, yaw: Math.PI },
    { ox: -0.8, oz: 2.1, standDx: 0, standDz: -1.45, yaw: 0 },
  ]);

  // Living office amenity corners inside the central human office
  const satellites: SatellitePad[] = [
    {
      id: 'amenity-lounge',
      center: loungeCenter,
      width: 4.8,
      depth: 3.5,
      thickness: 0.04,
      accent: '#D97706',
      feature: 'lounge',
    },
    {
      id: 'amenity-cafe',
      center: cafeCenter,
      width: 4.1,
      depth: 2.1,
      thickness: 0.04,
      accent: '#78350F',
      feature: 'cafe',
    },
    {
      id: 'amenity-greenery',
      center: [9.2, OFFICE_FLOOR_Y, 7.2 + extraDepth * 0.7],
      width: 3.6,
      depth: 2.8,
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

  // Compute outer campus bounds covering central office + all 5 external platforms
  let cMinX = minX;
  let cMaxX = maxX;
  let cMinZ = minZ;
  let cMaxZ = maxZ;
  for (const z of externalZones) {
    cMinX = Math.min(cMinX, z.center[0] - z.width / 2);
    cMaxX = Math.max(cMaxX, z.center[0] + z.width / 2);
    cMinZ = Math.min(cMinZ, z.center[2] - z.depth / 2);
    cMaxZ = Math.max(cMaxZ, z.center[2] + z.depth / 2);
  }

  const width = cMaxX - cMinX;
  const depth = cMaxZ - cMinZ;

  return {
    desks,
    deskStandPoints,
    deskRotations,
    stations,
    stationStandPoints,
    stationFacings,
    stationZoneIds,
    meetingTableCenter,
    meetingSeats,
    obstacles,
    floorBounds: { minX, maxX, minZ, maxZ },
    campusBounds: { minX: cMinX, maxX: cMaxX, minZ: cMinZ, maxZ: cMaxZ },
    zones,
    externalZones,
    bridges,
    satellites,
    builderDais,
    center: [(cMinX + cMaxX) / 2, 0.85, (cMinZ + cMaxZ) / 2 + 1.2],
    radius: Math.max(width, depth) * 0.48,
    width,
    depth,
  };
}



