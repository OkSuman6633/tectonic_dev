import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type WindowId = 'chat' | 'studio_chat' | 'command' | 'blueprint' | 'roster' | 'events' | 'sandbox' | 'inspector' | 'knowledge' | 'finops' | 'promptops' | 'audit' | 'connectors' | 'images';
export type PresetId = 'build' | 'monitor' | 'debug' | 'platform' | 'studio';

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Grid is GRID_COLS x GRID_ROWS units; rows are sized so a full layout fills the viewport. */
export const GRID_COLS = 24;
export const GRID_ROWS = 24;

export const ALL_WINDOWS: WindowId[] = ['chat', 'studio_chat', 'command', 'blueprint', 'roster', 'events', 'sandbox', 'inspector', 'knowledge', 'finops', 'promptops', 'audit', 'connectors', 'images'];

interface Preset {
  label: string;
  description: string;
  layout: Partial<Record<WindowId, Cell>>;
}

// Windows absent from a preset's layout start closed (dock icon without a dot), with a fallback cell.
export const PRESETS: Record<PresetId, Preset> = {
  build: {
    label: 'Build',
    description: 'Design agents with the Architect while watching them come to life',
    layout: {
      chat: { x: 0, y: 0, w: 7, h: 24 },
      command: { x: 7, y: 0, w: 11, h: 14 },
      roster: { x: 18, y: 0, w: 6, h: 14 },
      blueprint: { x: 7, y: 14, w: 10, h: 10 },
      events: { x: 17, y: 14, w: 7, h: 10 },
    },
  },
  monitor: {
    label: 'Monitor',
    description: 'Operations view: topology and the 3D office side by side',
    layout: {
      command: { x: 0, y: 0, w: 12, h: 15 },
      blueprint: { x: 12, y: 0, w: 12, h: 15 },
      events: { x: 0, y: 15, w: 9, h: 9 },
      roster: { x: 9, y: 15, w: 5, h: 9 },
      chat: { x: 14, y: 15, w: 10, h: 9 },
    },
  },
  debug: {
    label: 'Debug',
    description: 'Run agents in the sandbox and edit their code',
    layout: {
      chat: { x: 0, y: 0, w: 6, h: 24 },
      sandbox: { x: 6, y: 0, w: 9, h: 14 },
      inspector: { x: 15, y: 0, w: 9, h: 14 },
      command: { x: 6, y: 14, w: 9, h: 10 },
      events: { x: 15, y: 14, w: 9, h: 10 },
    },
  },
  platform: {
    label: 'Platform',
    description: 'Knowledge (RAG + vectors), FinOps, PromptOps and the audit trail',
    layout: {
      knowledge: { x: 0, y: 0, w: 10, h: 14 },
      finops: { x: 10, y: 0, w: 7, h: 14 },
      promptops: { x: 17, y: 0, w: 7, h: 14 },
      audit: { x: 0, y: 14, w: 14, h: 10 },
      command: { x: 14, y: 14, w: 10, h: 10 },
    },
  },
  studio: {
    label: 'Studio',
    description: 'Unified Workspace: Gemini-style chat and 3D Blueprint side-by-side',
    layout: {
      studio_chat: { x: 0, y: 0, w: 10, h: 24 },
      blueprint: { x: 10, y: 0, w: 14, h: 24 },
    },
  },
};

/**
 * Default cell for a window that the active preset does not place. The geometry of each family
 * tiles the 24-column grid exactly (debug: 6 + 9 + 9, platform: 10 + 7 + 7) so a window restored
 * from the Dock never lands half on top of its siblings.
 */
const FALLBACK: Record<WindowId, Cell> = {
  chat: { x: 0, y: 0, w: 6, h: 24 },
  studio_chat: { x: 0, y: 0, w: 10, h: 24 },
  command: { x: 6, y: 0, w: 9, h: 14 },
  blueprint: { x: 15, y: 0, w: 9, h: 14 },
  roster: { x: 15, y: 14, w: 9, h: 10 },
  events: { x: 6, y: 14, w: 9, h: 10 },
  sandbox: { x: 6, y: 0, w: 9, h: 14 },
  inspector: { x: 15, y: 0, w: 9, h: 14 },
  knowledge: { x: 0, y: 0, w: 10, h: 14 },
  finops: { x: 10, y: 0, w: 7, h: 14 },
  promptops: { x: 17, y: 0, w: 7, h: 14 },
  audit: { x: 0, y: 14, w: 14, h: 10 },
  connectors: { x: 14, y: 0, w: 10, h: 16 },
  images: { x: 14, y: 0, w: 10, h: 16 },
};

const GRID_COLS_FALLBACK = 24;

const overlaps = (a: Cell, b: Cell) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * First cell that fits `id` without covering a window already on the grid. Restoring a window from
 * the Dock used to drop it on top of whatever the preset had placed at that cell; now it is nudged
 * to the first free slot (or a fresh row below the grid) so the layout stays readable.
 */
function freeCell(id: WindowId, s: { layouts: Record<WindowId, Cell>; closed: WindowId[]; minimized: WindowId[] }): Cell {
  const want = s.layouts[id] ?? FALLBACK[id];
  const taken = ALL_WINDOWS
    .filter((w) => w !== id && !s.closed.includes(w) && !s.minimized.includes(w))
    .map((w) => s.layouts[w])
    .filter((c): c is Cell => Boolean(c));
  if (!taken.some((c) => overlaps(c, want))) return want;
  const w = Math.min(want.w, GRID_COLS_FALLBACK);
  const h = want.h;
  const bottom = taken.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= GRID_COLS_FALLBACK; x += 1) {
      const probe = { x, y, w, h };
      if (!taken.some((c) => overlaps(c, probe))) return probe;
    }
  }
  return { x: 0, y: bottom, w, h };
}

function presetState(preset: PresetId) {
  const layout = PRESETS[preset].layout;
  return {
    preset,
    layouts: Object.fromEntries(ALL_WINDOWS.map((id) => [id, layout[id] ?? FALLBACK[id]])) as Record<WindowId, Cell>,
    minimized: [] as WindowId[],
    closed: ALL_WINDOWS.filter((id) => !layout[id]),
    maximized: null as WindowId | null,
  };
}

interface WorkspaceState {
  preset: PresetId;
  layouts: Record<WindowId, Cell>;
  /** Yellow light: parked in the dock (dot shown). */
  minimized: WindowId[];
  /** Red light: closed (dock icon, no dot). Either way the window leaves the grid. */
  closed: WindowId[];
  maximized: WindowId | null;
  focused: WindowId | null;
  attention: { id: WindowId; nonce: number } | null;
  /** Bumped by "refresh all views": every window remounts and reloads its data (not persisted). */
  viewNonce: number;
  remountWindows: () => void;

  applyPreset: (preset: PresetId) => void;
  resetLayout: () => void;
  commitLayout: (cells: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  minimize: (id: WindowId) => void;
  close: (id: WindowId) => void;
  restore: (id: WindowId) => void;
  toggleMaximize: (id: WindowId) => void;
  exitMaximize: () => void;
  focus: (id: WindowId) => void;
  /** Bring a window into view: restore it if minimized, focus it and flash its border. */
  reveal: (id: WindowId) => void;
  /** Dock click: open this module on its own, maximized (the other windows stay put, hidden behind it). */
  spotlight: (id: WindowId) => void;
}

// localStorage can throw (private mode, blocked site data); the workspace must still render.
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* not persisted */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...presetState('build'),
      focused: null,
      attention: null,
      viewNonce: 0,
      remountWindows: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),

      applyPreset: (preset) => set({ ...presetState(preset), focused: null }),
      resetLayout: () => set({ ...presetState(get().preset), focused: null }),

      commitLayout: (cells) =>
        set((s) => {
          const layouts = { ...s.layouts };
          let changed = false;
          for (const c of cells) {
            const id = c.i as WindowId;
            const prev = layouts[id];
            if (!prev || prev.x !== c.x || prev.y !== c.y || prev.w !== c.w || prev.h !== c.h) {
              layouts[id] = { x: c.x, y: c.y, w: c.w, h: c.h };
              changed = true;
            }
          }
          return changed ? { layouts } : s;
        }),

      minimize: (id) =>
        set((s) => ({
          minimized: s.minimized.includes(id) ? s.minimized : [...s.minimized, id],
          maximized: s.maximized === id ? null : s.maximized,
          focused: s.focused === id ? null : s.focused,
        })),

      close: (id) =>
        set((s) => ({
          closed: s.closed.includes(id) ? s.closed : [...s.closed, id],
          minimized: s.minimized.filter((m) => m !== id),
          maximized: s.maximized === id ? null : s.maximized,
          focused: s.focused === id ? null : s.focused,
        })),

      restore: (id) =>
        set((s) => ({
          minimized: s.minimized.filter((m) => m !== id),
          closed: s.closed.filter((m) => m !== id),
          layouts: { ...s.layouts, [id]: freeCell(id, s) },
          focused: id,
        })),

      toggleMaximize: (id) =>
        set((s) => ({
          maximized: s.maximized === id ? null : id,
          minimized: s.minimized.filter((m) => m !== id),
          closed: s.closed.filter((m) => m !== id),
          focused: id,
        })),

      exitMaximize: () => set({ maximized: null }),

      focus: (id) => { if (get().focused !== id) set({ focused: id }); },

      spotlight: (id) =>
        set((s) => ({
          minimized: s.minimized.filter((m) => m !== id),
          closed: s.closed.filter((m) => m !== id),
          maximized: id,
          focused: id,
        })),

      reveal: (id) =>
        set((s) => ({
          minimized: s.minimized.filter((m) => m !== id),
          closed: s.closed.filter((m) => m !== id),
          layouts: { ...s.layouts, [id]: freeCell(id, s) },
          maximized: s.maximized && s.maximized !== id ? null : s.maximized,
          focused: id,
          attention: { id, nonce: Date.now() },
        })),
    }),
    {
      name: 'tectonic.workspace.v3',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ preset: s.preset, layouts: s.layouts, minimized: s.minimized, closed: s.closed }),
      // Drop unknown ids / fill new windows so an old saved layout never breaks the grid.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkspaceState>;
        const layouts = { ...current.layouts };
        for (const id of ALL_WINDOWS) {
          const c = p.layouts?.[id];
          if (c && [c.x, c.y, c.w, c.h].every((n) => Number.isFinite(n)) && c.w >= 2 && c.h >= 2) layouts[id] = c;
        }
        // A window added since the layout was saved starts closed (dock icon only), not dropped onto the grid.
        const added = p.layouts ? ALL_WINDOWS.filter((id) => !p.layouts?.[id]) : [];
        return {
          ...current,
          preset: p.preset && p.preset in PRESETS ? p.preset : current.preset,
          layouts,
          minimized: (p.minimized ?? current.minimized).filter((id) => ALL_WINDOWS.includes(id)),
          closed: [...new Set([...(p.closed ?? current.closed), ...added])].filter((id) => ALL_WINDOWS.includes(id)),
        };
      },
    },
  ),
);
