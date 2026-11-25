import { memo, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Vec3 } from '../officeLayout';
import { getContentServerRackTexture } from './textures';

/**
 * Heavy Black Aluminum-Trimmed Studio Equipment Flight Case matching the reference's front-left & front-right road cases.
 */
const StudioFlightCase = memo(function StudioFlightCase({
  position,
  size = [0.68, 0.56, 0.56],
  rotation = [0, 0, 0],
  showHazardSticker = false,
  isDark = true,
}: {
  position: Vec3;
  size?: Vec3;
  rotation?: [number, number, number];
  showHazardSticker?: boolean;
  isDark?: boolean;
}) {
  const [w, h, d] = size;
  return (
    <group position={position} rotation={rotation}>
      {/* Equipment case shell */}
      <RoundedBox args={[w, h, d]} radius={0.025} smoothness={2} position={[0, h / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#111827' : '#536B83'} roughness={isDark ? 0.44 : 0.36} metalness={isDark ? 0.55 : 0.62} />
      </RoundedBox>
      {/* Brushed-aluminum edge frame rails (top, bottom, lid seam) */}
      {[0.025, h * 0.74, h - 0.025].map((ey, i) => (
        <mesh key={i} position={[0, ey, 0]}>
          <boxGeometry args={[w + 0.02, 0.028, d + 0.02]} />
          <meshStandardMaterial color={isDark ? '#CBD5E1' : '#F5F7FA'} metalness={isDark ? 0.9 : 0.64} roughness={0.2} />
        </mesh>
      ))}
      {/* Vertical corner aluminum extrusion angles */}
      {[
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ].map(([cx, cz], i) => (
        <mesh key={i} position={[cx, h / 2, cz]}>
          <boxGeometry args={[0.036, h + 0.01, 0.036]} />
          <meshStandardMaterial color={isDark ? '#CBD5E1' : '#F5F7FA'} metalness={isDark ? 0.9 : 0.64} roughness={0.2} />
        </mesh>
      ))}
      {/* Recessed chrome butterfly latches on front (+Z) & side (+X) */}
      {[-w * 0.24, w * 0.24].map((lx, i) => (
        <mesh key={i} position={[lx, h * 0.74, d / 2 + 0.015]}>
          <boxGeometry args={[0.075, 0.095, 0.018]} />
          <meshStandardMaterial color={isDark ? '#94A3B8' : '#DCE4EB'} metalness={isDark ? 0.88 : 0.7} roughness={0.22} />
        </mesh>
      ))}
      {/* Optional tiny shipping label on side */}
      {showHazardSticker && (
        <mesh position={[w / 2 + 0.013, h * 0.44, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.16, 0.14]} />
          <meshStandardMaterial color="#E2E8F0" roughness={0.5} />
        </mesh>
      )}
    </group>
  );
});

/**
 * Detailed 3D Pro DSLR / Mirrorless Camera resting on top of the front-right Studio Flight Case.
 */
const ProDslrCamera = memo(function ProDslrCamera({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[0, -0.52, 0]}>
      {/* Sculpted matte-black camera body */}
      <RoundedBox args={[0.24, 0.16, 0.13]} radius={0.018} smoothness={2} position={[0, 0.08, 0]} castShadow>
        <meshStandardMaterial color="#0F172A" roughness={0.36} metalness={0.55} />
      </RoundedBox>
      {/* Top EVF prism hump + hot shoe */}
      <RoundedBox args={[0.11, 0.065, 0.11]} radius={0.015} smoothness={2} position={[0, 0.18, -0.005]} castShadow>
        <meshStandardMaterial color="#111827" roughness={0.35} metalness={0.6} />
      </RoundedBox>
      {/* Telephoto prime lens barrel + gold pro ring + glass front element */}
      <mesh position={[0, 0.085, 0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.068, 0.074, 0.19, 18]} />
        <meshStandardMaterial color="#111827" roughness={0.32} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.085, 0.205]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.071, 0.071, 0.014, 18]} />
        <meshStandardMaterial color="#D4AF6A" metalness={0.92} roughness={0.18} />
      </mesh>
      <mesh position={[0, 0.085, 0.236]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.056, 0.056, 0.008, 16]} />
        <meshStandardMaterial color="#1E3A8A" emissive="#0284C7" emissiveIntensity={0.35} roughness={0.06} metalness={0.9} />
      </mesh>
    </group>
  );
});

/**
 * Studio Softbox Key Light on 3-Leg Black Tripod Stand with Warm Glowing Diffuser Panel (exact reference left).
 */
const StudioSoftboxLight = memo(function StudioSoftboxLight({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[0, 0.62, 0]}>
      {/* 3-leg black aluminum tripod base */}
      {[0, 1, 2].map((i) => {
        const ang = (i / 3) * Math.PI * 2 + 0.3;
        return (
          <group key={i} rotation={[0, ang, 0]}>
            <mesh position={[0.24, 0.32, 0]} rotation={[0, 0, 0.52]} castShadow>
              <cylinderGeometry args={[0.018, 0.016, 0.78, 8]} />
              <meshStandardMaterial color="#111827" metalness={0.8} roughness={0.32} />
            </mesh>
          </group>
        );
      })}
      {/* Telescoping center stand column */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.028, 1.75, 10]} />
        <meshStandardMaterial color="#1E293B" metalness={0.82} roughness={0.28} />
      </mesh>
      {/* Angled Softbox Hood + Luminous Warm-White Studio Diffuser Face */}
      <group position={[0, 1.98, 0]} rotation={[0.16, 0, 0]}>
        {/* Tapered black softbox rear hood */}
        <mesh position={[0, 0, -0.18]} rotation={[Math.PI / 2, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.52, 0.16, 0.42, 4]} />
          <meshStandardMaterial color="#0B0F19" roughness={0.55} metalness={0.35} />
        </mesh>
        {/* Glowing warm-white studio diffuser panel */}
        <mesh position={[0, 0, 0.036]}>
          <planeGeometry args={[0.72, 0.72]} />
          <meshStandardMaterial color="#FFFBEB" emissive="#FEF3C7" emissiveIntensity={2.35} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
});

/**
 * Pro Cinema Production Camera on Heavy Black Fluid-Head Tripod aimed at the Chroma-Key Green Screen.
 */
const CinemaCameraRig = memo(function CinemaCameraRig({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[0, -0.58, 0]}>
      {/* Heavy 3-leg black tripod */}
      {[0, 1, 2].map((i) => {
        const ang = (i / 3) * Math.PI * 2;
        return (
          <group key={i} rotation={[0, ang, 0]}>
            <mesh position={[0.25, 0.56, 0]} rotation={[0, 0, 0.36]} castShadow>
              <cylinderGeometry args={[0.022, 0.018, 1.24, 8]} />
              <meshStandardMaterial color="#0F172A" metalness={0.78} roughness={0.32} />
            </mesh>
          </group>
        );
      })}
      {/* Fluid head & mounting plate */}
      <RoundedBox args={[0.18, 0.16, 0.18]} radius={0.02} smoothness={2} position={[0, 1.18, 0]}>
        <meshStandardMaterial color="#1E293B" metalness={0.82} roughness={0.28} />
      </RoundedBox>
      {/* Sculpted Matte-Black Cinema Camera Body */}
      <RoundedBox args={[0.26, 0.26, 0.46]} radius={0.024} smoothness={2} position={[0, 1.38, -0.02]} castShadow>
        <meshStandardMaterial color="#111827" roughness={0.35} metalness={0.62} />
      </RoundedBox>
      {/* Top carry handle & shotgun mic */}
      <mesh position={[0, 1.56, -0.04]} castShadow>
        <boxGeometry args={[0.055, 0.042, 0.34]} />
        <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Telephoto Cine Lens + Rectangular Matte Box */}
      <mesh position={[0, 1.38, 0.34]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.082, 0.092, 0.3, 16]} />
        <meshStandardMaterial color="#0B0F19" roughness={0.3} metalness={0.72} />
      </mesh>
      <RoundedBox args={[0.24, 0.19, 0.11]} radius={0.012} smoothness={2} position={[0, 1.38, 0.52]} castShadow>
        <meshStandardMaterial color="#090D16" roughness={0.42} metalness={0.58} />
      </RoundedBox>
      {/* Tiny red REC tally light on front */}
      <mesh position={[0.09, 1.48, 0.22]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={2.8} />
      </mesh>
    </group>
  );
});

/**
 * Clean White Potted Studio Plant (reused on server rack roof, beside desk, and front-right corner).
 */
const StudioPlanter = memo(function StudioPlanter({
  position,
  scale = 1,
}: {
  position: Vec3;
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.52, 16]} />
        <meshStandardMaterial color="#F1F5F9" roughness={0.28} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.515, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.02, 14]} />
        <meshStandardMaterial color="#1E293B" roughness={0.9} />
      </mesh>
      {[
        [0, 0.72, 0, 0.2, '#15803D'],
        [-0.12, 0.65, 0.1, 0.15, '#16A34A'],
        [0.12, 0.68, -0.09, 0.16, '#15803D'],
        [0.05, 0.86, 0.06, 0.14, '#22C55E'],
        [-0.08, 0.8, -0.1, 0.14, '#16A34A'],
      ].map(([x, y, z, r, col], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
          <dodecahedronGeometry args={[r as number, 0]} />
          <meshStandardMaterial color={col as string} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Left Chroma-Key Production Set (Green Screen Backdrop + Softbox Key Light + Pro Cinema Camera +
 * Blue-Lit Media Server Rack + Row of 4 Flight Cases) AND Right Foreground Flight Case with Pro DSLR Camera
 * + Architectural Studio Planters.
 */
export const ContentProductionRig = memo(function ContentProductionRig({ isDark = true }: { isDark?: boolean }) {
  const rackTex = useMemo(() => getContentServerRackTexture(isDark), [isDark]);

  return (
    <group>
      {/* ===================================================================== */}
      {/* LEFT PRODUCTION ZONE: CHROMA-KEY GREEN SCREEN, SOFTBOX & CINEMA RIG   */}
      {/* ===================================================================== */}

      {/* Vibrant Chroma-Key Green Screen Backdrop Stand */}
      <group position={[-4.85, 0, -1.95]} rotation={[0, 0.24, 0]}>
        {/* Twin upright C-stand poles + top crossbar */}
        {[-1.12, 1.12].map((px, i) => (
          <group key={i} position={[px, 0, 0]}>
            <mesh position={[0, 1.44, 0]} castShadow>
              <cylinderGeometry args={[0.026, 0.028, 2.88, 10]} />
              <meshStandardMaterial color={isDark ? '#111827' : '#536B83'} metalness={isDark ? 0.82 : 0.68} roughness={0.28} />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
              <cylinderGeometry args={[0.14, 0.16, 0.06, 12]} />
              <meshStandardMaterial color={isDark ? '#1E293B' : '#9EAFBF'} metalness={isDark ? 0.8 : 0.66} roughness={0.32} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 2.86, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 2.48, 12]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.84 : 0.68} roughness={0.26} />
        </mesh>
        {/* Seamless Chroma-Key Green Backdrop Cloth */}
        <mesh position={[0, 1.44, 0.03]} castShadow receiveShadow>
          <boxGeometry args={[2.14, 2.74, 0.025]} />
          <meshStandardMaterial color="#22C55E" emissive="#16A34A" emissiveIntensity={0.22} roughness={0.78} metalness={0.04} />
        </mesh>
      </group>

      {/* Studio Softbox Key Light on Tripod */}
      <StudioSoftboxLight position={[-5.15, 0, -0.25]} />

      {/* Pro Cinema Production Camera on Heavy Tripod */}
      <CinemaCameraRig position={[-3.92, 0, 0.35]} />

      {/* Tall Blue-Lit Media Storage & Render Server Rack + Roof Plant */}
      <group position={[-3.68, 0, -2.55]} rotation={[0, 0.08, 0]}>
        <RoundedBox args={[1.08, 2.55, 1.02]} radius={0.05} smoothness={2} position={[0, 1.275, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#334155' : '#DCE4EB'} roughness={isDark ? 0.28 : 0.25} metalness={isDark ? 0.86 : 0.64} />
        </RoundedBox>
        <mesh position={[0, 1.28, 0.516]}>
          <planeGeometry args={[0.88, 2.3]} />
          {rackTex ? (
            <meshStandardMaterial
              map={rackTex}
              emissive="#FFFFFF"
              emissiveMap={rackTex}
              emissiveIntensity={isDark ? 0.88 : 0.5}
              roughness={0.24}
              metalness={isDark ? 0.62 : 0.4}
            />
          ) : (
            <meshStandardMaterial color="#0A1224" emissive="#00B8FF" emissiveIntensity={0.6} />
          )}
        </mesh>
        {/* Glowing electric-blue vertical front edge bars */}
        {[-0.5, 0.5].map((rx, i) => (
          <mesh key={i} position={[rx, 1.28, 0.512]}>
            <boxGeometry args={[0.028, 2.38, 0.024]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.4} />
          </mesh>
        ))}
        {/* Small white potted green plant atop server rack (exact reference touch!) */}
        <StudioPlanter position={[0, 2.55, 0]} scale={0.58} />
      </group>

      {/* Mid-Left Potted Plant beside Editing Workstation */}
      <StudioPlanter position={[-2.68, 0, -0.92]} scale={0.95} />

      {/* Front-Left Row of 4 Studio Aluminum-Edged Equipment Flight Cases along Glass Railing */}
      {[-5.45, -4.75, -4.05].map((fx, i) => (
        <StudioFlightCase
          key={i}
          position={[fx, 0, 3.15]}
          size={[0.62, 0.52, 0.52]}
          rotation={[0, 0.06, 0]}
          isDark={isDark}
        />
      ))}
      <StudioFlightCase position={[-5.45, 0, 2.15]} size={[0.56, 0.54, 0.62]} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />

      {/* ===================================================================== */}
      {/* RIGHT FOREGROUND: LARGE STUDIO FLIGHT CASE + PRO DSLR + PLANTER       */}
      {/* ===================================================================== */}

      {/* Large Rugged Studio Flight Case at Front-Right with Sculpted 3D Pro DSLR Camera on Top */}
      <group position={[3.35, 0, 2.45]} rotation={[0, -0.22, 0]}>
        <StudioFlightCase position={[0, 0, 0]} size={[1.15, 0.86, 0.86]} showHazardSticker isDark={isDark} />
        <ProDslrCamera position={[0, 0.86, 0]} />
      </group>

      {/* Tall White Studio Planter beside the Right Feature Wall (clear of east +X bridge-content dock!) */}
      <StudioPlanter position={[5.35, 0, -1.55]} scale={1.2} />
    </group>
  );
});
