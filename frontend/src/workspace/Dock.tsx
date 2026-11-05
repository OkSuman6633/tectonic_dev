import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { LatestEvent } from '../components/command/EventTicker';
import { WINDOWS } from './windows';
import { ALL_WINDOWS, useWorkspaceStore, type WindowId } from './useWorkspaceStore';

/** App-icon style tiles (macOS dock look): gradient squircle + white glyph. */
const TILES: Record<WindowId, string> = {
  chat: 'linear-gradient(160deg, #5AC8FA 0%, #3B82F6 55%, #6366F1 100%)',
  command: 'linear-gradient(160deg, #67E8F9 0%, #06B6D4 50%, #0E7490 100%)',
  blueprint: 'linear-gradient(160deg, #C4B5FD 0%, #8B5CF6 55%, #6D28D9 100%)',
  roster: 'linear-gradient(160deg, #6EE7B7 0%, #10B981 55%, #047857 100%)',
  events: 'linear-gradient(160deg, #FDE68A 0%, #F59E0B 55%, #EA580C 100%)',
  sandbox: 'linear-gradient(160deg, #3F3F46 0%, #18181B 100%)',
  inspector: 'linear-gradient(160deg, #93C5FD 0%, #3B82F6 55%, #1D4ED8 100%)',
  knowledge: 'linear-gradient(160deg, #A5F3FC 0%, #22D3EE 45%, #0E7490 100%)',
  finops: 'linear-gradient(160deg, #BBF7D0 0%, #22C55E 50%, #15803D 100%)',
  promptops: 'linear-gradient(160deg, #F5D0FE 0%, #C084FC 50%, #7E22CE 100%)',
  audit: 'linear-gradient(160deg, #FEF3C7 0%, #F59E0B 50%, #B45309 100%)',
};

const BASE = 44;
const MAX = 66;
const RANGE = 130;

function DockIcon({ id, mouseX }: { id: WindowId; mouseX: MotionValue<number> }) {
  const ref = useRef<HTMLButtonElement>(null);
  const def = WINDOWS[id];
  const Icon = def.icon;
  const [hover, setHover] = useState(false);
  const minimized = useWorkspaceStore((s) => s.minimized.includes(id));
  const closed = useWorkspaceStore((s) => s.closed.includes(id));
  const solo = useWorkspaceStore((s) => s.maximized === id);
  const { spotlight, exitMaximize } = useWorkspaceStore.getState();

  // Distance from the cursor to this icon's centre drives its size (macOS magnification).
  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const sizeTarget = useTransform(distance, [-RANGE, 0, RANGE], [BASE, MAX, BASE], { clamp: true });
  const size = useSpring(sizeTarget, { mass: 0.1, stiffness: 170, damping: 14 });
  const glyph = useTransform(size, (s) => s * 0.46);

  const running = !closed;
  const label = solo ? `${def.title} · click to go back to all windows` : def.title;

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="glass pointer-events-none absolute -top-9 whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-medium text-[var(--studio-text)]"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.button
        ref={ref}
        type="button"
        style={{ width: size, height: size, background: TILES[id] }}
        whileTap={{ scale: 0.88 }}
        onHoverStart={() => setHover(true)}
        onHoverEnd={() => setHover(false)}
        onClick={() => (solo ? exitMaximize() : spotlight(id))}
        aria-label={solo ? `Back to all windows from ${def.title}` : `Open ${def.title} full size`}
        aria-pressed={solo}
        title=""
        className={`relative flex items-center justify-center rounded-[24%] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.35)] ${minimized ? 'opacity-80' : ''} ${solo ? 'ring-2 ring-sky-300/80 ring-offset-2 ring-offset-transparent' : ''}`}
      >
        <motion.span style={{ width: glyph, height: glyph }} className="flex items-center justify-center">
          <Icon className="h-full w-full text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" strokeWidth={2} style={id === 'sandbox' ? { color: '#4ADE80' } : undefined} />
        </motion.span>
        {def.DockBadge && (
          <span className="absolute -right-1 -top-1">
            <def.DockBadge />
          </span>
        )}
      </motion.button>
      {/* Running indicator */}
      <span className={`mt-1 h-1 w-1 rounded-full transition-opacity ${running ? 'bg-[var(--studio-text)] opacity-70' : 'opacity-0'}`} />
    </div>
  );
}

/** macOS-style floating dock: every window has an icon; open/minimized windows show a dot. */
export function Dock({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  const mouseX = useMotionValue(Infinity);

  return (
    <footer className="pointer-events-none relative z-30 flex h-[78px] shrink-0 items-end justify-center pb-2">
      <div className="glass pointer-events-auto absolute bottom-3 left-3 hidden h-9 w-[min(34vw,440px)] items-center rounded-xl px-2 lg:flex">
        <LatestEvent onSelectAgent={onSelectAgent} />
      </div>
      <motion.nav
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        aria-label="Dock"
        className="dock-shelf pointer-events-auto flex h-[62px] items-end gap-2.5 rounded-[20px] px-2.5 pb-1"
      >
        {ALL_WINDOWS.map((id) => (
          <DockIcon key={id} id={id} mouseX={mouseX} />
        ))}
      </motion.nav>
    </footer>
  );
}
