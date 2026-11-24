import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import {
  AdditiveBlending,
  DoubleSide,
  SphereGeometry,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three';
import type { Vec3 } from '../officeLayout';
import { CurvedChromePipe } from '../toolOrchestration/ServerAndCoolingHardware';
import { getCoreEmitterDiscTexture, getNeuralCortexTexture } from './textures';

/**
 * Generates an anatomically sculpted cerebral hemisphere BufferGeometry with organic gyri/sulci folds,
 * flattened medial wall (for longitudinal fissure), elongated frontal/occipital profile, and temporal bulge.
 */
function buildHemisphereGeometry(side: -1 | 1): SphereGeometry {
  const geom = new SphereGeometry(0.56, 36, 28);
  const pos = geom.attributes.position;
  const v = new Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Normalize for angular fold evaluation
    const len = v.length() || 1;
    const nx = v.x / len;
    const ny = v.y / len;
    const nz = v.z / len;

    // Shape into elongated cerebral hemisphere (longer along Z/X axis, slightly vaulted on top)
    let x = v.x * 0.78;
    let y = v.y * 0.86;
    let z = v.z * 1.24;

    // Flatten the inner medial face near the longitudinal fissure
    if (x * side < 0) {
      x *= 0.34;
    }

    // Temporal lobe inferior-lateral bulge
    if (ny < 0.08 && Math.abs(nz) < 0.62 && x * side > 0.08) {
      const tempFactor = Math.exp(-Math.pow((nz + 0.05) * 2.2, 2)) * Math.exp(-Math.pow((ny + 0.32) * 2.4, 2));
      x += side * 0.14 * tempFactor;
      y -= 0.1 * tempFactor;
    }

    // Slight inferior concavity at the base
    if (ny < -0.42) {
      y += (-0.42 - ny) * 0.22;
    }

    // Procedural cortical gyri & sulci folding ripples
    const gyri =
      Math.sin(nx * 13.5 + ny * 9.0 + nz * 11.0) * 0.026 +
      Math.cos(nx * 21.0 - nz * 17.5 + ny * 12.0) * 0.016 +
      Math.sin(ny * 19.0 + nz * 14.0) * 0.012;
    const scaleFold = 1 + gyri;

    pos.setXYZ(i, x * scaleFold + side * 0.24, y * scaleFold, z * scaleFold);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Monumental Central Memory Core matching the reference:
 * - Multi-tier circular brushed-titanium stepped foundation pedestal with recessed turbine ribs & dual cyan glow rings
 * - Physical brushed-brass curved cooling/data conduit pipes bridging directly into both STM (-X) and LTM (+X) sections
 * - Tall transparent glass cylindrical neural-processing chamber with top/bottom glowing cyan rings & animated scan rings
 * - Detailed floating 3D holographic neural brain (left/right sculpted hemispheres, cerebellum, brainstem, synaptic sparks)
 *   that reacts dynamically to real-time STM writes, LTM recalls, and cross-memory synchronization events
 */
export const CentralMemoryCore = memo(function CentralMemoryCore({
  position = [0, 0, -0.55],
  stmActiveRef,
  ltmActiveRef,
  syncActiveRef,
}: {
  position?: Vec3;
  stmActiveRef: React.RefObject<number>;
  ltmActiveRef: React.RefObject<number>;
  syncActiveRef: React.RefObject<number>;
}) {
  const reducedMotion = useReducedMotion();
  const brainGroupRef = useRef<Group>(null);
  const emitterDiscRef = useRef<Mesh>(null);
  const scanRingARef = useRef<Mesh>(null);
  const scanRingBRef = useRef<Mesh>(null);
  const syncHaloRef = useRef<Mesh>(null);
  const brainMatRef = useRef<MeshStandardMaterial>(null);
  const brainInnerMatRef = useRef<MeshBasicMaterial>(null);
  const topRingMatRef = useRef<MeshStandardMaterial>(null);

  const cortexTex = useMemo(() => getNeuralCortexTexture(), []);
  const emitterTex = useMemo(() => getCoreEmitterDiscTexture(), []);

  const leftHemi = useMemo(() => buildHemisphereGeometry(-1), []);
  const rightHemi = useMemo(() => buildHemisphereGeometry(1), []);

  // 16 machined radial fins around Tier-1 pedestal drum
  const pedestalRibs = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < 16; i++) out.push((i / 16) * Math.PI * 2);
    return out;
  }, []);

  // Synaptic spark positions orbiting close to the cortical shell
  const synapsePoints = useMemo(() => {
    const pts: Vec3[] = [];
    for (let i = 0; i < 18; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 18);
      const theta = i * 2.39996;
      pts.push([
        Math.sin(phi) * Math.cos(theta) * 0.68,
        Math.cos(phi) * 0.46 + 0.05,
        Math.sin(phi) * Math.sin(theta) * 0.74,
      ]);
    }
    return pts;
  }, []);

  // Physical curved brushed-brass conduits linking the Central Pedestal to STM (left) and LTM (right)
  const coreToStmPipeA: Vec3[] = useMemo(
    () => [
      [-1.78, 0.44, 0.35],
      [-2.18, 0.44, 0.58],
      [-2.42, 0.14, 0.85],
      [-3.12, 0.14, 1.35],
    ],
    [],
  );
  const coreToStmPipeB: Vec3[] = useMemo(
    () => [
      [-1.84, 0.34, -0.55],
      [-2.35, 0.34, -0.78],
      [-2.75, 0.14, -1.05],
      [-3.75, 0.14, -1.25],
    ],
    [],
  );
  const coreToLtmPipeA: Vec3[] = useMemo(
    () => [
      [1.76, 0.44, 0.42],
      [2.12, 0.44, 0.68],
      [2.32, 0.16, 1.05],
      [2.58, 0.16, 1.55],
    ],
    [],
  );
  const coreToLtmPipeB: Vec3[] = useMemo(
    () => [
      [1.82, 0.34, -0.48],
      [2.38, 0.34, -0.75],
      [2.72, 0.14, -1.18],
      [3.32, 0.14, -1.75],
    ],
    [],
  );

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const stm = stmActiveRef.current ?? 0;
    const ltm = ltmActiveRef.current ?? 0;
    const sync = syncActiveRef.current ?? 0;
    const energy = Math.min(1.5, stm + ltm + sync * 1.2);

    if (brainGroupRef.current && !reducedMotion) {
      brainGroupRef.current.position.y = 2.54 + Math.sin(t * 2.0) * 0.09;
      brainGroupRef.current.rotation.y += dt * (0.28 + energy * 0.72);
      const scalePulse = 1.18 * (1 + 0.03 * Math.sin(t * 3.6) + energy * 0.04);
      brainGroupRef.current.scale.setScalar(scalePulse);
    }

    if (emitterDiscRef.current && !reducedMotion) {
      emitterDiscRef.current.rotation.z -= dt * (0.45 + energy * 1.1);
    }

    if (scanRingARef.current && !reducedMotion) {
      scanRingARef.current.position.y = 2.38 + Math.sin(t * (1.25 + energy * 0.8)) * 1.12;
    }

    if (scanRingBRef.current && !reducedMotion) {
      scanRingBRef.current.position.y = 2.38 + Math.cos(t * (1.05 + energy * 0.7)) * 1.08;
    }

    if (syncHaloRef.current) {
      syncHaloRef.current.visible = sync > 0.05;
      if (sync > 0.05 && !reducedMotion) {
        syncHaloRef.current.rotation.z += dt * 2.4;
        syncHaloRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 3.2) * 0.35;
      }
    }

    if (brainMatRef.current) {
      // Shift brain cortical glow slightly violet during pure LTM recall, cyan on STM, brilliant white-cyan on sync
      if (ltm > stm + 0.15 && sync < 0.2) {
        brainMatRef.current.emissive.set('#818CF8');
      } else {
        brainMatRef.current.emissive.set('#00E5FF');
      }
      brainMatRef.current.emissiveIntensity = 1.65 + 0.3 * Math.sin(t * 4.0) + energy * 0.95;
    }

    if (brainInnerMatRef.current) {
      brainInnerMatRef.current.opacity = 0.24 + energy * 0.16;
    }

    if (topRingMatRef.current) {
      topRingMatRef.current.emissiveIntensity = 2.5 + energy * 1.2 + 0.3 * Math.sin(t * 5.0);
    }
  });

  return (
    <group position={position}>
      {/* ================================================================================= */}
      {/* 1. LAYERED CIRCULAR METALLIC FOUNDATION PEDESTAL (y = 0 to y = 0.82) */}
      {/* ================================================================================= */}
      {/* Floor luminous ground-reflection halo */}
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.02, 2.38, 40]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.22} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Tier 1: Heavy Dark Titanium Circular Base Drum */}
      <mesh position={[0, 0.19, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.92, 2.12, 0.38, 36]} />
        <meshStandardMaterial color="#182235" roughness={0.32} metalness={0.86} />
      </mesh>

      {/* Machined Radial Turbine Ribs & Recessed Vent Slots around Tier 1 */}
      {pedestalRibs.map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <mesh position={[0, 0.21, 1.98]} castShadow>
            <boxGeometry args={[0.12, 0.32, 0.16]} />
            <meshStandardMaterial color="#334155" roughness={0.28} metalness={0.88} />
          </mesh>
          {/* Warm brushed-brass micro bracket accent every 4th rib */}
          {i % 2 === 0 && (
            <mesh position={[0, 0.08, 2.04]}>
              <boxGeometry args={[0.16, 0.06, 0.08]} />
              <meshStandardMaterial color="#C8A25B" roughness={0.24} metalness={0.9} />
            </mesh>
          )}
        </group>
      ))}

      {/* Lower Tier Cyan Illuminated Trim Ring */}
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.86, 0.042, 10, 48]} />
        <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.65} roughness={0.14} />
      </mesh>

      {/* Tier 2: Stepped Brushed-Steel Upper Ring */}
      <mesh position={[0, 0.54, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.64, 1.78, 0.28, 36]} />
        <meshStandardMaterial color="#243147" roughness={0.28} metalness={0.88} />
      </mesh>

      {/* Secondary Bright Cyan Halo Ring on Tier 2 Rim */}
      <mesh position={[0, 0.69, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.56, 0.048, 10, 48]} />
        <meshStandardMaterial color="#BAE6FD" emissive="#00E5FF" emissiveIntensity={2.9} roughness={0.12} />
      </mesh>

      {/* Tier 3: Precision Glass Containment Base Collar */}
      <mesh position={[0, 0.77, 0]} castShadow>
        <cylinderGeometry args={[1.42, 1.5, 0.16, 36]} />
        <meshStandardMaterial color="#0F172A" roughness={0.3} metalness={0.88} />
      </mesh>

      {/* Glowing Rotating Concentric Holographic Emitter Disc */}
      <mesh ref={emitterDiscRef} position={[0, 0.858, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.32, 36]} />
        {emitterTex ? (
          <meshBasicMaterial map={emitterTex} transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} />
        ) : (
          <meshBasicMaterial color="#00E5FF" transparent opacity={0.7} blending={AdditiveBlending} depthWrite={false} />
        )}
      </mesh>

      {/* ================================================================================= */}
      {/* 2. TRANSPARENT GLASS CYLINDRICAL NEURAL-PROCESSING CHAMBER (y = 0.85 to y = 4.05) */}
      {/* ================================================================================= */}
      {/* Outer Translucent Precision Glass Cylinder */}
      <mesh position={[0, 2.45, 0]}>
        <cylinderGeometry args={[1.32, 1.32, 3.2, 40, 1, true]} />
        <meshStandardMaterial
          color="#7DD3FC"
          emissive="#0284C7"
          emissiveIntensity={0.45}
          transparent
          opacity={0.18}
          roughness={0.08}
          metalness={0.2}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Inner Volumetric Holographic Energy Light Curtain */}
      <mesh position={[0, 2.45, 0]}>
        <cylinderGeometry args={[1.24, 1.24, 3.08, 32, 1, true]} />
        <meshBasicMaterial
          color="#00E5FF"
          transparent
          opacity={0.08}
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 4 Ultra-Fine Vertical Holographic Framing Lines along Cylinder Wall */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 1.32, 2.45, Math.sin(a) * 1.32]}>
          <boxGeometry args={[0.018, 3.16, 0.018]} />
          <meshBasicMaterial color="#7DD3FC" transparent opacity={0.48} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}

      {/* Bottom & Top Luminous Glass Chamber Rings */}
      <mesh position={[0, 0.87, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.33, 0.036, 10, 48]} />
        <meshStandardMaterial color="#E0F2FE" emissive="#00E5FF" emissiveIntensity={2.8} />
      </mesh>
      <mesh position={[0, 4.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.33, 0.044, 12, 48]} />
        <meshStandardMaterial ref={topRingMatRef} color="#E0F2FE" emissive="#00E5FF" emissiveIntensity={2.85} />
      </mesh>
      {/* Subtle Glass Top Cap Rim */}
      <mesh position={[0, 4.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.3, 36]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.11} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Animated Vertical Scanning Holographic Rings inside Chamber */}
      <mesh ref={scanRingARef} position={[0, 1.65, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.29, 0.018, 8, 44]} />
        <meshBasicMaterial color="#7DD3FC" transparent opacity={0.75} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={scanRingBRef} position={[0, 3.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.26, 0.015, 8, 44]} />
        <meshBasicMaterial color="#C084FC" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Synchronization Orbital Halo Ring (illuminates brightly during STM ↔ LTM sync/share) */}
      <mesh ref={syncHaloRef} position={[0, 2.52, 0]} visible={false}>
        <torusGeometry args={[1.08, 0.028, 8, 40]} />
        <meshBasicMaterial color="#E879F9" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* ================================================================================= */}
      {/* 3. PROCEDURAL SCULPTED 3D GLOWING HOLOGRAPHIC NEURAL BRAIN */}
      {/* ================================================================================= */}
      {/* Upward volumetric holographic projection cone from emitter disc into brain */}
      <mesh position={[0, 1.68, 0]}>
        <cylinderGeometry args={[0.92, 1.18, 1.55, 32, 1, true]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.075} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
      </mesh>

      <group ref={brainGroupRef} position={[0, 2.54, 0]} rotation={[0.06, -Math.PI * 0.25, 0]} scale={[1.18, 1.18, 1.18]}>
        {/* Left & Right Sculpted Cerebral Hemispheres */}
        <mesh geometry={leftHemi}>
          <meshStandardMaterial
            ref={brainMatRef}
            color="#38BDF8"
            map={cortexTex ?? undefined}
            emissive="#00E5FF"
            emissiveMap={cortexTex ?? undefined}
            emissiveIntensity={1.65}
            roughness={0.25}
            metalness={0.14}
            transparent
            opacity={0.86}
          />
        </mesh>
        <mesh geometry={rightHemi}>
          <meshStandardMaterial
            color="#38BDF8"
            map={cortexTex ?? undefined}
            emissive="#00E5FF"
            emissiveMap={cortexTex ?? undefined}
            emissiveIntensity={1.65}
            roughness={0.25}
            metalness={0.14}
            transparent
            opacity={0.86}
          />
        </mesh>

        {/* Outer Volumetric Holographic Neural Glow Shell */}
        <mesh geometry={leftHemi} scale={[1.055, 1.055, 1.055]}>
          <meshBasicMaterial
            ref={brainInnerMatRef}
            color="#38E8FF"
            transparent
            opacity={0.16}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={rightHemi} scale={[1.055, 1.055, 1.055]}>
          <meshBasicMaterial
            color="#38E8FF"
            transparent
            opacity={0.16}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Fine Holographic Wireframe Neural Mesh Overlay */}
        <mesh geometry={leftHemi} scale={[1.02, 1.02, 1.02]}>
          <meshBasicMaterial color="#BAE6FD" wireframe transparent opacity={0.18} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh geometry={rightHemi} scale={[1.02, 1.02, 1.02]}>
          <meshBasicMaterial color="#BAE6FD" wireframe transparent opacity={0.18} blending={AdditiveBlending} depthWrite={false} />
        </mesh>

        {/* Inner Radiant White-Cyan Core */}
        <mesh position={[0, 0.02, 0]} scale={[1.05, 0.82, 1.28]}>
          <sphereGeometry args={[0.28, 16, 14]} />
          <meshBasicMaterial color="#E0F7FF" transparent opacity={0.48} blending={AdditiveBlending} depthWrite={false} />
        </mesh>

        {/* Cerebellum (Posterior-Inferior Twin Lobes) */}
        <mesh position={[-0.18, -0.35, -0.36]} scale={[1.08, 0.72, 0.92]}>
          <sphereGeometry args={[0.24, 16, 12]} />
          <meshStandardMaterial color="#38BDF8" map={cortexTex ?? undefined} emissive="#00E5FF" emissiveMap={cortexTex ?? undefined} emissiveIntensity={1.55} transparent opacity={0.86} />
        </mesh>
        <mesh position={[0.18, -0.35, -0.36]} scale={[1.08, 0.72, 0.92]}>
          <sphereGeometry args={[0.24, 16, 12]} />
          <meshStandardMaterial color="#38BDF8" map={cortexTex ?? undefined} emissive="#00E5FF" emissiveMap={cortexTex ?? undefined} emissiveIntensity={1.55} transparent opacity={0.86} />
        </mesh>

        {/* Brainstem / Neural Conduit Stem descending gently toward Emitter */}
        <mesh position={[0, -0.59, -0.18]} rotation={[0.26, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.062, 0.46, 14]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={1.85} transparent opacity={0.88} />
        </mesh>

        {/* Glowing Synaptic Spark Nodes distributed over the Cortex */}
        {synapsePoints.map((pt, i) => (
          <mesh key={i} position={pt}>
            <sphereGeometry args={[0.024, 8, 8]} />
            <meshBasicMaterial
              color={i % 3 === 0 ? '#FFFFFF' : i % 3 === 1 ? '#7DD3FC' : '#C084FC'}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* ================================================================================= */}
      {/* 4. PHYSICAL BRUSHED-BRASS CONDUITS LINKING CENTRAL CORE TO BOTH STM & LTM */}
      {/* ================================================================================= */}
      <CurvedChromePipe points={coreToStmPipeA} radius={0.068} flangeIndices={[0, 2]} color="#D9B36C" />
      <CurvedChromePipe points={coreToStmPipeB} radius={0.06} flangeIndices={[0, 2]} color="#C8A25B" />
      <CurvedChromePipe points={coreToLtmPipeA} radius={0.068} flangeIndices={[0, 2]} color="#D9B36C" />
      <CurvedChromePipe points={coreToLtmPipeB} radius={0.06} flangeIndices={[0, 2]} color="#C8A25B" />
    </group>
  );
});
