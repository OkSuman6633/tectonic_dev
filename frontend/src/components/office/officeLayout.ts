import type { AgentMeta } from '../../types/telemetry';
import { BUILDER_ID } from '../command/agentStateStyles.ts';

export type Vec3 = [number, number, number];

export type CampusZoneKind = 'command' | 'hub' | 'content' | 'memory' | 'process' | 'tools';

export interface CampusZone {
  id: string;
  label: string;
  subtitle?: string;
  kind: CampusZoneKind;
  /** Center of the platform top deck: [x, topSurfaceY, z]. */
  center: Vec3;
  width: number;
  depth: number;
  /** Top deck elevation above world y = 0. */
  height: number;
  /** Visible vertical slab thickness of this floating platform. */
  thickness: number;
  /** Primary luminous perimeter accent color. */
  accent: string;
  /** Secondary highlight accent color (lower stepped rim / trim). */
  secondaryAccent: string;
  /** Platform deck surface tint. */
  surfaceTint: string;
  /** Where the glowing zone marquee sign sits: floating above back edge or mounted on front rim. */
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
  feature: 'globe' | 'plinth' | 'accent';
  tetherTo?: Vec3;
}

export interface OfficeLayout {
  desks: Record<string, Vec3>;
  stations: Record<string, Vec3>;
  zones: CampusZone[];
  bridges: CampusBridge[];
  satellites: SatellitePad[];
  builderDais: { center: Vec3; baseY: number; topY: number } | null;
  center: Vec3;
  /** Half-extent of the occupied campus, used for shadow bounds and camera fit. */
  radius: number;
  width: number;
  depth: number;
}

// Elevations of independent stepped neon platforms (top deck Y)
const COMMAND_DECK_Y = 0.72;
const BUILDER_DAIS_Y = 0.94;
const HUB_DECK_Y = 0.96;
const CONTENT_DECK_Y = 0.78;
const MEMORY_DECK_Y = 0.90;
const PROCESS_DECK_Y = 0.88;
const TOOLS_DECK_Y = 0.82;

const DESK_SPACING_X = 2.62;
const DESK_SPACING_Z = 2.52;
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
 * Neon AI Operations Campus — 6-island isometric diamond architecture:
 * - AGENT COMMAND ZONE (center foreground, electric cyan): workstation grid + right-side holographic supervisor station
 * - COMMAND CENTER (upper-left, bright electric cyan/blue): stepped pyramid dais + floating neon cyan torus cube
 * - CONTENT STUDIO - RCP (far-left, cyan): hexagon wireframe screen + circular energy disc + front-left wireframe globe pad
 * - SHORT-TERM & LONG-TERM MEMORY (upper-right, royal purple + cyan): translucent cylinder memory stack + flanking cubes
 * - PROCESS STUDIO (far-right, hot magenta/pink): glowing pink cube cluster + floating magenta torus + holo code panels
 * - TOOL ORCHESTRATION (bottom-right foreground, warm amber/gold): golden energy cube core + gold modules + cyan cog screen
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
  const extraDepth = Math.max(0, workerRows - 3) * DESK_SPACING_Z;

  // 1. AGENT COMMAND ZONE (Center foreground)
  const cmdW = 11.4;
  const cmdD = 9.8 + extraDepth;
  const cmdCenter: Vec3 = [0, COMMAND_DECK_Y, 2.2 + extraDepth / 2];

  const desks: Record<string, Vec3> = {};
  const hasBuilder = Boolean(agents[BUILDER_ID]);
  const builderPos: Vec3 = [3.65, BUILDER_DAIS_Y, 0.35];
  if (hasBuilder) {
    desks[BUILDER_ID] = builderPos;
  }

  // Place worker agents centered cleanly inside the left-center floor grid of Agent Command Zone
  const gridCenterX = -1.15;
  const actualRows = Math.max(1, Math.ceil(orderedWorkers.length / DESKS_PER_ROW));
  const gridCenterZ = cmdCenter[2] + 0.15;
  orderedWorkers.forEach((id, i) => {
    const row = Math.floor(i / DESKS_PER_ROW);
    const inRow = Math.min(DESKS_PER_ROW, orderedWorkers.length - row * DESKS_PER_ROW);
    const col = i % DESKS_PER_ROW;
    const x = gridCenterX + (col - (inRow - 1) / 2) * DESK_SPACING_X;
    const z = gridCenterZ + (row - (actualRows - 1) / 2) * DESK_SPACING_Z;
    desks[id] = [x, COMMAND_DECK_Y, z];
  });

  const commandZone: CampusZone = {
    id: 'agent-command-zone',
    label: 'AGENT COMMAND ZONE',
    kind: 'command',
    center: cmdCenter,
    width: cmdW,
    depth: cmdD,
    height: COMMAND_DECK_Y,
    thickness: 0.92,
    accent: '#00D8FF',
    secondaryAccent: '#1D6BFF',
    surfaceTint: '#06122B',
    signPlacement: 'front',
  };

  // 2. COMMAND CENTER (Back-left of Agent Command Zone)
  const hubZone: CampusZone = {
    id: 'command-center-zone',
    label: 'COMMAND CENTER',
    kind: 'hub',
    center: [-11.0, HUB_DECK_Y, -2.1],
    width: 6.4,
    depth: 6.4,
    height: HUB_DECK_Y,
    thickness: 1.06,
    accent: '#00E5FF',
    secondaryAccent: '#2563EB',
    surfaceTint: '#071736',
    signPlacement: 'top',
  };

  // 3. CONTENT STUDIO - RCP (Far left)
  const contentZone: CampusZone = {
    id: 'content-studio-zone',
    label: 'CONTENT STUDIO - RCP',
    kind: 'content',
    center: [-11.0, CONTENT_DECK_Y, 5.2],
    width: 5.4,
    depth: 4.8,
    height: CONTENT_DECK_Y,
    thickness: 0.92,
    accent: '#00D4FF',
    secondaryAccent: '#1E88E5',
    surfaceTint: '#061430',
    signPlacement: 'top',
  };

  // 4. SHORT-TERM & LONG-TERM MEMORY (Back-right)
  const memoryZone: CampusZone = {
    id: 'memory-infra-zone',
    label: 'SHORT-TERM &\nLONG-TERM MEMORY',
    kind: 'memory',
    center: [-1.8, MEMORY_DECK_Y, -8.3],
    width: 6.4,
    depth: 6.0,
    height: MEMORY_DECK_Y,
    thickness: 1.0,
    accent: '#A855F7',
    secondaryAccent: '#00D8FF',
    surfaceTint: '#0D1030',
    signPlacement: 'top',
  };

  // 5. PROCESS STUDIO (Far right, hot magenta)
  const processZone: CampusZone = {
    id: 'process-studio-zone',
    label: 'PROCESS STUDIO',
    kind: 'process',
    center: [7.0, PROCESS_DECK_Y, -7.6],
    width: 7.0,
    depth: 6.4,
    height: PROCESS_DECK_Y,
    thickness: 1.02,
    accent: '#FF2AA6',
    secondaryAccent: '#7C3AED',
    surfaceTint: '#190B2E',
    signPlacement: 'top',
  };

  // 6. TOOL ORCHESTRATION (Front-right foreground, warm amber gold)
  const toolsZone: CampusZone = {
    id: 'tool-orchestration-zone',
    label: 'TOOL ORCHESTRATION',
    kind: 'tools',
    center: [11.0, TOOLS_DECK_Y, 2.8],
    width: 6.6,
    depth: 6.6,
    height: TOOLS_DECK_Y,
    thickness: 0.98,
    accent: '#FFAE00',
    secondaryAccent: '#00D8FF',
    surfaceTint: '#17121E',
    signPlacement: 'front',
  };

  const zones: CampusZone[] = [commandZone, hubZone, contentZone, memoryZone, processZone, toolsZone];

  // Place live Tectonic modules neatly on their corresponding islands without obscuring central hero sculptures
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
  const placeOnZone = (ids: string[], zone: CampusZone, slots: [number, number][]) => {
    ids.forEach((m, idx) => {
      const [ox, oz] = slots[idx % slots.length];
      stations[m] = [zone.center[0] + ox, zone.height, zone.center[2] + oz];
    });
  };

  placeOnZone(grouped.hub, hubZone, [
    [1.85, 1.85],
    [-1.95, 1.85],
    [1.95, -1.85],
    [-1.95, -1.85],
  ]);
  placeOnZone(grouped.content, contentZone, [
    [-1.15, 0.35],
    [1.25, 0.35],
    [0, -1.2],
  ]);
  placeOnZone(grouped.memory, memoryZone, [
    [-1.75, 0.75],
    [1.75, 0.75],
    [-1.75, -1.35],
    [1.75, -1.35],
  ]);
  placeOnZone(grouped.process, processZone, [
    [-1.95, 1.55],
    [1.85, 1.55],
    [-1.95, -1.25],
    [1.85, -1.25],
  ]);
  placeOnZone(grouped.tools, toolsZone, [
    [1.75, 1.65],
    [-1.85, 1.65],
    [1.75, -1.65],
    [-1.85, -1.65],
  ]);

  // Glowing neon glass walkways linking every connected platform
  const cmdLeft = commandZone.center[0] - commandZone.width / 2;
  const cmdRight = commandZone.center[0] + commandZone.width / 2;
  const cmdBack = commandZone.center[2] - commandZone.depth / 2;

  const bridges: CampusBridge[] = [
    // Agent Command Zone <-> Command Center
    {
      id: 'bridge-cmd-hub',
      from: [cmdLeft + 0.08, COMMAND_DECK_Y, -1.0],
      to: [hubZone.center[0] + hubZone.width / 2 - 0.08, HUB_DECK_Y, -1.0],
      width: 1.5,
      accent: '#00D8FF',
      secondaryAccent: '#2563EB',
    },
    // Agent Command Zone <-> Content Studio - RCP
    {
      id: 'bridge-cmd-content',
      from: [cmdLeft + 0.08, COMMAND_DECK_Y, 4.6],
      to: [contentZone.center[0] + contentZone.width / 2 - 0.08, CONTENT_DECK_Y, 4.6],
      width: 1.35,
      accent: '#00D4FF',
      secondaryAccent: '#38BDF8',
    },
    // Agent Command Zone <-> Short-Term & Long-Term Memory
    {
      id: 'bridge-cmd-memory',
      from: [-1.4, COMMAND_DECK_Y, cmdBack + 0.08],
      to: [-1.4, MEMORY_DECK_Y, memoryZone.center[2] + memoryZone.depth / 2 - 0.08],
      width: 1.5,
      accent: '#00D8FF',
      secondaryAccent: '#A855F7',
    },
    // Memory <-> Process Studio
    {
      id: 'bridge-memory-process',
      from: [memoryZone.center[0] + memoryZone.width / 2 - 0.08, MEMORY_DECK_Y, -7.8],
      to: [processZone.center[0] - processZone.width / 2 + 0.08, PROCESS_DECK_Y, -7.8],
      width: 1.45,
      accent: '#38BDF8',
      secondaryAccent: '#FF2AA6',
    },
    // Agent Command Zone <-> Process Studio
    {
      id: 'bridge-cmd-process',
      from: [cmdRight - 0.08, COMMAND_DECK_Y, -1.6],
      to: [processZone.center[0] - 0.6, PROCESS_DECK_Y, processZone.center[2] + processZone.depth / 2 - 0.08],
      width: 1.35,
      accent: '#38BDF8',
      secondaryAccent: '#FF2AA6',
    },
    // Agent Command Zone <-> Tool Orchestration
    {
      id: 'bridge-cmd-tools',
      from: [cmdRight - 0.08, COMMAND_DECK_Y, 3.0],
      to: [toolsZone.center[0] - toolsZone.width / 2 + 0.08, TOOLS_DECK_Y, 3.0],
      width: 1.55,
      accent: '#00D8FF',
      secondaryAccent: '#FFAE00',
    },
    // Command Center <-> Memory
    {
      id: 'bridge-hub-memory',
      from: [hubZone.center[0] + hubZone.width / 2 - 0.08, HUB_DECK_Y, -4.4],
      to: [memoryZone.center[0] - memoryZone.width / 2 + 0.08, MEMORY_DECK_Y, -6.4],
      width: 1.15,
      accent: '#00E5FF',
      secondaryAccent: '#A855F7',
    },
  ];

  // Satellite pads: iconic front-left wireframe globe pad + subtle stepped glowing floor accent plinths
  const satellites: SatellitePad[] = [
    {
      id: 'sat-globe',
      center: [-10.1, 0.56, 10.6],
      width: 3.4,
      depth: 3.4,
      thickness: 0.68,
      accent: '#00F0FF',
      feature: 'globe',
      tetherTo: [contentZone.center[0] + 0.6, CONTENT_DECK_Y, contentZone.center[2] + contentZone.depth / 2],
    },
    {
      id: 'sat-front-plinth',
      center: [-3.8, 0.34, 11.4 + extraDepth * 0.5],
      width: 2.3,
      depth: 2.3,
      thickness: 0.44,
      accent: '#00D8FF',
      feature: 'plinth',
    },
    {
      id: 'sat-right-accent',
      center: [16.2, 0.3, -2.5],
      width: 2.0,
      depth: 2.0,
      thickness: 0.38,
      accent: '#7C3AED',
      feature: 'accent',
    },
  ];

  const builderDais = hasBuilder
    ? {
        center: builderPos,
        baseY: COMMAND_DECK_Y,
        topY: BUILDER_DAIS_Y,
      }
    : null;

  const boundXs: number[] = [];
  const boundZs: number[] = [];
  for (const z of zones) {
    boundXs.push(z.center[0] - z.width / 2, z.center[0] + z.width / 2);
    boundZs.push(z.center[2] - z.depth / 2, z.center[2] + z.depth / 2);
  }
  for (const s of satellites) {
    boundXs.push(s.center[0] - s.width / 2, s.center[0] + s.width / 2);
    boundZs.push(s.center[2] - s.depth / 2, s.center[2] + s.depth / 2);
  }
  const minX = Math.min(...boundXs) - 0.8;
  const maxX = Math.max(...boundXs) + 0.8;
  const minZ = Math.min(...boundZs) - 0.8;
  const maxZ = Math.max(...boundZs) + 0.8;
  const width = maxX - minX;
  const depth = maxZ - minZ;

  return {
    desks,
    stations,
    zones,
    bridges,
    satellites,
    builderDais,
    center: [(minX + maxX) / 2, 0.65, (minZ + maxZ) / 2],
    radius: Math.max(width, depth) * 0.45,
    width,
    depth,
  };
}


