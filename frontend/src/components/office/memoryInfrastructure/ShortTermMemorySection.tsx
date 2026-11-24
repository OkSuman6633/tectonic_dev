import { memo, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { AdditiveBlending, DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import type { Vec3 } from '../officeLayout';
import { CurvedChromePipe } from '../toolOrchestration/ServerAndCoolingHardware';
import { getMemoryMonitorTexture, getMemoryRackFaceTexture, getMemorySectionSignTexture } from './textures';

/**
 * Reusable Context-Processing Server Rack for Short-Term Memory (STM):
 * - Brushed titanium dual-bay chassis with overhanging beveled top bezel
 * - Recessed circular top cooling fans that spin faster during live STM writes/reads
 * - Vertical electric cyan edge strips & high-density active session blade faceplate
 */
const StmContextRack = memo(function StmContextRack({
  position,
  rotation = [0, Math.PI / 2, 0],
  size = [1.32, 2.08, 1.05],
  stmActiveRef,
  phase = 0,
}: {
  position: Vec3;
  rotation?: [number, number, number];
  size?: Vec3;
  stmActiveRef: React.RefObject<number>;
  phase?: number;
}) {
  const reducedMotion = useReducedMotion();
  const fanRef = useRef<Group>(null);
  const stripMatRef = useRef<MeshStandardMaterial>(null);
  const faceTex = useMemo(() => getMemoryRackFaceTexture('stm'), []);
  const [w, h, d] = size;

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const active = stmActiveRef.current ?? 0;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    if (fanRef.current && !reducedMotion) {
      fanRef.current.rotation.y += dt * (2.6 + active * 7.5);
    }
    if (stripMatRef.current) {
      stripMatRef.current.emissiveIntensity = 1.9 + active * (1.4 + 0.45 * Math.sin(t * 7 + phase));
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Heavy recessed plinth */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.06, 0.1, d + 0.06]} />
        <meshStandardMaterial color="#0A101D" roughness={0.45} metalness={0.84} />
      </mesh>

      {/* Main Brushed-Titanium & Dark Steel Cabinet Body */}
      <RoundedBox args={[w, h - 0.1, d]} radius={0.04} smoothness={2} position={[0, 0.1 + (h - 0.1) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#253349" roughness={0.3} metalness={0.84} />
      </RoundedBox>

      {/* Recessed Dark Front Equipment Bay */}
      <mesh position={[0, 0.12 + (h - 0.24) / 2, d / 2 - 0.006]}>
        <boxGeometry args={[w - 0.18, h - 0.28, 0.03]} />
        <meshStandardMaterial color="#070D19" roughness={0.42} metalness={0.68} />
      </mesh>

      {/* High-Res Active Session Blade Faceplate */}
      <mesh position={[0, 0.12 + (h - 0.24) / 2, d / 2 + 0.012]}>
        <planeGeometry args={[w - 0.24, h - 0.34]} />
        {faceTex ? (
          <meshStandardMaterial map={faceTex} emissive="#FFFFFF" emissiveMap={faceTex} emissiveIntensity={1.1} roughness={0.28} metalness={0.3} />
        ) : (
          <meshStandardMaterial color="#0EA5E9" emissive="#00E5FF" emissiveIntensity={1.0} />
        )}
      </mesh>

      {/* Vertical Glowing Electric Cyan Status Rails on Front Corners */}
      {[-w / 2 + 0.045, w / 2 - 0.045].map((rx, i) => (
        <mesh key={i} position={[rx, 0.14 + (h - 0.28) / 2, d / 2 + 0.01]}>
          <boxGeometry args={[0.042, h - 0.34, 0.024]} />
          <meshStandardMaterial
            ref={i === 0 ? stripMatRef : undefined}
            color="#7DD3FC"
            emissive="#00E5FF"
            emissiveIntensity={2.1}
            roughness={0.18}
          />
        </mesh>
      ))}

      {/* Side Vent Louver Trim */}
      {[-w / 2 - 0.008, w / 2 + 0.008].map((sx, i) => (
        <mesh key={i} position={[sx, h * 0.52, 0]}>
          <boxGeometry args={[0.018, h * 0.62, d * 0.68]} />
          <meshStandardMaterial color="#111A2B" roughness={0.55} metalness={0.78} />
        </mesh>
      ))}

      {/* Overhanging Brushed-Silver Top Hood + Recessed Spinning Circular Exhaust Fan */}
      <RoundedBox args={[w + 0.06, 0.12, d + 0.06]} radius={0.03} smoothness={2} position={[0, h + 0.02, 0]} castShadow>
        <meshStandardMaterial color="#475569" roughness={0.26} metalness={0.88} />
      </RoundedBox>
      <group position={[0, h + 0.085, 0]}>
        <mesh>
          <cylinderGeometry args={[0.36, 0.38, 0.04, 24]} />
          <meshStandardMaterial color="#090F1C" roughness={0.5} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.022, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.35, 0.024, 8, 24]} />
          <meshStandardMaterial color="#64748B" roughness={0.25} metalness={0.9} />
        </mesh>
        <group ref={fanRef} position={[0, 0.016, 0]}>
          {[0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].map((ang, i) => (
            <mesh key={i} rotation={[0, ang, 0]}>
              <boxGeometry args={[0.6, 0.012, 0.065]} />
              <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.85} />
            </mesh>
          ))}
          <mesh>
            <cylinderGeometry args={[0.08, 0.08, 0.03, 12]} />
            <meshStandardMaterial color="#38BDF8" emissive="#00E5FF" emissiveIntensity={1.4} />
          </mesh>
        </group>
      </group>
    </group>
  );
});

/**
 * Reusable Illuminated Cryogenic Working-Memory / Buffer Coolant Cylinder.
 */
export const MemoryCryoCylinder = memo(function MemoryCryoCylinder({
  position,
  color = '#00E5FF',
  innerColor = '#7DD3FC',
  height = 1.65,
  radius = 0.48,
  activeRef,
  phase = 0,
}: {
  position: Vec3;
  color?: string;
  innerColor?: string;
  height?: number;
  radius?: number;
  activeRef: React.RefObject<number>;
  phase?: number;
}) {
  const reducedMotion = useReducedMotion();
  const ringRef = useRef<Mesh>(null);
  const coreMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const active = activeRef.current ?? 0;
    if (ringRef.current && !reducedMotion) {
      const cyc = ((t * (0.45 + active * 0.7) + phase) % 1);
      ringRef.current.position.y = 0.28 + cyc * (height - 0.56);
    }
    if (coreMatRef.current) {
      coreMatRef.current.emissiveIntensity = 2.0 + active * 1.1 + 0.25 * Math.sin(t * 4.5 + phase);
    }
  });

  return (
    <group position={position}>
      {/* Heavy Machined Base Flange */}
      <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 1.14, radius * 1.2, 0.22, 24]} />
        <meshStandardMaterial color="#1E293B" metalness={0.88} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.23, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 1.04, 0.025, 8, 28]} />
        <meshStandardMaterial color={innerColor} emissive={color} emissiveIntensity={2.3} />
      </mesh>

      {/* Outer Transparent Pressure Glass Vessel */}
      <mesh position={[0, height / 2 + 0.06, 0]}>
        <cylinderGeometry args={[radius, radius, height - 0.34, 24]} />
        <meshStandardMaterial
          color={innerColor}
          transparent
          opacity={0.24}
          roughness={0.08}
          metalness={0.22}
          depthWrite={false}
        />
      </mesh>

      {/* Inner Luminous Plasma / Cryo Coolant Column */}
      <mesh position={[0, height / 2 + 0.06, 0]}>
        <cylinderGeometry args={[radius * 0.72, radius * 0.72, height - 0.42, 20]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color={innerColor}
          emissive={color}
          emissiveIntensity={2.1}
          roughness={0.14}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Rising Energy Agitation Ring */}
      <mesh ref={ringRef} position={[0, height * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.84, 0.02, 8, 24]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.78} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* 4 Brushed-Steel External Structural Tie-Rods */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((ang, i) => (
        <mesh key={i} position={[Math.cos(ang) * (radius * 1.06), height / 2 + 0.06, Math.sin(ang) * (radius * 1.06)]}>
          <cylinderGeometry args={[0.024, 0.024, height - 0.22, 8]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.92} roughness={0.18} />
        </mesh>
      ))}

      {/* Machined Titanium Top Dome Cap & Brass Fitting */}
      <mesh position={[0, height - 0.06, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.12, radius * 1.16, 0.16, 24]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.26} />
      </mesh>
      <mesh position={[0, height + 0.06, 0]}>
        <cylinderGeometry args={[radius * 0.52, radius * 0.72, 0.1, 20]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.16} />
      </mesh>
    </group>
  );
});

/**
 * 3-Monitor Short-Term Memory Operator Control Workstation matching the reference's front-left console.
 */
const StmOperatorConsole = memo(function StmOperatorConsole({
  position,
  rotation = [0, Math.PI / 2, 0],
  stmActiveRef,
}: {
  position: Vec3;
  rotation?: [number, number, number];
  stmActiveRef: React.RefObject<number>;
}) {
  const screenL = useMemo(() => getMemoryMonitorTexture('stm-left'), []);
  const screenC = useMemo(() => getMemoryMonitorTexture('stm-center'), []);
  const screenR = useMemo(() => getMemoryMonitorTexture('stm-right'), []);
  const underLightRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const active = stmActiveRef.current ?? 0;
    if (underLightRef.current) {
      underLightRef.current.emissiveIntensity = 1.9 + active * (1.2 + 0.4 * Math.sin(clock.elapsedTime * 6));
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Dual Steel Console Pedestal Legs */}
      {[-0.86, 0.86].map((lx, i) => (
        <RoundedBox key={i} args={[0.28, 0.78, 0.72]} radius={0.03} position={[lx, 0.39, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#1E293B" roughness={0.34} metalness={0.84} />
        </RoundedBox>
      ))}
      {/* Recessed Central Knee Panel with Glowing Cyan Under-Desk Accent Strip */}
      <mesh position={[0, 0.46, -0.22]}>
        <boxGeometry args={[1.48, 0.64, 0.14]} />
        <meshStandardMaterial color="#0F172A" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.72, 0.18]}>
        <boxGeometry args={[1.42, 0.045, 0.06]} />
        <meshStandardMaterial ref={underLightRef} color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.1} />
      </mesh>

      {/* Brushed-Steel Console Desktop Slab */}
      <RoundedBox args={[2.12, 0.1, 0.88]} radius={0.03} smoothness={2} position={[0, 0.82, 0.04]} castShadow receiveShadow>
        <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.86} />
      </RoundedBox>

      {/* Backlit Cyan Keyboard & Tactile Control Pad */}
      <mesh position={[0, 0.88, 0.24]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[0.92, 0.03, 0.26]} />
        <meshStandardMaterial color="#0F172A" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.898, 0.24]} rotation={[-Math.PI / 2 + 0.08, 0, 0]}>
        <planeGeometry args={[0.84, 0.2]} />
        <meshBasicMaterial color="#38E8FF" transparent opacity={0.42} />
      </mesh>

      {/* Small Angled Lower-Center Diagnostic Display */}
      <group position={[0, 1.03, -0.02]} rotation={[-0.32, 0, 0]}>
        <RoundedBox args={[0.56, 0.3, 0.03]} radius={0.015}>
          <meshStandardMaterial color="#0F172A" roughness={0.3} metalness={0.84} />
        </RoundedBox>
        <mesh position={[0, 0, 0.018]}>
          <planeGeometry args={[0.5, 0.24]} />
          {screenC ? (
            <meshStandardMaterial map={screenC} emissive="#FFFFFF" emissiveMap={screenC} emissiveIntensity={0.95} />
          ) : (
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={0.9} />
          )}
        </mesh>
      </group>

      {/* Articulated Monitor Support Arms */}
      {[-0.68, 0, 0.68].map((ax, i) => (
        <mesh key={i} position={[ax, 1.18, -0.22]} castShadow>
          <cylinderGeometry args={[0.03, 0.035, 0.68, 10]} />
          <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.25} />
        </mesh>
      ))}

      {/* Panoramic Curved 3-Monitor Array (Left, Center, Right) */}
      {[
        { pos: [-0.74, 1.48, -0.14] as Vec3, rotY: 0.26, tex: screenL },
        { pos: [0.0, 1.52, -0.22] as Vec3, rotY: 0, tex: screenC },
        { pos: [0.74, 1.48, -0.14] as Vec3, rotY: -0.26, tex: screenR },
      ].map((m, i) => (
        <group key={i} position={m.pos} rotation={[-0.08, m.rotY, 0]}>
          <RoundedBox args={[0.72, 0.56, 0.04]} radius={0.02} castShadow>
            <meshStandardMaterial color="#0F172A" roughness={0.3} metalness={0.86} />
          </RoundedBox>
          <mesh position={[0, 0, 0.023]}>
            <planeGeometry args={[0.66, 0.5]} />
            {m.tex ? (
              <meshStandardMaterial map={m.tex} emissive="#FFFFFF" emissiveMap={m.tex} emissiveIntensity={1.08} roughness={0.18} />
            ) : (
              <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.0} />
            )}
          </mesh>
        </group>
      ))}
    </group>
  );
});

/**
 * Section 1: SHORT-TERM MEMORY (STM) — Left / -X Half of the Shared Memory Infrastructure Platform
 * - Elevated glowing "SHORT-TERM MEMORY" architectural signboard with lightning icon
 * - 3 large context-processing server racks with spinning top cooling fans & cyan LED strips
 * - Rear cooling manifold cabinet + parallel arched brushed-brass pipes into far-left cryo cylinder
 * - 3-monitor operator control desk & foreground silver auxiliary working-memory units
 */
export const ShortTermMemorySection = memo(function ShortTermMemorySection({
  stmActiveRef,
  onSelectStm,
}: {
  stmActiveRef: React.RefObject<number>;
  onSelectStm?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const signTex = useMemo(() => getMemorySectionSignTexture('stm'), []);
  const signFrameMatRef = useRef<MeshStandardMaterial>(null);

  // Parallel curved brushed-brass cooling pipes from rear STM manifold arching over into the far-left cryo tank
  const stmPipeA: Vec3[] = useMemo(
    () => [
      [-5.65, 1.72, 2.75],
      [-5.65, 2.48, 2.55],
      [-5.65, 2.58, 1.45],
      [-5.75, 2.38, 0.25],
    ],
    [],
  );
  const stmPipeB: Vec3[] = useMemo(
    () => [
      [-5.45, 1.72, 2.75],
      [-5.45, 2.38, 2.45],
      [-5.35, 2.48, 1.35],
      [-5.35, 2.28, -0.35],
    ],
    [],
  );
  const stmPipeC: Vec3[] = useMemo(
    () => [
      [-5.82, 1.72, 2.75],
      [-5.82, 2.6, 2.35],
      [-5.95, 2.68, 0.85],
      [-6.0, 2.42, -1.85],
    ],
    [],
  );
  const rearStmPipe: Vec3[] = useMemo(
    () => [
      [-5.95, 2.45, -1.85],
      [-5.95, 2.95, -2.95],
      [-5.65, 2.95, -3.95],
      [-4.95, 2.45, -4.15],
    ],
    [],
  );

  useFrame(({ clock }) => {
    const active = stmActiveRef.current ?? 0;
    if (signFrameMatRef.current) {
      signFrameMatRef.current.emissiveIntensity = 1.8 + active * (1.2 + 0.4 * Math.sin(clock.elapsedTime * 6));
    }
  });

  return (
    <group onClick={onSelectStm}>
      {/* ================================================================================= */}
      {/* 1. ELEVATED "SHORT-TERM MEMORY" ARCHITECTURAL SIGNBOARD (-X Superstructure) */}
      {/* ================================================================================= */}
      <group position={[-6.05, 3.68, -0.85]} rotation={[0, Math.PI / 2, 0]}>
        {/* Structural support stanchions anchoring sign to rear manifold */}
        {[-1.55, 1.55].map((sx, i) => (
          <mesh key={i} position={[sx, -1.12, -0.08]} castShadow>
            <boxGeometry args={[0.14, 1.35, 0.14]} />
            <meshStandardMaterial color="#1E293B" metalness={0.86} roughness={0.3} />
          </mesh>
        ))}
        {/* Dark Beveled Sign Housing */}
        <RoundedBox args={[4.45, 1.38, 0.16]} radius={0.08} smoothness={2} castShadow>
          <meshStandardMaterial color="#071226" roughness={0.28} metalness={0.86} />
        </RoundedBox>
        {/* Glowing Cyan Top & Bottom Frame Bars */}
        {[-0.69, 0.69].map((by, i) => (
          <mesh key={i} position={[0, by, 0.04]}>
            <boxGeometry args={[4.3, 0.04, 0.09]} />
            <meshStandardMaterial
              ref={i === 0 ? signFrameMatRef : undefined}
              color="#7DD3FC"
              emissive="#00E5FF"
              emissiveIntensity={2.0}
            />
          </mesh>
        ))}
        {/* Illuminated Front Sign Face (facing +X into the scene & camera) */}
        <mesh position={[0, 0, 0.088]}>
          <planeGeometry args={[4.32, 1.28]} />
          {signTex ? (
            <meshStandardMaterial
              map={signTex}
              emissive="#FFFFFF"
              emissiveMap={signTex}
              emissiveIntensity={0.95}
              roughness={0.22}
              side={DoubleSide}
            />
          ) : (
            <meshStandardMaterial color="#071226" emissive="#00E5FF" emissiveIntensity={0.85} />
          )}
        </mesh>
      </group>

      {/* ================================================================================= */}
      {/* 2. 3 LARGE CONTEXT-PROCESSING SERVER RACKS (Along -X Facing +X) */}
      {/* ================================================================================= */}
      <StmContextRack position={[-4.55, 0, 0.72]} size={[1.38, 2.02, 1.15]} stmActiveRef={stmActiveRef} phase={0} />
      <StmContextRack position={[-4.55, 0, -0.88]} size={[1.38, 2.16, 1.15]} stmActiveRef={stmActiveRef} phase={1.4} />
      <StmContextRack position={[-4.55, 0, -2.48]} size={[1.38, 2.24, 1.15]} stmActiveRef={stmActiveRef} phase={2.8} />

      {/* Back-Left Tall Session Buffer Tower behind the 3rd Rack */}
      <StmContextRack position={[-3.25, 0, -3.72]} rotation={[0, 0, 0]} size={[1.32, 2.32, 1.05]} stmActiveRef={stmActiveRef} phase={3.8} />

      {/* Rear STM Elevated Manifold Cabinet & Exhaust Unit */}
      <group position={[-5.95, 0, -0.85]}>
        <RoundedBox args={[0.85, 2.38, 4.95]} radius={0.05} smoothness={2} position={[0, 1.19, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#182336" roughness={0.34} metalness={0.84} />
        </RoundedBox>
        {/* Glowing cyan horizontal manifold status line */}
        <mesh position={[0.44, 1.95, 0]}>
          <boxGeometry args={[0.024, 0.06, 4.5]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.0} />
        </mesh>
        {/* Upper condenser module box */}
        <RoundedBox args={[0.92, 0.56, 1.35]} radius={0.04} position={[0.15, 2.66, -1.75]} castShadow>
          <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.86} />
        </RoundedBox>
      </group>

      {/* ================================================================================= */}
      {/* 3. FAR-LEFT GLOWING CYAN CRYOGENIC WORKING-MEMORY BUFFER CYLINDER & BRASS PIPES */}
      {/* ================================================================================= */}
      <MemoryCryoCylinder
        position={[-5.65, 0, 2.75]}
        color="#00E5FF"
        innerColor="#7DD3FC"
        height={1.74}
        radius={0.5}
        activeRef={stmActiveRef}
        phase={0.2}
      />

      <CurvedChromePipe points={stmPipeA} radius={0.062} flangeIndices={[0, 1, 3]} color="#D9B36C" />
      <CurvedChromePipe points={stmPipeB} radius={0.056} flangeIndices={[0, 2, 3]} color="#C8A25B" />
      <CurvedChromePipe points={stmPipeC} radius={0.052} flangeIndices={[1, 2]} color="#D9B36C" />
      <CurvedChromePipe points={rearStmPipe} radius={0.054} flangeIndices={[0, 2]} color="#C8A25B" />

      {/* ================================================================================= */}
      {/* 4. 3-MONITOR STM OPERATOR CONTROL WORKSTATION (Facing +X into Central Plaza) */}
      {/* ================================================================================= */}
      <StmOperatorConsole position={[-2.95, 0, 1.55]} rotation={[0, Math.PI * 0.42, 0]} stmActiveRef={stmActiveRef} />

      {/* ================================================================================= */}
      {/* 5. FOREGROUND AUXILIARY CACHE CABINET & JUNCTION CUBE (Front-Left Corner) */}
      {/* ================================================================================= */}
      {/* Brushed-Silver Vertical Auxiliary Cache Unit */}
      <group position={[-5.18, 0, 3.85]}>
        <RoundedBox args={[0.76, 1.18, 0.72]} radius={0.04} smoothness={2} position={[0, 0.59, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#94A3B8" roughness={0.24} metalness={0.86} />
        </RoundedBox>
        <mesh position={[0, 0.59, 0.368]}>
          <boxGeometry args={[0.58, 0.96, 0.02]} />
          <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.82} />
        </mesh>
        <mesh position={[0.22, 0.96, 0.382]}>
          <boxGeometry args={[0.12, 0.04, 0.015]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.2} />
        </mesh>
      </group>

      {/* Compact Illuminated Session-Cache Junction Cube */}
      <group position={[-4.02, 0, 3.82]}>
        <RoundedBox args={[0.84, 0.84, 0.84]} radius={0.04} smoothness={2} position={[0, 0.42, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#273449" roughness={0.32} metalness={0.84} />
        </RoundedBox>
        <mesh position={[0, 0.42, 0.428]}>
          <planeGeometry args={[0.64, 0.64]} />
          <meshStandardMaterial color="#0A1930" emissive="#0EA5E9" emissiveIntensity={0.85} roughness={0.2} />
        </mesh>
        {[-0.18, 0, 0.18].map((dy, i) => (
          <mesh key={i} position={[0, 0.42 + dy, 0.434]}>
            <boxGeometry args={[0.52, 0.045, 0.012]} />
            <meshStandardMaterial
              color={i === 1 ? '#C084FC' : '#7DD3FC'}
              emissive={i === 1 ? '#A855F7' : '#00E5FF'}
              emissiveIntensity={2.1}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
});
