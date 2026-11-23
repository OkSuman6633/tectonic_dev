import { memo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, type Group, type MeshBasicMaterial, type MeshStandardMaterial, type Sprite, type SpriteMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import type { OfficePalette } from './Desk';
import { Halo } from './glow';
import { moduleZoneKind, type Vec3 } from './officeLayout';

/** Module calls often finish in milliseconds; keep a station lit briefly so activity is perceptible. */
const SERVING_LINGER_S = 1.1;

function isServing(moduleId: string): boolean {
  const s = useTelemetryStore.getState();
  const mod = s.modules[moduleId];
  if (!mod) return false;
  if (mod.state === 'busy' || mod.state === 'booting') return true;
  const calls = s.moduleCalls[moduleId];
  const last = calls && calls.length ? calls[calls.length - 1].startedAt : 0;
  return Date.now() / 1000 - last < SERVING_LINGER_S;
}

function zoneAccentFor(moduleId: string): string {
  const kind = moduleZoneKind(moduleId);
  if (kind === 'tools') return '#FFAE00';
  if (kind === 'process') return '#FF2AA6';
  if (kind === 'memory') return '#A855F7';
  return '#00E5FF';
}

/**
 * Sleek interactive neon holographic module node placed seamlessly on its corresponding campus island.
 * Preserves full telemetry interactivity (hover/click selection, live serving beam, glowing status halo)
 * while blending harmoniously into the Neon AI Operations Campus island landmarks.
 */
function StationImpl({ id, position, showLabel }: { id: string; position: Vec3; palette: OfficePalette; showLabel: boolean }) {
  const reducedMotion = useReducedMotion();
  const mod = useTelemetryStore((s) => s.modules[id]);
  const selected = useTelemetryStore((s) => s.selectedModuleId === id);
  const selectModule = useTelemetryStore((s) => s.selectModule);
  const coreMat = useRef<MeshStandardMaterial>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const halo = useRef<Sprite>(null);
  const spin = useRef<Group>(null);
  const beam = useRef<MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const [inAction, setInAction] = useState(false);
  const inActionRef = useRef(false);
  const hoveredRef = useRef(false);

  const zoneAccent = zoneAccentFor(id);

  useFrame(({ clock }, delta) => {
    const live = useTelemetryStore.getState().modules[id];
    if (!live) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const serving = isServing(id);
    if (serving !== inActionRef.current) {
      inActionRef.current = serving;
      setInAction(serving);
    }
    const wave = 0.5 + 0.5 * Math.sin(t * 6 + position[0]);
    const offline = live.state === 'offline';
    if (coreMat.current) coreMat.current.emissiveIntensity = serving ? 1.85 + 1.15 * wave : offline ? 0.35 : 0.78;
    if (ringMat.current) ringMat.current.opacity = selected ? 0.98 : serving ? 0.72 + 0.25 * wave : hoveredRef.current ? 0.85 : 0.48;
    if (beam.current) beam.current.opacity = serving ? 0.16 + 0.1 * wave : 0;
    if (halo.current) {
      const size = serving ? 2.4 + 0.45 * wave : selected || hoveredRef.current ? 1.8 : 1.15;
      halo.current.scale.set(size, size, 1);
      (halo.current.material as SpriteMaterial).opacity = serving ? 0.65 + 0.22 * wave : selected ? 0.45 : 0.2;
    }
    if (spin.current && !reducedMotion) spin.current.rotation.y += delta * (serving ? 3.8 : 0.75);
  });

  if (!mod) return null;
  const stateStyle = MODULE_STATE_STYLES[mod.state];
  const activeColor = selected ? '#00F0FF' : zoneAccent;

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

  return (
    <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Vertical energy telemetry column during active serving */}
      <mesh position={[0, 1.9, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.18, 0.55, 3.8, 20, 1, true]} />
        <meshBasicMaterial ref={beam} color={activeColor} transparent opacity={0} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>

      {/* Compact glowing floor contact ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
        <ringGeometry args={[0.42, 0.49, 36]} />
        <meshBasicMaterial ref={ringMat} color={activeColor} transparent opacity={0.42} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Sleek architectural neon-tinted translucent cube node blending natively into its island */}
      <RoundedBox args={[0.56, 0.42, 0.56]} radius={0.04} smoothness={2} position={[0, 0.22, 0]} castShadow receiveShadow>
        <meshStandardMaterial
          ref={coreMat}
          color="#091633"
          emissive={activeColor}
          emissiveIntensity={0.48}
          metalness={0.58}
          roughness={0.22}
        />
      </RoundedBox>
      <mesh position={[0, 0.435, 0]}>
        <boxGeometry args={[0.48, 0.022, 0.48]} />
        <meshBasicMaterial color={activeColor} transparent opacity={0.85} toneMapped={false} />
      </mesh>

      {/* Floating spinning holographic indicator prism revealed on hover, selection, or active serving */}
      <group ref={spin} position={[0, 0.78, 0]} visible={hovered || selected || inAction}>
        <mesh>
          <octahedronGeometry args={[0.13, 0]} />
          <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.23, 0.014, 8, 24]} />
          <meshBasicMaterial color={activeColor} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      </group>

      <Halo ref={halo} color={activeColor} position={[0, 0.52, 0]} size={0.95} opacity={0.14} />

      {(showLabel || inAction || hovered || selected) && (
        <Html position={[0, 1.55, 0]} center distanceFactor={11.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex min-w-[144px] max-w-[215px] flex-col rounded-xl border px-2.5 py-1 shadow-2xl backdrop-blur-xl transition-all ${
              selected ? 'border-cyan-400/90 bg-[#051028]/92' : 'border-cyan-400/30 bg-[#051028]/85'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="typo-agent-name truncate text-[11.5px] font-semibold text-white">{mod.label}</span>
              <span className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-slate-300">
                {mod.category}
              </span>
            </div>
            <div className={`typo-status mt-0.5 flex items-center justify-between gap-2 text-[10.5px] ${stateStyle.text}`}>
              <span className="flex items-center gap-1 font-medium">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateStyle.color, boxShadow: `0 0 6px ${stateStyle.color}` }} />
                {stateStyle.label}
              </span>
              <span className="font-mono text-[9.5px] text-slate-300/85">
                {mod.totalCalls} calls{mod.activeCalls > 0 ? ` · ${mod.activeCalls} active` : ''}
              </span>
            </div>
            {mod.lastOperation && (
              <div className="mt-0.5 truncate border-t border-white/10 pt-0.5 font-mono text-[9.5px] text-violet-200/85">
                {mod.lastOperation}{mod.lastAgent ? ` ← ${mod.lastAgent}` : ''}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export const Station = memo(StationImpl);


