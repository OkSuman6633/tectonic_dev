import type { AgentMeta } from '../../types/telemetry';
import { BUILDER_ID } from '../command/agentStateStyles.ts';

export type Vec3 = [number, number, number];

export type CampusZoneKind = 'command' | 'memory' | 'tools' | 'safety';

export interface CampusZone {
  id: string;
  label: string;
  subtitle: string;
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
  /** Secondary highlight accent color. */
  secondaryAccent: string;
  /** Platform deck surface tint (dark theme). */
  surfaceTint: string;
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
  feature: 'spire' | 'grid' | 'cubes';
  tetherTo: Vec3;
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

// Elevations of independent floating islands (top surface Y)
const COMMAND_DECK_Y = 0.5;
const BUILDER_DAIS_Y = 1.24;
const GATEWAY_DECK_Y = 0.68;
const MEMORY_DECK_Y = 0.58;
const TOOLS_DECK_Y = 0.78;

const PLATFORM_GAP = 2.05;

const DESK_SPACING_X = 3.15;
const DESK_SPACING_Z = 2.95;
const DESKS_PER_ROW = 3;
const MODULE_SPACING_X = 3.85;
const MODULE_SPACING_Z = 3.25;

const MEMORY_MODULES = new Set(['short_term_memory', 'long_term_memory', 'agentic_rag', 'vector_db']);
const TOOL_MODULES = new Set(['tool_orchestration', 'finops', 'promptops']);

export function moduleZoneKind(moduleId: string): CampusZoneKind {
  if (MEMORY_MODULES.has(moduleId)) return 'memory';
  if (TOOL_MODULES.has(moduleId)) return 'tools';
  return 'safety';
}

/**
 * Multi-island futuristic isometric campus layout:
 * - Island 1 (Left / Upper-Left, Deep Blue & Cyan): Agent Command Campus with elevated white/silver
 *   Command Center Dais for agent_builder, terraced workstation rows, cyan ziggurat, glass towers,
 *   and 3 flanking floating satellite pads.
 * - Island 2 (Upper-Center-Right, Deep Slate & Turquoise): Cognitive Gateway (Guardrails, Intent Detection).
 * - Island 3 (Lower-Center, Obsidian, Warm Gold & Royal Violet): Memory Infrastructure (Short-Term & Long-Term Memory).
 * - Island 4 (Far-Right, Obsidian, Hot Pink/Magenta & Cyan): Tool Orchestration.
 *
 * Depends strictly on topology (agent ids, parent hierarchy, module list) so coordinates remain stable across telemetry ticks.
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

  const desks: Record<string, Vec3> = {};
  const commandCenterX = -4.6;
  const builderZ = -3.3;
  const hasBuilder = Boolean(agents[BUILDER_ID]);
  if (hasBuilder) {
    desks[BUILDER_ID] = [commandCenterX, BUILDER_DAIS_Y, builderZ];
  }

  const workerRows = Math.max(1, Math.ceil(orderedWorkers.length / DESKS_PER_ROW));
  orderedWorkers.forEach((id, i) => {
    const row = Math.floor(i / DESKS_PER_ROW);
    const inRow = Math.min(DESKS_PER_ROW, orderedWorkers.length - row * DESKS_PER_ROW);
    const col = i % DESKS_PER_ROW;
    const x = commandCenterX + (col - (inRow - 1) / 2) * DESK_SPACING_X;
    const z = 0.25 + row * DESK_SPACING_Z;
    desks[id] = [x, COMMAND_DECK_Y, z];
  });

  // Compute Agent Command Island footprint with generous architectural wings for ziggurat, glass towers & front data blocks
  const zones: CampusZone[] = [];
  let commandZone: CampusZone | null = null;
  if (Object.keys(desks).length > 0) {
    const dxs = Object.values(desks).map((p) => p[0]);
    const dzs = Object.values(desks).map((p) => p[2]);
    const minDX = Math.min(commandCenterX - 3.3, ...dxs) - 3.35;
    const maxDX = Math.max(commandCenterX + 3.3, ...dxs) + 3.15;
    const minDZ = Math.min(builderZ - 0.3, ...dzs) - 2.35;
    const maxDZ = Math.max(0.25 + (workerRows - 1) * DESK_SPACING_Z, ...dzs) + 2.55;
    commandZone = {
      id: 'agent-command-zone',
      label: 'AGENT COMMAND',
      subtitle: 'ORCHESTRATION & FLEET',
      kind: 'command',
      center: [(minDX + maxDX) / 2, COMMAND_DECK_Y, (minDZ + maxDZ) / 2],
      width: maxDX - minDX,
      depth: maxDZ - minDZ,
      height: COMMAND_DECK_Y,
      thickness: 1.0,
      accent: '#2DD4FF',
      secondaryAccent: '#14B8A6',
      surfaceTint: '#0D2654',
    };
    zones.push(commandZone);
  }

  // Group modules into their 3 dedicated elevated islands
  const grouped: Record<'safety' | 'memory' | 'tools', string[]> = {
    safety: [],
    memory: [],
    tools: [],
  };
  for (const m of modules) {
    const k = moduleZoneKind(m);
    if (k === 'memory' || k === 'tools' || k === 'safety') {
      grouped[k].push(m);
    }
  }
  // Place hero landmarks (long_term_memory violet pyramid, tool_orchestration tower city) in prime front-visible slots
  grouped.memory.sort((a, b) => {
    const rank = (id: string) =>
      id === 'agentic_rag' ? 0 : id === 'vector_db' ? 1 : id === 'short_term_memory' ? 2 : id === 'long_term_memory' ? 3 : 4;
    return rank(a) - rank(b);
  });
  grouped.safety.sort((a, b) => {
    const rank = (id: string) => (id === 'auditability' ? 0 : id === 'guardrails' ? 1 : id === 'intent_detection' ? 2 : 3);
    return rank(a) - rank(b);
  });
  grouped.tools.sort((a, b) => {
    const rank = (id: string) => (id === 'finops' ? 0 : id === 'promptops' ? 1 : id === 'tool_orchestration' ? 2 : 3);
    return rank(a) - rank(b);
  });

  const commandRightEdge = commandZone ? commandZone.center[0] + commandZone.width / 2 : 1.7;
  const midIslandsLeftX = commandRightEdge + PLATFORM_GAP;

  const stations: Record<string, Vec3> = {};
  let safetyZone: CampusZone | null = null;
  let memoryZone: CampusZone | null = null;
  let toolsZone: CampusZone | null = null;

  // Island 2: Cognitive Gateway (Upper-Center-Right, Deep Royal Blue & Vibrant Turquoise/Cyan)
  if (grouped.safety.length > 0) {
    const cols = Math.min(2, grouped.safety.length);
    const rows = Math.ceil(grouped.safety.length / 2);
    const zoneW = Math.max(7.8, cols * MODULE_SPACING_X + 2.0);
    const zoneD = Math.max(5.4, rows * MODULE_SPACING_Z + 2.3);
    const cx = midIslandsLeftX + zoneW / 2;
    const cz = -4.65;
    grouped.safety.forEach((m, i) => {
      const r = Math.floor(i / 2);
      const inRow = Math.min(2, grouped.safety.length - r * 2);
      const c = i % 2;
      stations[m] = [
        cx + (c - (inRow - 1) / 2) * MODULE_SPACING_X,
        GATEWAY_DECK_Y,
        cz + (r - (rows - 1) / 2) * MODULE_SPACING_Z,
      ];
    });
    safetyZone = {
      id: 'core-gateway-zone',
      label: 'COGNITIVE GATEWAY',
      subtitle: 'SAFETY & INTENT',
      kind: 'safety',
      center: [cx, GATEWAY_DECK_Y, cz],
      width: zoneW,
      depth: zoneD,
      height: GATEWAY_DECK_Y,
      thickness: 0.98,
      accent: '#22D3EE',
      secondaryAccent: '#14B8A6',
      surfaceTint: '#0C2B52',
    };
    zones.push(safetyZone);
  }

  // Island 3: Memory Infrastructure (Lower-Center, Obsidian, Warm Gold Perimeter & Royal Violet Pyramid)
  if (grouped.memory.length > 0) {
    const cols = Math.min(2, grouped.memory.length);
    const rows = Math.ceil(grouped.memory.length / 2);
    // Reserve dedicated +X terrace (+3.15 width) for the luminous Golden Network Node-Graph Matrix so zero modules ever overlap it
    const moduleAreaW = Math.max(7.2, cols * (MODULE_SPACING_X + 0.15) + 1.8);
    const graphWingW = 3.2;
    const zoneW = moduleAreaW + graphWingW;
    const zoneD = Math.max(6.4, rows * (MODULE_SPACING_Z + 0.15) + 2.65);
    const cx = midIslandsLeftX + zoneW / 2;
    const safetyBottomZ = safetyZone ? safetyZone.center[2] + safetyZone.depth / 2 : -2.0;
    const cz = safetyBottomZ + PLATFORM_GAP + zoneD / 2;
    const moduleCenterX = midIslandsLeftX + moduleAreaW / 2;
    grouped.memory.forEach((m, i) => {
      const r = Math.floor(i / 2);
      const inRow = Math.min(2, grouped.memory.length - r * 2);
      const c = i % 2;
      stations[m] = [
        moduleCenterX + (c - (inRow - 1) / 2) * (MODULE_SPACING_X + 0.15),
        MEMORY_DECK_Y,
        cz - 0.15 + (r - (rows - 1) / 2) * (MODULE_SPACING_Z + 0.15),
      ];
    });
    memoryZone = {
      id: 'memory-infra-zone',
      label: 'MEMORY CORE',
      subtitle: 'SHORT & LONG-TERM VAULT',
      kind: 'memory',
      center: [cx, MEMORY_DECK_Y, cz],
      width: zoneW,
      depth: zoneD,
      height: MEMORY_DECK_Y,
      thickness: 1.04,
      accent: '#FBBF24',
      secondaryAccent: '#A855F7',
      surfaceTint: '#151B30',
    };
    zones.push(memoryZone);
  }

  // Island 4: Tool Orchestration (Far-Right, Obsidian, Hot Pink/Magenta Border & Rose/Cyan Execution Matrix)
  if (grouped.tools.length > 0) {
    const cols = Math.min(2, grouped.tools.length);
    const rows = Math.ceil(grouped.tools.length / 2);
    const zoneW = Math.max(6.8, cols * MODULE_SPACING_X + 2.3);
    const zoneD = Math.max(6.6, rows * MODULE_SPACING_Z + 2.8);
    const midRightEdge = Math.max(
      safetyZone ? safetyZone.center[0] + safetyZone.width / 2 : midIslandsLeftX,
      memoryZone ? memoryZone.center[0] + memoryZone.width / 2 : midIslandsLeftX,
    );
    const cx = midRightEdge + PLATFORM_GAP + zoneW / 2;
    const cz = -0.35;
    grouped.tools.forEach((m, i) => {
      const r = Math.floor(i / 2);
      const inRow = Math.min(2, grouped.tools.length - r * 2);
      const c = i % 2;
      stations[m] = [
        cx + (c - (inRow - 1) / 2) * MODULE_SPACING_X,
        TOOLS_DECK_Y,
        cz + (r - (rows - 1) / 2) * MODULE_SPACING_Z,
      ];
    });
    toolsZone = {
      id: 'tool-orchestration-zone',
      label: 'TOOL ORCHESTRATION',
      subtitle: 'EXECUTION MATRIX',
      kind: 'tools',
      center: [cx, TOOLS_DECK_Y, cz],
      width: zoneW,
      depth: zoneD,
      height: TOOLS_DECK_Y,
      thickness: 1.08,
      accent: '#F43F98',
      secondaryAccent: '#2DD4FF',
      surfaceTint: '#1C1332',
    };
    zones.push(toolsZone);
  }

  // Glowing translucent skybridges linking independent islands cleanly across open gaps
  const bridges: CampusBridge[] = [];
  if (commandZone && safetyZone) {
    const zPos = Math.max(
      commandZone.center[2] - commandZone.depth / 2 + 1.8,
      safetyZone.center[2] + 0.6,
    );
    bridges.push({
      id: 'bridge-cmd-gateway',
      from: [commandZone.center[0] + commandZone.width / 2 - 0.08, COMMAND_DECK_Y, zPos],
      to: [safetyZone.center[0] - safetyZone.width / 2 + 0.08, GATEWAY_DECK_Y, zPos],
      width: 1.55,
      accent: '#2DD4FF',
      secondaryAccent: '#14B8A6',
    });
  }
  if (commandZone && memoryZone) {
    const zPos = Math.min(
      commandZone.center[2] + commandZone.depth / 2 - 2.2,
      memoryZone.center[2] - 0.6,
    );
    bridges.push({
      id: 'bridge-cmd-memory',
      from: [commandZone.center[0] + commandZone.width / 2 - 0.08, COMMAND_DECK_Y, zPos],
      to: [memoryZone.center[0] - memoryZone.width / 2 + 0.08, MEMORY_DECK_Y, zPos],
      width: 1.75,
      accent: '#2DD4FF',
      secondaryAccent: '#F59E0B',
    });
  }
  if (safetyZone && memoryZone) {
    const xPos = Math.min(
      safetyZone.center[0] + safetyZone.width / 2 - 2.2,
      memoryZone.center[0] - 0.8,
    );
    bridges.push({
      id: 'bridge-gateway-memory',
      from: [xPos, GATEWAY_DECK_Y, safetyZone.center[2] + safetyZone.depth / 2 - 0.08],
      to: [xPos, MEMORY_DECK_Y, memoryZone.center[2] - memoryZone.depth / 2 + 0.08],
      width: 1.35,
      accent: '#22D3EE',
      secondaryAccent: '#A855F7',
    });
  }
  if (memoryZone && toolsZone) {
    bridges.push({
      id: 'bridge-memory-tools',
      from: [memoryZone.center[0] + memoryZone.width / 2 - 0.08, MEMORY_DECK_Y, memoryZone.center[2] - 1.5],
      to: [toolsZone.center[0] - toolsZone.width / 2 + 0.08, TOOLS_DECK_Y, toolsZone.center[2] + 1.8],
      width: 1.65,
      accent: '#EC4899',
      secondaryAccent: '#F59E0B',
      hasBeacon: true,
    });
  }
  if (safetyZone && toolsZone) {
    bridges.push({
      id: 'bridge-gateway-tools',
      from: [safetyZone.center[0] + safetyZone.width / 2 - 0.08, GATEWAY_DECK_Y, safetyZone.center[2] + 1.1],
      to: [toolsZone.center[0] - toolsZone.width / 2 + 0.08, TOOLS_DECK_Y, toolsZone.center[2] - 1.9],
      width: 1.3,
      accent: '#EC4899',
      secondaryAccent: '#2DD4FF',
    });
  }

  // Three independent floating satellite pads off the left flank of Agent Command (matching reference composition)
  const satellites: SatellitePad[] = [];
  if (commandZone) {
    const leftEdge = commandZone.center[0] - commandZone.width / 2;
    const cz = commandZone.center[2];
    satellites.push(
      {
        id: 'sat-spire',
        center: [leftEdge - 2.75, 0.34, cz - 3.3],
        width: 2.55,
        depth: 2.55,
        thickness: 0.62,
        accent: '#2DD4FF',
        feature: 'spire',
        tetherTo: [leftEdge + 0.05, COMMAND_DECK_Y, cz - 3.3],
      },
      {
        id: 'sat-grid',
        center: [leftEdge - 2.65, 0.28, cz + 0.8],
        width: 2.35,
        depth: 2.15,
        thickness: 0.56,
        accent: '#38BDF8',
        feature: 'grid',
        tetherTo: [leftEdge + 0.05, COMMAND_DECK_Y, cz + 0.8],
      },
      {
        id: 'sat-cubes',
        center: [leftEdge - 2.45, 0.24, cz + 4.15],
        width: 2.2,
        depth: 1.95,
        thickness: 0.52,
        accent: '#14B8A6',
        feature: 'cubes',
        tetherTo: [leftEdge + 0.05, COMMAND_DECK_Y, cz + 4.15],
      },
    );
  }

  const builderDais = hasBuilder
    ? {
        center: [commandCenterX, BUILDER_DAIS_Y, builderZ] as Vec3,
        baseY: COMMAND_DECK_Y,
        topY: BUILDER_DAIS_Y,
      }
    : null;

  // Overall campus bounds across all islands & satellites
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
  const minX = boundXs.length ? Math.min(...boundXs) - 1.2 : -10;
  const maxX = boundXs.length ? Math.max(...boundXs) + 1.2 : 10;
  const minZ = boundZs.length ? Math.min(...boundZs) - 1.2 : -8;
  const maxZ = boundZs.length ? Math.max(...boundZs) + 1.2 : 8;
  const width = maxX - minX;
  const depth = maxZ - minZ;

  return {
    desks,
    stations,
    zones,
    bridges,
    satellites,
    builderDais,
    center: [(minX + maxX) / 2, 0.45, (minZ + maxZ) / 2],
    radius: Math.max(width, depth) * 0.48,
    width,
    depth,
  };
}


