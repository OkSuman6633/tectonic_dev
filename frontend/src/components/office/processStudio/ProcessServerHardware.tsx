import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import type { MeshStandardMaterial } from 'three';
import type { Vec3 } from '../officeLayout';
import { getProcessMonolithTexture, getProcessServerFaceTexture } from './textures';

/**
 * Realistic Enterprise Server Rack matching the reference's clean chamfered silver-bezel racks:
 * - Matte obsidian steel chassis with brushed-silver chamfered corner pillars & top bevel cap
 * - Recessed front equipment bay with crisp cyan-blue illuminated 14U blade array
 * - Subtle top ventilation louver plate & side metallic accents
 */
export const ProcessServerRack = memo(function ProcessServerRack({
  position,
  rotation = [0, 0, 0],
  size = [1.02, 2.48, 0.96],
  activityRef,
  phase = 0,
  isDark = true,
}: {
  position: Vec3;
  rotation?: [number, number, number];
  size?: Vec3;
  activityRef: React.RefObject<number>;
  phase?: number;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const faceMatRef = useRef<MeshStandardMaterial>(null);
  const faceTex = useMemo(() => getProcessServerFaceTexture(isDark), [isDark]);
  const [w, h, d] = size;

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const energy = activityRef.current ?? 0;
    if (faceMatRef.current) {
      faceMatRef.current.emissiveIntensity = (isDark ? 1.0 : 0.48) + energy * (0.45 + 0.2 * Math.sin(t * 6.5 + phase));
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Grounded recessed steel base plinth */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.04, 0.08, d + 0.04]} />
        <meshStandardMaterial color={isDark ? '#0A0F1A' : '#536B83'} roughness={isDark ? 0.44 : 0.36} metalness={isDark ? 0.85 : 0.65} />
      </mesh>

      {/* Main Cabinet Body */}
      <RoundedBox args={[w, h - 0.1, d]} radius={0.045} smoothness={2} position={[0, 0.08 + (h - 0.1) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#182132' : '#DCE4EB'} roughness={isDark ? 0.34 : 0.25} metalness={isDark ? 0.82 : 0.64} />
      </RoundedBox>

      {/* Signature Chamfered Front Corner Pillars */}
      {[-w / 2 + 0.032, w / 2 - 0.032].map((rx, i) => (
        <mesh key={i} position={[rx, 0.08 + (h - 0.12) / 2, d / 2 - 0.008]} castShadow>
          <boxGeometry args={[0.068, h - 0.14, 0.055]} />
          <meshStandardMaterial color={isDark ? '#94A3B8' : '#F5F7FA'} roughness={isDark ? 0.22 : 0.18} metalness={isDark ? 0.92 : 0.56} />
        </mesh>
      ))}

      {/* Precision Beveled Top Crown Cap */}
      <RoundedBox args={[w + 0.03, 0.09, d + 0.03]} radius={0.03} smoothness={2} position={[0, h + 0.015, 0]} castShadow>
        <meshStandardMaterial color={isDark ? '#94A3B8' : '#F5F7FA'} roughness={isDark ? 0.22 : 0.18} metalness={isDark ? 0.92 : 0.56} />
      </RoundedBox>
      <mesh position={[0, h + 0.064, 0]}>
        <boxGeometry args={[w * 0.72, 0.015, d * 0.68]} />
        <meshStandardMaterial color={isDark ? '#1E293B' : '#141E2B'} roughness={0.48} metalness={0.78} />
      </mesh>

      {/* Recessed Equipment Bay & Illuminated Cyan-Blue Blade Array */}
      <mesh position={[0, 0.1 + (h - 0.22) / 2, d / 2 - 0.005]}>
        <boxGeometry args={[w - 0.16, h - 0.24, 0.024]} />
        <meshStandardMaterial color={isDark ? '#050912' : '#536B83'} roughness={isDark ? 0.4 : 0.36} metalness={isDark ? 0.65 : 0.56} />
      </mesh>
      <mesh position={[0, 0.1 + (h - 0.22) / 2, d / 2 + 0.01]}>
        <planeGeometry args={[w - 0.2, h - 0.3]} />
        {faceTex ? (
          <meshStandardMaterial
            ref={faceMatRef}
            map={faceTex}
            emissive="#FFFFFF"
            emissiveMap={faceTex}
            emissiveIntensity={isDark ? 1.08 : 0.5}
            roughness={0.25}
            metalness={0.3}
          />
        ) : (
          <meshStandardMaterial ref={faceMatRef} color="#38BDF8" emissive="#00E5FF" emissiveIntensity={1.0} />
        )}
      </mesh>

      {/* Subtle Side Frosted Steel Blue Vertical Trim Panel */}
      {[-w / 2 - 0.006, w / 2 + 0.006].map((sx, i) => (
        <mesh key={i} position={[sx, h * 0.52, 0]}>
          <boxGeometry args={[0.014, h * 0.72, d * 0.64]} />
          <meshStandardMaterial color={isDark ? '#273449' : '#9EAFBF'} roughness={isDark ? 0.38 : 0.32} metalness={isDark ? 0.82 : 0.6} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Right-Most Signature Process Monolith Cabinet matching the reference image:
 * - Tall chamfered vertical enclosure
 * - Prominent glowing purple workflow-hierarchy glyph on its front panel
 * - Dual horizontal glowing electric-cyan status bars near the base
 */
export const ProcessWorkflowMonolith = memo(function ProcessWorkflowMonolith({
  position = [5.05, 0, -1.35],
  activityRef,
  isDark = true,
}: {
  position?: Vec3;
  activityRef: React.RefObject<number>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const faceMatRef = useRef<MeshStandardMaterial>(null);
  const faceTex = useMemo(() => getProcessMonolithTexture(isDark), [isDark]);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const energy = activityRef.current ?? 0;
    if (faceMatRef.current) {
      faceMatRef.current.emissiveIntensity = (isDark ? 1.05 : 0.82) + energy * (0.55 + 0.22 * Math.sin(t * 6.0));
    }
  });

  const w = 1.06;
  const h = 2.62;
  const d = 0.98;

  return (
    <group position={position}>
      {/* Grounded base plinth */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.04, 0.08, d + 0.04]} />
        <meshStandardMaterial color={isDark ? '#0A0F1A' : '#536B83'} roughness={isDark ? 0.42 : 0.36} metalness={isDark ? 0.86 : 0.65} />
      </mesh>
      {/* Main Chamfered Monolith Body */}
      <RoundedBox args={[w, h - 0.1, d]} radius={0.055} smoothness={2} position={[0, 0.08 + (h - 0.1) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#1B2436' : '#DCE4EB'} roughness={isDark ? 0.3 : 0.25} metalness={isDark ? 0.86 : 0.64} />
      </RoundedBox>
      {/* Top Bevel Plate */}
      <RoundedBox args={[w + 0.02, 0.09, d + 0.02]} radius={0.035} smoothness={2} position={[0, h + 0.015, 0]} castShadow>
        <meshStandardMaterial color={isDark ? '#CBD5E1' : '#F5F7FA'} roughness={0.2} metalness={isDark ? 0.92 : 0.56} />
      </RoundedBox>
      {/* Vertical Edge Trim */}
      {[-w / 2 + 0.028, w / 2 - 0.028].map((rx, i) => (
        <mesh key={i} position={[rx, 0.08 + (h - 0.12) / 2, d / 2 - 0.008]}>
          <boxGeometry args={[0.055, h - 0.14, 0.045]} />
          <meshStandardMaterial color={isDark ? '#94A3B8' : '#9EAFBF'} roughness={0.22} metalness={isDark ? 0.92 : 0.66} />
        </mesh>
      ))}
      {/* Glowing Purple Workflow Glyph + Dual Cyan Base Bars Faceplate */}
      <mesh position={[0, 0.1 + (h - 0.2) / 2, d / 2 + 0.012]}>
        <planeGeometry args={[w - 0.14, h - 0.22]} />
        {faceTex ? (
          <meshStandardMaterial
            ref={faceMatRef}
            map={faceTex}
            emissive="#FFFFFF"
            emissiveMap={faceTex}
            emissiveIntensity={isDark ? 1.12 : 0.85}
            roughness={0.22}
            metalness={0.32}
          />
        ) : (
          <meshStandardMaterial ref={faceMatRef} color="#A855F7" emissive="#A855F7" emissiveIntensity={1.1} />
        )}
      </mesh>
    </group>
  );
});
