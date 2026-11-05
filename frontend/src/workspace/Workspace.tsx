import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard } from 'lucide-react';
import { WindowFrame } from './WindowFrame';
import { WINDOWS } from './windows';
import { ALL_WINDOWS, GRID_COLS, GRID_ROWS, useWorkspaceStore } from './useWorkspaceStore';

const MARGIN: [number, number] = [12, 12];
const PADDING: [number, number] = [14, 12];

/** Measure the container so rows can be sized to fill the viewport exactly. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function Workspace({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  const [containerRef, { width, height }] = useSize<HTMLDivElement>();
  const layouts = useWorkspaceStore((s) => s.layouts);
  const minimized = useWorkspaceStore((s) => s.minimized);
  const closed = useWorkspaceStore((s) => s.closed);
  const maximized = useWorkspaceStore((s) => s.maximized);
  const viewNonce = useWorkspaceStore((s) => s.viewNonce);
  const { commitLayout, exitMaximize, applyPreset } = useWorkspaceStore.getState();
  const [interacting, setInteracting] = useState(false);

  const open = useMemo(() => ALL_WINDOWS.filter((id) => !minimized.includes(id) && !closed.includes(id)), [minimized, closed]);
  const layout: Layout[] = useMemo(
    () => open.map((id) => ({ i: id, ...layouts[id], minW: WINDOWS[id].minW, minH: WINDOWS[id].minH })),
    [open, layouts],
  );
  const rowHeight = Math.max(18, (height - PADDING[1] * 2 - MARGIN[1] * (GRID_ROWS - 1)) / GRID_ROWS);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc restores a maximized window unless a drawer/modal inside it wants Esc first.
      if (e.key === 'Escape' && !document.querySelector('aside[class*="z-20"]')) exitMaximize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, exitMaximize]);

  return (
    <div ref={containerRef} className={`relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${interacting ? 'select-none' : ''}`}>
      <AnimatePresence>
        {maximized && (
          <motion.div
            key="max-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[35] bg-black/40 backdrop-blur-sm"
            onClick={exitMaximize}
          />
        )}
      </AnimatePresence>

      {width > 0 && open.length > 0 && (
        <GridLayout
          className="workspace-grid"
          width={width}
          cols={GRID_COLS}
          rowHeight={rowHeight}
          margin={MARGIN}
          containerPadding={PADDING}
          layout={layout}
          compactType="vertical"
          draggableHandle=".window-drag"
          draggableCancel=".window-controls"
          resizeHandles={['se']}
          isDraggable={!maximized}
          isResizable={!maximized}
          useCSSTransforms
          onDragStart={() => setInteracting(true)}
          onResizeStart={() => setInteracting(true)}
          onDragStop={(l) => { setInteracting(false); commitLayout(l); }}
          onResizeStop={(l) => { setInteracting(false); commitLayout(l); }}
          // While one module is maximized the grid may re-flow behind it: never save that as the layout.
          onLayoutChange={(l) => { if (!interacting && !maximized) commitLayout(l); }}
        >
          {open.map((id) => {
            const def = WINDOWS[id];
            const Status = def.Status;
            return (
              // A maximized module is shown alone; the others stay mounted (state kept) but hidden.
              <div key={id} className={maximized === id ? 'window-maximized' : maximized ? 'invisible' : ''}>
                <WindowFrame id={id} title={def.title} icon={def.icon} accent={def.accent} status={Status ? <Status /> : undefined}>
                  {/* Keyed by viewNonce: "refresh all views" remounts the content so it reloads its data. */}
                  <Fragment key={viewNonce}>{def.render({ onSelectAgent })}</Fragment>
                </WindowFrame>
              </div>
            );
          })}
        </GridLayout>
      )}

      {width > 0 && open.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <LayoutDashboard className="mx-auto mb-2 h-6 w-6 text-[var(--studio-text-muted)]" />
            <p className="text-sm text-[var(--studio-text-secondary)]">No open windows. Pick one from the Dock.</p>
            <button type="button" onClick={() => applyPreset('build')} className="mt-3 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-[12px] font-medium text-sky-300 hover:bg-sky-400/20">
              Restore the Build layout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
