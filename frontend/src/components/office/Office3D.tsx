import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, Sparkles } from '@react-three/drei';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Bot, Building2, Eye, EyeOff, Focus, Play } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { startSimulation } from '../../services/telemetrySimulator';
import { useIsLightTheme } from '../../hooks/useIsLightTheme';
import { AgentTelemetryPanel } from '../command/AgentTelemetryPanel';
import { ModuleTelemetryPanel } from '../command/ModuleTelemetryPanel';
import { STATE_STYLES } from '../command/agentStateStyles';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import { DARK_PALETTE, Desk, LIGHT_PALETTE, type OfficePalette } from './Desk';
import { Station } from './Station';
import { COURIER_COLORS, Couriers } from './Couriers';
import { layoutOffice, type OfficeLayout } from './officeLayout';

const VIEW_DIR = new Vector3(0.62, 0.72, 0.9).normalize();
const LABELS_KEY = 'tectonic.office.labels';

/** Glides the camera to frame the floor whenever the office grows (or on "fit view"). */
function CameraRig({ layout, nonce }: { layout: OfficeLayout; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const goal = useRef<{ pos: Vector3; target: Vector3; until: number } | null>(null);
  // Refit when the floor grows, the window changes shape (resize / maximize), or "Fit" is pressed.
  const key = `${Math.round(layout.radius)}:${layout.center.map((n) => Math.round(n)).join(',')}:${aspect.toFixed(1)}:${nonce}`;

  useEffect(() => {
    const target = new Vector3(...layout.center);
    const distance = (layout.radius * 1.55 + 4) * Math.max(1, 1.45 / aspect);
    goal.current = { target, pos: target.clone().addScaledVector(VIEW_DIR, distance), until: performance.now() + 900 };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const g = goal.current;
    if (!g) return;
    camera.position.lerp(g.pos, 0.09);
    controls?.target.lerp(g.target, 0.09);
    controls?.update();
    if (performance.now() > g.until) goal.current = null;
  });
  return null;
}

function Room({ layout, palette, light }: { layout: OfficeLayout; palette: OfficePalette; light: boolean }) {
  const [cx, , cz] = layout.center;
  const backZ = cz - layout.depth / 2;
  const leftX = cx - layout.width / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[layout.width, layout.depth]} />
        <meshStandardMaterial color={palette.floor} roughness={0.92} />
      </mesh>
      <Grid
        position={[cx, 0.004, cz]}
        args={[layout.width, layout.depth]}
        cellSize={0.6}
        sectionSize={3}
        cellThickness={0.5}
        sectionThickness={0.9}
        cellColor={light ? '#CBD2DC' : '#232835'}
        sectionColor={light ? '#AEB7C4' : '#323A4A'}
        fadeDistance={80}
        infiniteGrid={false}
      />
      {/* Low walls: back and left, so the floor reads as a room without blocking the view */}
      <mesh position={[cx, 0.6, backZ]} receiveShadow>
        <boxGeometry args={[layout.width, 1.2, 0.12]} />
        <meshStandardMaterial color={palette.wall} roughness={0.85} />
      </mesh>
      <mesh position={[leftX, 0.6, cz]} receiveShadow>
        <boxGeometry args={[0.12, 1.2, layout.depth]} />
        <meshStandardMaterial color={palette.wall} roughness={0.85} />
      </mesh>
      <mesh position={[cx, 1.21, backZ + 0.07]}>
        <boxGeometry args={[layout.width, 0.02, 0.02]} />
        <meshBasicMaterial color={light ? '#0891B2' : '#2DD4FF'} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      {/* Neon trim along the floor's open edges */}
      <mesh position={[cx, 0.01, cz + layout.depth / 2]}>
        <boxGeometry args={[layout.width, 0.02, 0.05]} />
        <meshBasicMaterial color={light ? '#7C3AED' : '#A78BFA'} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh position={[cx + layout.width / 2, 0.01, cz]}>
        <boxGeometry args={[0.05, 0.02, layout.depth]} />
        <meshBasicMaterial color={light ? '#7C3AED' : '#A78BFA'} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      {/* Drifting motes give the room depth (cheap: one points object) */}
      <Sparkles count={70} scale={[layout.width, 4, layout.depth]} position={[cx, 2, cz]} size={2.2} speed={0.25}
                opacity={light ? 0.35 : 0.55} color={light ? '#0891B2' : '#7DD3FC'} />
    </group>
  );
}

function Scene({ showLabels, fitNonce }: { showLabels: boolean; fitNonce: number }) {
  const light = useIsLightTheme();
  const palette = light ? LIGHT_PALETTE : DARK_PALETTE;
  const topology = useTelemetryStore(
    (s) => ({ order: s.agentOrder, parents: s.agentOrder.map((id) => s.agents[id]?.parentId ?? '').join('|'), modules: s.moduleOrder }),
    shallow,
  );
  const layout = useMemo(() => {
    const { agents } = useTelemetryStore.getState();
    return layoutOffice(topology.order, agents, topology.modules);
  }, [topology]);

  return (
    <>
      {/* No scene background or fog: the canvas is transparent so the floor sits on the window glass. */}
      <ambientLight intensity={light ? 0.45 : 0.35} />
      <hemisphereLight args={[light ? '#FFFFFF' : '#B8C7E6', light ? '#C9D0DB' : '#1A1E27', light ? 0.9 : 0.85]} />
      <directionalLight
        position={[layout.center[0] + 8, 16, layout.center[2] + 10]}
        intensity={light ? 1.5 : 1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-layout.radius - 4}
        shadow-camera-right={layout.radius + 4}
        shadow-camera-top={layout.radius + 4}
        shadow-camera-bottom={-layout.radius - 4}
        shadow-bias={-0.0004}
      />
      <Room layout={layout} palette={palette} light={light} />
      {Object.entries(layout.stations).map(([id, pos]) => (
        <Station key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}
      {Object.entries(layout.desks).map(([id, pos]) => (
        <Desk key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}
      <Couriers layout={layout} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={1.22} minDistance={6} maxDistance={90} />
      <CameraRig layout={layout} nonce={fitNonce} />
    </>
  );
}

function Hud({ onFit, showLabels, toggleLabels }: { onFit: () => void; showLabels: boolean; toggleLabels: () => void }) {
  const working = useTelemetryStore((s) => s.agentOrder.filter((id) => ['thinking', 'tool_execution'].includes(s.agents[id]?.state ?? '')).length);
  const staff = useTelemetryStore((s) => s.agentOrder.length);
  const serving = useTelemetryStore((s) => {
    const cutoff = Date.now() / 1000 - 1.1;
    return s.moduleOrder.filter((id) => ['busy', 'booting'].includes(s.modules[id]?.state ?? '') || (s.moduleCalls[id]?.at(-1)?.startedAt ?? 0) > cutoff).length;
  });
  const modules = useTelemetryStore((s) => s.moduleOrder.length);
  const btn = 'flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-[var(--studio-text-secondary)] transition-colors hover:bg-white/[0.06] hover:text-[var(--studio-text)]';

  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-3 rounded-lg border border-studio-border bg-[var(--glass-bg)] px-3 py-1.5 shadow-lg backdrop-blur-md">
        <Stat value={working} of={staff} label="agents working" color={STATE_STYLES.thinking.color} />
        <span className="h-3.5 w-px bg-studio-border" />
        <Stat value={serving} of={modules} label="modules serving" color={MODULE_STATE_STYLES.busy.color} />
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-studio-border bg-[var(--glass-bg)] p-0.5 shadow-lg backdrop-blur-md">
        <button type="button" className={btn} onClick={onFit} title="Frame the whole office"><Focus className="h-3.5 w-3.5" /> Fit</button>
        <button type="button" className={btn} onClick={toggleLabels}
                title={showLabels ? 'Show name tags only when you hover a desk or module' : 'Always show every name tag'}>
          {showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Labels: {showLabels ? 'always' : 'on hover'}
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-studio-border bg-[var(--glass-bg)] px-3 py-1.5 font-mono text-[10px] text-[var(--studio-text-secondary)] backdrop-blur-md">
        {[
          ['Thinking', STATE_STYLES.thinking.color],
          ['Calling tool', STATE_STYLES.tool_execution.color],
          ['Ready', STATE_STYLES.idle.color],
          ['Error', STATE_STYLES.error.color],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            {label}
          </span>
        ))}
        {[
          ['Courier · delegation', COURIER_COLORS.delegation],
          ['Courier · module call', COURIER_COLORS.module],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1">
            <Bot className="h-3 w-3" style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

function Stat({ value, of, label, color }: { value: number; of: number; label: string; color: string }) {
  return (
    <span className="flex items-baseline gap-1 font-mono">
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: value > 0 ? color : 'var(--studio-text)' }}>{value}</span>
      <span className="text-[10px] text-[var(--studio-text-muted)]">/ {of} {label}</span>
    </span>
  );
}

function EmptyOffice() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-xs rounded-xl border border-studio-border bg-[var(--glass-bg)] p-5 text-center backdrop-blur-md">
        <Building2 className="mx-auto mb-2 h-6 w-6 text-violet-300" />
        <h3 className="text-sm font-semibold text-[var(--studio-text)]">The office is empty</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--studio-text-secondary)]">
          Desks appear as agents spawn; module stations light up as agents use them.
        </p>
        <button type="button" onClick={() => void startSimulation()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-[11.5px] font-medium text-sky-300 hover:bg-sky-400/20">
          <Play className="h-3.5 w-3.5" /> Simulate office
        </button>
      </div>
    </div>
  );
}

/** Blueprint: a 3D office mirroring the Command Center's live telemetry (same store, same selection). */
export function Office3D() {
  // Name tags appear on hover by default; "always" is remembered per browser.
  const [showLabels, setShowLabels] = useState(() => {
    try { return localStorage.getItem(LABELS_KEY) === 'always'; } catch { return false; }
  });
  const toggleLabels = () => setShowLabels((v) => {
    try { localStorage.setItem(LABELS_KEY, v ? 'hover' : 'always'); } catch { /* not persisted */ }
    return !v;
  });
  const [fitNonce, setFitNonce] = useState(0);
  const empty = useTelemetryStore((s) => s.agentOrder.length === 0 && s.moduleOrder.length === 0);
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const selectModule = useTelemetryStore((s) => s.selectModule);

  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 32, position: [18, 18, 22], near: 0.1, far: 400 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => {
          const s = useTelemetryStore.getState();
          if (s.selectionOrigin === 'office') { selectAgent(null); selectModule(null); }
        }}
      >
        <Suspense fallback={null}>
          <Scene showLabels={showLabels} fitNonce={fitNonce} />
        </Suspense>
      </Canvas>
      <Hud onFit={() => setFitNonce((n) => n + 1)} showLabels={showLabels} toggleLabels={toggleLabels} />
      {empty && <EmptyOffice />}
      <AgentTelemetryPanel host="office" />
      <ModuleTelemetryPanel host="office" />
    </div>
  );
}

export default Office3D;
