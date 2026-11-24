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
}: {
  position: Vec3;
  rotation?: [number, number, number];
  size?: Vec3;
  activityRef: React.RefObject<number>;
  phase?: number;
}) {
  const reducedMotion = useReducedMotion();
  const faceMatRef = useRef<MeshStandardMaterial>(null);
  const faceTex = useMemo(() => getProcessServerFaceTexture(), []);
  const [w, h, d] = size;

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const energy = activityRef.current ?? 0;
    if (faceMatRef.current) {
      faceMatRef.current.emissiveIntensity = 1.0 + energy * (0.55 + 0.25 * Math.sin(t * 6.5 + phase));
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Grounded recessed dark steel base plinth */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.04, 0.08, d + 0.04]} />
        <meshStandardMaterial color="#0A0F1A" roughness={0.44} metalness={0.85} />
      </mesh>

      {/* Main Matte Dark Gunmetal Cabinet Body */}
      <RoundedBox args={[w, h - 0.1, d]} radius={0.045} smoothness={2} position={[0, 0.08 + (h - 0.1) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#182132" roughness={0.34} metalness={0.82} />
      </RoundedBox>

      {/* Signature Brushed-Silver Chamfered Front Corner Pillars */}
      {[-w / 2 + 0.032, w / 2 - 0.032].map((rx, i) => (
        <mesh key={i} position={[rx, 0.08 + (h - 0.12) / 2, d / 2 - 0.008]} castShadow>
          <boxGeometry args={[0.068, h - 0.14, 0.055]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.22} metalness={0.92} />
        </mesh>
      ))}

      {/* Precision Brushed-Silver Beveled Top Crown Cap */}
      <RoundedBox args={[w + 0.03, 0.09, d + 0.03]} radius={0.03} smoothness={2} position={[0, h + 0.015, 0]} castShadow>
        <meshStandardMaterial color="#94A3B8" roughness={0.22} metalness={0.92} />
      </RoundedBox>
      <mesh position={[0, h + 0.064, 0]}>
        <boxGeometry args={[w * 0.72, 0.015, d * 0.68]} />
        <meshStandardMaterial color="#1E293B" roughness={0.48} metalness={0.78} />
      </mesh>

      {/* Recessed Equipment Bay & Illuminated Cyan-Blue Blade Array */}
      <mesh position={[0, 0.1 + (h - 0.22) / 2, d / 2 - 0.005]}>
        <boxGeometry args={[w - 0.16, h - 0.24, 0.024]} />
        <meshStandardMaterial color="#050912" roughness={0.4} metalness={0.65} />
      </mesh>
      <mesh position={[0, 0.1 + (h - 0.22) / 2, d / 2 + 0.01]}>
        <planeGeometry args={[w - 0.2, h - 0.3]} />
        {faceTex ? (
          <meshStandardMaterial
            ref={faceMatRef}
            map={faceTex}
            emissive="#FFFFFF"
            emissiveMap={faceTex}
            emissiveIntensity={1.08}
            roughness={0.25}
            metalness={0.3}
          />
        ) : (
          <meshStandardMaterial ref={faceMatRef} color="#38BDF8" emissive="#00E5FF" emissiveIntensity={1.0} />
        )}
      </mesh>

      {/* Subtle Side Brushed-Steel Vertical Trim Panel */}
      {[-w / 2 - 0.006, w / 2 + 0.006].map((sx, i) => (
        <mesh key={i} position={[sx, h * 0.52, 0]}>
          <boxGeometry args={[0.014, h * 0.72, d * 0.64]} />
          <meshStandardMaterial color="#273449" roughness={0.38} metalness={0.82} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Right-Most Signature Process Monolith Cabinet matching the reference image:
 * - Tall chamfered dark gunmetal & brushed-silver vertical enclosure
 * - Prominent glowing purple workflow-hierarchy glyph on its front panel
 * - Dual horizontal glowing electric-cyan status bars near the base
 */
export const ProcessWorkflowMonolith = memo(function ProcessWorkflowMonolith({
  position = [5.05, 0, -1.35],
  activityRef,
}: {
  position?: Vec3;
  activityRef: React.RefObject<number>;
}) {
  const reducedMotion = useReducedMotion();
  const faceMatRef = useRef<MeshStandardMaterial>(null);
  const faceTex = useMemo(() => getProcessMonolithTexture(), []);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const energy = activityRef.current ?? 0;
    if (faceMatRef.current) {
      faceMatRef.current.emissiveIntensity = 1.05 + energy * (0.65 + 0.25 * Math.sin(t * 6.0));
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
        <meshStandardMaterial color="#0A0F1A" roughness={0.42} metalness={0.86} />
      </mesh>
      {/* Main Chamfered Dark Gunmetal Monolith Body */}
      <RoundedBox args={[w, h - 0.1, d]} radius={0.055} smoothness={2} position={[0, 0.08 + (h - 0.1) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1B2436" roughness={0.3} metalness={0.86} />
      </RoundedBox>
      {/* Brushed-Silver Top Bevel Plate */}
      <RoundedBox args={[w + 0.02, 0.09, d + 0.02]} radius={0.035} smoothness={2} position={[0, h + 0.015, 0]} castShadow>
        <meshStandardMaterial color="#CBD5E1" roughness={0.2} metalness={0.92} />
      </RoundedBox>
      {/* Brushed-Silver Vertical Edge Trim */}
      {[-w / 2 + 0.028, w / 2 - 0.028].map((rx, i) => (
        <mesh key={i} position={[rx, 0.08 + (h - 0.12) / 2, d / 2 - 0.008]}>
          <boxGeometry args={[0.055, h - 0.14, 0.045]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.22} metalness={0.92} />
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
            emissiveIntensity={1.12}
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
