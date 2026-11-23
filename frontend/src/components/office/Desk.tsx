import { memo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Sprite, type SpriteMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { ROLE_STYLES, STATE_STYLES, agentRole, formatCount } from '../command/agentStateStyles';
import { Halo, HoloScreen } from './glow';
import type { Vec3 } from './officeLayout';

export interface OfficePalette {
  floor: string;
  deskTop: string;
  deskLeg: string;
  chair: string;
  wall: string;
  monitor: string;
}

export const DARK_PALETTE: OfficePalette = {
  floor: '#06122B',
  deskTop: '#0E1F3E',
  deskLeg: '#172E58',
  chair: '#0A162E',
  wall: '#091834',
  monitor: '#040C1C',
};
export const LIGHT_PALETTE: OfficePalette = DARK_PALETTE;

const ACTIVE = new Set(['thinking', 'tool_execution', 'running', 'waiting']);

function Monitor({
  x,
  z = -0.24,
  rotY = 0,
  width,
  screenRef,
  color,
  isIdle,
}: {
  x: number;
  z?: number;
  rotY?: number;
  width: number;
  screenRef: React.Ref<MeshStandardMaterial>;
  color: string;
  isIdle: boolean;
}) {
  // Reference image features vivid emerald-green & cyan glowing dual monitors at every workstation
  const screenGlow = isIdle ? (x < 0 ? '#2CE5A7' : '#2DD4FF') : color;

  return (
    <group position={[x, 1.04, z]} rotation={[0, rotY, 0]}>
      {/* Slim dark bezel chassis */}
      <mesh castShadow>
        <boxGeometry args={[width, 0.44, 0.036]} />
        <meshStandardMaterial color="#050D1E" roughness={0.3} metalness={0.65} />
      </mesh>
      {/* Glowing luminous monitor glass */}
      <mesh position={[0, 0, 0.022]}>
        <planeGeometry args={[width - 0.045, 0.37]} />
        <meshStandardMaterial
          ref={screenRef}
          color="#06222E"
          emissive={screenGlow}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>
      {/* Miniature glowing UI code lines across screen */}
      {[-0.09, 0, 0.09].map((ly, i) => (
        <mesh key={i} position={[-0.04 + (i % 2) * 0.03, ly, 0.026]}>
          <planeGeometry args={[width * (0.62 - i * 0.1), 0.028]} />
          <meshBasicMaterial color="#E0FFF4" transparent opacity={0.75} toneMapped={false} />
        </mesh>
      ))}
      {/* Slender monitor stand */}
      <mesh position={[0, -0.29, -0.01]}>
        <boxGeometry args={[0.045, 0.18, 0.045]} />
        <meshStandardMaterial color="#1A325C" metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh position={[0, -0.37, 0.01]}>
        <cylinderGeometry args={[0.08, 0.1, 0.022, 14]} />
        <meshStandardMaterial color="#102242" metalness={0.75} roughness={0.28} />
      </mesh>
    </group>
  );
}

/**
 * Glossy white-and-cyan stylized 3D robot seated in an ergonomic dark swivel chair at each workstation,
 * matching the signature cute white AI worker robots in the Neon AI Operations Campus reference image.
 */
function SeatedAgentRobot({
  isBuilder,
  statusColor,
  robotGroup,
  headGroup,
  leftArmGroup,
  rightArmGroup,
  chestMat,
  visorMat,
  thinkRingGroup,
}: {
  isBuilder: boolean;
  statusColor: string;
  robotGroup: React.Ref<Group>;
  headGroup: React.Ref<Group>;
  leftArmGroup: React.Ref<Group>;
  rightArmGroup: React.Ref<Group>;
  chestMat: React.Ref<MeshBasicMaterial>;
  visorMat: React.Ref<MeshBasicMaterial>;
  thinkRingGroup: React.Ref<Group>;
}) {
  const whiteShell = '#F5FAFF';
  const darkJoint = '#0E2040';
  const accentCyan = '#00E5FF';
  const scale = isBuilder ? 1.16 : 1.12;

  return (
    <group ref={robotGroup} position={[0, 0.06, 0.44]} rotation={[0, Math.PI, 0]} scale={scale}>
      {/* Seated Legs: thighs forward, calves down toward desk */}
      {[-0.1, 0.1].map((lx) => (
        <group key={lx} position={[lx, 0.42, 0.02]}>
          {/* Thigh extending forward toward desk */}
          <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2.1, 0, 0]} castShadow>
            <capsuleGeometry args={[0.048, 0.18, 6, 12]} />
            <meshStandardMaterial color={whiteShell} metalness={0.25} roughness={0.22} />
          </mesh>
          {/* Knee joint */}
          <mesh position={[0, -0.02, 0.24]}>
            <sphereGeometry args={[0.048, 12, 12]} />
            <meshStandardMaterial color={darkJoint} metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Lower shin extending downward */}
          <mesh position={[0, -0.17, 0.25]} castShadow>
            <capsuleGeometry args={[0.044, 0.2, 6, 12]} />
            <meshStandardMaterial color={whiteShell} metalness={0.25} roughness={0.22} />
          </mesh>
          {/* Foot */}
          <mesh position={[0, -0.32, 0.28]} castShadow>
            <boxGeometry args={[0.095, 0.065, 0.14]} />
            <meshStandardMaterial color={whiteShell} metalness={0.3} roughness={0.24} />
          </mesh>
        </group>
      ))}

      {/* Pelvis / Seated hip core */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.14, 0.12, 16]} />
        <meshStandardMaterial color={darkJoint} metalness={0.55} roughness={0.32} />
      </mesh>

      {/* Rounded glossy white torso */}
      <group position={[0, 0.72, 0]}>
        <RoundedBox args={[0.34, 0.38, 0.22]} radius={0.09} smoothness={3} castShadow>
          <meshStandardMaterial color={whiteShell} metalness={0.25} roughness={0.2} />
        </RoundedBox>
        {/* Shoulder caps */}
        {[-0.2, 0.2].map((sx) => (
          <mesh key={sx} position={[sx, 0.12, 0]} castShadow>
            <sphereGeometry args={[0.072, 14, 14]} />
            <meshStandardMaterial color={whiteShell} metalness={0.28} roughness={0.22} />
          </mesh>
        ))}
        {/* Glowing cyan collar accent */}
        <mesh position={[0, 0.19, 0]}>
          <torusGeometry args={[0.09, 0.015, 8, 22]} />
          <meshBasicMaterial color={accentCyan} toneMapped={false} />
        </mesh>
        {/* Front glowing chest core */}
        <mesh position={[0, 0.03, 0.115]}>
          <circleGeometry args={[0.058, 20]} />
          <meshBasicMaterial ref={chestMat} color={statusColor} toneMapped={false} />
        </mesh>
        {/* Back glowing cyan spine dot visible from isometric rear-quarter camera */}
        <mesh position={[0, 0.03, -0.115]}>
          <boxGeometry args={[0.11, 0.15, 0.014]} />
          <meshStandardMaterial color="#091B3A" metalness={0.7} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.03, -0.124]}>
          <planeGeometry args={[0.055, 0.11]} />
          <meshBasicMaterial color={statusColor} toneMapped={false} />
        </mesh>
      </group>

      {/* Articulated Left Arm typing forward on desk */}
      <group ref={leftArmGroup} position={[-0.21, 0.84, 0.02]} rotation={[0.55, 0, -0.1]}>
        <mesh position={[0, -0.11, 0]} castShadow>
          <capsuleGeometry args={[0.04, 0.16, 6, 12]} />
          <meshStandardMaterial color={whiteShell} metalness={0.25} roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.22, 0.1]} rotation={[0.95, 0, 0]} castShadow>
          <capsuleGeometry args={[0.036, 0.16, 6, 12]} />
          <meshStandardMaterial color={whiteShell} metalness={0.25} roughness={0.22} />
        </mesh>
      </group>

      {/* Articulated Right Arm typing forward on desk */}
      <group ref={rightArmGroup} position={[0.21, 0.84, 0.02]} rotation={[0.55, 0, 0.1]}>
        <mesh position={[0, -0.11, 0]} castShadow>
          <capsuleGeometry args={[0.04, 0.16, 6, 12]} />
          <meshStandardMaterial color={whiteShell} metalness={0.25} roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.22, 0.1]} rotation={[0.95, 0, 0]} castShadow>
          <capsuleGeometry args={[0.036, 0.16, 6, 12]} />
          <meshStandardMaterial color={whiteShell} metalness={0.25} roughness={0.22} />
        </mesh>
      </group>

      {/* Cute rounded white robot head with glossy black visor & glowing cyan eyes */}
      <group ref={headGroup} position={[0, 1.12, 0]}>
        <RoundedBox args={[0.31, 0.27, 0.28]} radius={0.11} smoothness={4} castShadow>
          <meshStandardMaterial color={whiteShell} metalness={0.22} roughness={0.18} />
        </RoundedBox>
        {/* Front black curved visor */}
        <mesh position={[0, 0.0, 0.118]}>
          <boxGeometry args={[0.23, 0.12, 0.05]} />
          <meshStandardMaterial color="#050C1C" metalness={0.85} roughness={0.12} />
        </mesh>
        {/* Glowing cyan pill eyes */}
        {[-0.055, 0.055].map((ex) => (
          <mesh key={ex} position={[ex, 0.005, 0.146]}>
            <capsuleGeometry args={[0.02, 0.028, 4, 8]} />
            <meshBasicMaterial ref={ex < 0 ? visorMat : undefined} color={accentCyan} toneMapped={false} />
          </mesh>
        ))}
        {/* Ear headphone pods with cyan LED ring */}
        {[-0.16, 0.16].map((ex) => (
          <group key={ex} position={[ex, 0.0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.055, 0.055, 0.035, 14]} />
              <meshStandardMaterial color={darkJoint} metalness={0.7} roughness={0.25} />
            </mesh>
            <mesh position={[0, ex > 0 ? -0.02 : 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.026, 0.038, 16]} />
              <meshBasicMaterial color={accentCyan} side={DoubleSide} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {/* Rear status glow strip visible from isometric camera */}
        <mesh position={[0, 0.01, -0.142]}>
          <planeGeometry args={[0.14, 0.028]} />
          <meshBasicMaterial color={statusColor} toneMapped={false} />
        </mesh>
      </group>

      {/* Active thinking / tool orbital ring above robot head */}
      <group ref={thinkRingGroup} position={[0, 1.38, 0]} visible={false}>
        <mesh rotation={[Math.PI / 2.2, 0.2, 0]}>
          <torusGeometry args={[0.24, 0.012, 8, 28]} />
          <meshBasicMaterial color={statusColor} transparent opacity={0.88} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function DeskImpl({ id, position, palette, showLabel }: { id: string; position: Vec3; palette: OfficePalette; showLabel: boolean }) {
  const reducedMotion = useReducedMotion();
  const agent = useTelemetryStore((s) => s.agents[id]);
  const selected = useTelemetryStore((s) => s.selectedAgentId === id);
  const lastTool = useTelemetryStore((s) => {
    const list = s.toolCalls[id];
    return list && list.length > 0 ? list[list.length - 1] : undefined;
  });
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const screens = [useRef<MeshStandardMaterial>(null), useRef<MeshStandardMaterial>(null), useRef<MeshStandardMaterial>(null)];
  const halo = useRef<Sprite>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  const pulseRing = useRef<Mesh>(null);

  const robotGroup = useRef<Group>(null);
  const headGroup = useRef<Group>(null);
  const leftArmGroup = useRef<Group>(null);
  const rightArmGroup = useRef<Group>(null);
  const chestMat = useRef<MeshBasicMaterial>(null);
  const visorMat = useRef<MeshBasicMaterial>(null);
  const thinkRingGroup = useRef<Group>(null);

  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);

  const role = agentRole(id);
  const isBuilder = role === 'builder';
  const roleColor = ROLE_STYLES[role].color;
  const width = isBuilder ? 1.85 : 1.56;
  const state = agent?.state ?? 'idle';
  const style = STATE_STYLES[state] ?? STATE_STYLES.idle;
  const color = style.color;
  const isIdle = state === 'idle';

  useFrame(({ clock }) => {
    const live = useTelemetryStore.getState().agents[id];
    if (!live) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const phase = position[0] * 0.7 + position[2] * 0.5;
    const isThinking = live.state === 'thinking';
    const isCallingTool = live.state === 'tool_execution' || live.state === 'running';
    const isError = live.state === 'error' || live.state === 'failed';
    const active = ACTIVE.has(live.state);
    const wave = 0.5 + 0.5 * Math.sin(t * (isError ? 4.5 : active ? 5.2 : 2.0) + phase);
    const intensity = active ? 1.65 + 1.0 * wave : isError ? 1.2 + 0.5 * wave : 1.05;

    for (const s of screens) if (s.current) s.current.emissiveIntensity = intensity;

    if (halo.current) {
      const size = active ? 2.15 + 0.35 * wave : isError ? 1.8 : 1.2;
      halo.current.scale.set(size, size, 1);
      (halo.current.material as SpriteMaterial).opacity = active ? 0.5 + 0.22 * wave : isError ? 0.42 : 0.16;
    }

    if (ring.current) {
      ring.current.opacity = selected ? 0.98 : active ? 0.65 + 0.3 * wave : hoveredRef.current ? 0.85 : 0.52;
    }

    if (pulseRing.current) {
      pulseRing.current.visible = active || selected || isError;
      const pulseScale = 1 + (reducedMotion ? 0.04 : ((t * 0.85 + phase) % 1) * 0.26);
      pulseRing.current.scale.set(pulseScale, pulseScale, 1);
      (pulseRing.current.material as MeshBasicMaterial).opacity = selected
        ? 0.52
        : active
          ? 0.44 * (1 - ((t * 0.85 + phase) % 1))
          : 0.28;
    }

    if (robotGroup.current && headGroup.current && leftArmGroup.current && rightArmGroup.current) {
      if (isThinking) {
        robotGroup.current.position.y = 0.06 + 0.02 * Math.sin(t * 3.2 + phase);
        headGroup.current.rotation.y = 0.25 * Math.sin(t * 2.1 + phase);
        headGroup.current.rotation.x = -0.1 + 0.06 * Math.sin(t * 3.5);
        leftArmGroup.current.rotation.x = 0.52 + 0.15 * Math.sin(t * 3.4);
        rightArmGroup.current.rotation.x = 0.88 + 0.12 * Math.cos(t * 4.2);
      } else if (isCallingTool) {
        robotGroup.current.position.y = 0.06 + 0.015 * Math.sin(t * 6 + phase);
        headGroup.current.rotation.y = 0.15 * Math.sin(t * 4.5);
        headGroup.current.rotation.x = 0.08;
        leftArmGroup.current.rotation.x = 0.65 + 0.22 * Math.sin(t * 11 + phase);
        rightArmGroup.current.rotation.x = 0.65 + 0.22 * Math.cos(t * 11 + phase);
      } else if (isError) {
        robotGroup.current.position.y = 0.06;
        headGroup.current.rotation.x = 0.2;
        headGroup.current.rotation.z = 0.08 * Math.sin(t * 3.5);
        leftArmGroup.current.rotation.x = 0.28;
        rightArmGroup.current.rotation.x = 0.28;
      } else {
        robotGroup.current.position.y = 0.06 + 0.01 * Math.sin(t * 1.8 + phase);
        headGroup.current.rotation.y = 0.08 * Math.sin(t * 1.1 + phase);
        headGroup.current.rotation.x = 0;
        headGroup.current.rotation.z = 0;
        leftArmGroup.current.rotation.x = 0.55 + 0.06 * Math.sin(t * 3.0 + phase);
        rightArmGroup.current.rotation.x = 0.55 + 0.06 * Math.cos(t * 3.0 + phase);
      }
    }

    if (thinkRingGroup.current) {
      thinkRingGroup.current.visible = isThinking || isCallingTool;
      thinkRingGroup.current.rotation.y = t * (isCallingTool ? 3.4 : 2.1);
    }
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

  const ringColor = selected ? '#00F0FF' : isIdle ? '#00D8FF' : color;
  const monitorConfigs = isBuilder
    ? [
        { x: -0.46, z: -0.22, rotY: 0.22, w: 0.72 },
        { x: 0.46, z: -0.22, rotY: -0.22, w: 0.72 },
      ]
    : [
        { x: -0.39, z: -0.22, rotY: 0.14, w: 0.72 },
        { x: 0.39, z: -0.22, rotY: -0.14, w: 0.72 },
      ];

  const currentTask =
    agent.stateDetail ||
    (lastTool?.status === 'running' ? `Running ${lastTool.toolName}` : lastTool ? `Last tool: ${lastTool.toolName}` : undefined);

  return (
    <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Signature glowing circular cyan floor ring beneath every agent workstation */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0.14]}>
        <ringGeometry args={[isBuilder ? 1.12 : 0.98, isBuilder ? 1.19 : 1.04, 56]} />
        <meshBasicMaterial ref={ring} color={ringColor} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0.14]}>
        <circleGeometry args={[isBuilder ? 1.12 : 0.98, 48]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.07} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Outer activity pulse ring */}
      <mesh ref={pulseRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0.14]} visible={false}>
        <ringGeometry args={[isBuilder ? 1.22 : 1.06, isBuilder ? 1.28 : 1.11, 56]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.35} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Sleek dark command desk */}
      <RoundedBox args={[width, 0.065, 0.78]} radius={0.025} smoothness={2} position={[0, 0.68, -0.04]} castShadow receiveShadow>
        <meshStandardMaterial color={palette.deskTop} metalness={0.52} roughness={0.32} />
      </RoundedBox>
      {/* Subtle glowing cyan front desk edge strip */}
      <mesh position={[0, 0.68, 0.355]}>
        <boxGeometry args={[width - 0.1, 0.018, 0.012]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.78} toneMapped={false} />
      </mesh>
      {/* Sleek dark desk side legs */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (width / 2 - 0.12), 0.34, -0.04]} castShadow>
          <boxGeometry args={[0.07, 0.66, 0.66]} />
          <meshStandardMaterial color={palette.deskLeg} metalness={0.62} roughness={0.32} />
        </mesh>
      ))}
      {/* Glowing keyboard strip */}
      <mesh position={[0, 0.718, 0.14]}>
        <planeGeometry args={[0.56, 0.16]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.35} toneMapped={false} />
      </mesh>

      {/* Dual glowing emerald-green / cyan monitors */}
      {monitorConfigs.map((m, i) => (
        <Monitor key={m.x} x={m.x} z={m.z} rotY={m.rotY} width={m.w} screenRef={screens[i]} color={color} isIdle={isIdle} />
      ))}

      {/* Supervisory curved translucent hologram display above agent_builder's console (matching right-side holo station in reference) */}
      {isBuilder && (
        <group position={[0, 1.38, -0.36]}>
          <HoloScreen variant="command" accent="#00E5FF" position={[0, 0.18, 0]} width={1.65} height={1.08} opacity={0.86} />
          <HoloScreen variant="code" accent="#38BDF8" position={[-1.08, 0.08, 0.28]} rotation={[0, 0.45, 0]} width={0.88} height={0.78} opacity={0.78} />
          <HoloScreen variant="code" accent="#38BDF8" position={[1.08, 0.08, 0.28]} rotation={[0, -0.45, 0]} width={0.88} height={0.78} opacity={0.78} />
        </group>
      )}

      {/* Seated glossy white-and-cyan 3D robot */}
      <SeatedAgentRobot
        isBuilder={isBuilder}
        statusColor={isIdle ? '#00E5FF' : color}
        robotGroup={robotGroup}
        headGroup={headGroup}
        leftArmGroup={leftArmGroup}
        rightArmGroup={rightArmGroup}
        chestMat={chestMat}
        visorMat={visorMat}
        thinkRingGroup={thinkRingGroup}
      />

      {/* Ergonomic dark swivel office chair */}
      <group position={[0, 0.02, 0.56]}>
        <mesh position={[0, 0.4, -0.06]} castShadow>
          <boxGeometry args={[0.42, 0.055, 0.38]} />
          <meshStandardMaterial color={palette.chair} metalness={0.5} roughness={0.38} />
        </mesh>
        <mesh position={[0, 0.72, 0.12]} castShadow>
          <boxGeometry args={[0.38, 0.58, 0.055]} />
          <meshStandardMaterial color={palette.chair} metalness={0.5} roughness={0.36} />
        </mesh>
        <mesh position={[0, 0.22, -0.06]}>
          <cylinderGeometry args={[0.032, 0.045, 0.36, 10]} />
          <meshStandardMaterial color="#182D54" metalness={0.72} roughness={0.28} />
        </mesh>
        {/* 4-spoke star caster base */}
        {[0, Math.PI / 2].map((ang) => (
          <mesh key={ang} position={[0, 0.05, -0.06]} rotation={[0, ang, 0]}>
            <boxGeometry args={[0.44, 0.03, 0.045]} />
            <meshStandardMaterial color="#13264A" metalness={0.75} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* Subtle ambient glow above workstation when active */}
      <Halo ref={halo} color={ringColor} position={[0, 1.32, -0.15]} size={1.2} opacity={0.16} />

      {(showLabel || ACTIVE.has(state) || hovered || selected) && (
        <Html position={[0, isBuilder ? 2.42 : 1.98, -0.1]} center distanceFactor={11.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex min-w-[144px] max-w-[214px] flex-col rounded-xl border px-2.5 py-1 shadow-2xl backdrop-blur-xl transition-all ${
              selected
                ? 'border-cyan-400/85 bg-[#051028]/92 shadow-cyan-500/25'
                : 'border-cyan-400/30 bg-[#051028]/85'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="typo-agent-name truncate text-[11.5px] font-semibold text-white">{agent.role}</span>
              <span className={`shrink-0 rounded border px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider ${ROLE_STYLES[role].chip}`}>
                {ROLE_STYLES[role].label}
              </span>
            </div>
            <div className="typo-status mt-0.5 flex items-center justify-between gap-2 text-[10.5px]" style={{ color }}>
              <span className="flex items-center gap-1 font-medium">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                {style.label}
              </span>
              <span className="font-mono text-[9.5px] text-slate-300/80">
                {agent.toolCallCount} tools · {formatCount(agent.tokens.total)} tok
              </span>
            </div>
            {currentTask && (
              <div className="mt-0.5 truncate border-t border-white/10 pt-0.5 font-mono text-[9.5px] text-cyan-200/85">
                {currentTask}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export const Desk = memo(DeskImpl);
