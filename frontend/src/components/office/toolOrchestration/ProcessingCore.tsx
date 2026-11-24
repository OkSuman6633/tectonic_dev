import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import {
  AdditiveBlending,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three';
import type { Vec3 } from '../officeLayout';
import { getCoreEmitterPadTexture, getHoloCoreCubeTexture } from './textures';

/** Helper that renders the 12 glowing edge bars of a wireframe box of given [w, h, d]. */
const WireframeBoxEdges = memo(function WireframeBoxEdges({
  size,
  thickness,
  color,
  emissive,
  emissiveIntensity,
}: {
  size: [number, number, number];
  thickness: number;
  color: string;
  emissive: string;
  emissiveIntensity: number;
}) {
  const [w, h, d] = size;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;

  return (
    <group>
      {/* 4 vertical corner bars */}
      {[
        [-hw, 0, -hd],
        [hw, 0, -hd],
        [-hw, 0, hd],
        [hw, 0, hd],
      ].map(([x, y, z], i) => (
        <mesh key={`v-${i}`} position={[x, y, z]}>
          <boxGeometry args={[thickness, h + thickness, thickness]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.12} />
        </mesh>
      ))}
      {/* 4 horizontal X-axis bars */}
      {[
        [0, -hh, -hd],
        [0, hh, -hd],
        [0, -hh, hd],
        [0, hh, hd],
      ].map(([x, y, z], i) => (
        <mesh key={`x-${i}`} position={[x, y, z]}>
          <boxGeometry args={[w + thickness, thickness, thickness]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.12} />
        </mesh>
      ))}
      {/* 4 horizontal Z-axis bars */}
      {[
        [-hw, -hh, 0],
        [hw, -hh, 0],
        [-hw, hh, 0],
        [hw, hh, 0],
      ].map(([x, y, z], i) => (
        <mesh key={`z-${i}`} position={[x, y, z]}>
          <boxGeometry args={[thickness, thickness, d + thickness]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.12} />
        </mesh>
      ))}
    </group>
  );
});

/** Reusable rounded-corner glowing amber pedestal light rim matching the reference's smooth golden loops. */
const AmberPedestalRing = memo(function AmberPedestalRing({
  y,
  width,
  depth,
  thickness = 0.058,
  matRef,
}: {
  y: number;
  width: number;
  depth: number;
  thickness?: number;
  matRef?: React.RefObject<MeshStandardMaterial>;
}) {
  return (
    <RoundedBox
      args={[width + thickness * 1.15, thickness * 0.88, depth + thickness * 1.15]}
      radius={0.08}
      smoothness={3}
      position={[0, y, 0]}
    >
      <meshStandardMaterial
        ref={matRef}
        color="#FFF5CC"
        emissive="#FFA000"
        emissiveIntensity={2.95}
        roughness={0.14}
      />
    </RoundedBox>
  );
});

/**
 * Central Monumental Holographic Processing Core (Reference Centerpiece):
 * - 3-Tier chamfered brushed-titanium foundation pedestal with recessed ventilation louvers
 * - Dual continuous glowing molten-amber perimeter light loops on Tier 2 and Tier 3
 * - Transparent glass containment cube with golden corner edge mullions & orbiting holographic ribbons
 * - Floating holographic golden wireframe-circuit cube with procedural sacred-circuit faces & inner radiant core
 */
export const CentralHolographicCore = memo(function CentralHolographicCore({
  position = [-0.15, 0, -0.35] as Vec3,
  activeRef,
  isDark = true,
}: {
  position?: Vec3;
  activeRef: React.RefObject<boolean>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const holoCubeGroupRef = useRef<Group>(null);
  const innerCoreRef = useRef<Mesh>(null);
  const haloRing1Ref = useRef<Mesh>(null);
  const haloRing2Ref = useRef<Mesh>(null);
  const tier2RingMatRef = useRef<MeshStandardMaterial>(null);
  const tier3RingMatRef = useRef<MeshStandardMaterial>(null);
  const coreGlowMatRef = useRef<MeshBasicMaterial>(null);

  const cubeTex = useMemo(() => getHoloCoreCubeTexture(), []);
  const padTex = useMemo(() => getCoreEmitterPadTexture(), []);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const active = Boolean(activeRef.current);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * (active ? 6.0 : 2.8));

    if (holoCubeGroupRef.current && !reducedMotion) {
      holoCubeGroupRef.current.position.y = 1.62 + Math.sin(t * 1.9) * 0.045;
      holoCubeGroupRef.current.rotation.y += dt * (active ? 0.55 : 0.14);
    }
    if (innerCoreRef.current && !reducedMotion) {
      innerCoreRef.current.rotation.x += dt * (active ? 1.4 : 0.45);
      innerCoreRef.current.rotation.y -= dt * (active ? 1.2 : 0.4);
      const s = 1 + (active ? 0.09 : 0.04) * pulse;
      innerCoreRef.current.scale.set(s, s, s);
    }
    if (haloRing1Ref.current && !reducedMotion) {
      haloRing1Ref.current.rotation.z += dt * (active ? 0.85 : 0.25);
    }
    if (haloRing2Ref.current && !reducedMotion) {
      haloRing2Ref.current.rotation.z -= dt * (active ? 0.65 : 0.2);
    }
    if (tier2RingMatRef.current) {
      tier2RingMatRef.current.emissiveIntensity = active ? 3.5 + 0.8 * pulse : 2.75 + 0.3 * pulse;
    }
    if (tier3RingMatRef.current) {
      tier3RingMatRef.current.emissiveIntensity = active ? 3.7 + 0.9 * pulse : 2.95 + 0.35 * pulse;
    }
    if (coreGlowMatRef.current) {
      coreGlowMatRef.current.opacity = active ? 0.92 : 0.78;
    }
  });

  return (
    <group position={position}>
      {/* ================================================================================= */}
      {/* TIER 1: HEAVY CHAMFERED TITANIUM BASE PLINTH */}
      {/* ================================================================================= */}
      <RoundedBox args={[3.04, 0.36, 3.04]} radius={0.08} smoothness={2} position={[0, 0.18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#182233' : '#DCE4EB'} roughness={isDark ? 0.34 : 0.28} metalness={isDark ? 0.82 : 0.68} />
      </RoundedBox>

      {/* Recessed Industrial Cooling Grilles on all 4 vertical faces of Tier 1 */}
      {[
        { pos: [0, 0.18, 1.525] as Vec3, rot: [0, 0, 0] as Vec3 },
        { pos: [0, 0.18, -1.525] as Vec3, rot: [0, Math.PI, 0] as Vec3 },
        { pos: [1.525, 0.18, 0] as Vec3, rot: [0, Math.PI / 2, 0] as Vec3 },
        { pos: [-1.525, 0.18, 0] as Vec3, rot: [0, -Math.PI / 2, 0] as Vec3 },
      ].map((f, idx) => (
        <group key={`t1-vent-${idx}`} position={f.pos} rotation={f.rot}>
          <mesh>
            <boxGeometry args={[2.25, 0.22, 0.02]} />
            <meshStandardMaterial color={isDark ? '#0A0F1A' : '#141E2B'} roughness={0.6} metalness={0.6} />
          </mesh>
          {/* Subtle warm internal radiator glow behind grille bars */}
          <mesh position={[0, 0, 0.008]}>
            <boxGeometry args={[2.1, 0.04, 0.015]} />
            <meshStandardMaterial color="#FFB830" emissive="#F59E0B" emissiveIntensity={1.65} />
          </mesh>
        </group>
      ))}

      {/* ================================================================================= */}
      {/* TIER 2: STEPPED BRUSHED TITANIUM PEDESTAL + LOWER GOLDEN LIGHT LOOP */}
      {/* ================================================================================= */}
      <RoundedBox args={[2.52, 0.24, 2.52]} radius={0.08} smoothness={2} position={[0, 0.48, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#212E42' : '#9EAFBF'} roughness={isDark ? 0.28 : 0.28} metalness={isDark ? 0.84 : 0.7} />
      </RoundedBox>
      <AmberPedestalRing y={0.585} width={2.52} depth={2.52} thickness={0.055} matRef={tier2RingMatRef} />

      {/* ================================================================================= */}
      {/* TIER 3: UPPER CORE EMITTER DECK + UPPER GOLDEN LIGHT LOOP */}
      {/* ================================================================================= */}
      <RoundedBox args={[2.02, 0.18, 2.02]} radius={0.07} smoothness={2} position={[0, 0.7, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#1A2436' : '#536B83'} roughness={isDark ? 0.28 : 0.3} metalness={isDark ? 0.86 : 0.74} />
      </RoundedBox>
      <AmberPedestalRing y={0.78} width={2.02} depth={2.02} thickness={0.052} matRef={tier3RingMatRef} />

      {/* Glowing Recessed Golden Circuit Emitter Bed */}
      <mesh position={[0, 0.808, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.82, 1.82]} />
        {padTex ? (
          <meshBasicMaterial map={padTex} />
        ) : (
          <meshBasicMaterial color="#F59E0B" />
        )}
      </mesh>

      {/* Soft Volumetric Golden Energy Wash Rising Inside Containment */}
      <mesh position={[0, 1.56, 0]}>
        <cylinderGeometry args={[0.72, 0.86, 1.44, 20, 1, true]} />
        <meshBasicMaterial
          color="#FFB830"
          transparent
          opacity={0.14}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* ================================================================================= */}
      {/* TRANSPARENT GLASS CONTAINMENT ENCLOSURE & ORBITING HOLOGRAPHIC RIBBONS */}
      {/* ================================================================================= */}
      <group position={[0, 1.58, 0]}>
        {/* Outer Glossy Translucent Glass Cube */}
        <mesh>
          <boxGeometry args={[1.64, 1.54, 1.64]} />
          <meshStandardMaterial
            color="#FFE8A3"
            transparent
            opacity={0.16}
            roughness={0.06}
            metalness={0.22}
            depthWrite={false}
          />
        </mesh>

        {/* Crisp Luminous Golden Corner Edge Mullions Framing the Containment Cube */}
        <WireframeBoxEdges
          size={[1.64, 1.54, 1.64]}
          thickness={0.022}
          color="#FFE599"
          emissive="#FFA726"
          emissiveIntensity={2.35}
        />

        {/* Two Delicate Glowing Holographic Energy Halo Ribbons Wrapping the Containment Box */}
        <mesh ref={haloRing1Ref} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.92, 1.18, 48]} />
          <meshBasicMaterial
            color="#FFC94A"
            transparent
            opacity={0.34}
            side={DoubleSide}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={haloRing2Ref} position={[0, -0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.98, 1.14, 48]} />
          <meshBasicMaterial
            color="#FFE89E"
            transparent
            opacity={0.26}
            side={DoubleSide}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* ================================================================================= */}
      {/* CENTRAL FLOATING HOLOGRAPHIC GOLDEN CIRCUIT CUBE CORE */}
      {/* ================================================================================= */}
      <group ref={holoCubeGroupRef} position={[0, 1.62, 0]}>
        {/* Holographic Circuit-Mandala Translucent Cube (Additive Luminous Projection) */}
        <mesh>
          <boxGeometry args={[1.04, 1.04, 1.04]} />
          {cubeTex ? (
            <meshBasicMaterial
              ref={coreGlowMatRef}
              map={cubeTex}
              transparent
              opacity={0.85}
              blending={AdditiveBlending}
              side={DoubleSide}
              depthWrite={false}
            />
          ) : (
            <meshBasicMaterial color="#FFC94A" transparent opacity={0.65} blending={AdditiveBlending} depthWrite={false} />
          )}
        </mesh>

        {/* Razor-Sharp Luminous White-Gold Outer Wireframe Skeleton */}
        <WireframeBoxEdges
          size={[1.05, 1.05, 1.05]}
          thickness={0.026}
          color="#FFFBEB"
          emissive="#FFBE2E"
          emissiveIntensity={3.4}
        />

        {/* Nested Inner Holographic Wireframe Cube (Volumetric Depth) */}
        <WireframeBoxEdges
          size={[0.64, 0.64, 0.64]}
          thickness={0.016}
          color="#FFF7D6"
          emissive="#FFA726"
          emissiveIntensity={2.8}
        />

        {/* Hot Radiant White-Gold Central Quantum Core */}
        <mesh ref={innerCoreRef}>
          <octahedronGeometry args={[0.28, 1]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#FFE082" emissiveIntensity={3.8} roughness={0.1} />
        </mesh>

        {/* Volumetric Soft Golden Glow Aura Sphere */}
        <mesh>
          <sphereGeometry args={[0.48, 16, 16]} />
          <meshBasicMaterial
            color="#FFCA4A"
            transparent
            opacity={0.26}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
});
