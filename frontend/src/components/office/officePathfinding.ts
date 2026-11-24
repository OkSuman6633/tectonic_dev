import { OFFICE_FLOOR_Y, type CampusBridge, type CampusZone, type ObstacleRect, type OfficeLayout, type Vec3 } from './officeLayout.ts';

export interface Point2D {
  x: number;
  z: number;
}

export interface Waypoint3D {
  x: number;
  y: number;
  z: number;
  /** Non-null when this waypoint lies on a physical skybridge (enables bridge illumination & lane-safe steering). */
  bridgeId?: string;
}

const CELL_SIZE = 0.55;
const AGENT_MARGIN = 0.34;

export interface NavGrid {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  cellSize: number;
  blocked: Uint8Array;
  layout: OfficeLayout;
}

export function buildNavGrid(layout: OfficeLayout): NavGrid {
  const { minX, maxX, minZ, maxZ } = layout.floorBounds;
  const pad = 0.45;
  const gMinX = minX + pad;
  const gMaxX = maxX - pad;
  const gMinZ = minZ + pad;
  const gMaxZ = maxZ - pad;
  const cols = Math.max(4, Math.ceil((gMaxX - gMinX) / CELL_SIZE));
  const rows = Math.max(4, Math.ceil((gMaxZ - gMinZ) / CELL_SIZE));
  const blocked = new Uint8Array(cols * rows);

  const isInsideObstacle = (wx: number, wz: number, obs: ObstacleRect): boolean =>
    wx >= obs.minX - AGENT_MARGIN &&
    wx <= obs.maxX + AGENT_MARGIN &&
    wz >= obs.minZ - AGENT_MARGIN &&
    wz <= obs.maxZ + AGENT_MARGIN;

  for (let r = 0; r < rows; r++) {
    const wz = gMinZ + (r + 0.5) * CELL_SIZE;
    for (let c = 0; c < cols; c++) {
      const wx = gMinX + (c + 0.5) * CELL_SIZE;
      for (const obs of layout.obstacles) {
        if (isInsideObstacle(wx, wz, obs)) {
          blocked[r * cols + c] = 1;
          break;
        }
      }
    }
  }

  return { minX: gMinX, minZ: gMinZ, cols, rows, cellSize: CELL_SIZE, blocked, layout };
}

function worldToCell(grid: NavGrid, x: number, z: number): [number, number] {
  const c = Math.max(0, Math.min(grid.cols - 1, Math.floor((x - grid.minX) / grid.cellSize)));
  const r = Math.max(0, Math.min(grid.rows - 1, Math.floor((z - grid.minZ) / grid.cellSize)));
  return [c, r];
}

function cellToWorld(grid: NavGrid, c: number, r: number): Point2D {
  return {
    x: grid.minX + (c + 0.5) * grid.cellSize,
    z: grid.minZ + (r + 0.5) * grid.cellSize,
  };
}

function findNearestWalkable(grid: NavGrid, startC: number, startR: number): [number, number] {
  if (!grid.blocked[startR * grid.cols + startC]) return [startC, startR];
  for (let radius = 1; radius <= 10; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const nc = startC + dc;
        const nr = startR + dr;
        if (nc >= 0 && nc < grid.cols && nr >= 0 && nr < grid.rows && !grid.blocked[nr * grid.cols + nc]) {
          return [nc, nr];
        }
      }
    }
  }
  return [startC, startR];
}

function hasLineOfSight(grid: NavGrid, a: Point2D, b: Point2D): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.ceil(dist / (grid.cellSize * 0.45)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const [c, r] = worldToCell(grid, a.x + dx * t, a.z + dz * t);
    if (grid.blocked[r * grid.cols + c]) return false;
  }
  return true;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Runs 8-way A* exclusively inside the central human office floor. */
function findInteriorPath(grid: NavGrid, startPt: Point2D, goalPt: Point2D): Waypoint3D[] {
  if (Math.hypot(goalPt.x - startPt.x, goalPt.z - startPt.z) < 0.22) {
    return [{ x: goalPt.x, y: OFFICE_FLOOR_Y, z: goalPt.z }];
  }
  if (hasLineOfSight(grid, startPt, goalPt)) {
    return [
      { x: startPt.x, y: OFFICE_FLOOR_Y, z: startPt.z },
      { x: goalPt.x, y: OFFICE_FLOOR_Y, z: goalPt.z },
    ];
  }

  const [sc0, sr0] = worldToCell(grid, startPt.x, startPt.z);
  const [gc0, gr0] = worldToCell(grid, goalPt.x, goalPt.z);
  const [sc, sr] = findNearestWalkable(grid, sc0, sr0);
  const [gc, gr] = findNearestWalkable(grid, gc0, gr0);

  const total = grid.cols * grid.rows;
  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const inOpen = new Uint8Array(total);

  const startIdx = sr * grid.cols + sc;
  const goalIdx = gr * grid.cols + gc;
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(gc - sc, gr - sr);

  const open: number[] = [startIdx];
  inOpen[startIdx] = 1;

  while (open.length > 0) {
    let bestPos = 0;
    let current = open[0];
    let bestF = fScore[current];
    for (let i = 1; i < open.length; i++) {
      const idx = open[i];
      if (fScore[idx] < bestF) {
        bestF = fScore[idx];
        current = idx;
        bestPos = i;
      }
    }

    if (current === goalIdx) break;

    open.splice(bestPos, 1);
    inOpen[current] = 0;
    closed[current] = 1;

    const cc = current % grid.cols;
    const cr = Math.floor(current / grid.cols);

    for (const [dc, dr, stepCost] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;
      const nIdx = nr * grid.cols + nc;
      if (closed[nIdx] || grid.blocked[nIdx]) continue;
      if (dc !== 0 && dr !== 0) {
        if (grid.blocked[cr * grid.cols + nc] || grid.blocked[nr * grid.cols + cc]) continue;
      }
      const tentative = gScore[current] + stepCost;
      if (tentative < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentative;
        fScore[nIdx] = tentative + Math.hypot(gc - nc, gr - nr);
        if (!inOpen[nIdx]) {
          open.push(nIdx);
          inOpen[nIdx] = 1;
        }
      }
    }
  }

  if (cameFrom[goalIdx] === -1 && startIdx !== goalIdx) {
    const mid: Point2D = { x: (startPt.x + goalPt.x) * 0.5, z: -2.2 };
    return [
      { x: startPt.x, y: OFFICE_FLOOR_Y, z: startPt.z },
      { x: mid.x, y: OFFICE_FLOOR_Y, z: mid.z },
      { x: goalPt.x, y: OFFICE_FLOOR_Y, z: goalPt.z },
    ];
  }

  const raw: Point2D[] = [];
  let trace = goalIdx;
  while (trace !== -1) {
    const tc = trace % grid.cols;
    const tr = Math.floor(trace / grid.cols);
    raw.push(cellToWorld(grid, tc, tr));
    trace = cameFrom[trace];
  }
  raw.reverse();
  raw[0] = startPt;
  raw[raw.length - 1] = goalPt;

  // String-pull smoothing to eliminate zig-zag staircasing
  const smoothed: Point2D[] = [raw[0]];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let furthest = anchor + 1;
    for (let j = raw.length - 1; j > anchor + 1; j--) {
      if (hasLineOfSight(grid, raw[anchor], raw[j])) {
        furthest = j;
        break;
      }
    }
    smoothed.push(raw[furthest]);
    anchor = furthest;
  }

  return smoothed.map((p) => ({ x: p.x, y: OFFICE_FLOOR_Y, z: p.z }));
}

function isInsideOffice(layout: OfficeLayout, pt: Vec3): boolean {
  const b = layout.floorBounds;
  return pt[0] >= b.minX - 0.15 && pt[0] <= b.maxX + 0.15 && pt[2] >= b.minZ - 0.15 && pt[2] <= b.maxZ + 0.15;
}

function findExternalZoneForPoint(layout: OfficeLayout, pt: Vec3): CampusZone | null {
  for (const z of layout.externalZones) {
    const halfW = z.width / 2 + 0.8;
    const halfD = z.depth / 2 + 0.8;
    if (Math.abs(pt[0] - z.center[0]) <= halfW && Math.abs(pt[2] - z.center[2]) <= halfD) {
      return z;
    }
  }
  return null;
}

function findBridgeForPoint(layout: OfficeLayout, pt: Vec3): CampusBridge | null {
  let best: { bridge: CampusBridge; dist: number } | null = null;
  for (const br of layout.bridges) {
    const ax = br.from[0];
    const az = br.from[2];
    const bx = br.to[0];
    const bz = br.to[2];
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[2] - az) * dz) / lenSq));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dist = Math.hypot(pt[0] - px, pt[2] - pz);
    if (dist <= br.width * 0.75 + 0.75 && (!best || dist < best.dist)) {
      best = { bridge: br, dist };
    }
  }
  return best?.bridge ?? null;
}

function bridgeWaypoints(bridge: CampusBridge, outbound: boolean, laneOffset = 0): Waypoint3D[] {
  const start = outbound ? bridge.from : bridge.to;
  const end = outbound ? bridge.to : bridge.from;
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const len = Math.hypot(dx, dz) || 1;
  // Perpendicular lane offset so opposing walkers pass side-by-side cleanly on the bridge
  const perpX = (-dz / len) * laneOffset;
  const perpZ = (dx / len) * laneOffset;

  const steps = 4;
  const pts: Waypoint3D[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: start[0] + dx * t + perpX,
      y: start[1] + (end[1] - start[1]) * t,
      z: start[2] + dz * t + perpZ,
      bridgeId: bridge.id,
    });
  }
  return pts;
}

function appendUnique(target: Waypoint3D[], next: Waypoint3D[]) {
  for (const pt of next) {
    const prev = target[target.length - 1];
    if (prev && Math.hypot(prev.x - pt.x, prev.z - pt.z) < 0.14 && Math.abs(prev.y - pt.y) < 0.08) {
      if (pt.bridgeId && !prev.bridgeId) prev.bridgeId = pt.bridgeId;
      continue;
    }
    target.push(pt);
  }
}

/**
 * Computes a collision-free, elevation-aware 3D walking route across the connected campus:
 * - Inside the central human office: 8-way A* around desks, lounge, cafe, and meeting table.
 * - Between office and external futuristic platforms: physically crosses the exact connecting skybridge
 *   (smoothly ascending/descending the bridge slope) without ever flying or cutting over open space.
 * - Between two external platforms: returns via bridge A -> office A* -> bridge B -> platform B.
 */
export function findOfficePath(grid: NavGrid, start: Vec3, goal: Vec3, laneOffset = 0): Waypoint3D[] {
  const { layout } = grid;
  const startInOffice = isInsideOffice(layout, start);
  const goalInOffice = isInsideOffice(layout, goal);

  // Case 1: Both inside central human office
  if (startInOffice && goalInOffice) {
    return findInteriorPath(grid, { x: start[0], z: start[2] }, { x: goal[0], z: goal[2] });
  }

  const startExtZone = startInOffice ? null : findExternalZoneForPoint(layout, start);
  const goalExtZone = goalInOffice ? null : findExternalZoneForPoint(layout, goal);
  const startBridge = startInOffice
    ? null
    : startExtZone
      ? layout.bridges.find((b) => b.zoneId === startExtZone.id) ?? null
      : findBridgeForPoint(layout, start);
  const goalBridge = goalInOffice
    ? null
    : goalExtZone
      ? layout.bridges.find((b) => b.zoneId === goalExtZone.id) ?? null
      : findBridgeForPoint(layout, goal);

  // Case 2: Both on the SAME external platform -> walk directly on that platform deck
  if (startExtZone && goalExtZone && startExtZone.id === goalExtZone.id) {
    return [
      { x: start[0], y: startExtZone.height, z: start[2] },
      { x: goal[0], y: goalExtZone.height, z: goal[2] },
    ];
  }

  const result: Waypoint3D[] = [];

  // Phase A: Exit starting external platform (or current bridge) back to office portal
  let officeStart: Point2D = { x: start[0], z: start[2] };
  if (!startInOffice && startBridge) {
    if (startExtZone) {
      appendUnique(result, [
        { x: start[0], y: startExtZone.height, z: start[2] },
        { x: startBridge.platformEntry[0], y: startBridge.platformEntry[1], z: startBridge.platformEntry[2] },
      ]);
      appendUnique(result, bridgeWaypoints(startBridge, false, -laneOffset));
    } else {
      // Currently mid-bridge: head smoothly to bridge office anchor
      appendUnique(result, [
        { x: start[0], y: start[1], z: start[2], bridgeId: startBridge.id },
        { x: startBridge.from[0], y: startBridge.from[1], z: startBridge.from[2], bridgeId: startBridge.id },
      ]);
    }
    appendUnique(result, [{ x: startBridge.officeEntry[0], y: OFFICE_FLOOR_Y, z: startBridge.officeEntry[2] }]);
    officeStart = { x: startBridge.officeEntry[0], z: startBridge.officeEntry[2] };
  }

  // Phase B: Navigate through central office aisles via A*
  const officeGoal: Point2D = goalInOffice
    ? { x: goal[0], z: goal[2] }
    : goalBridge
      ? { x: goalBridge.officeEntry[0], z: goalBridge.officeEntry[2] }
      : { x: goal[0], z: goal[2] };

  appendUnique(result, findInteriorPath(grid, officeStart, officeGoal));

  // Phase C: Cross physical skybridge to destination external platform and walk to target module station
  if (!goalInOffice && goalBridge) {
    appendUnique(result, bridgeWaypoints(goalBridge, true, laneOffset));
    appendUnique(result, [
      { x: goalBridge.platformEntry[0], y: goalBridge.platformEntry[1], z: goalBridge.platformEntry[2] },
      { x: goal[0], y: goalExtZone?.height ?? goalBridge.platformEntry[1], z: goal[2] },
    ]);
  }

  return result.length > 0 ? result : [{ x: goal[0], y: goal[1], z: goal[2] }];
}

/**
 * Computes a gentle lateral steering vector so multiple walking employees avoid overlapping each other.
 * Automatically dampens steering on narrow bridges so walkers stay safely within bridge guardrails.
 */
export function computeAvoidanceOffset(
  selfId: string,
  selfPos: Point2D,
  others: Record<string, Point2D>,
  minSeparation = 0.88,
  onBridge = false,
): Point2D {
  let pushX = 0;
  let pushZ = 0;
  const scale = onBridge ? 0.22 : 0.52;
  for (const [id, pos] of Object.entries(others)) {
    if (id === selfId) continue;
    const dx = selfPos.x - pos.x;
    const dz = selfPos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001 && d < minSeparation) {
      const strength = (minSeparation - d) / minSeparation;
      pushX += (dx / d) * strength * scale;
      pushZ += (dz / d) * strength * scale;
    }
  }
  return { x: pushX, z: pushZ };
}
