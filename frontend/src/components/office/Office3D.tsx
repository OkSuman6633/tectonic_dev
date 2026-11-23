import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Building2, Eye, EyeOff, Focus, LocateFixed, Play, RotateCcw, Users, Wrench, ZoomIn, ZoomOut } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { startSimulation } from '../../services/telemetrySimulator';
import { AgentTelemetryPanel } from '../command/AgentTelemetryPanel';
import { ModuleTelemetryPanel } from '../command/ModuleTelemetryPanel';
import { STATE_STYLES } from '../command/agentStateStyles';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import { Desk, LIGHT_PALETTE } from './Desk';
import { Station } from './Station';
import { COURIER_COLORS, Couriers } from './Couriers';
import { OfficeEnvironment } from './OfficeEnvironment';
import { layoutOffice, type OfficeLayout } from './officeLayout';
import { getOfficeFocusTarget } from './officeCamera';

/** Warm isometric 3/4 room camera vector matching cozy sunlit diorama framing. */
const VIEW_DIR = new Vector3(0.76, 0.64, 0.78).normalize();
const LABELS_KEY = 'tectonic.office.labels';

/** Glides the camera to frame the office, focus a selected employee or resource, reset angle, or step zoom. */
function CameraRig({
  layout,
  fitNonce,
  resetNonce,
  focusNonce,
  zoomDelta,
  focusTarget,
}: {
  layout: OfficeLayout;
  fitNonce: number;
  resetNonce: number;
  focusNonce: number;
  zoomDelta: { step: number; nonce: number };
  focusTarget: [number, number, number] | null;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const goal = useRef<{ pos: Vector3; target: Vector3; until: number } | null>(null);

  const fitKey = `${Math.round(layout.radius)}:${layout.center.map((n) => Math.round(n)).join(',')}:${aspect.toFixed(1)}:${fitNonce}:${resetNonce}`;
  const focusKey = `${focusTarget?.join(',') ?? ''}:${focusNonce}`;

  useEffect(() => {
    const target = new Vector3(layout.center[0] - 0.35, layout.center[1] + 0.15, layout.center[2] - 0.25);
    const distance = (layout.radius * 1.9 + 3.4) * Math.max(1, 1.32 / aspect);
    goal.current = {
      target,
      pos: target.clone().addScaledVector(VIEW_DIR, distance),
      until: performance.now() + 900,
    };
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusTarget) return;
    const target = new Vector3(focusTarget[0], focusTarget[1] + 0.85, focusTarget[2]);
    const distance = Math.max(9.5, Math.min(16, layout.radius * 0.9));
    goal.current = {
      target,
      pos: target.clone().addScaledVector(VIEW_DIR, distance),
      until: performance.now() + 850,
    };
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (zoomDelta.nonce === 0) return;
    const currentTarget = controls ? controls.target.clone() : new Vector3(...layout.center);
    const offset = camera.position.clone().sub(currentTarget);
    const dist = Math.max(7, Math.min(85, offset.length() * (zoomDelta.step > 0 ? 0.8 : 1.25)));
    offset.normalize().multiplyScalar(dist);
    goal.current = {
      target: currentTarget,
      pos: currentTarget.clone().add(offset),
      until: performance.now() + 450,
    };
  }, [zoomDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const g = goal.current;
    if (!g) return;
    camera.position.lerp(g.pos, 0.12);
    controls?.target.lerp(g.target, 0.12);
    controls?.update();
    if (performance.now() > g.until) goal.current = null;
  });
  return null;
}

function Scene({
  showLabels,
  fitNonce,
  resetNonce,
  focusNonce,
  zoomDelta,
}: {
  showLabels: boolean;
  fitNonce: number;
  resetNonce: number;
  focusNonce: number;
  zoomDelta: { step: number; nonce: number };
}) {
  const palette = LIGHT_PALETTE;
  const topology = useTelemetryStore(
    (s) => ({
      order: s.agentOrder,
      parents: s.agentOrder.map((id) => s.agents[id]?.parentId ?? '').join('|'),
      modules: s.moduleOrder,
    }),
    shallow,
  );
  const layout = useMemo(() => {
    const { agents } = useTelemetryStore.getState();
    return layoutOffice(topology.order, agents, topology.modules);
  }, [topology]);

  const selectedAgentId = useTelemetryStore((s) => s.selectedAgentId);
  const selectedModuleId = useTelemetryStore((s) => s.selectedModuleId);
  const focusTarget = getOfficeFocusTarget(layout, selectedAgentId, selectedModuleId);
  const shadowExtent = Math.max(20, layout.radius + 7);

  return (
    <>
      {/* Soft warm atmospheric depth matching studio backdrop */}
      <fog attach="fog" args={['#EDE6DB', 48, 120]} />

      {/* Warm natural daylight lighting rig streaming through office windows */}
      <ambientLight intensity={0.78} color="#FFF8EE" />
      <hemisphereLight args={['#FFFDF7', '#C9B294', 0.85]} />
      <directionalLight
        position={[layout.center[0] - 14, 24, layout.center[2] - 12]}
        intensity={1.95}
        color="#FFF5E1"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={2}
        shadow-camera-far={95}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
      {/* Gentle cool sky bounce fill from opposite side for soft cozy shading */}
      <directionalLight
        position={[layout.center[0] + 18, 14, layout.center[2] + 16]}
        intensity={0.58}
        color="#DCEBFF"
      />
      {/* Warm interior pendant & lounge lamp accents */}
      <pointLight position={[-7.2, 3.0, -5.4]} color="#FFE8B8" intensity={1.1} distance={14} decay={2} />
      <pointLight position={[7.4, 3.0, -5.4]} color="#FFE8B8" intensity={1.1} distance={14} decay={2} />
      <pointLight position={[-7.5, 2.1, 6.0]} color="#FFDDA1" intensity={0.95} distance={10} decay={2} />

      {/* Sunlit modern isometric office shell, glass partitions, lounge, cafe, plants & conference room */}
      <OfficeEnvironment layout={layout} />

      {/* Interactive Live Resource Workstations (Tectonic Modules) */}
      {Object.entries(layout.stations).map(([id, pos]) => (
        <Station
          key={id}
          id={id}
          position={pos}
          facingYaw={layout.stationFacings[id]}
          palette={palette}
          showLabel={showLabels}
        />
      ))}

      {/* Modern Ergonomic Employee Desks & Chairs */}
      {Object.entries(layout.desks).map(([id, pos]) => (
        <Desk key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}

      {/* Living Articulated Human Employees with A* Pathfinding & Real Telemetry Workflows */}
      <Couriers layout={layout} showLabels={showLabels} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.28}
        maxPolarAngle={1.32}
        minDistance={7}
        maxDistance={85}
      />
      <CameraRig
        layout={layout}
        fitNonce={fitNonce}
        resetNonce={resetNonce}
        focusNonce={focusNonce}
        zoomDelta={zoomDelta}
        focusTarget={focusTarget}
      />
    </>
  );
}

function Hud({
  onFit,
  onReset,
  onFocus,
  onZoomIn,
  onZoomOut,
  hasFocus,
  showLabels,
  toggleLabels,
}: {
  onFit: () => void;
  onReset: () => void;
  onFocus: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  hasFocus: boolean;
  showLabels: boolean;
  toggleLabels: () => void;
}) {
  const working = useTelemetryStore((s) =>
    s.agentOrder.filter((id) => ['thinking', 'tool_execution', 'running'].includes(s.agents[id]?.state ?? '')).length,
  );
  const staff = useTelemetryStore((s) => s.agentOrder.length);
  const serving = useTelemetryStore((s) => {
    const cutoff = Date.now() / 1000 - 1.6;
    return s.moduleOrder.filter(
      (id) => ['busy', 'booting'].includes(s.modules[id]?.state ?? '') || (s.moduleCalls[id]?.at(-1)?.startedAt ?? 0) > cutoff,
    ).length;
  });
  const modules = useTelemetryStore((s) => s.moduleOrder.length);

  const pillSurface =
    'rounded-xl border border-stone-300/80 bg-white/88 shadow-[0_6px_24px_rgba(30,24,18,0.10)] backdrop-blur-md';
  const pillBtn =
    'flex h-8 items-center gap-1.5 px-3 text-[12.5px] font-medium text-slate-700 transition-colors hover:bg-stone-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40';
  const iconBtn =
    'flex h-8 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-stone-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <>
      {/* Top-Left Live Office Stats Pill */}
      <div className={`pointer-events-none absolute left-3.5 top-3.5 z-10 flex items-center gap-3.5 px-3.5 py-2 ${pillSurface}`}>
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          <Stat value={working} of={staff} label="employees active" color={STATE_STYLES.running.color} />
        </span>
        <span className="h-4 w-px bg-stone-300" />
        <span className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-600" />
          <Stat value={serving} of={modules} label="resources in use" color={MODULE_STATE_STYLES.busy.color} />
        </span>
      </div>

      {/* Top-Right Camera & Simulation Controls */}
      <div className="absolute right-3.5 top-3.5 z-10 flex items-center gap-2">
        <div className={`flex items-center gap-0.5 px-1 ${pillSurface}`}>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900"
            onClick={() => void startSimulation()}
            title="Simulate an employee workflow across the office"
          >
            <Play className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Simulate</span>
          </button>
          <span className="mx-0.5 h-3.5 w-px bg-stone-300" />
          <button type="button" className={iconBtn} onClick={onZoomIn} title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={iconBtn} onClick={onZoomOut} title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={iconBtn} onClick={onFocus} disabled={!hasFocus} title="Focus selected employee or workstation">
            <LocateFixed className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={iconBtn} onClick={onReset} title="Reset isometric camera">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          className={`${pillSurface} ${pillBtn}`}
          onClick={onFit}
          title="Frame the entire 3D office"
        >
          <Focus className="h-3.5 w-3.5 text-blue-600" />
          <span>Fit</span>
        </button>

        <button
          type="button"
          className={`${pillSurface} ${pillBtn}`}
          onClick={toggleLabels}
          title={showLabels ? 'Show name tags only on hover or active tasks' : 'Always show every employee and workstation tag'}
        >
          {showLabels ? <Eye className="h-3.5 w-3.5 text-blue-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-500" />}
          <span>Labels: {showLabels ? 'always' : 'on hover'}</span>
        </button>
      </div>

      {/* Bottom-Left Human Workflow Status Legend */}
      <div
        className={`pointer-events-none absolute bottom-3.5 left-3.5 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[12px] text-slate-700 ${pillSurface}`}
      >
        {[
          { label: 'Thinking', color: '#D97706' },
          { label: 'Working', color: '#2563EB' },
          { label: 'At desk', color: '#10B981' },
          { label: 'Error', color: '#EF4444' },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 font-medium">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: COURIER_COLORS.delegation }} />
          Team collaboration
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: COURIER_COLORS.module }} />
          Resource visit
        </span>
      </div>
    </>
  );
}

function Stat({ value, of, label, color }: { value: number; of: number; label: string; color: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="font-mono text-[14px] font-bold tabular-nums" style={{ color: value > 0 ? color : '#0F172A' }}>
        {value}
      </span>
      <span className="text-[12.5px] font-medium text-slate-600">
        / {of} {label}
      </span>
    </span>
  );
}

function EmptyOffice() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-xs rounded-2xl border border-stone-300/90 bg-white/94 p-5 text-center shadow-xl backdrop-blur-md">
        <Building2 className="mx-auto mb-2 h-6 w-6 text-amber-600" />
        <h3 className="typo-panel-heading text-slate-900">The office is ready for the team</h3>
        <p className="typo-secondary mt-1 text-slate-600">
          Employees take their desks as agents come online and walk to specialized workstations as tasks execute.
        </p>
        <button
          type="button"
          onClick={() => void startSimulation()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Play className="h-3.5 w-3.5" /> Simulate office
        </button>
      </div>
    </div>
  );
}

/** Living 3D AI Office view mirroring live Tectonic telemetry with articulated human employees. */
export function Office3D() {
  const [showLabels, setShowLabels] = useState(() => {
    try {
      return localStorage.getItem(LABELS_KEY) === 'always';
    } catch {
      return false;
    }
  });
  const toggleLabels = () =>
    setShowLabels((v) => {
      try {
        localStorage.setItem(LABELS_KEY, v ? 'hover' : 'always');
      } catch {
        /* not persisted */
      }
      return !v;
    });
  const [fitNonce, setFitNonce] = useState(0);
  const [resetNonce, setResetNonce] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  const [zoomDelta, setZoomDelta] = useState<{ step: number; nonce: number }>({ step: 0, nonce: 0 });

  const empty = useTelemetryStore((s) => s.agentOrder.length === 0 && s.moduleOrder.length === 0);
  const selectedAgentId = useTelemetryStore((s) => s.selectedAgentId);
  const selectedModuleId = useTelemetryStore((s) => s.selectedModuleId);
  const hasFocus = !!(selectedAgentId || selectedModuleId);
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const selectModule = useTelemetryStore((s) => s.selectModule);

  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  const studioBackdrop =
    'radial-gradient(ellipse at 50% 42%, #FAF6F0 0%, #EFE8DC 55%, #E3D9CA 100%)';

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: studioBackdrop }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 26, position: [24, 20, 24], near: 0.2, far: 300 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.04,
        }}
        onPointerMissed={() => {
          const s = useTelemetryStore.getState();
          if (s.selectionOrigin === 'office') {
            selectAgent(null);
            selectModule(null);
          }
        }}
      >
        <Suspense fallback={null}>
          <Scene
            showLabels={showLabels}
            fitNonce={fitNonce}
            resetNonce={resetNonce}
            focusNonce={focusNonce}
            zoomDelta={zoomDelta}
          />
        </Suspense>
      </Canvas>
      <Hud
        onFit={() => setFitNonce((n) => n + 1)}
        onReset={() => {
          selectAgent(null);
          selectModule(null);
          setResetNonce((n) => n + 1);
        }}
        onFocus={() => {
          if (hasFocus) setFocusNonce((n) => n + 1);
        }}
        onZoomIn={() => setZoomDelta((z) => ({ step: 1, nonce: z.nonce + 1 }))}
        onZoomOut={() => setZoomDelta((z) => ({ step: -1, nonce: z.nonce + 1 }))}
        hasFocus={hasFocus}
        showLabels={showLabels}
        toggleLabels={toggleLabels}
      />
      {empty && <EmptyOffice />}
      <AgentTelemetryPanel host="office" />
      <ModuleTelemetryPanel host="office" />
    </div>
  );
}

export default Office3D;

