import { memo, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { CanvasTexture, SRGBColorSpace, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import type { OfficePalette } from './Desk';
import { moduleZoneKind, type CampusZoneKind, type Vec3 } from './officeLayout';

/** Module calls often finish in milliseconds; keep a station illuminated briefly so real activity is perceptible. */
const SERVING_LINGER_S = 1.6;

function isServing(moduleId: string): boolean {
  const s = useTelemetryStore.getState();
  const mod = s.modules[moduleId];
  if (!mod) return false;
  if (mod.state === 'busy' || mod.state === 'booting') return true;
  const calls = s.moduleCalls[moduleId];
  const last = calls && calls.length ? calls[calls.length - 1].startedAt : 0;
  return Date.now() / 1000 - last < SERVING_LINGER_S;
}

function zoneAccentFor(kind: CampusZoneKind): string {
  if (kind === 'tools') return '#D97706';
  if (kind === 'process') return '#C2410C';
  if (kind === 'memory') return '#6D28D9';
  if (kind === 'content') return '#0284C7';
  return '#0F766E';
}

function makeResourceScreen(label: string, accent: string, kind: CampusZoneKind): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 256, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText(label.toUpperCase().slice(0, 20), 12, 19);

  if (kind === 'memory') {
    // Database rows / knowledge index bars
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(167, 139, 250, 0.25)';
      ctx.fillRect(14, 42 + i * 26, 228, 18);
      ctx.fillStyle = '#C4B5FD';
      ctx.fillRect(20, 47 + i * 26, 90 + (i % 3) * 38, 8);
    }
  } else if (kind === 'tools') {
    // Ops pipeline metrics
    [45, 78, 62, 92, 70, 84].forEach((h, i) => {
      ctx.fillStyle = i % 2 === 0 ? '#F59E0B' : '#38BDF8';
      ctx.fillRect(22 + i * 36, 144 - h, 22, h);
    });
  } else {
    // Research / Compliance / Strategy telemetry lines
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 128);
    ctx.lineTo(66, 98);
    ctx.lineTo(118, 112);
    ctx.lineTo(176, 66);
    ctx.lineTo(240, 74);
    ctx.stroke();
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(16, 42, 140, 8);
    ctx.fillRect(16, 58, 96, 8);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Realistic modern workplace resource workstation for each live Tectonic module:
 * - Memory modules render as sleek archive server cabinets with integrated monitoring terminal
 * - Tooling/Ops modules render as technical engineering consoles
 * - Operations/Research/Process modules render as specialized modern workbenches
 * Preserves full click selection, hover highlight, and live telemetry badges.
 */
function StationImpl({
  id,
  position,
  facingYaw = Math.PI,
  showLabel,
}: {
  id: string;
  position: Vec3;
  facingYaw?: number;
  palette: OfficePalette;
  showLabel: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const mod = useTelemetryStore((s) => s.modules[id]);
  const selected = useTelemetryStore((s) => s.selectedModuleId === id);
  const selectModule = useTelemetryStore((s) => s.selectModule);
  const screenMat = useRef<MeshStandardMaterial>(null);
  const ledMat = useRef<MeshBasicMaterial>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const [inAction, setInAction] = useState(false);
  const inActionRef = useRef(false);
  const hoveredRef = useRef(false);

  const kind = moduleZoneKind(id);
  const accent = zoneAccentFor(kind);
  const screenTex = useMemo(() => makeResourceScreen(mod?.label ?? id, accent, kind), [mod?.label, id, accent, kind]);

  useFrame(({ clock }) => {
    const live = useTelemetryStore.getState().modules[id];
    if (!live) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const serving = isServing(id);
    if (serving !== inActionRef.current) {
      inActionRef.current = serving;
      setInAction(serving);
    }
    const wave = 0.5 + 0.5 * Math.sin(t * 5.5 + position[0]);
    if (screenMat.current) {
      screenMat.current.emissiveIntensity = serving ? 0.85 + 0.25 * wave : 0.35;
    }
    if (ledMat.current) {
      ledMat.current.color.set(live.state === 'error' ? '#EF4444' : serving ? '#10B981' : accent);
    }
    if (ringMat.current) {
      ringMat.current.opacity = selected ? 0.8 : serving ? 0.45 + 0.22 * wave : hoveredRef.current ? 0.42 : 0;
    }
  });

  if (!mod) return null;
  const stateStyle = MODULE_STATE_STYLES[mod.state];
  const activeColor = selected ? '#2563EB' : inAction ? '#10B981' : accent;

  // Rotate workstation so its monitor faces the employee standing point (facingYaw + PI)
  const stationRotY = facingYaw + Math.PI;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectModule(id, 'office');
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = on ? 'pointer' : '';
    hoveredRef.current = on;
    setHovered(on);
  };

  const isMemory = kind === 'memory';

  return (
    <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Subtle floor highlight ring when selected, hovered, or actively serving */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
        <ringGeometry args={[0.72, 0.8, 36]} />
        <meshBasicMaterial ref={ringMat} color={activeColor} transparent opacity={hovered || selected ? 0.5 : 0} depthWrite={false} />
      </mesh>

      <group rotation={[0, stationRotY, 0]}>
        {isMemory ? (
          /* Data & Knowledge Server/Archive Console */
          <>
            <RoundedBox args={[1.05, 1.48, 0.56]} radius={0.03} smoothness={2} position={[0, 0.74, -0.08]} castShadow receiveShadow>
              <meshStandardMaterial color="#334155" roughness={0.48} metalness={0.35} />
            </RoundedBox>
            {/* Front glass rack door */}
            <mesh position={[0, 0.74, 0.205]}>
              <boxGeometry args={[0.92, 1.32, 0.02]} />
              <meshStandardMaterial color="#1E293B" roughness={0.25} metalness={0.4} />
            </mesh>
            {/* Server blade slots */}
            {[0.3, 0.52, 0.74, 0.96, 1.18].map((by, idx) => (
              <mesh key={idx} position={[0, by, 0.22]}>
                <boxGeometry args={[0.78, 0.12, 0.015]} />
                <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.5} />
              </mesh>
            ))}
            {/* Mounted status monitor on front console shelf */}
            <RoundedBox args={[0.92, 0.05, 0.32]} radius={0.01} position={[0, 0.86, 0.34]} castShadow>
              <meshStandardMaterial color="#C89E72" roughness={0.58} />
            </RoundedBox>
            <mesh position={[0, 1.24, 0.23]} castShadow>
              <boxGeometry args={[0.76, 0.44, 0.032]} />
              <meshStandardMaterial color="#1E293B" roughness={0.35} />
            </mesh>
            <mesh position={[0, 1.24, 0.249]}>
              <planeGeometry args={[0.7, 0.38]} />
              {screenTex ? (
                <meshStandardMaterial ref={screenMat} map={screenTex} emissive="#FFFFFF" emissiveMap={screenTex} emissiveIntensity={0.4} />
              ) : (
                <meshStandardMaterial ref={screenMat} color="#1E293B" emissive={accent} emissiveIntensity={0.4} />
              )}
            </mesh>
            {/* Subtle top status indicator dot */}
            <mesh position={[0.38, 1.49, 0.16]}>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshBasicMaterial ref={ledMat} color={accent} />
            </mesh>
          </>
        ) : (
          /* Specialized Modern Standing/Seated Resource Desk (Ops, Research, Tooling, Strategy) */
          <>
            {/* Oak & Matte-White Standing Workbench */}
            <RoundedBox args={[1.26, 0.06, 0.72]} radius={0.02} smoothness={2} position={[0, 0.86, 0]} castShadow receiveShadow>
              <meshStandardMaterial color="#C89E72" roughness={0.56} />
            </RoundedBox>
            <RoundedBox args={[1.18, 0.82, 0.62]} radius={0.025} smoothness={2} position={[0, 0.42, -0.02]} castShadow receiveShadow>
              <meshStandardMaterial color="#F1ECE4" roughness={0.68} />
            </RoundedBox>
            {/* Accent colored desk trim bar */}
            <mesh position={[0, 0.82, 0.295]}>
              <boxGeometry args={[1.12, 0.04, 0.015]} />
              <meshStandardMaterial color={accent} roughness={0.5} />
            </mesh>
            {/* Wide Resource Terminal Monitor */}
            <group position={[0, 1.22, -0.14]}>
              <RoundedBox args={[0.88, 0.5, 0.035]} radius={0.015} castShadow>
                <meshStandardMaterial color="#1F2937" roughness={0.38} metalness={0.4} />
              </RoundedBox>
              <mesh position={[0, 0, 0.021]}>
                <planeGeometry args={[0.82, 0.44]} />
                {screenTex ? (
                  <meshStandardMaterial ref={screenMat} map={screenTex} emissive="#FFFFFF" emissiveMap={screenTex} emissiveIntensity={0.42} />
                ) : (
                  <meshStandardMaterial ref={screenMat} color="#1E293B" emissive={accent} emissiveIntensity={0.42} />
                )}
              </mesh>
              <mesh position={[0, -0.3, -0.01]}>
                <boxGeometry args={[0.055, 0.14, 0.04]} />
                <meshStandardMaterial color="#4B5563" metalness={0.5} roughness={0.38} />
              </mesh>
            </group>
            {/* Keyboard & Document folder on workbench */}
            <RoundedBox args={[0.42, 0.02, 0.14]} radius={0.005} position={[-0.1, 0.9, 0.16]} castShadow>
              <meshStandardMaterial color="#334155" roughness={0.5} />
            </RoundedBox>
            <mesh position={[0.38, 0.898, 0.14]} rotation={[0, -0.18, 0]} castShadow>
              <boxGeometry args={[0.24, 0.018, 0.18]} />
              <meshStandardMaterial color={accent} roughness={0.72} />
            </mesh>
            {/* Status beacon indicator */}
            <mesh position={[0.48, 0.92, -0.22]}>
              <sphereGeometry args={[0.042, 12, 12]} />
              <meshBasicMaterial ref={ledMat} color={accent} />
            </mesh>
          </>
        )}
      </group>

      {(showLabel || inAction || hovered || selected) && (
        <Html position={[0, isMemory ? 1.85 : 1.72, 0]} center distanceFactor={12} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex min-w-[144px] max-w-[215px] flex-col rounded-xl border px-2.5 py-1.5 shadow-lg backdrop-blur-md transition-all ${
              selected
                ? 'border-blue-500/80 bg-white/95 text-slate-900'
                : 'border-stone-300/90 bg-white/90 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11.5px] font-semibold text-slate-900">{mod.label}</span>
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-white"
                style={{ backgroundColor: accent }}
              >
                {mod.category}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px]">
              <span className="flex items-center gap-1 font-medium text-slate-700">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateStyle.color }} />
                {stateStyle.label}
              </span>
              <span className="font-mono text-[9.5px] text-slate-500">
                {mod.totalCalls} calls{mod.activeCalls > 0 ? ` · ${mod.activeCalls} active` : ''}
              </span>
            </div>
            {mod.lastOperation && (
              <div className="mt-0.5 truncate border-t border-stone-200 pt-0.5 font-mono text-[9.5px] text-slate-600">
                {mod.lastOperation}
                {mod.lastAgent ? ` · ${mod.lastAgent}` : ''}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export const Station = memo(StationImpl);



