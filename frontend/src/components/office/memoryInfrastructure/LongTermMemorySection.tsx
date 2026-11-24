import { memo, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, type MeshStandardMaterial } from 'three';
import type { Vec3 } from '../officeLayout';
import { CurvedChromePipe } from '../toolOrchestration/ServerAndCoolingHardware';
import { MemoryCryoCylinder } from './ShortTermMemorySection';
import { getMemoryMonitorTexture, getMemoryRackFaceTexture, getMemorySectionSignTexture } from './textures';

/**
 * Reusable Persistent Storage / Vector Database Server Array for Long-Term Memory (LTM):
 * - Brushed metallic titanium bezel with signature glowing violet-purple vertical edge strips
 * - High-density blue & purple vector-index / embedding drive bay faceplate
 * - Overhanging precision top cap with recessed cooling vents
 */
const LtmStorageArray = memo(function LtmStorageArray({
  position,
  rotation = [0, 0, 0],
  size = [1.34, 2.24, 1.08],
  faceVariant = 'ltm',
  ltmActiveRef,
  phase = 0,
}: {
  position: Vec3;
  rotation?: [number, number, number];
  size?: Vec3;
  faceVariant?: 'ltm' | 'ltm-front';
  ltmActiveRef: React.RefObject<number>;
  phase?: number;
}) {
  const reducedMotion = useReducedMotion();
  const purpleEdgeRef = useRef<MeshStandardMaterial>(null);
  const faceTex = useMemo(() => getMemoryRackFaceTexture(faceVariant), [faceVariant]);
  const [w, h, d] = size;

  const isFront = faceVariant === 'ltm-front';

  useFrame(({ clock }) => {
    const active = ltmActiveRef.current ?? 0;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    if (purpleEdgeRef.current) {
      purpleEdgeRef.current.emissiveIntensity = (isFront ? 1.65 : 2.15) + active * (1.45 + 0.45 * Math.sin(t * 6.5 + phase));
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Grounded dark steel plinth */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.06, 0.1, d + 0.06]} />
        <meshStandardMaterial color="#0A0E1C" roughness={0.45} metalness={0.85} />
      </mesh>

      {/* Main Heavy Enterprise Storage Chassis */}
      <RoundedBox args={[w, h - 0.1, d]} radius={0.045} smoothness={2} position={[0, 0.1 + (h - 0.1) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={isFront ? '#334155' : '#26324A'} roughness={0.28} metalness={0.86} />
      </RoundedBox>

      {/* Recessed Dark Drive Bay Cavity */}
      <mesh position={[0, 0.12 + (h - 0.24) / 2, d / 2 - 0.005]}>
        <boxGeometry args={[w - 0.18, h - 0.26, 0.03]} />
        <meshStandardMaterial color="#070A18" roughness={0.42} metalness={0.68} />
      </mesh>

      {/* High-Density Blue/Purple Vector-Index Drive Array Faceplate */}
      <mesh position={[0, 0.12 + (h - 0.24) / 2, d / 2 + 0.013]}>
        <planeGeometry args={[w - 0.24, h - 0.34]} />
        {faceTex ? (
          <meshStandardMaterial map={faceTex} emissive="#FFFFFF" emissiveMap={faceTex} emissiveIntensity={1.15} roughness={0.26} metalness={0.32} />
        ) : (
          <meshStandardMaterial color="#A855F7" emissive="#A855F7" emissiveIntensity={1.1} />
        )}
      </mesh>

      {/* Signature Illuminated Violet-Purple Corner Pillars (matching reference LTM arrays) */}
      {[-w / 2 + 0.038, w / 2 - 0.038].map((rx, i) => (
        <mesh key={i} position={[rx, 0.14 + (h - 0.28) / 2, d / 2 + 0.014]}>
          <boxGeometry args={[0.055, h - 0.24, 0.034]} />
          <meshStandardMaterial
            ref={i === 0 ? purpleEdgeRef : undefined}
            color={isFront ? '#93C5FD' : '#F0ABFC'}
            emissive={isFront ? '#38BDF8' : '#C026D3'}
            emissiveIntensity={isFront ? 1.85 : 2.65}
            roughness={0.14}
          />
        </mesh>
      ))}
      {/* Subtle Horizontal Purple Accent Rim on LTM Top Hood */}
      {!isFront && (
        <mesh position={[0, h - 0.04, d / 2 + 0.025]}>
          <boxGeometry args={[w - 0.08, 0.032, 0.022]} />
          <meshStandardMaterial color="#F0ABFC" emissive="#A855F7" emissiveIntensity={2.5} roughness={0.16} />
        </mesh>
      )}

      {/* Side Metallic Cooling Grilles */}
      {[-w / 2 - 0.008, w / 2 + 0.008].map((sx, i) => (
        <mesh key={i} position={[sx, h * 0.52, 0]}>
          <boxGeometry args={[0.018, h * 0.66, d * 0.72]} />
          <meshStandardMaterial color="#131B2E" roughness={0.5} metalness={0.8} />
        </mesh>
      ))}

      {/* Precision Beveled Titanium Top Cap */}
      <RoundedBox args={[w + 0.06, 0.11, d + 0.06]} radius={0.03} smoothness={2} position={[0, h + 0.02, 0]} castShadow>
        <meshStandardMaterial color="#64748B" roughness={0.24} metalness={0.9} />
      </RoundedBox>
    </group>
  );
});

/**
 * Compact LTM Retrieval Query Terminal Console matching the foreground-right workstation in the reference.
 */
const LtmQueryTerminal = memo(function LtmQueryTerminal({
  position,
  rotation = [0, -Math.PI * 0.32, 0],
  ltmActiveRef,
}: {
  position: Vec3;
  rotation?: [number, number, number];
  ltmActiveRef: React.RefObject<number>;
}) {
  const screenTex = useMemo(() => getMemoryMonitorTexture('ltm-terminal'), []);
  const screenMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const active = ltmActiveRef.current ?? 0;
    if (screenMatRef.current) {
      screenMatRef.current.emissiveIntensity = 0.95 + active * (0.65 + 0.25 * Math.sin(clock.elapsedTime * 6));
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Compact Steel Pedestal */}
      <RoundedBox args={[0.88, 0.74, 0.62]} radius={0.03} position={[0, 0.37, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#273449" roughness={0.34} metalness={0.84} />
      </RoundedBox>
      {/* Slanted Control Deck */}
      <RoundedBox args={[0.96, 0.08, 0.68]} radius={0.025} position={[0, 0.77, 0.04]} rotation={[0.14, 0, 0]} castShadow>
        <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.86} />
      </RoundedBox>
      <mesh position={[0, 0.822, 0.12]} rotation={[-Math.PI / 2 + 0.14, 0, 0]}>
        <planeGeometry args={[0.72, 0.26]} />
        <meshBasicMaterial color="#818CF8" transparent opacity={0.44} />
      </mesh>
      {/* Angled Luminous Retrieval Screen */}
      <group position={[0, 1.18, -0.14]} rotation={[-0.22, 0, 0]}>
        <RoundedBox args={[0.94, 0.62, 0.045]} radius={0.02} castShadow>
          <meshStandardMaterial color="#0F172A" roughness={0.28} metalness={0.86} />
        </RoundedBox>
        <mesh position={[0, 0, 0.026]}>
          <planeGeometry args={[0.86, 0.54]} />
          {screenTex ? (
            <meshStandardMaterial
              ref={screenMatRef}
              map={screenTex}
              emissive="#FFFFFF"
              emissiveMap={screenTex}
              emissiveIntensity={1.0}
              roughness={0.2}
            />
          ) : (
            <meshStandardMaterial ref={screenMatRef} color="#818CF8" emissive="#A855F7" emissiveIntensity={1.0} />
          )}
        </mesh>
      </group>
    </group>
  );
});

/**
 * Section 2: LONG-TERM MEMORY (LTM) — Right / +X Half of the Shared Memory Infrastructure Platform
 * - Elevated glowing "LONG-TERM MEMORY" architectural signboard with stacked database cylinder icon
 * - Dense back-right persistent storage arrays, vector database racks & embedding/indexing units with purple edge lighting
 * - Elevated exhaust manifold & twin arched brushed-brass cooling pipes into far-right blue-purple cryo cylinder
 * - Foreground 3-rack LTM retrieval cluster, compact query terminal console, and front-right glowing electric-blue cryo tank
 */
export const LongTermMemorySection = memo(function LongTermMemorySection({
  ltmActiveRef,
  onSelectLtm,
}: {
  ltmActiveRef: React.RefObject<number>;
  onSelectLtm?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const signTex = useMemo(() => getMemorySectionSignTexture('ltm'), []);
  const signFrameMatRef = useRef<MeshStandardMaterial>(null);

  // Overhead brushed-brass cooling pipes curving from the LTM top exhaust manifold into the far-right cryo tank
  const ltmPipeA: Vec3[] = useMemo(
    () => [
      [4.55, 2.66, -2.95],
      [5.25, 2.86, -2.95],
      [5.62, 2.55, -2.55],
      [5.62, 1.56, -2.18],
    ],
    [],
  );
  const ltmPipeB: Vec3[] = useMemo(
    () => [
      [4.15, 2.66, -3.28],
      [5.05, 2.95, -3.25],
      [5.78, 2.65, -2.65],
      [5.78, 1.56, -2.18],
    ],
    [],
  );
  const ltmRearConduitPipe: Vec3[] = useMemo(
    () => [
      [0.65, 2.55, -4.42],
      [2.45, 2.55, -4.42],
      [4.05, 2.55, -4.25],
      [4.45, 2.55, -3.35],
    ],
    [],
  );

  useFrame(({ clock }) => {
    const active = ltmActiveRef.current ?? 0;
    if (signFrameMatRef.current) {
      signFrameMatRef.current.emissiveIntensity = 1.9 + active * (1.2 + 0.4 * Math.sin(clock.elapsedTime * 6));
    }
  });

  return (
    <group onClick={onSelectLtm}>
      {/* ================================================================================= */}
      {/* 1. ELEVATED "LONG-TERM MEMORY" ARCHITECTURAL SIGNBOARD (-Z Superstructure) */}
      {/* ================================================================================= */}
      <group position={[2.65, 3.68, -4.78]}>
        {[-1.55, 1.55].map((sx, i) => (
          <mesh key={i} position={[sx, -1.12, -0.08]} castShadow>
            <boxGeometry args={[0.14, 1.35, 0.14]} />
            <meshStandardMaterial color="#1E293B" metalness={0.86} roughness={0.3} />
          </mesh>
        ))}
        <RoundedBox args={[4.45, 1.38, 0.16]} radius={0.08} smoothness={2} castShadow>
          <meshStandardMaterial color="#0F0B26" roughness={0.28} metalness={0.86} />
        </RoundedBox>
        {[-0.69, 0.69].map((by, i) => (
          <mesh key={i} position={[0, by, 0.04]}>
            <boxGeometry args={[4.3, 0.04, 0.09]} />
            <meshStandardMaterial
              ref={i === 0 ? signFrameMatRef : undefined}
              color="#E9D5FF"
              emissive="#A855F7"
              emissiveIntensity={2.1}
            />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.088]}>
          <planeGeometry args={[4.32, 1.28]} />
          {signTex ? (
            <meshStandardMaterial
              map={signTex}
              emissive="#FFFFFF"
              emissiveMap={signTex}
              emissiveIntensity={0.96}
              roughness={0.22}
              side={DoubleSide}
            />
          ) : (
            <meshStandardMaterial color="#0F0B26" emissive="#A855F7" emissiveIntensity={0.85} />
          )}
        </mesh>
      </group>

      {/* ================================================================================= */}
      {/* 2. BACK-RIGHT PERSISTENT STORAGE ARRAYS, VECTOR DB & EMBEDDING/INDEXING RACKS */}
      {/* ================================================================================= */}
      <LtmStorageArray position={[0.68, 0, -3.55]} size={[1.18, 2.28, 1.02]} ltmActiveRef={ltmActiveRef} phase={0.2} />
      <LtmStorageArray position={[2.02, 0, -3.48]} size={[1.18, 2.22, 1.02]} ltmActiveRef={ltmActiveRef} phase={1.3} />
      <LtmStorageArray position={[3.38, 0, -3.32]} size={[1.28, 2.18, 1.1]} ltmActiveRef={ltmActiveRef} phase={2.4} />
      {/* Hero Wide Vector-Database Persistent Array with Overhead Exhaust Manifold */}
      <LtmStorageArray position={[4.52, 0, -2.55]} rotation={[0, -Math.PI * 0.14, 0]} size={[1.45, 2.34, 1.32]} ltmActiveRef={ltmActiveRef} phase={3.5} />

      {/* Top Exhaust Condenser Manifold Box mounted atop the Hero Vector DB Array */}
      <group position={[4.45, 2.38, -2.72]} rotation={[0, -Math.PI * 0.14, 0]}>
        <RoundedBox args={[1.18, 0.42, 0.92]} radius={0.04} smoothness={2} position={[0, 0.21, 0]} castShadow>
          <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.86} />
        </RoundedBox>
        {[-0.28, 0.28].map((fx, i) => (
          <mesh key={i} position={[fx, 0.43, 0]}>
            <cylinderGeometry args={[0.22, 0.24, 0.04, 16]} />
            <meshStandardMaterial color="#090F1C" roughness={0.5} metalness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Rear Purple Data Spine & Bus Cabinet behind LTM Arrays */}
      <group position={[2.65, 0, -4.58]}>
        <RoundedBox args={[5.45, 2.36, 0.56]} radius={0.04} position={[0, 1.18, 0]} castShadow>
          <meshStandardMaterial color="#17162E" roughness={0.34} metalness={0.84} />
        </RoundedBox>
        <mesh position={[0, 2.02, 0.29]}>
          <boxGeometry args={[5.2, 0.065, 0.025]} />
          <meshStandardMaterial color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.2} />
        </mesh>
        <mesh position={[0, 1.15, 0.29]}>
          <boxGeometry args={[0.065, 1.8, 0.025]} />
          <meshStandardMaterial color="#C084FC" emissive="#A855F7" emissiveIntensity={2.0} />
        </mesh>
      </group>

      {/* ================================================================================= */}
      {/* 3. FAR-RIGHT GLOWING BLUE-PURPLE CRYOGENIC VECTOR-STORE CYLINDER & JUNCTION CUBE */}
      {/* ================================================================================= */}
      <MemoryCryoCylinder
        position={[5.72, 0, -2.18]}
        color="#8B5CF6"
        innerColor="#C4B5FD"
        height={1.58}
        radius={0.46}
        activeRef={ltmActiveRef}
        phase={1.1}
      />
      <CurvedChromePipe points={ltmPipeA} radius={0.062} flangeIndices={[0, 2, 3]} color="#D9B36C" />
      <CurvedChromePipe points={ltmPipeB} radius={0.054} flangeIndices={[0, 2, 3]} color="#C8A25B" />
      <CurvedChromePipe points={ltmRearConduitPipe} radius={0.048} flangeIndices={[1, 2]} color="#94A3B8" />

      {/* Brushed-Silver Auxiliary Junction Box beside Far-Right Cryo Tank */}
      <group position={[5.62, 0, -0.78]}>
        <RoundedBox args={[0.84, 0.86, 0.78]} radius={0.04} smoothness={2} position={[0, 0.43, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#94A3B8" roughness={0.24} metalness={0.86} />
        </RoundedBox>
        <mesh position={[0.428, 0.43, 0]}>
          <boxGeometry args={[0.018, 0.62, 0.56]} />
          <meshStandardMaterial color="#475569" roughness={0.34} metalness={0.82} />
        </mesh>
        <mesh position={[0.44, 0.64, 0.16]}>
          <boxGeometry args={[0.014, 0.045, 0.14]} />
          <meshStandardMaterial color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.2} />
        </mesh>
      </group>

      {/* ================================================================================= */}
      {/* 4. FOREGROUND-RIGHT LTM RETRIEVAL CLUSTER: 3-RACK BANK + QUERY TERMINAL + CRYO TANK */}
      {/* ================================================================================= */}
      <group position={[3.35, 0, 1.55]} rotation={[0, -Math.PI * 0.5, 0]}>
        <LtmStorageArray position={[-0.92, 0, 0]} size={[0.86, 1.58, 0.92]} faceVariant="ltm-front" ltmActiveRef={ltmActiveRef} phase={0.5} />
        <LtmStorageArray position={[0.0, 0, 0]} size={[0.86, 1.66, 0.92]} faceVariant="ltm-front" ltmActiveRef={ltmActiveRef} phase={1.8} />
        <LtmStorageArray position={[0.92, 0, 0]} size={[0.86, 1.58, 0.92]} faceVariant="ltm-front" ltmActiveRef={ltmActiveRef} phase={3.1} />
      </group>

      {/* Compact LTM Query Terminal Console */}
      <LtmQueryTerminal position={[2.22, 0, 3.35]} rotation={[0, -Math.PI * 0.28, 0]} ltmActiveRef={ltmActiveRef} />

      {/* Front-Right Glowing Electric-Blue Cryogenic Buffer Cylinder */}
      <MemoryCryoCylinder
        position={[4.02, 0, 3.68]}
        color="#00E5FF"
        innerColor="#7DD3FC"
        height={1.36}
        radius={0.44}
        activeRef={ltmActiveRef}
        phase={2.4}
      />
    </group>
  );
});
