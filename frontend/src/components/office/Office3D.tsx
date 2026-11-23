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
import { AgentTelemetryPanel } from '../command/AgentTelemetryPanel';
import { ModuleTelemetryPanel } from '../command/ModuleTelemetryPanel';
import { STATE_STYLES } from '../command/agentStateStyles';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import { DARK_PALETTE, Desk } from './Desk';
import { Station } from './Station';
import { COURIER_COLORS, Couriers } from './Couriers';
import {
  AgentCommandLandmarks,
  CampusPlatform,
  CommandCenterLandmarks,
  ContentStudioLandmarks,
  MemoryLandmarks,
  NeonFloorAndBackdrop,
  ProcessStudioLandmarks,
  SatelliteCluster,
  SkyBridge,
  ToolOrchestrationLandmarks,
} from './CampusArchitecture';
import { layoutOffice, type OfficeLayout } from './officeLayout';
import { getOfficeFocusTarget } from './officeCamera';

/** Classic isometric diamond camera vector (~45° azimuth, ~33° elevation) matching Neon AI Operations Campus. */
const VIEW_DIR = new Vector3(0.76, 0.62, 0.78).normalize();
const LABELS_KEY = 'tectonic.office.labels';

/** Isometric glowing 3D cube icon matching the reference HUD legend & module counter. */
function NeonCubeIcon({ color, className = 'h-3.5 w-3.5' }: { color: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ filter: `drop-shadow(0 0 5px ${color})` }}
      aria-hidden="true"
    >
      <path d="M12 2.5L20.5 7.25V16.75L12 21.5L3.5 16.75V7.25L12 2.5Z" fill={`${color}35`} stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 2.5V12M12 12L20.5 7.25M12 12L3.5 7.25M12 12V21.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    const target = new Vector3(layout.center[0] + 0.15, layout.center[1] + 0.5, layout.center[2] + 0.2);
    const distance = (layout.radius * 1.9 + 2.4) * Math.max(1, 1.38 / aspect);
    goal.current = {
      target,
      pos: target.clone().addScaledVector(VIEW_DIR, distance),
      until: performance.now() + 900,
    };
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusTarget) return;
    const target = new Vector3(focusTarget[0], focusTarget[1] + 0.75, focusTarget[2]);
    const distance = Math.max(11.5, Math.min(18.5, layout.radius * 0.85));
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
    const dist = Math.max(8, Math.min(125, offset.length() * (zoomDelta.step > 0 ? 0.8 : 1.25)));
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
  const reducedMotion = useReducedMotion();
  const palette = DARK_PALETTE;
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
  const hubZone = layout.zones.find((z) => z.kind === 'hub') ?? null;
  const contentZone = layout.zones.find((z) => z.kind === 'content') ?? null;
  const memoryZone = layout.zones.find((z) => z.kind === 'memory') ?? null;
  const processZone = layout.zones.find((z) => z.kind === 'process') ?? null;
  const toolsZone = layout.zones.find((z) => z.kind === 'tools') ?? null;
  const shadowExtent = Math.max(26, layout.radius + 10);

  return (
    <>
      {/* Deep midnight neon-blue atmospheric fog */}
      <fog attach="fog" args={['#02091E', 52, 130]} />

      {/* Crisp neon studio lighting rig for bright white robots, glossy dark decks & vivid accents */}
      <ambientLight intensity={0.62} color="#B8D8FF" />
      <hemisphereLight args={['#93C5FD', '#040C24', 1.05]} />
      <directionalLight
        position={[layout.center[0] + 16, 26, layout.center[2] + 18]}
        intensity={2.15}
        color="#EBF5FF"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={2}
        shadow-camera-far={105}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <directionalLight
        position={[layout.center[0] - 20, 15, layout.center[2] - 18]}
        intensity={0.95}
        color="#38BDF8"
      />

      {/* Zone-specific neon atmospheric light pools casting realistic colored specular highlights */}
      {commandZone && (
        <pointLight position={[commandZone.center[0], 6.5, commandZone.center[2]]} color="#00D8FF" intensity={3.2} distance={26} decay={1.5} />
      )}
      {hubZone && (
        <pointLight position={[hubZone.center[0], 5.8, hubZone.center[2]]} color="#00E5FF" intensity={3.6} distance={20} decay={1.5} />
      )}
      {contentZone && (
        <pointLight position={[contentZone.center[0], 5.2, contentZone.center[2]]} color="#00D4FF" intensity={2.6} distance={18} decay={1.5} />
      )}
      {memoryZone && (
        <pointLight position={[memoryZone.center[0], 5.8, memoryZone.center[2]]} color="#A855F7" intensity={3.8} distance={20} decay={1.5} />
      )}
      {processZone && (
        <pointLight position={[processZone.center[0], 5.8, processZone.center[2]]} color="#FF2AA6" intensity={4.0} distance={22} decay={1.5} />
      )}
      {toolsZone && (
        <pointLight position={[toolsZone.center[0], 5.6, toolsZone.center[2]]} color="#FFAE00" intensity={4.0} distance={22} decay={1.5} />
      )}

      {/* Glossy dark cyber floor + distant dark-blue background monolith silhouettes */}
      <NeonFloorAndBackdrop center={layout.center} />

      {/* All 6 Neon AI Operations Campus stepped platforms */}
      {layout.zones.map((zone) => (
        <CampusPlatform key={zone.id} zone={zone} />
      ))}

      {/* Illuminated neon glass walkways with flowing light pulses */}
      {layout.bridges.map((bridge) => (
        <SkyBridge key={bridge.id} bridge={bridge} />
      ))}

      {/* Front-left wireframe geodesic globe pad + subtle outer floor accent plinths */}
      <SatelliteCluster satellites={layout.satellites} />

      {/* Signature hero landmarks matching each island of the reference image */}
      {commandZone && (
        <AgentCommandLandmarks zone={commandZone} builderDais={layout.builderDais} desks={layout.desks} />
      )}
      {hubZone && <CommandCenterLandmarks zone={hubZone} />}
      {contentZone && <ContentStudioLandmarks zone={contentZone} />}
      {memoryZone && <MemoryLandmarks zone={memoryZone} />}
      {processZone && <ProcessStudioLandmarks zone={processZone} />}
      {toolsZone && <ToolOrchestrationLandmarks zone={toolsZone} />}

      {/* Subtle ambient cyber dust particles */}
      <Sparkles
        count={78}
        scale={[layout.width + 6, 5.5, layout.depth + 6]}
        position={[layout.center[0], 2.8, layout.center[2]]}
        size={2.0}
        speed={reducedMotion ? 0 : 0.16}
        opacity={0.48}
        color="#38BDF8"
      />

      {/* Interactive Live Tectonic Modules & Seated White Robot Agents */}
      {Object.entries(layout.stations).map(([id, pos]) => (
        <Station key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}
      {Object.entries(layout.desks).map(([id, pos]) => (
        <Desk key={id} id={id} position={pos} palette={palette} showLabel={showLabels} />
      ))}

      {/* Live runtime-driven communication paths & courier fleet */}
      <Couriers layout={layout} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.22}
        maxPolarAngle={1.28}
        minDistance={8}
        maxDistance={125}
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

  const pillSurface =
    'rounded-xl border border-[#38BDF8]/45 bg-[#040E26]/82 shadow-[0_0_22px_rgba(0,165,255,0.22),inset_0_1px_0_rgba(125,211,252,0.18)] backdrop-blur-xl';
  const pillBtn =
    'flex h-8 items-center gap-1.5 px-3 text-[12.5px] font-medium text-[#E6F4FF] transition-colors hover:bg-[#38BDF8]/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
  const iconBtn =
    'flex h-8 w-7 items-center justify-center rounded-lg text-[#B8D9F8] transition-colors hover:bg-[#38BDF8]/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <>
      {/* Top-Left Stats Pill matching reference image (Bot icon + agents working | Cube icon + modules serving) */}
      <div className={`pointer-events-none absolute left-3.5 top-3.5 z-10 flex items-center gap-3.5 px-3.5 py-2 ${pillSurface}`}>
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#38BDF8]" style={{ filter: 'drop-shadow(0 0 6px #38BDF8)' }} />
          <Stat value={working} of={staff} label="agents working" color={STATE_STYLES.thinking.color} />
        </span>
        <span className="h-4 w-px bg-[#38BDF8]/30" />
        <span className="flex items-center gap-2">
          <NeonCubeIcon color="#38BDF8" className="h-4 w-4" />
          <Stat value={serving} of={modules} label="modules serving" color={MODULE_STATE_STYLES.busy.color} />
        </span>
      </div>

      {/* Top-Right Controls matching reference image ([Fit] and [Labels: on hover] + compact utility controls) */}
      <div className="absolute right-3.5 top-3.5 z-10 flex items-center gap-2">
        <div className={`flex items-center gap-0.5 px-1 ${pillSurface}`}>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-[#7DD3FC] transition-colors hover:bg-[#38BDF8]/15 hover:text-white"
            onClick={() => void startSimulation()}
            title="Simulate an agent campus workflow"
          >
            <Play className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Simulate</span>
          </button>
          <span className="mx-0.5 h-3.5 w-px bg-[#38BDF8]/25" />
          <button type="button" className={iconBtn} onClick={onZoomIn} title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={iconBtn} onClick={onZoomOut} title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={iconBtn} onClick={onFocus} disabled={!hasFocus} title="Focus selected agent or module">
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
          title="Frame the entire 3D campus"
        >
          <Focus className="h-3.5 w-3.5 text-[#7DD3FC]" />
          <span>Fit</span>
        </button>

        <button
          type="button"
          className={`${pillSurface} ${pillBtn}`}
          onClick={toggleLabels}
          title={showLabels ? 'Show name tags only when you hover a desk or module' : 'Always show every name tag'}
        >
          {showLabels ? <Eye className="h-3.5 w-3.5 text-[#7DD3FC]" /> : <EyeOff className="h-3.5 w-3.5 text-[#7DD3FC]" />}
          <span>Labels: {showLabels ? 'always' : 'on hover'}</span>
        </button>
      </div>

      {/* Bottom-Left Status & Courier Legend Pill matching reference image */}
      <div
        className={`pointer-events-none absolute bottom-3.5 left-3.5 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[12px] text-[#DCEEFF] ${pillSurface}`}
      >
        {[
          { label: 'Thinking', color: '#FBBF24', bold: false },
          { label: 'Calling tool', color: '#3B82F6', bold: true },
          { label: 'Ready', color: '#10B981', bold: false },
          { label: 'Error', color: '#EF4444', bold: false },
        ].map(({ label, color, bold }) => (
          <span key={label} className={`flex items-center gap-2 ${bold ? 'font-semibold text-white' : 'font-normal'}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
            {label}
          </span>
        ))}
        {[
          { label: 'Courier - delegation', color: COURIER_COLORS.delegation },
          { label: 'Courier - module call', color: COURIER_COLORS.module },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <NeonCubeIcon color={color} className="h-3.5 w-3.5" />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

function Stat({ value, of, label, color }: { value: number; of: number; label: string; color: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="font-mono text-[14px] font-bold tabular-nums" style={{ color: value > 0 ? color : '#FFFFFF' }}>
        {value}
      </span>
      <span className="text-[12.5px] font-medium text-[#C2DDFB]">/ {of} {label}</span>
    </span>
  );
}

function EmptyOffice() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-xs rounded-xl border border-[#38BDF8]/40 bg-[#040E26]/88 p-5 text-center shadow-[0_0_32px_rgba(0,165,255,0.28)] backdrop-blur-xl">
        <Building2 className="mx-auto mb-2 h-6 w-6 text-cyan-300" />
        <h3 className="typo-panel-heading text-white">The campus is on standby</h3>
        <p className="typo-secondary mt-1 text-slate-300">
          Command workstations appear as agents spawn; memory and tool infrastructure light up as agents invoke them.
        </p>
        <button
          type="button"
          onClick={() => void startSimulation()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-400/45 bg-sky-400/15 px-3 py-1.5 text-[12px] font-medium text-sky-200 hover:bg-sky-400/25"
        >
          <Play className="h-3.5 w-3.5" /> Simulate office
        </button>
      </div>
    </div>
  );
}

/** Blueprint: Neon AI Operations Campus 3D view mirroring live telemetry (same store, same selection). */
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

  const campusBackground =
    'radial-gradient(ellipse at 50% 44%, #09215E 0%, #041033 48%, #010615 100%)';

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: campusBackground }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 25, position: [28, 23, 29], near: 0.2, far: 450 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.24,
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

