import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, ExtrudeGeometry, Shape, type MeshStandardMaterial } from 'three';
import type { CampusZone, Vec3 } from '../officeLayout';
import { getProcessDeckTexture, getProcessFrontSignTexture } from './textures';

/**
 * Clean Architectural Glass & Brushed-Steel Balustrade matching the reference's perimeter railings.
 */
const GlassSafetyBalustrade = memo(function GlassSafetyBalustrade({
  start,
  length,
  rotation = [0, 0, 0],
  height = 0.64,
  baseStripColor = '#38E8FF',
  isDark = true,
}: {
  start: Vec3;
  length: number;
  rotation?: [number, number, number];
  height?: number;
  baseStripColor?: string;
  isDark?: boolean;
}) {
  const posts = useMemo(() => {
    const count = Math.max(2, Math.round(length / 1.15) + 1);
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((i / (count - 1)) * length);
    return out;
  }, [length]);

  return (
    <group position={start} rotation={rotation}>
      {/* Sleek brushed-chrome top handrail bar */}
      <mesh position={[length / 2, height, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.024, 0.024, length + 0.04, 12]} />
        <meshStandardMaterial color={isDark ? '#CBD5E1' : '#F5F7FA'} metalness={isDark ? 0.92 : 0.7} roughness={0.18} />
      </mesh>
      {/* Translucent tempered glass balustrade panel */}
      <mesh position={[length / 2, height * 0.52, 0]}>
        <boxGeometry args={[length - 0.04, height * 0.78, 0.022]} />
        <meshStandardMaterial
          color="#7DD3FC"
          emissive="#0284C7"
          emissiveIntensity={0.28}
          transparent
          opacity={0.22}
          roughness={0.08}
          metalness={0.18}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Subtle luminous base trim under glass */}
      <mesh position={[length / 2, 0.045, 0]}>
        <boxGeometry args={[length - 0.02, 0.032, 0.04]} />
        <meshStandardMaterial color={baseStripColor} emissive={baseStripColor} emissiveIntensity={1.55} roughness={0.2} />
      </mesh>
      {/* Brushed-steel stanchions with warm metallic clamp mounts */}
      {posts.map((px, i) => (
        <group key={i} position={[px, 0, 0]}>
          <mesh position={[0, height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, height, 10]} />
            <meshStandardMaterial color={isDark ? '#94A3B8' : '#9EAFBF'} metalness={isDark ? 0.9 : 0.68} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.048, 0.056, 0.04, 10]} />
            <meshStandardMaterial color="#D4AF6A" metalness={0.86} roughness={0.24} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/**
 * Clean, Premium Enterprise Metallic Platform Chassis for Process Studio:
 * - Sculpted brushed-titanium & dark gunmetal multi-tier rounded foundation
 * - Crisp electric cyan-blue corner accent bars & purple side/signboard illumination
 * - Reflective mirror-sheen tiled dark metallic deck surface
 * - Extruded chamfered "PROCESS STUDIO" front signboard with glowing purple workflow icon
 * - Sleek glass & chrome perimeter balustrades with an open docking landing for `bridge-process`
 */
export const ProcessPlatformChassis = memo(function ProcessPlatformChassis({
  zone,
  activityRef,
  isDark = true,
}: {
  zone: CampusZone;
  activityRef: React.RefObject<number>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const cyanEdgeRef = useRef<MeshStandardMaterial>(null);
  const purpleEdgeRef = useRef<MeshStandardMaterial>(null);

  const deckTex = useMemo(() => getProcessDeckTexture(isDark), [isDark]);
  const signTex = useMemo(() => getProcessFrontSignTexture(isDark), [isDark]);

  const w = zone.width; // 12.2
  const d = zone.depth; // 8.4
  const h = Math.max(0.55, zone.height); // 0.62

  const baseW = w + 0.6;
  const baseD = d + 0.6;
  const midW = w + 0.28;
  const midD = d + 0.28;

  // Extruded chamfered "PROCESS STUDIO" architectural signboard
  const signGeometry = useMemo(() => {
    const sw = 4.95;
    const sh = 0.96;
    const cut = 0.24;
    const hw = sw / 2;
    const hh = sh / 2;
    const shape = new Shape();
    shape.moveTo(-hw + cut, -hh);
    shape.lineTo(hw - cut, -hh);
    shape.lineTo(hw, -hh + cut);
    shape.lineTo(hw, hh - cut);
    shape.lineTo(hw - cut, hh);
    shape.lineTo(-hw + cut, hh);
    shape.lineTo(-hw, hh - cut);
    shape.lineTo(-hw, -hh + cut);
    shape.closePath();

    const geom = new ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.045,
      bevelSegments: 2,
    });
    geom.center();
    return geom;
  }, []);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const energy = activityRef.current ?? 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
    if (cyanEdgeRef.current) {
      cyanEdgeRef.current.emissiveIntensity = 2.35 + energy * (1.2 + 0.45 * pulse);
    }
    if (purpleEdgeRef.current) {
      purpleEdgeRef.current.emissiveIntensity = 2.35 + energy * (1.15 + 0.45 * pulse);
    }
  });

  // `bridge-process` docks at front-left of +Z edge: local x ≈ -4.7 (spanning x ∈ [-5.8, -3.6])
  const dockCenterX = -4.9;

  return (
    <group>
      {/* TIER 1: LOWER ARMOR SKIRT */}
      <RoundedBox
        args={[baseW, h - 0.2, baseD]}
        radius={0.18}
        smoothness={3}
        position={[0, -h + (h - 0.2) / 2, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={isDark ? '#111827' : '#8A98A8'} roughness={0.34} metalness={isDark ? 0.86 : 0.56} />
      </RoundedBox>

      {/* Recessed Shadow Reveal Groove */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[baseW - 0.12, 0.04, baseD - 0.12]} />
        <meshStandardMaterial color={isDark ? '#050812' : '#263B52'} roughness={isDark ? 0.75 : 0.55} metalness={0.5} />
      </mesh>

      {/* TIER 2: BRUSHED-TITANIUM STEPPED UPPER COLLAR */}
      <RoundedBox
        args={[midW, 0.16, midD]}
        radius={0.15}
        smoothness={3}
        position={[0, -0.12, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={isDark ? '#334155' : '#B7C4D1'} roughness={isDark ? 0.26 : 0.28} metalness={isDark ? 0.9 : 0.62} />
      </RoundedBox>

      {/* ILLUMINATED CYAN-BLUE CORNER BARS & PURPLE SIDE VENT ACCENT STRIPS */}
      <group position={[0, -h + 0.22, 0]}>
        {/* Front-right (+Z) glowing cyan-blue corner bar */}
        <mesh position={[baseW / 2 - 1.35, 0.02, baseD / 2 + 0.015]}>
          <boxGeometry args={[2.25, 0.08, 0.028]} />
          <meshStandardMaterial ref={cyanEdgeRef} color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.5} roughness={0.14} />
        </mesh>
        {/* Front-left (+Z, west of sign) subtle cyan accent bar */}
        <mesh position={[-baseW / 2 + 0.85, 0.02, baseD / 2 + 0.015]}>
          <boxGeometry args={[1.15, 0.08, 0.028]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.3} roughness={0.14} />
        </mesh>

        {/* +X Right Edge: Cyan corner bars flanking a central recessed vent with Purple Neon Accent */}
        <mesh position={[baseW / 2 + 0.015, 0.02, baseD / 2 - 1.0]}>
          <boxGeometry args={[0.028, 0.08, 1.5]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.45} roughness={0.14} />
        </mesh>
        <mesh position={[baseW / 2 + 0.015, 0.02, -baseD / 2 + 1.0]}>
          <boxGeometry args={[0.028, 0.08, 1.5]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} roughness={0.14} />
        </mesh>
        {/* Central +X recessed industrial vent grille + glowing purple overhead trim */}
        <mesh position={[baseW / 2 + 0.008, -0.02, 0]}>
          <boxGeometry args={[0.022, 0.24, 3.2]} />
          <meshStandardMaterial color={isDark ? '#050812' : '#121B28'} roughness={0.78} metalness={0.5} />
        </mesh>
        <mesh position={[baseW / 2 + 0.016, 0.14, 0]}>
          <boxGeometry args={[0.028, 0.055, 3.35]} />
          <meshStandardMaterial ref={purpleEdgeRef} color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.5} roughness={0.14} />
        </mesh>

        {/* -X & -Z Rear Accent Light Bars */}
        <mesh position={[-baseW / 2 - 0.014, 0.02, 0]}>
          <boxGeometry args={[0.026, 0.075, baseD * 0.48]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#0EA5E9" emissiveIntensity={2.0} />
        </mesh>
        <mesh position={[0, 0.02, -baseD / 2 - 0.014]}>
          <boxGeometry args={[baseW * 0.48, 0.075, 0.026]} />
          <meshStandardMaterial color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.0} />
        </mesh>
      </group>

      {/* TIER 3: REFLECTIVE TILED DECK (top at local y = 0) */}
      <RoundedBox args={[w, 0.08, d]} radius={0.08} smoothness={2} position={[0, -0.04, 0]} receiveShadow>
        <meshStandardMaterial color={isDark ? '#182235' : '#C8D3DE'} roughness={isDark ? 0.22 : 0.26} metalness={isDark ? 0.86 : 0.52} />
      </RoundedBox>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.16, d - 0.16]} />
        {deckTex ? (
          <meshStandardMaterial map={deckTex} roughness={isDark ? 0.16 : 0.34} metalness={isDark ? 0.86 : 0.48} />
        ) : (
          <meshStandardMaterial color={isDark ? '#111A2C' : '#C8D3DE'} roughness={isDark ? 0.16 : 0.34} metalness={isDark ? 0.86 : 0.48} />
        )}
      </mesh>

      {/* Subtle cyan & purple reflective deck light washes */}
      <mesh position={[0, 0.004, 0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 3.8]} />
        <meshBasicMaterial color="#00B8FF" transparent opacity={0.055} depthWrite={false} />
      </mesh>
      <mesh position={[4.1, 0.004, -0.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 3.8]} />
        <meshBasicMaterial color="#A855F7" transparent opacity={0.06} depthWrite={false} />
      </mesh>

      {/* Flush Bridge Docking Threshold at Front-Left (+Z, local x ≈ -4.7) */}
      <group position={[dockCenterX, 0.006, d / 2 - 0.12]}>
        <mesh receiveShadow>
          <boxGeometry args={[2.25, 0.024, 0.52]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#9EAFBF'} metalness={isDark ? 0.85 : 0.62} roughness={0.28} />
        </mesh>
        {[-1.12, 1.12].map((gx, i) => (
          <mesh key={i} position={[gx, 0.015, 0]}>
            <boxGeometry args={[0.05, 0.022, 0.54]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.1} />
          </mesh>
        ))}
      </group>

      {/* INTEGRATED BEVELED "PROCESS STUDIO" FRONT ARCHITECTURAL SIGNBOARD (+Z FASCIA) */}
      <group position={[0.45, -0.06, baseD / 2 + 0.13]} rotation={[-0.06, 0, 0]}>
        <mesh geometry={signGeometry} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#0A1020' : '#DCE4EB'} roughness={0.26} metalness={isDark ? 0.88 : 0.65} />
        </mesh>
        <mesh position={[0, 0.48, 0.06]}>
          <boxGeometry args={[4.45, 0.036, 0.06]} />
          <meshStandardMaterial color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.35} />
        </mesh>
        <mesh position={[0, -0.48, 0.06]}>
          <boxGeometry args={[4.45, 0.036, 0.06]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#38BDF8" emissiveIntensity={2.25} />
        </mesh>
        <mesh position={[0, 0, 0.128]}>
          <planeGeometry args={[4.82, 0.9]} />
          {signTex ? (
            <meshStandardMaterial
              map={signTex}
              emissive="#FFFFFF"
              emissiveMap={signTex}
              emissiveIntensity={isDark ? 0.94 : 0.82}
              roughness={0.2}
              metalness={0.28}
            />
          ) : (
            <meshStandardMaterial color={isDark ? '#0A1020' : '#263B52'} emissive="#A855F7" emissiveIntensity={0.8} />
          )}
        </mesh>
      </group>

      {/* SLEEK GLASS & BRUSHED-STEEL PERIMETER BALUSTRADES (Open at bridge dock x ∈ [-5.85, -3.55]) */}
      {/* Left side (-X) glass railing */}
      <GlassSafetyBalustrade start={[-w / 2 + 0.16, 0, d / 2 - 0.25]} length={3.6} rotation={[0, Math.PI / 2, 0]} baseStripColor="#38E8FF" isDark={isDark} />
      {/* Front-right (+Z, right of signboard) glass railing with warm-gold subtle edge */}
      <GlassSafetyBalustrade start={[3.25, 0, d / 2 - 0.16]} length={2.65} baseStripColor="#FBBF24" isDark={isDark} />
      {/* Right side (+X) glass railing */}
      <GlassSafetyBalustrade start={[w / 2 - 0.16, 0, d / 2 - 0.25]} length={5.1} rotation={[0, Math.PI / 2, 0]} baseStripColor="#38E8FF" isDark={isDark} />
    </group>
  );
});
