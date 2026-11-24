import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { MeshStandardMaterial } from 'three';
import type { Vec3 } from '../officeLayout';
import { getProcessMonitorTexture } from './textures';

/**
 * Clean Enterprise 3-Monitor Process Operator Workstation matching the reference's left desk:
 * - Matte brushed-silver/white desk with recessed workstation tower PC under left leg
 * - Sleek black ergonomic swivel task chair
 * - Panoramic 3-monitor curved cyan workflow display array (Metrics, Radar, Stage Topology)
 */
export const ProcessWorkstation = memo(function ProcessWorkstation({
  position = [-2.55, 0, 0.35],
  rotation = [0, 0.12, 0],
  activityRef,
  isDark = true,
}: {
  position?: Vec3;
  rotation?: [number, number, number];
  activityRef: React.RefObject<number>;
  isDark?: boolean;
}) {
  const texL = useMemo(() => getProcessMonitorTexture('metrics', isDark), [isDark]);
  const texC = useMemo(() => getProcessMonitorTexture('radar', isDark), [isDark]);
  const texR = useMemo(() => getProcessMonitorTexture('graph', isDark), [isDark]);
  const screenMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const energy = activityRef.current ?? 0;
    if (screenMatRef.current) {
      screenMatRef.current.emissiveIntensity = (isDark ? 1.0 : 0.84) + energy * (0.45 + 0.2 * Math.sin(clock.elapsedTime * 5.5));
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Desk Frame Legs & Brushed-Silver Panel End-Supports */}
      {[-0.98, 0.98].map((lx, i) => (
        <RoundedBox key={i} args={[0.08, 0.74, 0.78]} radius={0.02} position={[lx, 0.37, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#CBD5E1' : '#9EAFBF'} roughness={0.28} metalness={isDark ? 0.78 : 0.64} />
        </RoundedBox>
      ))}
      {/* Under-Desk Workstation Tower PC on Left Side */}
      <group position={[-0.78, 0.28, 0.04]}>
        <RoundedBox args={[0.24, 0.52, 0.56]} radius={0.02} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#94A3B8' : '#DCE4EB'} roughness={0.26} metalness={isDark ? 0.82 : 0.64} />
        </RoundedBox>
        <mesh position={[0, 0.14, 0.284]}>
          <boxGeometry args={[0.14, 0.025, 0.01]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.0} />
        </mesh>
      </group>

      {/* Clean Matte-Silver Enterprise Desktop Surface */}
      <RoundedBox args={[2.16, 0.07, 0.88]} radius={0.025} smoothness={2} position={[0, 0.76, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#E2E8F0' : '#F5F7FA'} roughness={0.24} metalness={isDark ? 0.62 : 0.52} />
      </RoundedBox>

      {/* Slim Wireless Keyboard & Mouse */}
      <mesh position={[0.02, 0.805, 0.22]} castShadow>
        <boxGeometry args={[0.72, 0.018, 0.2]} />
        <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0.52, 0.805, 0.23]} castShadow>
        <boxGeometry args={[0.08, 0.02, 0.12]} />
        <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} roughness={0.35} metalness={0.5} />
      </mesh>

      {/* 3 Curved Cyan Workflow Monitoring Displays on Brushed-Steel Stands */}
      {[
        { pos: [-0.68, 1.18, -0.14] as Vec3, rotY: 0.2, tex: texL },
        { pos: [0.0, 1.18, -0.2] as Vec3, rotY: 0, tex: texC },
        { pos: [0.68, 1.18, -0.14] as Vec3, rotY: -0.2, tex: texR },
      ].map((m, i) => (
        <group key={i} position={[m.pos[0], 0, m.pos[2]]} rotation={[0, m.rotY, 0]}>
          {/* Monitor Stand Stem & Base */}
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[0.18, 0.02, 0.14]} />
            <meshStandardMaterial color={isDark ? '#64748B' : '#9EAFBF'} metalness={isDark ? 0.86 : 0.66} roughness={0.24} />
          </mesh>
          <mesh position={[0, 0.96, -0.02]}>
            <cylinderGeometry args={[0.02, 0.022, 0.34, 8]} />
            <meshStandardMaterial color={isDark ? '#64748B' : '#9EAFBF'} metalness={isDark ? 0.86 : 0.66} roughness={0.24} />
          </mesh>
          {/* Thin Bezel Display Chassis */}
          <RoundedBox args={[0.66, 0.44, 0.032]} radius={0.016} position={[0, 1.18, 0]} castShadow>
            <meshStandardMaterial color={isDark ? '#0F172A' : '#536B83'} roughness={0.28} metalness={isDark ? 0.82 : 0.68} />
          </RoundedBox>
          <mesh position={[0, 1.18, 0.019]}>
            <planeGeometry args={[0.61, 0.39]} />
            {m.tex ? (
              <meshStandardMaterial
                ref={i === 1 ? screenMatRef : undefined}
                map={m.tex}
                emissive="#FFFFFF"
                emissiveMap={m.tex}
                emissiveIntensity={isDark ? 1.06 : 0.84}
                roughness={0.18}
              />
            ) : (
              <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.0} />
            )}
          </mesh>
        </group>
      ))}

      {/* Sleek Ergonomic Swivel Office Chair positioned in front of Desk */}
      <group position={[0.1, 0, 0.68]} rotation={[0, Math.PI + 0.18, 0]}>
        {/* 5-star chrome base & pneumatic column */}
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.26, 0.28, 0.04, 5]} />
          <meshStandardMaterial color={isDark ? '#475569' : '#9EAFBF'} metalness={isDark ? 0.88 : 0.68} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.032, 0.035, 0.38, 10]} />
          <meshStandardMaterial color={isDark ? '#64748B' : '#9EAFBF'} metalness={isDark ? 0.9 : 0.68} roughness={0.2} />
        </mesh>
        {/* Contoured seat cushion */}
        <RoundedBox args={[0.48, 0.07, 0.46]} radius={0.03} position={[0, 0.45, 0]} castShadow>
          <meshStandardMaterial color={isDark ? '#111827' : '#3B5066'} roughness={0.55} metalness={0.22} />
        </RoundedBox>
        {/* Ergonomic backrest */}
        <RoundedBox args={[0.44, 0.5, 0.06]} radius={0.03} position={[0, 0.74, -0.22]} rotation={[-0.12, 0, 0]} castShadow>
          <meshStandardMaterial color={isDark ? '#111827' : '#3B5066'} roughness={0.55} metalness={0.22} />
        </RoundedBox>
        {/* Armrests */}
        {[-0.25, 0.25].map((ax, i) => (
          <mesh key={i} position={[ax, 0.6, -0.02]}>
            <boxGeometry args={[0.04, 0.035, 0.28]} />
            <meshStandardMaterial color={isDark ? '#334155' : '#536B83'} roughness={0.4} metalness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

/**
 * Minimalist Architectural Matte-White Square Planter with Layered Emerald Foliage (exact reference accent).
 */
export const ArchitecturalPlanter = memo(function ArchitecturalPlanter({
  position,
  potHeight = 0.72,
  potWidth = 0.56,
}: {
  position: Vec3;
  potHeight?: number;
  potWidth?: number;
}) {
  const leafAngles = useMemo(() => [0, 0.78, 1.57, 2.35, 3.14, 3.92, 4.71, 5.5], []);
  return (
    <group position={position}>
      {/* Matte-white architectural square planter box */}
      <RoundedBox args={[potWidth, potHeight, potWidth]} radius={0.025} smoothness={2} position={[0, potHeight / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#F1F5F9" roughness={0.38} metalness={0.08} />
      </RoundedBox>
      {/* Dark soil bed */}
      <mesh position={[0, potHeight - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[potWidth - 0.08, potWidth - 0.08]} />
        <meshStandardMaterial color="#1E293B" roughness={0.92} />
      </mesh>
      {/* Layered architectural dark-emerald foliage blades */}
      <group position={[0, potHeight, 0]}>
        {leafAngles.map((ang, i) => {
          const isInner = i % 2 === 0;
          const len = isInner ? 0.58 : 0.48;
          const tilt = isInner ? 0.36 : 0.68;
          return (
            <group key={i} rotation={[0, ang, 0]}>
              <mesh position={[0, len * 0.44, Math.sin(tilt) * 0.14]} rotation={[tilt, 0, 0]} castShadow>
                <coneGeometry args={[0.085, len, 5]} />
                <meshStandardMaterial color={isInner ? '#15803D' : '#22C55E'} roughness={0.55} metalness={0.05} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
});
