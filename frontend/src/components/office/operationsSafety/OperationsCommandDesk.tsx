import { memo, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Vec3 } from '../officeLayout';
import { getOpsCommandMonitorTexture } from './textures';

/**
 * Tiny minimalist desk-accent planter matching the twin white mini-pots on the reference command desk.
 */
const DeskMiniPlant = memo(function DeskMiniPlant({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.068, 0.052, 0.12, 12]} />
        <meshStandardMaterial color="#E2E8F0" roughness={0.28} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <dodecahedronGeometry args={[0.085, 0]} />
        <meshStandardMaterial color="#15803D" roughness={0.62} />
      </mesh>
      <mesh position={[0.03, 0.19, 0.02]}>
        <dodecahedronGeometry args={[0.058, 0]} />
        <meshStandardMaterial color="#22C55E" roughness={0.58} />
      </mesh>
    </group>
  );
});

/**
 * Sleek Black Ergonomic Swivel Command Chair facing the curved 4-monitor workstation.
 */
const CommandSwivelChair = memo(function CommandSwivelChair({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* 5-star chrome caster base */}
      {[0, 1, 2, 3, 4].map((i) => {
        const ang = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation={[0, ang, 0]}>
            <mesh position={[0.16, 0.04, 0]}>
              <boxGeometry args={[0.32, 0.025, 0.036]} />
              <meshStandardMaterial color="#64748B" metalness={0.86} roughness={0.24} />
            </mesh>
            <mesh position={[0.31, 0.022, 0]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#0F172A" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.032, 0.038, 0.38, 12]} />
        <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Contoured cushioned seat */}
      <RoundedBox args={[0.52, 0.075, 0.48]} radius={0.03} smoothness={2} position={[0, 0.44, 0]} castShadow>
        <meshStandardMaterial color="#0F172A" roughness={0.52} metalness={0.18} />
      </RoundedBox>
      {/* High-back mesh/leather command backrest */}
      <RoundedBox args={[0.48, 0.64, 0.065]} radius={0.03} smoothness={2} position={[0, 0.8, 0.22]} rotation={[0.1, 0, 0]} castShadow>
        <meshStandardMaterial color="#111827" roughness={0.48} metalness={0.22} />
      </RoundedBox>
      {/* Headrest */}
      <RoundedBox args={[0.26, 0.13, 0.06]} radius={0.025} smoothness={2} position={[0, 1.18, 0.24]} castShadow>
        <meshStandardMaterial color="#1E293B" roughness={0.42} metalness={0.25} />
      </RoundedBox>
      {/* Twin Armrests */}
      {[-0.27, 0.27].map((ax, i) => (
        <group key={i} position={[ax, 0.57, 0.02]}>
          <mesh position={[0, -0.05, 0.05]}>
            <boxGeometry args={[0.03, 0.16, 0.04]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.28} />
          </mesh>
          <RoundedBox args={[0.055, 0.032, 0.28]} radius={0.01} smoothness={2} position={[0, 0.04, 0]}>
            <meshStandardMaterial color="#0F172A" roughness={0.5} />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
});

/**
 * Central Curved 4-Monitor Operations & Safety Command Workstation matching the reference centerpiece:
 * - Curved brushed-titanium & dark obsidian U-shaped command desk with blue under-desk LED accent strips
 * - 4 angled curved cyan-lit tactical monitors + keyboards + mice
 * - Twin small white desk accent plants at the outer wings
 * - Sleek black ergonomic command swivel chair facing the monitors & rear operations wall
 */
export const OperationsCommandDesk = memo(function OperationsCommandDesk({
  position = [-0.15, 0, 0.45],
  onSelect,
}: {
  position?: Vec3;
  onSelect?: () => void;
}) {
  const monTex0 = useMemo(() => getOpsCommandMonitorTexture(0), []);
  const monTex1 = useMemo(() => getOpsCommandMonitorTexture(1), []);
  const monTex2 = useMemo(() => getOpsCommandMonitorTexture(2), []);
  const monTex3 = useMemo(() => getOpsCommandMonitorTexture(3), []);
  const monitorTextures = [monTex0, monTex1, monTex2, monTex3];

  const monitors: { pos: Vec3; rotY: number }[] = [
    { pos: [-1.18, 1.09, -0.14], rotY: 0.38 },
    { pos: [-0.41, 1.09, -0.34], rotY: 0.12 },
    { pos: [0.41, 1.09, -0.34], rotY: -0.12 },
    { pos: [1.18, 1.09, -0.14], rotY: -0.38 },
  ];

  return (
    <group
      position={position}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* CURVED SEGMENTED COMMAND DESK SURFACE (Center + Angled Left/Right Wings) */}
      {/* Center desktop */}
      <RoundedBox args={[1.9, 0.08, 0.88]} radius={0.025} smoothness={2} position={[0, 0.78, -0.22]} castShadow receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.26} metalness={0.84} />
      </RoundedBox>
      {/* Left angled wing */}
      <RoundedBox
        args={[1.28, 0.08, 0.82]}
        radius={0.025}
        smoothness={2}
        position={[-1.32, 0.78, 0.08]}
        rotation={[0, 0.48, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#334155" roughness={0.26} metalness={0.84} />
      </RoundedBox>
      {/* Right angled wing */}
      <RoundedBox
        args={[1.28, 0.08, 0.82]}
        radius={0.025}
        smoothness={2}
        position={[1.32, 0.78, 0.08]}
        rotation={[0, -0.48, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#334155" roughness={0.26} metalness={0.84} />
      </RoundedBox>

      {/* Dark recessed modesty shroud & left/right hardware cabinet pedestals */}
      <RoundedBox args={[1.65, 0.72, 0.22]} radius={0.02} smoothness={2} position={[0, 0.37, -0.44]} castShadow receiveShadow>
        <meshStandardMaterial color="#111827" roughness={0.38} metalness={0.82} />
      </RoundedBox>
      {[-1.55, 1.55].map((px, i) => (
        <group key={i} position={[px, 0.37, 0.18]} rotation={[0, i === 0 ? 0.48 : -0.48, 0]}>
          <RoundedBox args={[0.56, 0.74, 0.72]} radius={0.03} smoothness={2} castShadow receiveShadow>
            <meshStandardMaterial color="#1E293B" roughness={0.32} metalness={0.84} />
          </RoundedBox>
          {/* Glowing electric-blue under-desk vertical & lower edge strip */}
          <mesh position={[0, 0.32, 0.365]}>
            <boxGeometry args={[0.46, 0.026, 0.02]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.3} />
          </mesh>
          <mesh position={[0, -0.32, 0.365]}>
            <boxGeometry args={[0.46, 0.026, 0.02]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.1} />
          </mesh>
        </group>
      ))}

      {/* Glowing cyan front-knee & top-lip LED accent bar */}
      <mesh position={[0, 0.72, -0.58]}>
        <boxGeometry args={[1.76, 0.026, 0.024]} />
        <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.3} />
      </mesh>
      <mesh position={[0, 0.14, -0.32]}>
        <boxGeometry args={[1.52, 0.024, 0.024]} />
        <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={2.0} />
      </mesh>

      {/* 4 ANGLED TACTICAL CYAN MONITORS */}
      {monitors.map((m, i) => {
        const tex = monitorTextures[i];
        return (
          <group key={i} position={m.pos} rotation={[0, m.rotY, 0]}>
            {/* Brushed metal stand & base */}
            <mesh position={[0, -0.21, -0.04]}>
              <boxGeometry args={[0.048, 0.16, 0.04]} />
              <meshStandardMaterial color="#64748B" metalness={0.88} roughness={0.22} />
            </mesh>
            <mesh position={[0, -0.275, -0.02]}>
              <boxGeometry args={[0.22, 0.018, 0.16]} />
              <meshStandardMaterial color="#475569" metalness={0.86} roughness={0.26} />
            </mesh>
            {/* Slim dark monitor chassis */}
            <RoundedBox args={[0.74, 0.42, 0.036]} radius={0.012} smoothness={2} castShadow>
              <meshStandardMaterial color="#0F172A" roughness={0.28} metalness={0.84} />
            </RoundedBox>
            {/* Glowing screen facing operator (+Z) */}
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[0.69, 0.37]} />
              {tex ? (
                <meshStandardMaterial
                  map={tex}
                  emissive="#FFFFFF"
                  emissiveMap={tex}
                  emissiveIntensity={0.95}
                  roughness={0.18}
                />
              ) : (
                <meshStandardMaterial color="#041229" emissive="#00B8FF" emissiveIntensity={0.8} />
              )}
            </mesh>
          </group>
        );
      })}

      {/* Keyboards & Mice across curved console */}
      {[
        { pos: [-1.05, 0.83, 0.18] as Vec3, rotY: 0.44 },
        { pos: [0, 0.83, -0.02] as Vec3, rotY: 0 },
        { pos: [1.05, 0.83, 0.18] as Vec3, rotY: -0.44 },
      ].map((kb, i) => (
        <group key={i} position={kb.pos} rotation={[0, kb.rotY, 0]}>
          <mesh>
            <boxGeometry args={[0.42, 0.018, 0.14]} />
            <meshStandardMaterial color="#1E293B" roughness={0.35} metalness={0.65} />
          </mesh>
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry args={[0.38, 0.004, 0.1]} />
            <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={0.75} />
          </mesh>
          <mesh position={[0.28, 0.008, 0.01]}>
            <boxGeometry args={[0.055, 0.018, 0.088]} />
            <meshStandardMaterial color="#0F172A" roughness={0.35} />
          </mesh>
        </group>
      ))}

      {/* Twin Minimalist Desk Accent Plants at Far Wings */}
      <DeskMiniPlant position={[-1.68, 0.82, 0.28]} />
      <DeskMiniPlant position={[1.68, 0.82, 0.28]} />

      {/* Ergonomic Swivel Command Chair */}
      <CommandSwivelChair position={[0, 0, 0.72]} />
    </group>
  );
});
