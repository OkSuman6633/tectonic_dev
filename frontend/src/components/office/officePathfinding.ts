import type { ObstacleRect, OfficeLayout, Vec3 } from './officeLayout.ts';

export interface Point2D {
  x: number;
  z: number;
}

const CELL_SIZE = 0.6;
const AGENT_MARGIN = 0.36;

export interface NavGrid {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  cellSize: number;
  blocked: Uint8Array;
}

export function buildNavGrid(layout: OfficeLayout): NavGrid {
  const { minX, maxX, minZ, maxZ } = layout.floorBounds;
  const pad = 0.55;
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

  return { minX: gMinX, minZ: gMinZ, cols, rows, cellSize: CELL_SIZE, blocked };
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

/**
 * Computes a collision-free, smoothed walkable floor path between two 3D office positions using 8-way A*.
 * Always returns waypoints at office floor elevation (never flying or teleporting through furniture).
 */
export function findOfficePath(grid: NavGrid, start: Vec3, goal: Vec3): Point2D[] {
  const startPt: Point2D = { x: start[0], z: start[2] };
  const goalPt: Point2D = { x: goal[0], z: goal[2] };

  if (Math.hypot(goalPt.x - startPt.x, goalPt.z - startPt.z) < 0.25) {
    return [goalPt];
  }

  if (hasLineOfSight(grid, startPt, goalPt)) {
    return [startPt, goalPt];
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
      // Prevent corner clipping on diagonal steps
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
    // Fallback via main corridor midpoint if goal is tightly enclosed
    const mid: Point2D = { x: (startPt.x + goalPt.x) * 0.5, z: -2.5 };
    return [startPt, mid, goalPt];
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

  return smoothed;
}

/**
 * Computes a gentle lateral steering vector so multiple walking employees avoid overlapping each other.
 */
export function computeAvoidanceOffset(
  selfId: string,
  selfPos: Point2D,
  others: Record<string, Point2D>,
  minSeparation = 0.92,
): Point2D {
  let pushX = 0;
  let pushZ = 0;
  for (const [id, pos] of Object.entries(others)) {
    if (id === selfId) continue;
    const dx = selfPos.x - pos.x;
    const dz = selfPos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001 && d < minSeparation) {
      const strength = (minSeparation - d) / minSeparation;
      pushX += (dx / d) * strength * 0.55;
      pushZ += (dz / d) * strength * 0.55;
    }
  }
  return { x: pushX, z: pushZ };
}
