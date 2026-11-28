import { memo, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { CanvasTexture, SRGBColorSpace, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import type { OfficePalette } from './Desk';
import { moduleZoneKind, type CampusZoneKind, type Vec3 } from './officeLayout';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

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

function zoneAccentFor(kind: CampusZoneKind): { primary: string; secondary: string } {
  if (kind === 'tools') return { primary: '#F59E0B', secondary: '#FDE047' };
  if (kind === 'process') return { primary: '#A855F7', secondary: '#00E5FF' };
  if (kind === 'memory') return { primary: '#A855F7', secondary: '#38BDF8' };
  if (kind === 'content') return { primary: '#06B6D4', secondary: '#EC4899' };
  return { primary: '#00E5FF', secondary: '#3B82F6' };
}

function makeResourceScreen(
  label: string,
  accent: string,
  secondary: string,
  kind: CampusZoneKind,
  isDark = true,
): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = isDark ? '#07122B' : '#FFFFFF';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 250, 154);

  ctx.fillStyle = accent;
  ctx.fillRect(4, 4, 248, 30);
  ctx.fillStyle = isDark ? '#040B1A' : '#FFFFFF';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText(label.toUpperCase().slice(0, 20), 12, 23);

  if (kind === 'memory') {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = isDark ? 'rgba(168, 85, 247, 0.22)' : 'rgba(168, 85, 247, 0.12)';
      ctx.fillRect(14, 44 + i * 26, 228, 18);
      ctx.fillStyle = i % 2 === 0 ? '#C084FC' : '#38BDF8';
      ctx.fillRect(20, 49 + i * 26, 95 + (i % 3) * 42, 8);
    }
  } else if (kind === 'tools') {
    [48, 84, 66, 98, 76, 92].forEach((h, i) => {
      ctx.fillStyle = i % 2 === 0 ? '#FBBF24' : '#38BDF8';
      ctx.fillRect(20 + i * 36, 144 - h, 22, h);
    });
  } else if (kind === 'process') {
    ctx.strokeStyle = '#F472B6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 128);
    ctx.lineTo(64, 92);
    ctx.lineTo(118, 108);
    ctx.lineTo(176, 58);
    ctx.lineTo(240, 70);
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.fillRect(16, 46, 130, 8);
    ctx.fillRect(16, 62, 86, 6);
  } else {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 126);
    ctx.lineTo(70, 96);
    ctx.lineTo(126, 114);
    ctx.lineTo(182, 64);
    ctx.lineTo(240, 74);
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.fillRect(16, 44, 146, 8);
    ctx.fillRect(16, 60, 102, 7);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Substantial External Futuristic AI Infrastructure Module Installation:
 * Adaptively renders in both Dark Mode (deep obsidian & glowing neon) and Light Mode (pearl white & luminous accents).
 */
function StationImpl({
  id,
  position,
  facingYaw = Math.PI,
  showLabel,
  isDark: propIsDark,
}: {
  id: string;
  position: Vec3;
  facingYaw?: number;
  palette?: OfficePalette;
  showLabel: boolean;
  isDark?: boolean;
}) {
  const hookIsDark = useIsDarkMode();
  const isDark = propIsDark ?? hookIsDark;

  const reducedMotion = useReducedMotion();
  const mod = useTelemetryStore((s) => s.modules[id]);
  const selected = useTelemetryStore((s) => s.selectedModuleId === id);
  const selectModule = useTelemetryStore((s) => s.selectModule);
  const screenMat = useRef<MeshStandardMaterial>(null);
  const glowMat = useRef<MeshStandardMaterial>(null);
  const ledMat = useRef<MeshBasicMaterial>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const [inAction, setInAction] = useState(false);
  const inActionRef = useRef(false);
  const hoveredRef = useRef(false);

  const kind = moduleZoneKind(id);
  const { primary: accent, secondary } = zoneAccentFor(kind);
  const screenTex = useMemo(
    () => makeResourceScreen(mod?.label ?? id, accent, secondary, kind, isDark),
    [mod?.label, id, accent, secondary, kind, isDark],
  );

  useFrame(({ clock }) => {
    const live = useTelemetryStore.getState().modules[id];
    if (!live) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const serving = isServing(id);
    if (serving !== inActionRef.current) {
      inActionRef.current = serving;
      setInAction(serving);
    }
    const wave = 0.5 + 0.5 * Math.sin(t * 5.8 + position[0]);
    if (screenMat.current) {
      screenMat.current.emissiveIntensity = serving ? 1.15 + 0.35 * wave : 0.58;
    }
    if (glowMat.current) {
      glowMat.current.emissiveIntensity = serving ? 2.4 + 0.65 * wave : 1.2;
    }
    if (ledMat.current) {
      ledMat.current.color.set(live.state === 'error' ? '#EF4444' : serving ? '#34D399' : accent);
    }
    if (ringMat.current) {
      ringMat.current.opacity = selected ? 0.92 : serving ? 0.62 + 0.28 * wave : hoveredRef.current ? 0.55 : 0.24;
    }
  });

  if (!mod) return null;
  const stateStyle = MODULE_STATE_STYLES[mod.state];
  const activeColor = selected ? '#38BDF8' : inAction ? '#34D399' : accent;

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

  const towerHeight = kind === 'memory' ? 2.38 : kind === 'tools' ? 2.65 : 2.22;

  // All five external AI infrastructure platforms (Tool Orchestration, Shared Memory Infrastructure,
  // Process Studio, Operations & Safety Center & Content Studio - RCP) are reconstructed as dedicated
  // 3D architectural dioramas. Render an integrated interactive hit-volume, luminous section-colored
  // outline, and telemetry HUD card so clicking, hovering, focus, and live status work seamlessly
  // without obstructing the hardware.
  if (kind === 'tools' || kind === 'memory' || kind === 'process' || kind === 'hub' || kind === 'content') {
    const isMemory = kind === 'memory';
    const isProcess = kind === 'process';
    const isHub = kind === 'hub';
    const isContent = kind === 'content';
    const isCoreTarget =
      id === 'tool_orchestration' ||
      id === 'agentic_rag' ||
      id === 'auditability' ||
      id === 'intent_detection' ||
      id === 'promptops';
    const isStm = id === 'short_term_memory';
    const sectionAccent = isMemory
      ? isStm
        ? '#00E5FF'
        : '#A855F7'
      : isProcess
        ? id === 'finops'
          ? '#00E5FF'
          : '#A855F7'
        : isHub
          ? id === 'guardrails'
            ? '#F59E0B'
            : '#00B8FF'
          : isContent
            ? id === 'image_generation'
              ? '#A855F7'
              : '#00B8FF'
            : accent;
    const outlineColor = selected ? '#38BDF8' : inAction ? '#34D399' : sectionAccent;
    const showOutline = selected || inAction || hovered;
    const half = isCoreTarget ? (isProcess || isHub || isContent ? 1.85 : 1.62) : isMemory || isProcess || isHub || isContent ? 1.15 : 0.92;
    return (
      <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        {/* Sleek perimeter telemetry outline hugging the hardware section (visible on hover/selection/active) */}
        <group position={[0, 0.024, 0]} visible={showOutline}>
          {[
            { pos: [0, 0, half] as Vec3, size: [half * 2 + 0.08, 0.022, 0.055] as Vec3 },
            { pos: [0, 0, -half] as Vec3, size: [half * 2 + 0.08, 0.022, 0.055] as Vec3 },
            { pos: [half, 0, 0] as Vec3, size: [0.055, 0.022, half * 2 + 0.08] as Vec3 },
            { pos: [-half, 0, 0] as Vec3, size: [0.055, 0.022, half * 2 + 0.08] as Vec3 },
          ].map((seg, i) => (
            <mesh key={i} position={seg.pos}>
              <boxGeometry args={seg.size} />
              <meshBasicMaterial
                ref={i === 0 ? ringMat : undefined}
                color={outlineColor}
                transparent
                opacity={0.58}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>

        {/* Transparent interactive click/hover bounding target matching the hardware silhouette */}
        <mesh position={[0, isCoreTarget ? 1.65 : 1.15, 0]}>
          <boxGeometry args={isCoreTarget ? (isProcess ? [4.2, 3.4, 1.2] : [2.8, 3.2, 2.8]) : isMemory || isProcess ? [2.2, 2.1, 2.2] : [1.4, 2.2, 1.8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {(showLabel || inAction || hovered || selected) && (
          <Html position={[0, isCoreTarget ? 4.25 : 2.65, 0]} center distanceFactor={15} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div
              className={`office-tag flex min-w-[152px] max-w-[225px] flex-col rounded-xl border px-2.5 py-1.5 shadow-lg transition-all ${selected
                ? isMemory || isProcess
                  ? isStm || id === 'finops'
                    ? 'border-cyan-500 bg-white dark:bg-slate-950 text-slate-950 dark:text-slate-50 shadow-cyan-500/20'
                    : 'border-purple-500 bg-white dark:bg-slate-950 text-slate-950 dark:text-slate-50 shadow-purple-500/20'
                  : 'border-amber-500 bg-white dark:bg-slate-950 text-slate-950 dark:text-slate-50 shadow-amber-500/20'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50'
                }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate text-[11.5px] font-semibold text-slate-900 dark:text-white">{mod.label}</span>
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-wider text-slate-950"
                  style={{ backgroundColor: sectionAccent }}
                >
                  {mod.category}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px]">
                <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateStyle.color }} />
                  {stateStyle.label}
                </span>
                <span className="font-mono text-[9.5px] text-slate-500 dark:text-slate-400">
                  {mod.totalCalls} calls{mod.activeCalls > 0 ? ` · ${mod.activeCalls} active` : ''}
                </span>
              </div>
              {mod.lastOperation && (
                <div className="mt-0.5 truncate border-t border-slate-200 dark:border-slate-700/80 pt-0.5 font-mono text-[9.5px] text-blue-600 dark:text-cyan-300">
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

  // Material tone adaptation based on current theme
  const plinthColor = isDark ? '#0C1B38' : '#E2E8F0';
  const chassisColor = isDark ? '#112040' : '#FFFFFF';
  const glassBayColor = isDark ? '#071126' : '#F1F5F9';
  const crownColor = isDark ? '#172A50' : '#E2E8F0';
  const pedestalColor = isDark ? '#132548' : '#F1F5F9';
  const touchDeckColor = isDark ? '#1E3A63' : '#E2E8F0';
  const displayFrameColor = isDark ? '#0A1936' : '#FFFFFF';

  return (
    <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Luminous floor energy pad ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0.15]}>
        <ringGeometry args={[0.92, 1.06, 40]} />
        <meshBasicMaterial ref={ringMat} color={activeColor} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0.15]}>
        <circleGeometry args={[0.92, 32]} />
        <meshBasicMaterial color={accent} transparent opacity={inAction ? 0.18 : 0.07} depthWrite={false} />
      </mesh>

      <group rotation={[0, stationRotY, 0]}>
        {/* Foundation plinth */}
        <RoundedBox args={[1.48, 0.18, 1.18]} radius={0.04} smoothness={2} position={[0, 0.09, 0.04]} castShadow receiveShadow>
          <meshStandardMaterial color={plinthColor} roughness={0.4} metalness={isDark ? 0.72 : 0.25} />
        </RoundedBox>

        {/* Main Server Monolith */}
        <RoundedBox
          args={[1.22, towerHeight, 0.78]}
          radius={0.05}
          smoothness={2}
          position={[0, 0.18 + towerHeight / 2, -0.14]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={chassisColor} roughness={0.34} metalness={isDark ? 0.68 : 0.15} />
        </RoundedBox>

        {/* Recessed glass front bay */}
        <mesh position={[0, 0.18 + towerHeight / 2, 0.255]}>
          <boxGeometry args={[0.98, towerHeight - 0.24, 0.03]} />
          <meshStandardMaterial color={glassBayColor} roughness={0.2} metalness={isDark ? 0.5 : 0.1} />
        </mesh>

        {/* Illuminated server blade layers */}
        {[0.52, 0.86, 1.2, 1.54, 1.88, 2.16].filter((by) => by < towerHeight + 0.05).map((by, idx) => (
          <mesh key={idx} position={[0, by, 0.275]}>
            <boxGeometry args={[0.84, 0.1, 0.025]} />
            <meshStandardMaterial
              ref={idx === 2 ? glowMat : undefined}
              color={idx % 2 === 0 ? accent : secondary}
              emissive={idx % 2 === 0 ? accent : secondary}
              emissiveIntensity={1.25}
              roughness={0.22}
            />
          </mesh>
        ))}

        {/* Side vertical luminous fins */}
        {[-0.62, 0.62].map((fx, i) => (
          <mesh key={i} position={[fx, 0.18 + towerHeight / 2, -0.05]}>
            <boxGeometry args={[0.05, towerHeight - 0.16, 0.12]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.35} />
          </mesh>
        ))}

        {/* Crown energy cap */}
        <RoundedBox args={[0.96, 0.12, 0.62]} radius={0.03} position={[0, 0.22 + towerHeight, -0.14]} castShadow>
          <meshStandardMaterial color={crownColor} roughness={0.32} metalness={isDark ? 0.75 : 0.3} />
        </RoundedBox>
        <mesh position={[0, 0.34 + towerHeight, -0.14]}>
          <octahedronGeometry args={[0.16, 0]} />
          <meshBasicMaterial ref={ledMat} color={accent} />
        </mesh>

        {/* Front Interactive Operator Console */}
        <group position={[0, 0, 0.52]}>
          <RoundedBox args={[0.78, 0.9, 0.32]} radius={0.03} position={[0, 0.48, 0]} castShadow>
            <meshStandardMaterial color={pedestalColor} roughness={0.42} metalness={isDark ? 0.65 : 0.2} />
          </RoundedBox>
          <RoundedBox args={[0.86, 0.05, 0.38]} radius={0.015} position={[0, 0.95, 0.04]} rotation={[0.22, 0, 0]} castShadow>
            <meshStandardMaterial color={touchDeckColor} roughness={0.35} metalness={isDark ? 0.6 : 0.25} />
          </RoundedBox>
          <mesh position={[0, 0.985, 0.05]} rotation={[-Math.PI / 2 + 0.22, 0, 0]}>
            <planeGeometry args={[0.72, 0.24]} />
            <meshBasicMaterial color={secondary} transparent opacity={0.45} />
          </mesh>
          {/* Angled Holographic Display */}
          <group position={[0, 1.46, -0.05]} rotation={[-0.1, 0, 0]}>
            <RoundedBox args={[1.06, 0.64, 0.035]} radius={0.018}>
              <meshStandardMaterial color={displayFrameColor} roughness={0.3} metalness={isDark ? 0.6 : 0.15} />
            </RoundedBox>
            <mesh position={[0, 0, 0.022]}>
              <planeGeometry args={[0.98, 0.56]} />
              {screenTex ? (
                <meshStandardMaterial
                  ref={screenMat}
                  map={screenTex}
                  emissive="#FFFFFF"
                  emissiveMap={screenTex}
                  emissiveIntensity={0.62}
                />
              ) : (
                <meshStandardMaterial ref={screenMat} color={isDark ? '#0F172A' : '#FFFFFF'} emissive={accent} emissiveIntensity={0.62} />
              )}
            </mesh>
          </group>
        </group>
      </group>

      {(showLabel || inAction || hovered || selected) && (
        <Html position={[0, towerHeight + 0.9, 0]} center distanceFactor={15} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex min-w-[152px] max-w-[225px] flex-col rounded-xl border px-2.5 py-1.5 shadow-lg transition-all ${selected
              ? 'border-cyan-500 bg-white dark:bg-slate-950 text-slate-950 dark:text-slate-50 shadow-cyan-500/15'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50'
              }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11.5px] font-semibold text-slate-900 dark:text-white">{mod.label}</span>
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-wider text-slate-950"
                style={{ backgroundColor: accent }}
              >
                {mod.category}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px]">
              <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateStyle.color }} />
                {stateStyle.label}
              </span>
              <span className="font-mono text-[9.5px] text-slate-500 dark:text-slate-400">
                {mod.totalCalls} calls{mod.activeCalls > 0 ? ` · ${mod.activeCalls} active` : ''}
              </span>
            </div>
            {mod.lastOperation && (
              <div className="mt-0.5 truncate border-t border-slate-200 dark:border-slate-700/80 pt-0.5 font-mono text-[9.5px] text-blue-600 dark:text-cyan-300">
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
