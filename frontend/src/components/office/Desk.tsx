import { memo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Sprite, SpriteMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { ROLE_STYLES, STATE_STYLES, agentRole, formatCount } from '../command/agentStateStyles';
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

export const DARK_PALETTE: OfficePalette = {
  floor: '#091B3A',
  deskTop: '#163159',
  deskLeg: '#244A7E',
  chair: '#0E2242',
  wall: '#0D2345',
  monitor: '#050C1B',
};
export const LIGHT_PALETTE: OfficePalette = {
  floor: '#E6EEF8',
  deskTop: '#F8FAFC',
  deskLeg: '#B6C5D8',
  chair: '#CBD7E6',
  wall: '#D5E0EE',
  monitor: '#132033',
};

const ACTIVE = new Set(['thinking', 'tool_execution', 'running', 'waiting']);

function Monitor({
  x,
  z = -0.26,
  rotY = 0,
  width,
  screenRef,
  color,
  roleColor,
}: {
  x: number;
  z?: number;
  rotY?: number;
  width: number;
  screenRef: React.Ref<MeshStandardMaterial>;
  color: string;
  roleColor: string;
}) {
  return (
    <group position={[x, 1.12, z]} rotation={[0, rotY, 0]}>
      {/* Main display chassis */}
      <mesh castShadow>
        <boxGeometry args={[width, 0.54, 0.045]} />
        <meshStandardMaterial color="#050B16" roughness={0.32} metalness={0.55} />
      </mesh>
      {/* Top holographic rim accent */}
      <mesh position={[0, 0.275, 0.01]}>
        <boxGeometry args={[width - 0.06, 0.016, 0.025]} />
        <meshBasicMaterial color={roleColor} transparent opacity={0.75} toneMapped={false} />
      </mesh>
      {/* Active illuminated display glass */}
      <mesh position={[0, 0, 0.026]}>
        <planeGeometry args={[width - 0.06, 0.45]} />
        <meshStandardMaterial ref={screenRef} color="#040A18" emissive={color} emissiveIntensity={0.65} toneMapped={false} />
      </mesh>
      {/* Subtle floating holographic HUD layer in front of screen */}
      <mesh position={[0, 0.02, 0.055]}>
        <planeGeometry args={[width * 0.76, 0.26]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* Articulated metallic monitor arm */}
      <mesh position={[0, -0.36, -0.02]} castShadow>
        <boxGeometry args={[0.07, 0.24, 0.07]} />
        <meshStandardMaterial color="#1E3554" metalness={0.65} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.47, 0.01]}>
        <cylinderGeometry args={[0.11, 0.14, 0.03, 16]} />
        <meshStandardMaterial color="#152844" metalness={0.7} roughness={0.28} />
      </mesh>
    </group>
  );
}

/**
 * Detailed humanoid robot stationed at each agent workstation.
 * Includes articulated head, visor, chest core, torso, shoulders, arms, forearms, and legs.
 */
function StationedAgentRobot({
  isBuilder,
  roleColor,
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
  roleColor: string;
  statusColor: string;
  robotGroup: React.Ref<Group>;
  headGroup: React.Ref<Group>;
  leftArmGroup: React.Ref<Group>;
  rightArmGroup: React.Ref<Group>;
  chestMat: React.Ref<MeshBasicMaterial>;
  visorMat: React.Ref<MeshBasicMaterial>;
  thinkRingGroup: React.Ref<Group>;
}) {
  const armor = isBuilder ? '#DCEBFF' : '#C8D9F0';
  const darkJoint = '#102038';
  const chassisTrim = '#34537A';
  const scale = isBuilder ? 1.06 : 0.96;

  return (
    <group ref={robotGroup} position={[0, 0, 0.62]} rotation={[0, Math.PI, 0]} scale={scale}>
      {/* Articulated Legs (seated/standing hybrid operational stance) */}
      {[-0.13, 0.13].map((lx) => (
        <group key={lx} position={[lx, 0, 0]}>
          {/* Boot / foot base */}
          <mesh position={[0, 0.05, 0.04]} castShadow>
            <boxGeometry args={[0.11, 0.08, 0.18]} />
            <meshStandardMaterial color={chassisTrim} metalness={0.65} roughness={0.32} />
          </mesh>
          {/* Lower leg */}
          <mesh position={[0, 0.24, 0]} castShadow>
            <capsuleGeometry args={[0.048, 0.24, 6, 12]} />
            <meshStandardMaterial color={armor} metalness={0.5} roughness={0.3} />
          </mesh>
          {/* Knee joint */}
          <mesh position={[0, 0.4, 0.01]}>
            <sphereGeometry args={[0.052, 12, 12]} />
            <meshStandardMaterial color={darkJoint} metalness={0.7} roughness={0.35} />
          </mesh>
          {/* Upper leg */}
          <mesh position={[0, 0.54, -0.02]} rotation={[0.18, 0, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.22, 6, 12]} />
            <meshStandardMaterial color={armor} metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Pelvis / Waist Core */}
      <mesh position={[0, 0.68, -0.03]} castShadow>
        <cylinderGeometry args={[0.15, 0.13, 0.12, 16]} />
        <meshStandardMaterial color={darkJoint} metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Main Armored Torso */}
      <group position={[0, 0.96, -0.02]}>
        <RoundedBox args={[0.38, 0.44, 0.24]} radius={0.07} smoothness={3} castShadow>
          <meshStandardMaterial color={armor} metalness={0.52} roughness={0.26} />
        </RoundedBox>
        {/* Shoulder pauldrons */}
        {[-0.23, 0.23].map((sx) => (
          <mesh key={sx} position={[sx, 0.15, 0]} castShadow>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshStandardMaterial color={chassisTrim} metalness={0.65} roughness={0.28} />
          </mesh>
        ))}
        {/* Role collar accent */}
        <mesh position={[0, 0.22, 0]}>
          <torusGeometry args={[0.11, 0.018, 10, 24]} />
          <meshBasicMaterial color={roleColor} toneMapped={false} />
        </mesh>
        {/* Illuminated Chest Reactor Core (faces desk and also has dorsal status spine) */}
        <mesh position={[0, 0.04, 0.125]}>
          <circleGeometry args={[0.075, 24]} />
          <meshBasicMaterial ref={chestMat} color={statusColor} toneMapped={false} />
        </mesh>
        {/* Dorsal status indicator strip (visible from isometric camera behind robot) */}
        <mesh position={[0, 0.04, -0.125]}>
          <boxGeometry args={[0.16, 0.22, 0.018]} />
          <meshStandardMaterial color="#071020" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.04, -0.136]}>
          <planeGeometry args={[0.09, 0.16]} />
          <meshBasicMaterial color={statusColor} toneMapped={false} />
        </mesh>
      </group>

      {/* Articulated Left Arm */}
      <group ref={leftArmGroup} position={[-0.24, 1.1, -0.02]} rotation={[0.55, 0, -0.12]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <capsuleGeometry args={[0.042, 0.18, 6, 12]} />
          <meshStandardMaterial color={armor} metalness={0.48} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.26, 0.1]} rotation={[0.85, 0, 0]} castShadow>
          <capsuleGeometry args={[0.038, 0.18, 6, 12]} />
          <meshStandardMaterial color={chassisTrim} metalness={0.62} roughness={0.28} />
        </mesh>
      </group>

      {/* Articulated Right Arm */}
      <group ref={rightArmGroup} position={[0.24, 1.1, -0.02]} rotation={[0.55, 0, 0.12]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <capsuleGeometry args={[0.042, 0.18, 6, 12]} />
          <meshStandardMaterial color={armor} metalness={0.48} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.26, 0.1]} rotation={[0.85, 0, 0]} castShadow>
          <capsuleGeometry args={[0.038, 0.18, 6, 12]} />
          <meshStandardMaterial color={chassisTrim} metalness={0.62} roughness={0.28} />
        </mesh>
      </group>

      {/* Articulated Robotic Head + Visor + Antennae */}
      <group ref={headGroup} position={[0, 1.38, -0.02]}>
        <RoundedBox args={[0.28, 0.25, 0.26]} radius={0.08} smoothness={3} castShadow>
          <meshStandardMaterial color={armor} metalness={0.52} roughness={0.24} />
        </RoundedBox>
        {/* Panoramic wrap-around visor */}
        <mesh position={[0, 0.01, 0.118]}>
          <boxGeometry args={[0.23, 0.11, 0.04]} />
          <meshStandardMaterial color="#050C1A" metalness={0.8} roughness={0.15} />
        </mesh>
        {/* Glowing visor optical eyes */}
        <mesh position={[0, 0.01, 0.141]}>
          <planeGeometry args={[0.17, 0.045]} />
          <meshBasicMaterial ref={visorMat} color={statusColor} toneMapped={false} />
        </mesh>
        {/* Rear neural halo band so camera sees status on back of head too */}
        <mesh position={[0, 0.02, -0.132]}>
          <planeGeometry args={[0.16, 0.032]} />
          <meshBasicMaterial color={statusColor} toneMapped={false} />
        </mesh>
        {/* Side telemetry transceivers */}
        {[-0.155, 0.155].map((ex) => (
          <mesh key={ex} position={[ex, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.045, 0.045, 0.035, 14]} />
            <meshStandardMaterial color={chassisTrim} metalness={0.7} roughness={0.25} />
          </mesh>
        ))}
        {/* Crown antenna */}
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.01, 0.014, 0.12, 8]} />
          <meshStandardMaterial color={chassisTrim} metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <sphereGeometry args={[0.032, 12, 12]} />
          <meshBasicMaterial color={statusColor} toneMapped={false} />
        </mesh>
      </group>

      {/* Thinking / Processing Orbital Data Rings around the Robot Head */}
      <group ref={thinkRingGroup} position={[0, 1.56, -0.02]} visible={false}>
        <mesh rotation={[Math.PI / 2.3, 0.2, 0]}>
          <torusGeometry args={[0.26, 0.01, 8, 32]} />
          <meshBasicMaterial color={statusColor} transparent opacity={0.8} toneMapped={false} />
        </mesh>
        {[-0.24, 0.24, 0].map((ox, idx) => (
          <mesh key={idx} position={[ox, (idx - 1) * 0.05, idx === 2 ? 0.24 : -0.12]}>
            <octahedronGeometry args={[0.032, 0]} />
            <meshBasicMaterial color={statusColor} toneMapped={false} />
          </mesh>
        ))}
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
  const orb = useRef<Mesh>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  const pulseRing = useRef<Mesh>(null);
  const holoPad = useRef<Mesh>(null);

  // Robot animation refs
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
  const width = isBuilder ? 2.85 : 1.92;
  const state = agent?.state ?? 'idle';
  const style = STATE_STYLES[state] ?? STATE_STYLES.idle;
  const color = style.color;

  useFrame(({ clock }) => {
    const live = useTelemetryStore.getState().agents[id];
    if (!live) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const phase = position[0] * 0.7 + position[2] * 0.5;
    const isThinking = live.state === 'thinking';
    const isCallingTool = live.state === 'tool_execution' || live.state === 'running';
    const isError = live.state === 'error' || live.state === 'failed';
    const active = ACTIVE.has(live.state);
    const wave = 0.5 + 0.5 * Math.sin(t * (isError ? 4.5 : active ? 5.2 : 2.2) + phase);
    const intensity = active ? 1.45 + 1.15 * wave : isError ? 1.1 + 0.55 * wave : 0.55;

    for (const s of screens) if (s.current) s.current.emissiveIntensity = intensity;

    if (halo.current) {
      const size = active ? 2.35 + 0.4 * wave : isError ? 2.0 : 1.35;
      halo.current.scale.set(size, size, 1);
      (halo.current.material as SpriteMaterial).opacity = active ? 0.52 + 0.24 * wave : isError ? 0.45 : 0.16;
    }

    if (orb.current) {
      orb.current.position.y = 1.78 + (active ? 0.07 * Math.sin(t * 3.4 + phase) : 0.025 * Math.sin(t * 1.8 + phase));
      orb.current.rotation.y = t * (active ? 2.4 : 0.7);
    }

    if (holoPad.current) {
      holoPad.current.rotation.z = t * (isCallingTool ? 2.8 : 0.6);
    }

    if (ring.current) {
      ring.current.opacity = selected ? 0.92 : active ? 0.42 + 0.32 * wave : hoveredRef.current ? 0.58 : 0.2;
    }

    if (pulseRing.current) {
      pulseRing.current.visible = active || selected || isError;
      const pulseScale = 1 + (reducedMotion ? 0.04 : ((t * 0.85 + phase) % 1) * 0.28);
      pulseRing.current.scale.set(pulseScale, pulseScale, 1);
      (pulseRing.current.material as MeshBasicMaterial).opacity = selected
        ? 0.45
        : active
          ? 0.38 * (1 - ((t * 0.85 + phase) % 1))
          : 0.25;
    }

    // State-driven humanoid robot animation
    if (robotGroup.current && headGroup.current && leftArmGroup.current && rightArmGroup.current) {
      if (isThinking) {
        // THINKING: slight lean, head scanning, hand raised thoughtfully, orbital thinking ring active
        robotGroup.current.position.y = 0.02 * Math.sin(t * 3.2 + phase);
        headGroup.current.rotation.y = 0.26 * Math.sin(t * 2.1 + phase);
        headGroup.current.rotation.x = -0.12 + 0.08 * Math.sin(t * 3.6);
        leftArmGroup.current.rotation.x = 0.5 + 0.15 * Math.sin(t * 3.2);
        rightArmGroup.current.rotation.x = 0.92 + 0.12 * Math.cos(t * 4.0);
      } else if (isCallingTool) {
        // CALLING TOOL: rapid interactive console typing & holographic manipulation
        robotGroup.current.position.y = 0.015 * Math.sin(t * 6 + phase);
        headGroup.current.rotation.y = 0.16 * Math.sin(t * 4.5);
        headGroup.current.rotation.x = 0.08;
        leftArmGroup.current.rotation.x = 0.65 + 0.24 * Math.sin(t * 11 + phase);
        rightArmGroup.current.rotation.x = 0.65 + 0.24 * Math.cos(t * 11 + phase);
      } else if (isError) {
        // ERROR: restrained warning posture without harsh strobe
        robotGroup.current.position.y = 0;
        headGroup.current.rotation.x = 0.22;
        headGroup.current.rotation.z = 0.08 * Math.sin(t * 3.5);
        leftArmGroup.current.rotation.x = 0.25;
        rightArmGroup.current.rotation.x = 0.25;
      } else {
        // READY: subtle breathing idle posture at workstation
        robotGroup.current.position.y = 0.012 * Math.sin(t * 1.9 + phase);
        headGroup.current.rotation.y = 0.08 * Math.sin(t * 1.1 + phase);
        headGroup.current.rotation.x = 0;
        headGroup.current.rotation.z = 0;
        leftArmGroup.current.rotation.x = 0.52 + 0.04 * Math.sin(t * 1.9 + phase);
        rightArmGroup.current.rotation.x = 0.52 + 0.04 * Math.cos(t * 1.9 + phase);
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
  const monitorConfigs = isBuilder
    ? [
        { x: -0.88, z: -0.18, rotY: 0.24, w: 0.78 },
        { x: 0, z: -0.28, rotY: 0, w: 0.88 },
        { x: 0.88, z: -0.18, rotY: -0.24, w: 0.78 },
      ]
    : [
        { x: -0.38, z: -0.24, rotY: 0.14, w: 0.72 },
        { x: 0.38, z: -0.24, rotY: -0.14, w: 0.72 },
      ];

  const currentTask =
    agent.stateDetail ||
    (lastTool?.status === 'running' ? `Running ${lastTool.toolName}` : lastTool ? `Last tool: ${lastTool.toolName}` : undefined);

  return (
    <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Individual tiered architectural workstation foundation */}
      <RoundedBox
        args={[isBuilder ? 3.45 : 2.38, 0.11, isBuilder ? 2.38 : 2.08]}
        radius={0.04}
        smoothness={2}
        position={[0, 0.056, 0.15]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={palette.wall} metalness={0.56} roughness={0.38} />
      </RoundedBox>
      {/* Glowing perimeter front trim on individual foundation */}
      <mesh position={[0, 0.116, isBuilder ? 1.32 : 1.17]}>
        <boxGeometry args={[isBuilder ? 3.1 : 2.08, 0.018, 0.03]} />
        <meshBasicMaterial color={selected ? '#2DD4FF' : roleColor} transparent opacity={0.75} toneMapped={false} />
      </mesh>

      {/* Primary floor status ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.118, 0.15]}>
        <ringGeometry args={[isBuilder ? 1.48 : 1.04, isBuilder ? 1.58 : 1.12, 64]} />
        <meshBasicMaterial ref={ring} color={selected ? '#2DD4FF' : color} transparent opacity={0.32} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Animated outer activity pulse ring */}
      <mesh ref={pulseRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.121, 0.15]} visible={false}>
        <ringGeometry args={[isBuilder ? 1.6 : 1.15, isBuilder ? 1.68 : 1.21, 64]} />
        <meshBasicMaterial color={selected ? '#2DD4FF' : color} transparent opacity={0.28} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Futuristic curved command console desk */}
      <RoundedBox args={[width, 0.08, 0.98]} radius={0.03} smoothness={2} position={[0, 0.76, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={palette.deskTop} metalness={0.42} roughness={0.35} />
      </RoundedBox>

      {/* Illuminated front edge trim on desk */}
      <mesh position={[0, 0.76, 0.495]}>
        <boxGeometry args={[width - 0.14, 0.024, 0.016]} />
        <meshBasicMaterial color={selected ? '#2DD4FF' : roleColor} transparent opacity={0.85} toneMapped={false} />
      </mesh>

      {/* Angled architectural desk pedestals */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (width / 2 - 0.22), 0.42, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.14, 0.68, 0.72]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[sx * 0.075, 0, 0]}>
            <boxGeometry args={[0.015, 0.52, 0.56]} />
            <meshBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Desk surface holographic projection emitter & control keyboard */}
      <mesh position={[0, 0.806, 0.18]}>
        <planeGeometry args={[0.72, 0.24]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} toneMapped={false} />
      </mesh>
      <mesh ref={holoPad} rotation={[-Math.PI / 2, 0, 0]} position={[isBuilder ? 0.85 : 0.58, 0.808, 0.16]}>
        <ringGeometry args={[0.09, 0.14, 6]} />
        <meshBasicMaterial color={roleColor} transparent opacity={0.65} toneMapped={false} />
      </mesh>

      {/* Panoramic Holographic Monitors */}
      {monitorConfigs.map((m, i) => (
        <Monitor key={m.x} x={m.x} z={m.z} rotY={m.rotY} width={m.w} screenRef={screens[i]} color={color} roleColor={roleColor} />
      ))}

      {/* Stationed Humanoid Agent Robot */}
      <StationedAgentRobot
        isBuilder={isBuilder}
        roleColor={roleColor}
        statusColor={color}
        robotGroup={robotGroup}
        headGroup={headGroup}
        leftArmGroup={leftArmGroup}
        rightArmGroup={rightArmGroup}
        chestMat={chestMat}
        visorMat={visorMat}
        thinkRingGroup={thinkRingGroup}
      />

      {/* Ergonomic cybernetic command chair behind robot */}
      <group position={[0, 0.08, 0.86]}>
        <mesh position={[0, 0.38, 0]} castShadow>
          <boxGeometry args={[0.52, 0.07, 0.46]} />
          <meshStandardMaterial color={palette.chair} metalness={0.45} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.76, 0.21]} castShadow>
          <boxGeometry args={[0.48, 0.68, 0.06]} />
          <meshStandardMaterial color={palette.chair} metalness={0.45} roughness={0.38} />
        </mesh>
        <mesh position={[0, 0.78, 0.245]}>
          <planeGeometry args={[0.32, 0.42]} />
          <meshBasicMaterial color={roleColor} transparent opacity={0.3} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.36, 12]} />
          <meshStandardMaterial color={palette.deskLeg} metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* Floating crystalline status beacon + soft additive halo */}
      <mesh ref={orb} position={[0, 1.78, -0.24]}>
        <octahedronGeometry args={[isBuilder ? 0.12 : 0.095, 0]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Halo ref={halo} color={color} position={[0, 1.78, -0.24]} />

      {(showLabel || ACTIVE.has(state) || hovered || selected) && (
        <Html position={[0, isBuilder ? 2.52 : 2.34, -0.18]} center distanceFactor={10.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex min-w-[146px] max-w-[216px] flex-col rounded-xl border px-2.5 py-1 shadow-2xl backdrop-blur-xl transition-all ${
              selected
                ? 'border-cyan-400/80 bg-slate-950/90 shadow-cyan-500/20'
                : 'border-cyan-300/20 bg-slate-950/80'
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
