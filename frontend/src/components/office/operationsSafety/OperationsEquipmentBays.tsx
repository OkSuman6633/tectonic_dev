import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, type MeshStandardMaterial } from 'three';
import type { Vec3 } from '../officeLayout';
import { CurvedChromePipe } from '../toolOrchestration/ServerAndCoolingHardware';
import {
  getFireSignTexture,
  getOpsServerFaceTexture,
  getSafetyFirstGlassTexture,
} from './textures';

/**
 * Detailed 3D Emergency Red Fire Extinguisher with white specification label,
 * brass valve & trigger handle, pressure gauge, and black curved discharge hose/nozzle.
 */
const FireExtinguisher = memo(function FireExtinguisher({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* Steel wall mount collar */}
      <mesh position={[0, 0.36, -0.095]}>
        <boxGeometry args={[0.16, 0.42, 0.025]} />
        <meshStandardMaterial color="#334155" metalness={0.84} roughness={0.3} />
      </mesh>
      {/* Glossy crimson cylinder body */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.105, 0.105, 0.52, 18]} />
        <meshStandardMaterial color="#DC2626" roughness={0.22} metalness={0.38} />
      </mesh>
      {/* Domed top shoulder */}
      <mesh position={[0, 0.54, 0]} castShadow>
        <sphereGeometry args={[0.105, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#DC2626" roughness={0.22} metalness={0.38} />
      </mesh>
      {/* White specification label band */}
      <mesh position={[0, 0.32, 0.002]}>
        <cylinderGeometry args={[0.108, 0.108, 0.18, 16, 1, true, -0.95, 1.9]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
      </mesh>
      {/* Brass valve neck & pressure gauge */}
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.028, 0.032, 0.075, 12]} />
        <meshStandardMaterial color="#D4AF6A" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.035, 0.65, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.02, 12]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.25} />
      </mesh>
      {/* Black squeeze lever handles */}
      <mesh position={[-0.06, 0.71, 0]} rotation={[0, 0, 0.25]}>
        <boxGeometry args={[0.16, 0.02, 0.026]} />
        <meshStandardMaterial color="#0F172A" roughness={0.42} metalness={0.65} />
      </mesh>
      <mesh position={[-0.05, 0.67, 0]} rotation={[0, 0, 0.05]}>
        <boxGeometry args={[0.14, 0.018, 0.024]} />
        <meshStandardMaterial color="#1E293B" roughness={0.42} metalness={0.65} />
      </mesh>
      {/* Black flexible discharge hose & flared cone nozzle */}
      <mesh position={[0.115, 0.44, 0.03]} rotation={[0, 0, -0.1]}>
        <cylinderGeometry args={[0.014, 0.014, 0.42, 10]} />
        <meshStandardMaterial color="#111827" roughness={0.65} />
      </mesh>
      <mesh position={[0.135, 0.2, 0.05]} rotation={[0.12, 0, -0.15]}>
        <cylinderGeometry args={[0.018, 0.042, 0.14, 12]} />
        <meshStandardMaterial color="#090D16" roughness={0.55} />
      </mesh>
    </group>
  );
});

/**
 * Detailed 3D Red Medical First-Aid Kit with crisp raised white cross emblem & top carry handle.
 */
const FirstAidKit = memo(function FirstAidKit({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[0, -0.22, 0]}>
      <RoundedBox args={[0.52, 0.38, 0.22]} radius={0.03} smoothness={2} position={[0, 0.19, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#DC2626" roughness={0.26} metalness={0.22} />
      </RoundedBox>
      {/* Molded top handle */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.2, 0.035, 0.055]} />
        <meshStandardMaterial color="#991B1B" roughness={0.35} metalness={0.3} />
      </mesh>
      {[-0.085, 0.085].map((hx, i) => (
        <mesh key={i} position={[hx, 0.39, 0]}>
          <boxGeometry args={[0.032, 0.05, 0.055]} />
          <meshStandardMaterial color="#991B1B" roughness={0.35} />
        </mesh>
      ))}
      {/* Chrome latches */}
      {[-0.17, 0.17].map((lx, i) => (
        <mesh key={i} position={[lx, 0.36, 0.11]}>
          <boxGeometry args={[0.045, 0.055, 0.018]} />
          <meshStandardMaterial color="#CBD5E1" metalness={0.88} roughness={0.22} />
        </mesh>
      ))}
      {/* Crisp raised white medical cross (+) on front face */}
      <mesh position={[0, 0.19, 0.113]}>
        <boxGeometry args={[0.2, 0.064, 0.012]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.25} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.19, 0.113]}>
        <boxGeometry args={[0.064, 0.2, 0.012]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.25} roughness={0.3} />
      </mesh>
    </group>
  );
});

/**
 * Sculpted 3D Bright Yellow Industrial Safety Helmet (Hard Hat) with dome, crown ridge, and front brim.
 */
const SafetyHelmet = memo(function SafetyHelmet({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[0, -0.35, 0]}>
      {/* Main glossy safety-yellow hard-hat dome */}
      <mesh position={[0, 0.02, 0]} scale={[1.0, 0.88, 1.12]} castShadow>
        <sphereGeometry args={[0.19, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54]} />
        <meshStandardMaterial color="#FACC15" roughness={0.22} metalness={0.14} />
      </mesh>
      {/* Raised center reinforcement crown ridge */}
      <RoundedBox args={[0.055, 0.06, 0.34]} radius={0.018} smoothness={2} position={[0, 0.16, -0.01]} castShadow>
        <meshStandardMaterial color="#FDE047" roughness={0.24} metalness={0.14} />
      </RoundedBox>
      {/* Lower perimeter rim ring */}
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.04, 1.16, 1]}>
        <torusGeometry args={[0.192, 0.018, 10, 24]} />
        <meshStandardMaterial color="#EAB308" roughness={0.24} metalness={0.18} />
      </mesh>
      {/* Front curved sun/impact visor brim */}
      <mesh position={[0, 0.018, 0.2]} rotation={[0.14, 0, 0]} castShadow>
        <cylinderGeometry args={[0.175, 0.19, 0.018, 18, 1, false, -0.95, 1.9]} />
        <meshStandardMaterial color="#FACC15" roughness={0.22} metalness={0.14} />
      </mesh>
    </group>
  );
});

/**
 * 3-Tier Industrial Red / Amber / Green Stack Warning Signal Beacon mounted atop the Safety Cabinet.
 * Dynamically driven by live `useTelemetryStore` runtime alerts & safety status.
 */
const SafetyWarningBeacon = memo(function SafetyWarningBeacon({
  position,
  alertLevelRef,
}: {
  position: Vec3;
  alertLevelRef: React.RefObject<'ok' | 'warn' | 'alert'>;
}) {
  const reducedMotion = useReducedMotion();
  const redRef = useRef<MeshStandardMaterial>(null);
  const amberRef = useRef<MeshStandardMaterial>(null);
  const greenRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const lvl = alertLevelRef.current ?? 'ok';
    const fast = 0.5 + 0.5 * Math.sin(t * 9.5);
    const gentle = 0.5 + 0.5 * Math.sin(t * 3.5);

    if (redRef.current) {
      redRef.current.emissiveIntensity = lvl === 'alert' ? 3.2 + 2.2 * fast : 0.95;
    }
    if (amberRef.current) {
      amberRef.current.emissiveIntensity = lvl === 'warn' ? 3.2 + 1.8 * fast : 1.05;
    }
    if (greenRef.current) {
      greenRef.current.emissiveIntensity = lvl === 'ok' ? 2.6 + 0.65 * gentle : 0.6;
    }
  });

  return (
    <group position={position}>
      {/* Chrome mounting base & stem */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.11, 0.13, 0.06, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.88} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.22, 12]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.9} roughness={0.18} />
      </mesh>
      {/* Green lower lens */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.095, 0.095, 0.14, 18]} />
        <meshStandardMaterial ref={greenRef} color="#4ADE80" emissive="#22C55E" emissiveIntensity={2.6} roughness={0.16} />
      </mesh>
      {/* Amber middle lens */}
      <mesh position={[0, 0.49, 0]}>
        <cylinderGeometry args={[0.095, 0.095, 0.14, 18]} />
        <meshStandardMaterial ref={amberRef} color="#FDE047" emissive="#F59E0B" emissiveIntensity={1.2} roughness={0.16} />
      </mesh>
      {/* Red upper lens */}
      <mesh position={[0, 0.64, 0]}>
        <cylinderGeometry args={[0.095, 0.095, 0.14, 18]} />
        <meshStandardMaterial ref={redRef} color="#F87171" emissive="#EF4444" emissiveIntensity={1.1} roughness={0.16} />
      </mesh>
      {/* Matte gunmetal top cap */}
      <mesh position={[0, 0.74, 0]}>
        <cylinderGeometry args={[0.092, 0.098, 0.06, 18]} />
        <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.28} />
      </mesh>
    </group>
  );
});

/**
 * Left Enterprise Server Cabinets + Emergency Fire Extinguisher + Tall White Corner Planter,
 * AND Right Glowing Cyan Safety Monitoring Cabinet ("⚠ SAFETY FIRST") + Warning Beacon +
 * Heavy Industrial Chrome/Brass Pipework + First-Aid Kit + Yellow Hard Hat.
 */
export const OperationsEquipmentBays = memo(function OperationsEquipmentBays({
  alertLevelRef,
  onSelectGuardrails,
  isDark = true,
}: {
  alertLevelRef: React.RefObject<'ok' | 'warn' | 'alert'>;
  onSelectGuardrails?: () => void;
  isDark?: boolean;
}) {
  const serverFaceTex = useMemo(() => getOpsServerFaceTexture(isDark), [isDark]);
  const safetyGlassTex = useMemo(() => getSafetyFirstGlassTexture(), []);
  const fireSignTex = useMemo(() => getFireSignTexture(), []);

  // Heavy industrial brushed-chrome overhead conduit curving from dashboard right side over the Safety Cabinet to deck
  const rightIndustrialPipe: Vec3[] = useMemo(
    () => [
      [3.55, 2.75, -2.55],
      [4.55, 2.78, -2.42],
      [5.18, 2.68, -2.02],
      [5.28, 2.15, -1.72],
      [5.28, 0.95, -1.72],
      [5.28, 0.08, -1.72],
    ],
    [],
  );

  // Secondary parallel cooling pipe routing behind the safety bay
  const rearIndustrialPipe: Vec3[] = useMemo(
    () => [
      [3.55, 2.38, -2.75],
      [4.75, 2.38, -2.65],
      [5.48, 2.25, -2.28],
      [5.54, 1.55, -2.02],
      [5.54, 0.08, -2.02],
    ],
    [],
  );

  return (
    <group>
      {/* ===================================================================== */}
      {/* LEFT BAY: REALISTIC ENTERPRISE SERVER RACKS, FIRE EXTINGUISHER & PLANT */}
      {/* ===================================================================== */}

      {/* Tall Primary Left Server Rack */}
      <group position={[-4.25, 0, -1.85]} rotation={[0, 0.14, 0]}>
        <RoundedBox args={[1.18, 2.75, 1.12]} radius={0.05} smoothness={2} position={[0, 1.375, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#334155' : '#DCE4EB'} roughness={isDark ? 0.28 : 0.25} metalness={isDark ? 0.86 : 0.64} />
        </RoundedBox>
        <mesh position={[0, 1.38, 0.568]}>
          <planeGeometry args={[0.96, 2.48]} />
          {serverFaceTex ? (
            <meshStandardMaterial
              map={serverFaceTex}
              emissive="#FFFFFF"
              emissiveMap={serverFaceTex}
              emissiveIntensity={isDark ? 0.85 : 0.48}
              roughness={0.24}
              metalness={isDark ? 0.62 : 0.4}
            />
          ) : (
            <meshStandardMaterial color="#0A1224" emissive="#00B8FF" emissiveIntensity={0.6} />
          )}
        </mesh>
        {/* Glowing cyan vertical front corner rails */}
        {[-0.55, 0.55].map((rx, i) => (
          <mesh key={i} position={[rx, 1.38, 0.562]}>
            <boxGeometry args={[0.028, 2.55, 0.026]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} />
          </mesh>
        ))}
        {/* Top chrome cooling manifold */}
        <RoundedBox args={[1.06, 0.14, 0.96]} radius={0.03} smoothness={2} position={[0, 2.82, 0]} castShadow>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#F5F7FA'} roughness={isDark ? 0.34 : 0.2} metalness={isDark ? 0.84 : 0.56} />
        </RoundedBox>
      </group>

      {/* Mid-Height Front-Left Server Cabinet + Mounted Red Fire-Flame Sign + 3D Emergency Fire Extinguisher */}
      <group position={[-4.92, 0, -0.58]} rotation={[0, 0.22, 0]}>
        <RoundedBox args={[1.02, 2.1, 1.0]} radius={0.05} smoothness={2} position={[0, 1.05, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#DCE4EB'} roughness={isDark ? 0.32 : 0.25} metalness={isDark ? 0.86 : 0.64} />
        </RoundedBox>
        <mesh position={[0, 1.08, 0.506]}>
          <planeGeometry args={[0.82, 1.84]} />
          {serverFaceTex ? (
            <meshStandardMaterial
              map={serverFaceTex}
              emissive="#FFFFFF"
              emissiveMap={serverFaceTex}
              emissiveIntensity={isDark ? 0.78 : 0.48}
              roughness={0.26}
              metalness={isDark ? 0.58 : 0.4}
            />
          ) : (
            <meshStandardMaterial color="#0A1224" />
          )}
        </mesh>
        {[-0.47, 0.47].map((rx, i) => (
          <mesh key={i} position={[rx, 1.05, 0.504]}>
            <boxGeometry args={[0.026, 1.92, 0.024]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.2} />
          </mesh>
        ))}

        {/* Red Emergency Fire Sign Plaque mounted prominently on the front (+Z) corner face */}
        <mesh position={[0.26, 1.48, 0.515]}>
          <planeGeometry args={[0.34, 0.34]} />
          {fireSignTex ? (
            <meshStandardMaterial
              map={fireSignTex}
              emissive="#FFFFFF"
              emissiveMap={fireSignTex}
              emissiveIntensity={0.55}
              roughness={0.25}
            />
          ) : (
            <meshStandardMaterial color="#DC2626" />
          )}
        </mesh>

        {/* Sculpted 3D Red Emergency Fire Extinguisher mounted clearly in front of the left cabinet */}
        <FireExtinguisher position={[0.26, 0.04, 0.64]} />
      </group>

      {/* Low Auxiliary Telemetry Power Unit with glowing amber strip (front-left of desk, matching reference) */}
      <group position={[-3.38, 0, -0.78]}>
        <RoundedBox args={[0.68, 0.72, 0.62]} radius={0.03} smoothness={2} position={[0, 0.36, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#273449' : '#9EAFBF'} roughness={0.32} metalness={isDark ? 0.84 : 0.64} />
        </RoundedBox>
        <mesh position={[0, 0.56, 0.315]}>
          <boxGeometry args={[0.52, 0.055, 0.018]} />
          <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={2.35} />
        </mesh>
        <mesh position={[0, 0.26, 0.315]}>
          <boxGeometry args={[0.52, 0.24, 0.015]} />
          <meshStandardMaterial color={isDark ? '#0A101D' : '#121B28'} roughness={0.7} />
        </mesh>
      </group>

      {/* Far-Left Matte-White Square Architectural Planter (matching reference) */}
      <group position={[-5.45, 0, 1.12]}>
        <RoundedBox args={[0.62, 0.66, 0.62]} radius={0.025} smoothness={2} position={[0, 0.33, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#F1F5F9" roughness={0.28} metalness={0.08} />
        </RoundedBox>
        <mesh position={[0, 0.655, 0]}>
          <boxGeometry args={[0.52, 0.02, 0.52]} />
          <meshStandardMaterial color="#1E293B" roughness={0.9} />
        </mesh>
        {[
          [0, 0.88, 0, 0.22, '#15803D'],
          [-0.14, 0.8, 0.12, 0.16, '#16A34A'],
          [0.14, 0.82, -0.1, 0.17, '#15803D'],
          [0.06, 0.98, 0.08, 0.14, '#22C55E'],
          [-0.1, 0.92, -0.12, 0.15, '#16A34A'],
        ].map(([x, y, z, r, col], i) => (
          <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
            <dodecahedronGeometry args={[r as number, 0]} />
            <meshStandardMaterial color={col as string} roughness={0.62} />
          </mesh>
        ))}
      </group>

      {/* ===================================================================== */}
      {/* RIGHT BAY: SAFETY MONITORING CABINET, BEACON, PIPES, FIRST AID & HELMET */}
      {/* ===================================================================== */}

      <group
        position={[4.28, 0, -1.28]}
        rotation={[0, -0.18, 0]}
        onClick={(e) => {
          if (!onSelectGuardrails) return;
          e.stopPropagation();
          onSelectGuardrails();
        }}
      >
        {/* Main Safety Monitoring Cabinet Body */}
        <RoundedBox args={[1.48, 2.52, 1.18]} radius={0.05} smoothness={2} position={[0, 1.26, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#DCE4EB'} roughness={isDark ? 0.28 : 0.25} metalness={isDark ? 0.86 : 0.64} />
        </RoundedBox>

        {/* Illuminated Blue-Lit Internal Monitoring Rack visible behind Glass Door */}
        <mesh position={[0, 1.24, 0.44]}>
          <planeGeometry args={[1.18, 2.18]} />
          {serverFaceTex ? (
            <meshStandardMaterial
              map={serverFaceTex}
              emissive="#38E8FF"
              emissiveMap={serverFaceTex}
              emissiveIntensity={isDark ? 0.65 : 0.45}
              roughness={0.25}
            />
          ) : (
            <meshStandardMaterial color={isDark ? '#082F49' : '#263B52'} emissive="#00B8FF" emissiveIntensity={0.8} />
          )}
        </mesh>

        {/* Glowing Electric-Cyan Perimeter Frame Bars on Front of Safety Cabinet */}
        {[
          { pos: [-0.69, 1.26, 0.6] as Vec3, args: [0.045, 2.42, 0.04] as Vec3 },
          { pos: [0.69, 1.26, 0.6] as Vec3, args: [0.045, 2.42, 0.04] as Vec3 },
          { pos: [0, 2.45, 0.6] as Vec3, args: [1.42, 0.045, 0.04] as Vec3 },
          { pos: [0, 0.08, 0.6] as Vec3, args: [1.42, 0.045, 0.04] as Vec3 },
        ].map((bar, i) => (
          <mesh key={i} position={bar.pos}>
            <boxGeometry args={bar.args} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.6} roughness={0.12} />
          </mesh>
        ))}

        {/* Translucent Front Glass Door with Bold "⚠ SAFETY FIRST" Warning Graphic */}
        <mesh position={[0, 1.26, 0.608]}>
          <planeGeometry args={[1.32, 2.3]} />
          {safetyGlassTex ? (
            <meshStandardMaterial
              map={safetyGlassTex}
              emissive="#FFFFFF"
              emissiveMap={safetyGlassTex}
              emissiveIntensity={0.72}
              transparent
              opacity={0.94}
              roughness={0.12}
              metalness={0.18}
              side={DoubleSide}
            />
          ) : (
            <meshStandardMaterial color="#38E8FF" transparent opacity={0.35} />
          )}
        </mesh>

        {/* Reactive 3-Tier Red/Amber/Green Industrial Warning Signal Beacon atop Safety Cabinet */}
        <SafetyWarningBeacon position={[0, 2.52, 0.12]} alertLevelRef={alertLevelRef} />
      </group>

      {/* Heavy Industrial Brushed-Chrome Overhead Pipework with Brass/Gold Flange Collars */}
      <CurvedChromePipe
        points={rightIndustrialPipe}
        radius={0.125}
        flangeIndices={[1, 2, 4, 5]}
        color="#CBD5E1"
      />
      <CurvedChromePipe
        points={rearIndustrialPipe}
        radius={0.075}
        flangeIndices={[1, 3, 4]}
        color="#94A3B8"
      />
      {/* Deck-mounted brass floor pipe flange collars & manifold plate */}
      <group position={[5.38, 0, -1.85]}>
        <RoundedBox args={[0.72, 0.12, 0.72]} radius={0.02} smoothness={2} position={[0, 0.06, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#9EAFBF'} metalness={isDark ? 0.86 : 0.64} roughness={0.3} />
        </RoundedBox>
        {[
          [-0.1, 0.13, 0.13, 0.18],
          [0.16, 0.13, -0.17, 0.12],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]}>
            <cylinderGeometry args={[r, r + 0.02, 0.07, 16]} />
            <meshStandardMaterial color="#D4AF6A" metalness={0.9} roughness={0.2} />
          </mesh>
        ))}
      </group>

      {/* FOREGROUND RIGHT SAFETY GEAR: RED FIRST-AID KIT + YELLOW INDUSTRIAL SAFETY HELMET */}
      {/* Low metallic safety-gear staging pedestal positioned cleanly in front of the Safety Bay */}
      <group position={[4.55, 0, 0.42]} rotation={[0, -0.22, 0]}>
        <RoundedBox args={[0.82, 0.44, 0.64]} radius={0.03} smoothness={2} position={[0, 0.22, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#DCE4EB'} roughness={isDark ? 0.32 : 0.26} metalness={isDark ? 0.85 : 0.64} />
        </RoundedBox>
        <mesh position={[0, 0.4, 0.324]}>
          <boxGeometry args={[0.68, 0.028, 0.018]} />
          <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={2.2} />
        </mesh>
        {/* Bright Yellow Safety Helmet resting on top of staging pedestal */}
        <SafetyHelmet position={[0.02, 0.44, 0.02]} />
      </group>

      {/* Red First-Aid Kit with crisp white cross positioned prominently beside the Safety Bay */}
      <FirstAidKit position={[3.55, 0, 0.56]} />
    </group>
  );
});
