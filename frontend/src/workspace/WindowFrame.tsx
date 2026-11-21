import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWorkspaceStore, type WindowId } from './useWorkspaceStore';

interface WindowFrameProps {
  id: WindowId;
  title: string;
  icon: LucideIcon;
  accent: string;
  status?: ReactNode;
  children: ReactNode;
}

export function WindowFrame({ id, title, icon: Icon, accent, status, children }: WindowFrameProps) {
  const focused = useWorkspaceStore((s) => s.focused === id);
  const maximized = useWorkspaceStore((s) => s.maximized === id);
  const attentionNonce = useWorkspaceStore((s) => (s.attention?.id === id ? s.attention.nonce : 0));
  const { focus, minimize, close, toggleMaximize } = useWorkspaceStore.getState();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!attentionNonce) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1900);
    return () => clearTimeout(t);
  }, [attentionNonce]);

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}
      onPointerDownCapture={() => focus(id)}
      aria-label={title}
      className={`studio-window flex h-full flex-col overflow-hidden ${focused ? 'is-focused' : ''} ${flash ? 'attention' : ''}`}
    >
      <header
        className="window-drag studio-window-header relative flex h-9 shrink-0 cursor-default items-center border-b px-3 select-none"
        onDoubleClick={() => toggleMaximize(id)}
      >
        {/* macOS traffic lights: close (to dock, no dot) · minimize (to dock) · zoom */}
        <div className="window-controls traffic z-10 shrink-0">
          <button type="button" className="tl-close" onClick={() => close(id)} title="Close" aria-label={`Close ${title}`}>
            <X />
          </button>
          <button type="button" className="tl-min" onClick={() => minimize(id)} title="Minimize" aria-label={`Minimize ${title}`}>
            <Minus />
          </button>
          <button
            type="button"
            className="tl-zoom"
            onClick={() => toggleMaximize(id)}
            title={maximized ? 'Exit full size (Esc)' : 'Zoom'}
            aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`}
          >
            {maximized ? <Minimize2 /> : <Maximize2 />}
          </button>
        </div>

        {/* Centered title, like a native window */}
        <div className="pointer-events-none absolute inset-x-24 flex items-center justify-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
          <h2 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--studio-text)]">{title}</h2>
        </div>

        {status && <div className="z-10 ml-auto flex min-w-0 items-center gap-2 overflow-hidden">{status}</div>}
      </header>
      <div className="window-body relative min-h-0 flex-1">{children}</div>
    </motion.section>
  );
}
