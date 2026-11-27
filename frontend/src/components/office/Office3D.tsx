import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, Vector3, type Material, type Mesh, type Texture } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Building2, Eye, EyeOff, Focus, LocateFixed, Play, RotateCcw, Users, Wrench, ZoomIn, ZoomOut } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { startSimulation } from '../../services/telemetrySimulator';
import { AgentTelemetryPanel } from '../command/AgentTelemetryPanel';
import { ModuleTelemetryPanel } from '../command/ModuleTelemetryPanel';
import { STATE_STYLES } from '../command/agentStateStyles';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import { Desk, DARK_PALETTE, LIGHT_PALETTE } from './Desk';
import { Station } from './Station';
import { Couriers } from './Couriers';
import { OfficeEnvironment } from './OfficeEnvironment';
import { layoutOffice, type OfficeLayout } from './officeLayout';
import { getOfficeFocusTarget } from './officeCamera';
import { ExternalCampus, type CampusActivityRefs } from './ExternalCampus';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

/** Warm isometric 3/4 room camera vector matching diorama framing with full campus visibility. */
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
    const distance = (layout.radius * 1.95 + 4.0) * Math.max(1, 1.32 / aspect);
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
    const dist = Math.max(7, Math.min(95, offset.length() * (zoomDelta.step > 0 ? 0.8 : 1.25)));
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
  isDark,
}: {
  showLabels: boolean;
  fitNonce: number;
  resetNonce: number;
  focusNonce: number;
  zoomDelta: { step: number; nonce: number };
  isDark: boolean;
}) {
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
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
  const shadowExtent = Math.max(34, layout.radius + 10);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  // Boost anisotropic filtering across all canvas/screen/sign textures so angled views remain ultra-sharp
  useEffect(() => {
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    if (maxAniso <= 1) return;
    const seen = new Set<Texture>();
    const bump = (tex: Texture | null | undefined) => {
      if (!tex || seen.has(tex)) return;
      seen.add(tex);
      if (tex.anisotropy < maxAniso) {
        tex.anisotropy = maxAniso;
        tex.needsUpdate = true;
      }
    };
    scene.traverse((obj) => {
      const mat = (obj as Mesh).material as (Material & { map?: Texture | null; emissiveMap?: Texture | null }) | Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          const typed = m as Material & { map?: Texture | null; emissiveMap?: Texture | null };
          bump(typed.map);
          bump(typed.emissiveMap);
        }
      } else {
        bump(mat.map);
        bump(mat.emissiveMap);
      }
    });
  }, [gl, scene, layout, isDark]);

  // Shared campus activity refs passed to Couriers (writer) and ExternalCampus (reader)
  const activityRef = useRef<CampusActivityRefs>({
    activeBridges: new Set(),
    activeZones: new Set(),
  });

  const bgColor = isDark ? '#040B1A' : '#EDE6DB';
  const fogArgs: [string, number, number] = isDark ? ['#040B1A', 48, 160] : ['#EDE6DB', 56, 148];

  return (
    <>
      {/* Background & atmospheric depth adapting to Light & Dark theme */}
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={fogArgs} />

      {/* Campus ambient and hemisphere lighting */}
      <ambientLight intensity={isDark ? 0.68 : 0.88} color={isDark ? '#DCEBFF' : '#FFFBF5'} />
      <hemisphereLight args={[isDark ? '#1E293B' : '#FFFDF7', isDark ? '#020617' : '#D1C4B2', isDark ? 0.85 : 0.95]} />

      {/* Main directional light casting crisp architectural shadows */}
      <directionalLight
        position={[layout.center[0] - 16, 28, layout.center[2] - 14]}
        intensity={isDark ? 1.85 : 2.15}
        color={isDark ? '#F8FAFC' : '#FFF7E6'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={2}
        shadow-camera-far={115}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.00025}
        shadow-normalBias={0.02}
      />
      {/* Cool secondary rim/fill light from opposite campus quadrant */}
      <directionalLight
        position={[layout.center[0] + 20, 16, layout.center[2] + 18]}
        intensity={isDark ? 0.62 : 0.65}
        color={isDark ? '#38BDF8' : '#E0EDFF'}
      />

      {/* Warm natural interior pendant & lounge lights preserving the cozy human office */}
      <pointLight position={[-7.2, 3.2, -6.4]} color="#FFE8B8" intensity={isDark ? 1.2 : 0.85} distance={16} decay={2} />
      <pointLight position={[7.4, 3.2, -6.4]} color="#FFE8B8" intensity={isDark ? 1.2 : 0.85} distance={16} decay={2} />
      <pointLight position={[-7.5, 2.2, 7.2]} color="#FFDDA1" intensity={isDark ? 1.0 : 0.75} distance={12} decay={2} />
      <pointLight position={[0.0, 3.4, 0.0]} color="#FFF7ED" intensity={isDark ? 1.1 : 0.9} distance={18} decay={2} />

      {/* Domain-specific glowing point lights illuminating each external facility platform */}
      {/* 1. DATA & KNOWLEDGE / MEMORY (Purple) */}
      <pointLight position={[0.0, 4.4, -20.2]} color="#C084FC" intensity={isDark ? 3.4 : 1.95} distance={26} decay={2} />
      {/* 2. OPERATIONS & SAFETY (Electric Cyan) */}
      <pointLight position={[-22.5, 4.0, -16.2]} color="#00E5FF" intensity={isDark ? 2.9 : 1.85} distance={24} decay={2} />
      {/* 3. PROCESSING & GOVERNANCE / PROCESS STUDIO (Magenta / Pink) */}
      <pointLight position={[22.5, 4.0, -16.2]} color="#F472B6" intensity={isDark ? 3.1 : 1.85} distance={24} decay={2} />
      {/* 4. PROMPTOPS & CREATIVE AI / CONTENT STUDIO (Cyan / Sky-Blue) */}
      <pointLight position={[-22.8, 3.8, 1.8]} color="#38BDF8" intensity={isDark ? 2.8 : 1.75} distance={24} decay={2} />
      {/* 5. TOOL ORCHESTRATION (Golden Amber) */}
      <pointLight position={[22.8, 3.8, 1.8]} color="#FBBF24" intensity={isDark ? 3.3 : 1.95} distance={24} decay={2} />

      {/* Surrounding Futuristic External AI Infrastructure Campus (adapts to Dark & Light) */}
      <ExternalCampus layout={layout} activityRef={activityRef} isDark={isDark} />

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
          isDark={isDark}
        />
      ))}

      {/* Modern Ergonomic Employee Desks & Chairs */}
      {Object.entries(layout.desks).map(([id, pos]) => (
        <Desk key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}

      {/* Living Articulated Human Employees with A* Pathfinding & Real Telemetry Workflows */}
      <Couriers layout={layout} showLabels={showLabels} activityRef={activityRef} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.28}
        maxPolarAngle={1.32}
        minDistance={7}
        maxDistance={95}
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
  isDark,
}: {
  onFit: () => void;
  onReset: () => void;
  onFocus: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  hasFocus: boolean;
  showLabels: boolean;
  toggleLabels: () => void;
  isDark: boolean;
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

  const pillSurface = isDark
    ? 'rounded-xl border border-slate-700/90 bg-slate-950/96 shadow-[0_10px_28px_rgba(0,0,0,0.65)] ring-1 ring-white/5 text-slate-50'
    : 'rounded-xl border border-slate-300 bg-white/98 shadow-[0_8px_24px_rgba(15,23,42,0.14)] ring-1 ring-slate-900/5 text-slate-900';

  const pillBtn = isDark
    ? 'flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
    : 'flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium text-slate-700 transition-colors hover:bg-stone-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40';

  const iconBtn = isDark
    ? 'flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35'
    : 'flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-stone-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <>
      {/* Responsive Top HUD Bar: auto-adapts & wraps cleanly to any Office3D panel width without overlap */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
        {/* Live Office Stats Pill */}
        <div className={`pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 ${pillSurface}`}>
          <span className="flex items-center gap-1.5">
            <Users className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-cyan-400' : 'text-blue-600'}`} />
            <Stat value={working} of={staff} label="agents working" color={STATE_STYLES.running.color} isDark={isDark} />
          </span>
          <span className={`h-3.5 w-px ${isDark ? 'bg-white/15' : 'bg-stone-300'}`} />
          <span className="flex items-center gap-1.5">
            <Wrench className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
            <Stat value={serving} of={modules} label="modules serving" color={MODULE_STATE_STYLES.busy.color} isDark={isDark} />
          </span>
        </div>

        {/* Camera & Simulation Controls */}
        <div className="pointer-events-auto ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5">
          <div className={`flex flex-wrap items-center gap-0.5 p-0.5 ${pillSurface}`}>
            <button
              type="button"
              className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium transition-colors ${isDark
                ? 'text-cyan-400 hover:bg-white/10 hover:text-cyan-200'
                : 'text-blue-700 hover:bg-blue-50 hover:text-blue-900'
                }`}
              onClick={() => void startSimulation()}
              title="Simulate an employee workflow across the office"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Simulate</span>
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={onZoomIn}
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={onZoomOut}
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={onFocus}
              disabled={!hasFocus}
              title={hasFocus ? 'Focus camera on selected employee or workstation' : 'Select an employee or workstation to focus'}
              aria-label="Focus on selection"
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={onReset}
              title="Reset camera and clear selection"
              aria-label="Reset camera"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            className={`${pillSurface} ${pillBtn} h-8`}
            onClick={onFit}
            title="Frame the entire 3D office and external campus"
          >
            <Focus className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-cyan-400' : 'text-blue-600'}`} />
            <span>Fit</span>
          </button>

          <button
            type="button"
            className={`${pillSurface} ${pillBtn} h-8`}
            onClick={toggleLabels}
            title={showLabels ? 'Show name tags only on hover or active tasks' : 'Always show every employee and workstation tag'}
          >
            {showLabels ? (
              <Eye className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-cyan-400' : 'text-blue-600'}`} />
            ) : (
              <EyeOff className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
            )}
            <span className="whitespace-nowrap">Labels: {showLabels ? 'always' : 'on hover'}</span>
          </button>
        </div>
      </div>

      {/* Bottom Human Workflow Status Legend (auto-wraps cleanly inside container width) */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-start">
        <div
          className={`flex max-w-full flex-wrap items-center gap-x-3.5 gap-y-1 px-3.5 py-1.5 text-[11.5px] ${isDark ? 'text-slate-200' : 'text-slate-700'
            } ${pillSurface}`}
        >
          {[
            { label: 'Thinking', color: '#EAB308' },
            { label: 'Calling tool', color: '#2563EB' },
            { label: 'Ready', color: '#10B981' },
            { label: 'Error', color: '#EF4444' },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5 whitespace-nowrap font-medium">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#38BDF8' }} />
            Courier - delegation
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#A855F7' }} />
            Courier - module call
          </span>
        </div>
      </div>
    </>
  );
}

function Stat({ value, of, label, color, isDark }: { value: number; of: number; label: string; color: string; isDark: boolean }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="font-mono text-[14px] font-bold tabular-nums" style={{ color: value > 0 ? color : (isDark ? '#F8FAFC' : '#0F172A') }}>
        {value}
      </span>
      <span className={`text-[12.5px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
        / {of} {label}
      </span>
    </span>
  );
}

function EmptyOffice({ isDark }: { isDark: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        className={`pointer-events-auto max-w-xs rounded-2xl border p-5 text-center shadow-2xl backdrop-blur-md ${isDark
          ? 'border-white/10 bg-slate-950/92 text-white'
          : 'border-stone-300/90 bg-white/94 text-slate-900'
          }`}
      >
        <Building2 className={`mx-auto mb-2 h-6 w-6 ${isDark ? 'text-amber-500' : 'text-amber-600'}`} />
        <h3 className={`typo-panel-heading ${isDark ? 'text-white' : 'text-slate-900'}`}>The office is ready for the team</h3>
        <p className={`typo-secondary mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
  const isDark = useIsDarkMode();

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

  const studioBackdrop = isDark
    ? 'radial-gradient(ellipse at 50% 35%, #071536 0%, #040B1D 60%, #020614 100%)'
    : 'radial-gradient(ellipse at 50% 40%, #FAF7F2 0%, #EFE8DD 55%, #E2D7C5 100%)';

  return (
    <div className="relative h-full w-full overflow-hidden transition-colors duration-500" style={{ background: studioBackdrop }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 26, position: [28, 22, 28], near: 0.2, far: 350 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: isDark ? 1.04 : 1.08,
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
            isDark={isDark}
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
        isDark={isDark}
      />
      {empty && <EmptyOffice isDark={isDark} />}
      <AgentTelemetryPanel host="office" />
      <ModuleTelemetryPanel host="office" />
    </div>
  );
}

export default Office3D;
