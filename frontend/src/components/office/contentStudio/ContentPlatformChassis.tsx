import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, ExtrudeGeometry, Shape, type MeshStandardMaterial } from 'three';
import type { CampusZone, Vec3 } from '../officeLayout';
import { getContentDeckTexture, getContentFrontSignTexture } from './textures';

/**
 * Brushed-Chrome / Warm-Silver & Tempered-Glass Double-Rail Balustrade matching the reference perimeter railings.
 */
const StudioGlassRailing = memo(function StudioGlassRailing({
  start,
  length,
  rotation = [0, 0, 0],
  height = 0.68,
  isDark = true,
}: {
  start: Vec3;
  length: number;
  rotation?: [number, number, number];
  height?: number;
  isDark?: boolean;
}) {
  const posts = useMemo(() => {
    const count = Math.max(2, Math.round(length / 1.0) + 1);
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((i / (count - 1)) * length);
    return out;
  }, [length]);

  return (
    <group position={start} rotation={rotation}>
      {/* Upper & lower brushed warm-chrome tubular rails */}
      {[height, height * 0.52].map((ry, i) => (
        <mesh key={i} position={[length / 2, ry, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.024, 0.024, length + 0.04, 10]} />
          <meshStandardMaterial color="#D6C7A9" metalness={0.9} roughness={0.18} />
        </mesh>
      ))}
      {/* Clear tempered glass infill panel */}
      <mesh position={[length / 2, height * 0.5, 0]}>
        <boxGeometry args={[length - 0.04, height * 0.78, 0.022]} />
        <meshStandardMaterial
          color="#7DD3FC"
          emissive="#0284C7"
          emissiveIntensity={0.22}
          transparent
          opacity={0.2}
          roughness={0.08}
          metalness={0.18}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Vertical machined stanchions */}
      {posts.map((px, i) => (
        <group key={i} position={[px, 0, 0]}>
          <mesh position={[0, height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, height, 10]} />
            <meshStandardMaterial color="#C8B99B" metalness={0.88} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.022, 0]}>
            <cylinderGeometry args={[0.048, 0.056, 0.044, 10]} />
            <meshStandardMaterial color={isDark ? '#334155' : '#536B83'} metalness={isDark ? 0.85 : 0.7} roughness={0.26} />
          </mesh>
          <mesh position={[0, height + 0.014, 0]}>
            <sphereGeometry args={[0.026, 8, 8]} />
            <meshStandardMaterial color="#E5D8BF" metalness={0.92} roughness={0.16} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/**
 * Multi-Tier Metallic Studio Platform Chassis for Content Studio – RCP:
 * - Sculpted dark-gunmetal (or Light Graphite/Silver in light mode) & brushed-titanium rounded plinth
 * - Continuous glowing electric cyan-blue upper & lower perimeter contour bars
 * - Recessed glowing purple-violet lower corner accent strips & dark ventilation grilles
 * - Reflective mirror-sheen modular tiled floor deck
 * - Extruded chamfered "Content Studio – RCP" front signboard with glowing purple play icon
 * - Tempered-glass & brushed-chrome perimeter railings with unobstructed east (+X) bridge dock for `bridge-content`
 */
export const ContentPlatformChassis = memo(function ContentPlatformChassis({
  zone,
  activeRef,
  isDark = true,
}: {
  zone: CampusZone;
  activeRef: React.RefObject<boolean>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const cyanBarRef = useRef<MeshStandardMaterial>(null);
  const purpleBarRef = useRef<MeshStandardMaterial>(null);

  const deckTex = useMemo(() => getContentDeckTexture(isDark), [isDark]);
  const signTex = useMemo(() => getContentFrontSignTexture(isDark), [isDark]);

  const w = zone.width; // 12.6
  const d = zone.depth; // 8.8
  const h = Math.max(0.55, zone.height); // 0.62

  const baseW = w + 0.64;
  const baseD = d + 0.64;
  const midW = w + 0.3;
  const midD = d + 0.3;

  // Extruded chamfered "Content Studio – RCP" front signboard
  const signGeometry = useMemo(() => {
    const sw = 5.1;
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
    const active = Boolean(activeRef.current);
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.8);
    if (cyanBarRef.current) {
      cyanBarRef.current.emissiveIntensity = active ? 2.85 + 0.6 * pulse : 2.35;
    }
    if (purpleBarRef.current) {
      purpleBarRef.current.emissiveIntensity = active ? 2.95 + 0.75 * pulse : 2.3;
    }
  });

  return (
    <group>
      {/* TIER 1: HEAVY SUB-CHASSIS ARMOR SKIRT */}
      <RoundedBox
        args={[baseW, h - 0.2, baseD]}
        radius={0.18}
        smoothness={3}
        position={[0, -h + (h - 0.2) / 2, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={isDark ? '#0E1526' : '#8A98A8'} roughness={isDark ? 0.32 : 0.34} metalness={isDark ? 0.86 : 0.56} />
      </RoundedBox>

      {/* Recessed Shadow Reveal Groove */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[baseW - 0.14, 0.04, baseD - 0.14]} />
        <meshStandardMaterial color={isDark ? '#04070F' : '#263B52'} roughness={isDark ? 0.75 : 0.55} metalness={0.5} />
      </mesh>

      {/* TIER 2: STEPPED UPPER COLLAR */}
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

      {/* CONTINUOUS ELECTRIC CYAN-BLUE ILLUMINATED PERIMETER CONTOUR BARS (exact reference signature) */}
      <group position={[0, -0.075, 0]}>
        {/* +Z Front Continuous Cyan Contour Bar */}
        <mesh position={[0, 0, midD / 2 + 0.016]}>
          <boxGeometry args={[midW + 0.04, 0.068, 0.036]} />
          <meshStandardMaterial ref={cyanBarRef} color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.45} roughness={0.12} />
        </mesh>
        {/* -X Left Edge Cyan Bar */}
        <mesh position={[-midW / 2 - 0.016, 0, 0]}>
          <boxGeometry args={[0.036, 0.068, midD + 0.04]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} roughness={0.12} />
        </mesh>
        {/* +X Right Edge Cyan Bars (gap at bridge-content z ∈ [-1.15, +1.15]) */}
        <mesh position={[midW / 2 + 0.016, 0, -2.85]}>
          <boxGeometry args={[0.036, 0.068, 3.35]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} roughness={0.12} />
        </mesh>
        <mesh position={[midW / 2 + 0.016, 0, 2.85]}>
          <boxGeometry args={[0.036, 0.068, 3.35]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} roughness={0.12} />
        </mesh>
        {/* -Z Rear Edge Cyan Bar */}
        <mesh position={[0, 0, -midD / 2 - 0.016]}>
          <boxGeometry args={[midW + 0.04, 0.068, 0.036]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={1.9} roughness={0.12} />
        </mesh>
      </group>

      {/* LOWER SUB-CHASSIS GLOWING PURPLE-VIOLET CORNER STRIPS & RECESSED VENT GRILLES (exact reference detail) */}
      <group position={[0, -h + 0.19, 0]}>
        {/* Front-left & Front-right glowing purple recessed lower vents */}
        {[-baseW / 2 + 1.45, baseW / 2 - 1.45].map((vx, i) => (
          <group key={`pv-${i}`} position={[vx, 0, baseD / 2 + 0.012]}>
            <mesh>
              <boxGeometry args={[1.65, 0.19, 0.025]} />
              <meshStandardMaterial color={isDark ? '#050812' : '#121B28'} roughness={0.8} metalness={0.45} />
            </mesh>
            <mesh position={[0, 0, 0.015]}>
              <boxGeometry args={[1.38, 0.065, 0.016]} />
              <meshStandardMaterial
                ref={i === 0 ? purpleBarRef : undefined}
                color="#E9D5FF"
                emissive="#A855F7"
                emissiveIntensity={2.4}
                roughness={0.14}
              />
            </mesh>
          </group>
        ))}

        {/* +X Right Side Lower Glowing Blue/Purple Recessed Vents (north & south of bridge-content) */}
        {[-2.85, 2.85].map((vz, i) => (
          <group key={`rv-${i}`} position={[baseW / 2 + 0.012, 0, vz]}>
            <mesh>
              <boxGeometry args={[0.025, 0.19, 1.85]} />
              <meshStandardMaterial color={isDark ? '#050812' : '#121B28'} roughness={0.8} metalness={0.45} />
            </mesh>
            <mesh position={[0.015, 0, 0]}>
              <boxGeometry args={[0.016, 0.062, 1.52]} />
              <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.2} roughness={0.14} />
            </mesh>
          </group>
        ))}

        {/* -X Left Side Lower Purple Accent Strip */}
        <mesh position={[-baseW / 2 - 0.014, 0, 0]}>
          <boxGeometry args={[0.022, 0.072, baseD * 0.5]} />
          <meshStandardMaterial color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.2} />
        </mesh>
      </group>

      {/* TIER 3: REFLECTIVE TILED DECK (top at local y = 0) */}
      <RoundedBox args={[w, 0.08, d]} radius={0.08} smoothness={2} position={[0, -0.04, 0]} receiveShadow>
        <meshStandardMaterial color={isDark ? '#172033' : '#C8D3DE'} roughness={isDark ? 0.22 : 0.26} metalness={isDark ? 0.86 : 0.52} />
      </RoundedBox>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.16, d - 0.16]} />
        {deckTex ? (
          <meshStandardMaterial map={deckTex} roughness={isDark ? 0.15 : 0.34} metalness={isDark ? 0.88 : 0.48} />
        ) : (
          <meshStandardMaterial color={isDark ? '#101828' : '#C8D3DE'} roughness={isDark ? 0.15 : 0.34} metalness={isDark ? 0.88 : 0.48} />
        )}
      </mesh>

      {/* Subtle cyan & violet floor reflection wash */}
      <mesh position={[-0.2, 0.004, 0.65]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.8, 4.4]} />
        <meshBasicMaterial color="#00B8FF" transparent opacity={0.055} depthWrite={false} />
      </mesh>

      {/* Flush East Bridge Docking Threshold for `bridge-content` (+X, z = 0) */}
      <group position={[w / 2 - 0.12, 0.006, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[0.52, 0.024, 2.25]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#9EAFBF'} metalness={isDark ? 0.85 : 0.62} roughness={0.28} />
        </mesh>
        {[-1.12, 1.12].map((gz, i) => (
          <mesh key={i} position={[0, 0.015, gz]}>
            <boxGeometry args={[0.54, 0.022, 0.05]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.2} />
          </mesh>
        ))}
      </group>

      {/* INTEGRATED CHAMFERED "Content Studio – RCP" ARCHITECTURAL SIGNBOARD (+Z FRONT FASCIA) */}
      <group position={[-0.35, -0.06, baseD / 2 + 0.14]} rotation={[-0.06, 0, 0]}>
        <mesh geometry={signGeometry} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#091122' : '#DCE4EB'} roughness={0.26} metalness={isDark ? 0.88 : 0.65} />
        </mesh>
        <mesh position={[0, 0.48, 0.06]}>
          <boxGeometry args={[4.6, 0.036, 0.06]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.4} />
        </mesh>
        <mesh position={[0, -0.48, 0.06]}>
          <boxGeometry args={[4.6, 0.036, 0.06]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} />
        </mesh>
        <mesh position={[0, 0, 0.128]}>
          <planeGeometry args={[4.96, 0.9]} />
          {signTex ? (
            <meshStandardMaterial
              map={signTex}
              emissive="#FFFFFF"
              emissiveMap={signTex}
              emissiveIntensity={isDark ? 0.95 : 0.82}
              roughness={0.18}
              metalness={0.24}
            />
          ) : (
            <meshStandardMaterial color={isDark ? '#091122' : '#263B52'} emissive="#00B8FF" emissiveIntensity={0.8} />
          )}
        </mesh>
      </group>

      {/* TEMPERED-GLASS & BRUSHED-CHROME PERIMETER RAILINGS (Clear at East +X bridge-content dock z ∈ [-1.2, +1.2]) */}
      {/* Front-left (+Z) glass railing west of front signboard */}
      <StudioGlassRailing start={[-w / 2 + 0.24, 0, d / 2 - 0.16]} length={3.05} isDark={isDark} />
      {/* Front-right (+Z) glass railing east of front signboard */}
      <StudioGlassRailing start={[2.55, 0, d / 2 - 0.16]} length={3.45} isDark={isDark} />
      {/* Left (-X) glass railing */}
      <StudioGlassRailing start={[-w / 2 + 0.16, 0, d / 2 - 0.24]} length={3.85} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
      {/* Front-Right (+X) glass railing south of bridge-content dock */}
      <StudioGlassRailing start={[w / 2 - 0.16, 0, d / 2 - 0.24]} length={2.95} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
    </group>
  );
});
