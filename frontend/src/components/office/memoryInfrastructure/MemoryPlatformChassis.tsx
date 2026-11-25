import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { ExtrudeGeometry, Shape, type MeshStandardMaterial } from 'three';
import type { CampusZone, Vec3 } from '../officeLayout';
import { getMemoryDeckTexture, getMemoryFrontSignTexture } from './textures';

/**
 * Reusable Brushed-Brass Industrial Safety Handrail matching the reference's perimeter railings.
 */
export const BrassSafetyRail = memo(function BrassSafetyRail({
  start,
  length,
  rotation = [0, 0, 0],
  height = 0.56,
  isDark = true,
}: {
  start: Vec3;
  length: number;
  rotation?: [number, number, number];
  height?: number;
  isDark?: boolean;
}) {
  const posts = useMemo(() => {
    const count = Math.max(2, Math.round(length / 0.85) + 1);
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((i / (count - 1)) * length);
    return out;
  }, [length]);

  return (
    <group position={start} rotation={rotation}>
      {[height, height * 0.54].map((ry, i) => (
        <mesh key={i} position={[length / 2, ry, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, length + 0.04, 10]} />
          <meshStandardMaterial color="#D4AF6A" metalness={0.88} roughness={0.22} />
        </mesh>
      ))}
      {posts.map((px, i) => (
        <group key={i} position={[px, 0, 0]}>
          <mesh position={[0, height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, height, 10]} />
            <meshStandardMaterial color="#C8A25B" metalness={0.88} roughness={0.24} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.045, 0.052, 0.04, 10]} />
            <meshStandardMaterial color={isDark ? '#334155' : '#536B83'} metalness={isDark ? 0.84 : 0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, height + 0.012, 0]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshStandardMaterial color="#E5C585" metalness={0.92} roughness={0.16} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/**
 * Multi-Tier Sculpted Industrial Platform Chassis for Shared Memory Infrastructure:
 * - Thick dark gunmetal lower armor skirt with recessed ventilation louvers, micro green status LEDs,
 *   cyan corner bars on the STM (+Z / -X) side, and purple corner bars on the LTM (+X / -Z) side
 * - Continuous illuminated perimeter light bar seamlessly transitioning from Electric Cyan (STM half)
 *   to Vibrant Violet-Purple (LTM half) right at the front-most corner
 * - Reflective brushed-steel tiled deck with glowing floor conduits radiating from the Central Memory Core
 * - Integrated ExtrudeGeometry beveled "MEMORY INFRASTRUCTURE" architectural signboard on the +Z fascia
 * - Flush north skybridge docking sill at x = 0 on the +Z edge for seamless employee navigation
 */
export const MemoryPlatformChassis = memo(function MemoryPlatformChassis({
  zone,
  stmActiveRef,
  ltmActiveRef,
  isDark = true,
}: {
  zone: CampusZone;
  stmActiveRef: React.RefObject<number>;
  ltmActiveRef: React.RefObject<number>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const cyanRimRef = useRef<MeshStandardMaterial>(null);
  const purpleRimRef = useRef<MeshStandardMaterial>(null);
  const signTrimRef = useRef<MeshStandardMaterial>(null);

  const deckTex = useMemo(() => getMemoryDeckTexture(isDark), [isDark]);
  const signTex = useMemo(() => getMemoryFrontSignTexture('MEMORY INFRASTRUCTURE', isDark), [isDark]);

  const w = zone.width; // 13.8
  const d = zone.depth; // 10.6
  const h = Math.max(0.55, zone.height); // 0.62

  const baseW = w + 0.68;
  const baseD = d + 0.68;
  const midW = w + 0.34;
  const midD = d + 0.34;

  // Bridge docking opening on the +Z edge centered at x = 0
  const dockHalf = 1.24;

  const signGeometry = useMemo(() => {
    const sw = 4.65;
    const sh = 0.88;
    const cut = 0.22;
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
    const stm = stmActiveRef.current ?? 0;
    const ltm = ltmActiveRef.current ?? 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);

    if (cyanRimRef.current) {
      cyanRimRef.current.emissiveIntensity = 2.25 + stm * (1.15 + 0.5 * pulse);
    }
    if (purpleRimRef.current) {
      purpleRimRef.current.emissiveIntensity = 2.25 + ltm * (1.15 + 0.5 * pulse);
    }
    if (signTrimRef.current) {
      signTrimRef.current.emissiveIntensity = 2.15 + Math.max(stm, ltm) * (0.95 + 0.4 * pulse);
    }
  });

  const leftFrontLen = midW / 2 - dockHalf;
  const leftFrontCenter = -dockHalf - leftFrontLen / 2;
  const rightFrontLen = midW / 2 - dockHalf;
  const rightFrontCenter = dockHalf + rightFrontLen / 2;

  return (
    <group>
      {/* TIER 1: HEAVY SUB-CHASSIS ARMOR SKIRT */}
      <RoundedBox
        args={[baseW, h - 0.22, baseD]}
        radius={0.14}
        smoothness={2}
        position={[0, -h + (h - 0.22) / 2, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={isDark ? '#0C1220' : '#8A98A8'} roughness={isDark ? 0.36 : 0.34} metalness={isDark ? 0.84 : 0.56} />
      </RoundedBox>

      {/* Recessed Shadow Reveal Groove */}
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[baseW - 0.14, 0.045, baseD - 0.14]} />
        <meshStandardMaterial color={isDark ? '#04070E' : '#263B52'} roughness={isDark ? 0.75 : 0.55} metalness={0.45} />
      </mesh>

      {/* Segmented Armor Vertical Seam Ribs */}
      {[-5.2, -2.5, 2.5, 5.2].map((sx, i) => (
        <mesh key={`sz-${i}`} position={[sx, -h + 0.2, baseD / 2 + 0.008]}>
          <boxGeometry args={[0.06, h - 0.26, 0.025]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.86 : 0.65} roughness={0.28} />
        </mesh>
      ))}
      {[-3.6, -1.2, 1.2, 3.6].map((sz, i) => (
        <mesh key={`sx-${i}`} position={[baseW / 2 + 0.008, -h + 0.2, sz]}>
          <boxGeometry args={[0.025, h - 0.26, 0.06]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.86 : 0.65} roughness={0.28} />
        </mesh>
      ))}

      {/* SUB-CHASSIS VENTS, GREEN STATUS LEDS & CYAN / PURPLE CORNER ACCENT BARS */}
      <group position={[0, -h + 0.18, 0]}>
        {[-baseW / 2 + 1.1, baseW / 2 - 1.1].map((lx, i) => (
          <mesh key={`cbar-z-${i}`} position={[lx, 0.01, baseD / 2 + 0.014]}>
            <boxGeometry args={[1.25, 0.075, 0.026]} />
            <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={2.5} roughness={0.18} />
          </mesh>
        ))}

        {[-4.05, 5.85].map((vx, i) => (
          <group key={`vent-z-${i}`} position={[vx, -0.01, baseD / 2 + 0.008]}>
            <mesh>
              <boxGeometry args={[1.15, 0.24, 0.024]} />
              <meshStandardMaterial color={isDark ? '#050811' : '#121B28'} roughness={0.8} metalness={0.4} />
            </mesh>
            {[-0.22, -0.1, 0.02, 0.14].map((dx, j) => (
              <mesh key={j} position={[dx, 0.065, 0.016]}>
                <boxGeometry args={[0.075, 0.028, 0.01]} />
                <meshStandardMaterial color="#4ADE80" emissive="#22C55E" emissiveIntensity={2.2} />
              </mesh>
            ))}
          </group>
        ))}

        {/* +X (Front-Right LTM side): Cyan near front corner, Purple at right corner */}
        <mesh position={[baseW / 2 + 0.014, 0.01, baseD / 2 - 1.05]}>
          <boxGeometry args={[0.026, 0.075, 1.2]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={2.4} roughness={0.18} />
        </mesh>
        <mesh position={[baseW / 2 + 0.014, 0.01, -baseD / 2 + 1.05]}>
          <boxGeometry args={[0.026, 0.075, 1.25]} />
          <meshStandardMaterial color="#D8B4FE" emissive="#A855F7" emissiveIntensity={2.6} roughness={0.18} />
        </mesh>

        {[-1.55, 1.55].map((vz, i) => (
          <group key={`vent-x-${i}`} position={[baseW / 2 + 0.008, -0.01, vz]}>
            <mesh>
              <boxGeometry args={[0.024, 0.24, 1.45]} />
              <meshStandardMaterial color={isDark ? '#050811' : '#121B28'} roughness={0.8} metalness={0.4} />
            </mesh>
            {[-0.32, -0.14, 0.04, 0.22].map((dz, j) => (
              <mesh key={j} position={[0.016, 0.065, dz]}>
                <boxGeometry args={[0.01, 0.028, 0.085]} />
                <meshStandardMaterial
                  color={i === 0 ? '#4ADE80' : '#E9D5FF'}
                  emissive={i === 0 ? '#22C55E' : '#A855F7'}
                  emissiveIntensity={2.1}
                />
              </mesh>
            ))}
          </group>
        ))}

        {/* Rear Sub-Chassis Accent Bars */}
        <mesh position={[-baseW / 2 - 0.014, 0.01, 0]}>
          <boxGeometry args={[0.024, 0.07, baseD * 0.45]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={1.9} />
        </mesh>
        <mesh position={[0, 0.01, -baseD / 2 - 0.014]}>
          <boxGeometry args={[baseW * 0.45, 0.07, 0.024]} />
          <meshStandardMaterial color="#D8B4FE" emissive="#A855F7" emissiveIntensity={1.9} />
        </mesh>
      </group>

      {/* TIER 2: STEPPED METALLIC LEDGE + CONTINUOUS CYAN-TO-PURPLE ILLUMINATED RIM */}
      <RoundedBox
        args={[midW, 0.16, midD]}
        radius={0.12}
        smoothness={2}
        position={[0, -0.14, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={isDark ? '#182235' : '#B7C4D1'} roughness={isDark ? 0.3 : 0.28} metalness={isDark ? 0.86 : 0.62} />
      </RoundedBox>

      {/* Continuous Illuminated Rim Track — CYAN along STM Half, PURPLE along LTM Half */}
      <group position={[0, -0.095, 0]}>
        <mesh position={[leftFrontCenter, 0, midD / 2 + 0.018]}>
          <boxGeometry args={[leftFrontLen + 0.06, 0.065, 0.04]} />
          <meshStandardMaterial ref={cyanRimRef} color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.35} roughness={0.15} />
        </mesh>
        <mesh position={[rightFrontCenter, 0, midD / 2 + 0.018]}>
          <boxGeometry args={[rightFrontLen + 0.06, 0.065, 0.04]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.35} roughness={0.15} />
        </mesh>
        <mesh position={[-midW / 2 - 0.018, 0, 0]}>
          <boxGeometry args={[0.04, 0.065, midD + 0.06]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.25} roughness={0.15} />
        </mesh>
        <mesh position={[-midW / 4, 0, -midD / 2 - 0.018]}>
          <boxGeometry args={[midW / 2, 0.065, 0.04]} />
          <meshStandardMaterial color="#38BDF8" emissive="#0EA5E9" emissiveIntensity={2.1} roughness={0.15} />
        </mesh>

        {/* Smooth cyan-indigo-purple transition around front-right corner */}
        <mesh position={[midW / 2 + 0.018, 0, midD / 2 - 0.65]}>
          <boxGeometry args={[0.04, 0.065, 1.35]} />
          <meshStandardMaterial color="#93C5FD" emissive="#6366F1" emissiveIntensity={2.45} roughness={0.15} />
        </mesh>
        <mesh position={[midW / 2 + 0.018, 0, -0.62]}>
          <boxGeometry args={[0.04, 0.065, midD - 1.25]} />
          <meshStandardMaterial ref={purpleRimRef} color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.45} roughness={0.15} />
        </mesh>
        <mesh position={[midW / 4, 0, -midD / 2 - 0.018]}>
          <boxGeometry args={[midW / 2 + 0.04, 0.065, 0.04]} />
          <meshStandardMaterial color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.3} roughness={0.15} />
        </mesh>
      </group>

      {/* TIER 3: REFLECTIVE BRUSHED-STEEL TILED DECK SURFACE (top at local y = 0) */}
      <RoundedBox args={[w, 0.08, d]} radius={0.05} smoothness={2} position={[0, -0.04, 0]} receiveShadow>
        <meshStandardMaterial color={isDark ? '#172033' : '#C8D3DE'} roughness={0.26} metalness={isDark ? 0.82 : 0.52} />
      </RoundedBox>

      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.14, d - 0.14]} />
        {deckTex ? (
          <meshStandardMaterial map={deckTex} roughness={isDark ? 0.22 : 0.34} metalness={isDark ? 0.82 : 0.48} />
        ) : (
          <meshStandardMaterial color={isDark ? '#141E30' : '#C8D3DE'} roughness={isDark ? 0.22 : 0.34} metalness={isDark ? 0.82 : 0.48} />
        )}
      </mesh>

      {/* Subtle Section Ambient Floor Reflections */}
      <mesh position={[-w * 0.24, 0.004, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.44, d - 0.9]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.055} depthWrite={false} />
      </mesh>
      <mesh position={[w * 0.24, 0.004, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.44, d - 0.9]} />
        <meshBasicMaterial color="#A855F7" transparent opacity={0.085} depthWrite={false} />
      </mesh>

      {/* Recessed Luminous Circular Floor Inspection Port in Front Plaza */}
      <group position={[-0.75, 0.006, 2.55]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.38, 0.48, 28]} />
          <meshStandardMaterial color={isDark ? '#475569' : '#536B83'} metalness={isDark ? 0.88 : 0.7} roughness={0.22} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <circleGeometry args={[0.38, 24]} />
          <meshStandardMaterial color={isDark ? '#082F49' : '#263B52'} emissive="#00E5FF" emissiveIntensity={1.1} roughness={0.15} metalness={0.4} />
        </mesh>
      </group>

      {/* Flush North Skybridge Docking Sill on +Z Center (x ∈ [-1.24, +1.24]) */}
      <group position={[0, 0.005, d / 2 - 0.12]}>
        <mesh receiveShadow>
          <boxGeometry args={[dockHalf * 2 + 0.12, 0.025, 0.56]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#9EAFBF'} metalness={isDark ? 0.84 : 0.62} roughness={0.3} />
        </mesh>
        {[-dockHalf - 0.03, dockHalf + 0.03].map((gx, i) => (
          <mesh key={i} position={[gx, 0.015, 0]}>
            <boxGeometry args={[0.055, 0.022, 0.58]} />
            <meshStandardMaterial
              color={i === 0 ? '#38E8FF' : '#C084FC'}
              emissive={i === 0 ? '#00E5FF' : '#A855F7'}
              emissiveIntensity={2.1}
            />
          </mesh>
        ))}
      </group>

      {/* INTEGRATED BEVELED "MEMORY INFRASTRUCTURE" ARCHITECTURAL SIGNBOARD (+Z FRONT RIM) */}
      <group position={[3.68, -0.1, baseD / 2 + 0.14]} rotation={[-0.06, 0, 0]}>
        <mesh geometry={signGeometry} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#081020' : '#DCE4EB'} roughness={0.26} metalness={isDark ? 0.88 : 0.65} />
        </mesh>
        <mesh position={[0, 0.44, 0.06]}>
          <boxGeometry args={[4.15, 0.038, 0.065]} />
          <meshStandardMaterial ref={signTrimRef} color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.55} />
        </mesh>
        <mesh position={[0, -0.44, 0.06]}>
          <boxGeometry args={[4.15, 0.038, 0.065]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.35} />
        </mesh>
        <mesh position={[0, 0, 0.128]}>
          <planeGeometry args={[4.52, 0.84]} />
          {signTex ? (
            <meshStandardMaterial
              map={signTex}
              emissive="#FFFFFF"
              emissiveMap={signTex}
              emissiveIntensity={isDark ? 0.95 : 0.82}
              roughness={0.22}
              metalness={0.3}
            />
          ) : (
            <meshStandardMaterial color={isDark ? '#0A1222' : '#263B52'} emissive="#00E5FF" emissiveIntensity={0.85} />
          )}
        </mesh>
      </group>

      {/* PERIMETER BRUSHED-BRASS INDUSTRIAL HANDRAILS (Cleanly framed around signage & bridge dock) */}
      <BrassSafetyRail start={[-w / 2 + 0.3, 0, d / 2 - 0.18]} length={w / 2 - dockHalf - 0.45} isDark={isDark} />
      <BrassSafetyRail start={[-w / 2 + 0.18, 0, d / 2 - 0.2]} length={2.25} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
      <BrassSafetyRail start={[5.98, 0, d / 2 - 0.18]} length={0.78} isDark={isDark} />
      <BrassSafetyRail start={[w / 2 - 0.18, 0, d / 2 - 0.25]} length={4.35} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
      <BrassSafetyRail start={[w / 2 - 0.18, 0, -1.65]} length={2.85} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
    </group>
  );
});
