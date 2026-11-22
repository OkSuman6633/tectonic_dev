import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sparkles } from '@react-three/drei';
import { ACESFilmicToneMapping, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useReducedMotion } from 'framer-motion';
import { Bot, Building2, Eye, EyeOff, Focus, LocateFixed, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { startSimulation } from '../../services/telemetrySimulator';
import { useIsLightTheme } from '../../hooks/useIsLightTheme';
import { AgentTelemetryPanel } from '../command/AgentTelemetryPanel';
import { ModuleTelemetryPanel } from '../command/ModuleTelemetryPanel';
import { STATE_STYLES } from '../command/agentStateStyles';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import { DARK_PALETTE, Desk, LIGHT_PALETTE } from './Desk';
import { Station } from './Station';
import { COURIER_COLORS, Couriers } from './Couriers';
import {
  CampusPlatform,
  CommandIslandLandmarks,
  DeepVoidBackdrop,
  MemoryIslandLandmarks,
  SatelliteCluster,
  SkyBridge,
} from './CampusArchitecture';
import { layoutOffice, type OfficeLayout } from './officeLayout';
import { getOfficeFocusTarget } from './officeCamera';

/** Strong elevated isometric camera vector (~45° diagonal azimuth, ~37° elevation) framing all floating islands. */
const VIEW_DIR = new Vector3(0.84, 0.78, 0.88).normalize();
const LABELS_KEY = 'tectonic.office.labels';

/** Glides the camera to frame the campus, focus a selected entity, reset the default isometric angle, or step zoom. */
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
    const target = new Vector3(layout.center[0] + 0.5, layout.center[1] + 0.4, layout.center[2] + 0.2);
    // Tight isometric framing so the multi-island campus fills ~80% of the viewport cleanly
    const distance = (layout.radius * 1.66 + 2.8) * Math.max(1, 1.38 / aspect);
    goal.current = {
      target,
      pos: target.clone().addScaledVector(VIEW_DIR, distance),
      until: performance.now() + 900,
    };
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusTarget) return;
    const target = new Vector3(focusTarget[0], focusTarget[1] + 0.85, focusTarget[2]);
    const distance = Math.max(11.5, Math.min(18.5, layout.radius * 0.78));
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
    const dist = Math.max(8, Math.min(115, offset.length() * (zoomDelta.step > 0 ? 0.8 : 1.25)));
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
  const light = useIsLightTheme();
  const reducedMotion = useReducedMotion();
  const palette = light ? LIGHT_PALETTE : DARK_PALETTE;
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

  const commandZone = layout.zones.find((z) => z.kind === 'command') ?? null;
  const safetyZone = layout.zones.find((z) => z.kind === 'safety') ?? null;
  const memoryZone = layout.zones.find((z) => z.kind === 'memory') ?? null;
  const toolsZone = layout.zones.find((z) => z.kind === 'tools') ?? null;
  const shadowExtent = Math.max(24, layout.radius + 8);

  return (
    <>
      {/* Depth fog blending outer floating void tiles smoothly into luminous deep electric blue */}
      <fog attach="fog" args={[light ? '#DBEAFE' : '#041230', 58, 145]} />

      {/* Primary ambient & directional lighting rig for realistic metallic depth and crisp shadows */}
      <ambientLight intensity={light ? 0.6 : 0.62} color={light ? '#F8FAFC' : '#C8E0FF'} />
      <hemisphereLight args={[light ? '#FFFFFF' : '#A5D0FF', light ? '#B8CAE2' : '#081B40', light ? 0.95 : 1.15]} />
      <directionalLight
        position={[layout.center[0] + 16, 26, layout.center[2] + 18]}
        intensity={light ? 1.55 : 2.2}
        color={light ? '#FFFFFF' : '#EBF5FF'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={2}
        shadow-camera-far={95}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {/* Cool back-left rim light catching architectural bevels and glass towers */}
      <directionalLight
        position={[layout.center[0] - 20, 14, layout.center[2] - 18]}
        intensity={light ? 0.5 : 0.85}
        color="#38BDF8"
      />

      {/* Distinct zone-colored atmospheric accent pools */}
      {commandZone && (
        <pointLight
          position={[commandZone.center[0], 7.0, commandZone.center[2]]}
          color="#2DD4FF"
          intensity={light ? 1.2 : 2.8}
          distance={28}
          decay={1.5}
        />
      )}
      {safetyZone && (
        <pointLight
          position={[safetyZone.center[0], 6.0, safetyZone.center[2]]}
          color="#14B8A6"
          intensity={light ? 1.0 : 2.2}
          distance={22}
          decay={1.5}
        />
      )}
      {memoryZone && (
        <pointLight
          position={[memoryZone.center[0], 6.2, memoryZone.center[2]]}
          color="#FBBF24"
          intensity={light ? 1.0 : 2.5}
          distance={24}
          decay={1.5}
        />
      )}
      {toolsZone && (
        <pointLight
          position={[toolsZone.center[0], 6.4, toolsZone.center[2]]}
          color="#F43F98"
          intensity={light ? 1.0 : 2.6}
          distance={24}
          decay={1.5}
        />
      )}

      {/* Open deep-electric-blue void backdrop with floating architectural micro-tiles (no walls, no office floor) */}
      <DeepVoidBackdrop center={layout.center} light={light} />

      {/* Independent elevated 3D floating island platforms with visible thickness & glowing perimeters */}
      {layout.zones.map((zone) => (
        <CampusPlatform key={zone.id} zone={zone} light={light} />
      ))}

      {/* Glowing translucent skybridges linking independent islands across spatial gaps */}
      {layout.bridges.map((bridge) => (
        <SkyBridge key={bridge.id} bridge={bridge} light={light} />
      ))}

      {/* Satellite floating pads off Agent Command's left flank */}
      <SatelliteCluster satellites={layout.satellites} light={light} />

      {/* Integrated sci-fi campus landmarks on Agent Command & Memory islands */}
      {commandZone && (
        <CommandIslandLandmarks zone={commandZone} builderDais={layout.builderDais} light={light} />
      )}
      {memoryZone && <MemoryIslandLandmarks zone={memoryZone} />}

      {/* Subtle ambient environmental particles drifting above the floating campus */}
      <Sparkles
        count={light ? 34 : 85}
        scale={[layout.width + 6, 5.5, layout.depth + 6]}
        position={[layout.center[0], 2.8, layout.center[2]]}
        size={2.1}
        speed={reducedMotion ? 0 : 0.18}
        opacity={light ? 0.28 : 0.5}
        color={light ? '#0284C7' : '#38BDF8'}
      />

      {/* Real Tectonic Modules & Agents */}
      {Object.entries(layout.stations).map(([id, pos]) => (
        <Station key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}
      {Object.entries(layout.desks).map(([id, pos]) => (
        <Desk key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}

      {/* Runtime-driven communication pathways, directional particles & courier fleet */}
      <Couriers layout={layout} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.25}
        maxPolarAngle={1.28}
        minDistance={8}
        maxDistance={120}
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
    const cutoff = Date.now() / 1000 - 1.1;
    return s.moduleOrder.filter(
      (id) => ['busy', 'booting'].includes(s.modules[id]?.state ?? '') || (s.moduleCalls[id]?.at(-1)?.startedAt ?? 0) > cutoff,
    ).length;
  });
  const modules = useTelemetryStore((s) => s.moduleOrder.length);
  const btn =
    'flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[var(--studio-text-secondary)] transition-colors hover:bg-white/[0.08] hover:text-[var(--studio-text)] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-[var(--glass-bg)] px-3.5 py-1.5 shadow-xl backdrop-blur-xl">
        <Stat value={working} of={staff} label="agents working" color={STATE_STYLES.thinking.color} />
        <span className="h-3.5 w-px bg-studio-border" />
        <Stat value={serving} of={modules} label="modules serving" color={MODULE_STATE_STYLES.busy.color} />
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-xl border border-cyan-400/20 bg-[var(--glass-bg)] p-0.5 shadow-xl backdrop-blur-xl">
        <button
          type="button"
          className={btn}
          onClick={() => void startSimulation()}
          title="Simulate an agent campus workflow"
        >
          <Play className="h-3.5 w-3.5 text-cyan-300" /> Simulate
        </button>
        <span className="mx-0.5 h-3.5 w-px bg-studio-border" />
        <button type="button" className={btn} onClick={onZoomIn} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={onZoomOut} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-3.5 w-px bg-studio-border" />
        <button type="button" className={btn} onClick={onFit} title="Frame the entire 3D campus">
          <Focus className="h-3.5 w-3.5" /> Fit
        </button>
        <button type="button" className={btn} onClick={onFocus} disabled={!hasFocus} title="Focus selected agent or module">
          <LocateFixed className="h-3.5 w-3.5" /> Focus
        </button>
        <button type="button" className={btn} onClick={onReset} title="Reset isometric camera">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <button
          type="button"
          className={btn}
          onClick={toggleLabels}
          title={showLabels ? 'Show name tags only when you hover a desk or module' : 'Always show every name tag'}
        >
          {showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Labels: {showLabels ? 'always' : 'on hover'}
        </button>
      </div>
      <div className="typo-metadata pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-xl border border-cyan-400/20 bg-[var(--glass-bg)] px-3.5 py-1.5 text-[var(--studio-text-secondary)] shadow-xl backdrop-blur-xl">
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
    <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
      <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: value > 0 ? color : 'var(--studio-text)' }}>
        {value}
      </span>
      <span className="typo-metadata text-[var(--studio-text-muted)]">/ {of} {label}</span>
    </span>
  );
}

function EmptyOffice() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-xs rounded-xl border border-cyan-400/25 bg-[var(--glass-bg)] p-5 text-center shadow-2xl backdrop-blur-xl">
        <Building2 className="mx-auto mb-2 h-6 w-6 text-cyan-300" />
        <h3 className="typo-panel-heading text-[var(--studio-text)]">The campus is on standby</h3>
        <p className="typo-secondary mt-1 text-[var(--studio-text-secondary)]">
          Command workstations appear as agents spawn; memory and tool infrastructure light up as agents invoke them.
        </p>
        <button
          type="button"
          onClick={() => void startSimulation()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-[12px] font-medium text-sky-300 hover:bg-sky-400/20"
        >
          <Play className="h-3.5 w-3.5" /> Simulate office
        </button>
      </div>
    </div>
  );
}

/** Blueprint: a 3D multi-agent campus mirroring the Command Center's live telemetry (same store, same selection). */
export function Office3D() {
  const light = useIsLightTheme();
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

  const campusBackground = light
    ? 'radial-gradient(ellipse at 50% 42%, #EFF6FF 0%, #DBEAFE 52%, #C7D7EE 100%)'
    : 'radial-gradient(ellipse at 48% 42%, #0F3174 0%, #071A46 46%, #030A1E 100%)';

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: campusBackground }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 26, position: [26, 24, 28], near: 0.2, far: 450 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
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

