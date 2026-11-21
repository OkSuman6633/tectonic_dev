import { memo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Mesh, MeshBasicMaterial, MeshStandardMaterial, Sprite, SpriteMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { ROLE_STYLES, STATE_STYLES, agentRole } from '../command/agentStateStyles';
import { Halo } from './glow';
import type { Vec3 } from './officeLayout';

export interface OfficePalette {
  floor: string;
  deskTop: string;
  deskLeg: string;
  chair: string;
  wall: string;
  monitor: string;
}

export const DARK_PALETTE: OfficePalette = { floor: '#151821', deskTop: '#3A4150', deskLeg: '#4A5263', chair: '#262B36', wall: '#1E222C', monitor: '#07080B' };
export const LIGHT_PALETTE: OfficePalette = { floor: '#E9ECF1', deskTop: '#FFFFFF', deskLeg: '#C3C9D3', chair: '#D7DCE4', wall: '#DDE2EA', monitor: '#1B1F27' };

const ACTIVE = new Set(['thinking', 'tool_execution']);

function Monitor({ x, width, screenRef, color }: { x: number; width: number; screenRef: React.Ref<MeshStandardMaterial>; color: string }) {
  return (
    <group position={[x, 1.08, -0.24]}>
      <mesh castShadow>
        <boxGeometry args={[width, 0.52, 0.05]} />
        <meshStandardMaterial color="#07080B" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.028]}>
        <planeGeometry args={[width - 0.07, 0.44]} />
        <meshStandardMaterial ref={screenRef} color="#05060A" emissive={color} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.36, 0]} castShadow>
        <boxGeometry args={[0.06, 0.22, 0.06]} />
        <meshStandardMaterial color="#2C313C" />
      </mesh>
    </group>
  );
}

function DeskImpl({ id, position, palette, showLabel }: { id: string; position: Vec3; palette: OfficePalette; showLabel: boolean }) {
  const agent = useTelemetryStore((s) => s.agents[id]);
  const selected = useTelemetryStore((s) => s.selectedAgentId === id);
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const screens = [useRef<MeshStandardMaterial>(null), useRef<MeshStandardMaterial>(null), useRef<MeshStandardMaterial>(null)];
  const halo = useRef<Sprite>(null);
  const orb = useRef<Mesh>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  // Name tags only while in action, hovered or selected (or when "Always" is on): the floor stays clean.
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);

  const role = agentRole(id);
  const isBuilder = role === 'builder';
  const width = isBuilder ? 2.7 : 1.7;
  const state = agent?.state ?? 'idle';
  const color = STATE_STYLES[state].color;

  useFrame(({ clock }) => {
    const live = useTelemetryStore.getState().agents[id];
    if (!live) return;
    const t = clock.elapsedTime;
    const active = ACTIVE.has(live.state);
    const error = live.state === 'error';
    const wave = 0.5 + 0.5 * Math.sin(t * (error ? 9 : 5) + position[0]);
    const intensity = active ? 1.4 + 1.2 * wave : error ? 1.1 + 0.9 * wave : 0.45;
    for (const s of screens) if (s.current) s.current.emissiveIntensity = intensity;
    if (halo.current) {
      const size = active ? 2.2 + 0.4 * wave : error ? 2.0 : 1.2;
      halo.current.scale.set(size, size, 1);
      (halo.current.material as SpriteMaterial).opacity = active ? 0.55 + 0.25 * wave : error ? 0.5 : 0.14;
    }
    if (orb.current) orb.current.position.y = 1.72 + (active ? 0.07 * Math.sin(t * 3.2 + position[2]) : 0);
    if (ring.current) ring.current.opacity = selected ? 0.9 : active ? 0.35 + 0.3 * wave : hoveredRef.current ? 0.55 : 0.12;
  });

  if (!agent) return null;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectAgent(id, 'office');
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = on ? 'pointer' : '';
    hoveredRef.current = on;
    setHovered(on);
  };
  const monitorXs = isBuilder ? [-0.82, 0, 0.82] : [0];

  return (
    <group position={position} onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Floor status ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.15]}>
        <ringGeometry args={[isBuilder ? 1.75 : 1.25, isBuilder ? 1.86 : 1.34, 64]} />
        <meshBasicMaterial ref={ring} color={selected ? '#2DD4FF' : color} transparent opacity={0.2} toneMapped={false} />
      </mesh>

      {/* Desk */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.07, 0.95]} />
        <meshStandardMaterial color={palette.deskTop} roughness={0.55} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (width / 2 - 0.08), 0.37, sz * 0.38]} castShadow>
          <boxGeometry args={[0.06, 0.74, 0.06]} />
          <meshStandardMaterial color={palette.deskLeg} />
        </mesh>
      )))}
      {isBuilder && (
        <mesh position={[0, 0.66, 0.48]}>
          <boxGeometry args={[width - 0.1, 0.035, 0.012]} />
          <meshBasicMaterial color={ROLE_STYLES.builder.color} toneMapped={false} />
        </mesh>
      )}

      {monitorXs.map((x, i) => (
        <Monitor key={x} x={x} width={isBuilder ? 0.74 : 0.86} screenRef={screens[i]} color={color} />
      ))}

      {/* Chair */}
      <group position={[0, 0, 0.78]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.52, 0.07, 0.5]} />
          <meshStandardMaterial color={palette.chair} />
        </mesh>
        <mesh position={[0, 0.8, 0.23]} castShadow>
          <boxGeometry args={[0.5, 0.62, 0.06]} />
          <meshStandardMaterial color={palette.chair} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.44, 8]} />
          <meshStandardMaterial color={palette.deskLeg} />
        </mesh>
      </group>

      {/* Status orb + glow */}
      <mesh ref={orb} position={[0, 1.72, -0.24]}>
        <sphereGeometry args={[isBuilder ? 0.11 : 0.085, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Halo ref={halo} color={color} position={[0, 1.72, -0.24]} />

      {(showLabel || ACTIVE.has(state) || hovered || selected) && (
        <Html position={[0, 2.18, -0.24]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex flex-col items-center whitespace-nowrap rounded-lg border px-2 py-1 backdrop-blur-md transition-colors ${
              selected ? 'border-sky-400/70 bg-sky-950/70' : 'border-white/10 bg-black/55'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] font-medium text-white">{agent.role}</span>
              <span className={`rounded border px-1 font-mono text-[8px] uppercase tracking-wider ${ROLE_STYLES[role].chip}`}>{ROLE_STYLES[role].label}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 font-mono text-[9.5px]" style={{ color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {STATE_STYLES[state].label}
              {state === 'tool_execution' && agent.stateDetail && <span className="max-w-[120px] truncate text-white/60">· {agent.stateDetail}</span>}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export const Desk = memo(DeskImpl);
