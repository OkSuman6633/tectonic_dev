import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import {
  AdditiveBlending,
  CatmullRomCurve3,
  DoubleSide,
  Quaternion,
  TubeGeometry,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import type { Vec3 } from '../officeLayout';
import {
  getDiagStackTexture,
  getEnterpriseRackFaceTexture,
  getHazardDoorTexture,
  getHoloWallTexture,
} from './textures';

/**
 * Smooth 3D Brushed-Chrome Cooling Pipe constructed from a CatmullRomCurve3 TubeGeometry
 * with machined metallic flange collars at key control points.
 */
export const CurvedChromePipe = memo(function CurvedChromePipe({
  points,
  radius = 0.052,
  flangeIndices = [],
  color = '#CBD5E1',
}: {
  points: Vec3[];
  radius?: number;
  flangeIndices?: number[];
  color?: string;
}) {
  const { tubeGeom, flanges } = useMemo(() => {
    const vecs = points.map((p) => new Vector3(...p));
    const curve = new CatmullRomCurve3(vecs, false, 'catmullrom', 0.22);
    const geom = new TubeGeometry(curve, Math.max(20, points.length * 10), radius, 14, false);

    const up = new Vector3(0, 1, 0);
    const flangeList = flangeIndices
      .filter((i) => i >= 0 && i < vecs.length)
      .map((i) => {
        const u = vecs.length > 1 ? i / (vecs.length - 1) : 0;
        const pos = curve.getPointAt(u);
        const tangent = curve.getTangentAt(u).normalize();
        const quat = new Quaternion().setFromUnitVectors(up, tangent);
        return { pos, quat };
      });
    return { tubeGeom: geom, flanges: flangeList };
  }, [points, radius, flangeIndices]);

  return (
    <group>
      <mesh geometry={tubeGeom} castShadow>
        <meshStandardMaterial color={color} metalness={0.94} roughness={0.15} />
      </mesh>
      {flanges.map((fl, i) => (
        <mesh key={i} position={[fl.pos.x, fl.pos.y, fl.pos.z]} quaternion={fl.quat}>
          <cylinderGeometry args={[radius * 1.42, radius * 1.42, 0.055, 16]} />
          <meshStandardMaterial color="#64748B" metalness={0.9} roughness={0.22} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Reusable Enterprise Blade Server Rack matching the reference's front-row 4-rack array:
 * - Heavy dark plinth base
 * - Dark gunmetal steel body with recessed vertical side cooling louvers
 * - Overhanging brushed-silver/titanium beveled top hood with recessed top exhaust fan vents
 * - Brushed-silver vertical front bezel rails + high-res 11U cyan/white LED blade faceplate
 */
export const EnterpriseBladeRack = memo(function EnterpriseBladeRack({
  position,
  rotation = [0, 0, 0],
  size = [0.78, 1.56, 0.8],
  primaryLed = '#00E5FF',
  secondaryLed = '#7DD3FC',
  accentStyle = 'cyan',
  hoodColor = '#475569',
}: {
  position: Vec3;
  rotation?: [number, number, number];
  size?: Vec3;
  primaryLed?: string;
  secondaryLed?: string;
  accentStyle?: 'cyan' | 'amber-vertical';
  hoodColor?: string;
}) {
  const [w, h, d] = size;
  const faceTex = useMemo(
    () => getEnterpriseRackFaceTexture(primaryLed, secondaryLed, accentStyle),
    [primaryLed, secondaryLed, accentStyle],
  );

  return (
    <group position={position} rotation={rotation}>
      {/* Grounded Steel Plinth Base */}
      <mesh position={[0, 0.045, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.04, 0.09, d + 0.04]} />
        <meshStandardMaterial color="#0A0F1A" roughness={0.45} metalness={0.78} />
      </mesh>

      {/* Main Dark Gunmetal Structural Chassis */}
      <RoundedBox args={[w, h - 0.14, d]} radius={0.035} smoothness={2} position={[0, 0.09 + (h - 0.14) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#182132" roughness={0.34} metalness={0.82} />
      </RoundedBox>

      {/* Overhanging Brushed-Titanium Beveled Top Hood & Exhaust Louver Bed */}
      <RoundedBox args={[w + 0.05, 0.12, d + 0.05]} radius={0.04} smoothness={2} position={[0, h - 0.02, 0]} castShadow>
        <meshStandardMaterial color={hoodColor} roughness={0.24} metalness={0.88} />
      </RoundedBox>
      <mesh position={[0, h + 0.042, 0]}>
        <boxGeometry args={[w * 0.72, 0.02, d * 0.72]} />
        <meshStandardMaterial color="#090E18" roughness={0.7} metalness={0.5} />
      </mesh>
      {/* Top exhaust slat louvers */}
      {[-0.22, -0.08, 0.08, 0.22].map((lz, i) => (
        <mesh key={`slat-${i}`} position={[0, h + 0.05, lz * d]}>
          <boxGeometry args={[w * 0.66, 0.012, 0.035]} />
          <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.28} />
        </mesh>
      ))}

      {/* Twin Vertical Brushed-Silver Front Bezel Rails */}
      {[-w / 2 + 0.032, w / 2 - 0.032].map((rx, i) => (
        <mesh key={`rail-${i}`} position={[rx, 0.09 + (h - 0.16) / 2, d / 2 + 0.005]}>
          <boxGeometry args={[0.045, h - 0.2, 0.02]} />
          <meshStandardMaterial color="#7C8BA1" metalness={0.88} roughness={0.24} />
        </mesh>
      ))}

      {/* Recessed High-Resolution Illuminated Server Blade Faceplate */}
      <mesh position={[0, 0.09 + (h - 0.18) / 2, d / 2 + 0.01]}>
        <planeGeometry args={[w - 0.13, h - 0.26]} />
        {faceTex ? (
          <meshStandardMaterial
            map={faceTex}
            emissive="#FFFFFF"
            emissiveMap={faceTex}
            emissiveIntensity={0.95}
            roughness={0.32}
            metalness={0.45}
          />
        ) : (
          <meshStandardMaterial color="#0B1324" roughness={0.4} />
        )}
      </mesh>

      {/* Recessed Side Cooling Vent Slots (Left & Right Flanks) */}
      {[-1, 1].map((side) => (
        <mesh key={`sv-${side}`} position={[side * (w / 2 + 0.006), 0.09 + (h - 0.24) / 2, 0]}>
          <boxGeometry args={[0.014, h * 0.62, d * 0.64]} />
          <meshStandardMaterial color="#0C121E" roughness={0.62} metalness={0.65} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Slim Silver-Titanium Hazard & Diagnostic Cabinet (Front-Right End of Server Row):
 * - +Z face: recessed dark door with yellow industrial warning triangle
 * - +X face: 3 stacked glowing electric-cyan diagnostic screens
 */
export const HazardDiagnosticCabinet = memo(function HazardDiagnosticCabinet({
  position,
  size = [0.66, 1.74, 0.72],
}: {
  position: Vec3;
  size?: Vec3;
}) {
  const [w, h, d] = size;
  const diagTex = useMemo(() => getDiagStackTexture(), []);
  const hazardTex = useMemo(() => getHazardDoorTexture(), []);

  return (
    <group position={position}>
      {/* Heavy Dark Stepped Base Plinth */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.08, 0.12, d + 0.08]} />
        <meshStandardMaterial color="#111827" metalness={0.82} roughness={0.38} />
      </mesh>

      {/* Brushed Silver-Titanium Main Enclosure */}
      <RoundedBox args={[w, h - 0.14, d]} radius={0.04} smoothness={2} position={[0, 0.12 + (h - 0.14) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#6D7B91" roughness={0.26} metalness={0.84} />
      </RoundedBox>

      {/* Beveled Top Cap */}
      <RoundedBox args={[w + 0.04, 0.1, d + 0.04]} radius={0.03} smoothness={2} position={[0, h, 0]} castShadow>
        <meshStandardMaterial color="#8A98AE" roughness={0.22} metalness={0.88} />
      </RoundedBox>

      {/* +Z Flank: Industrial Dark Door Panel with Yellow Warning Triangle */}
      <mesh position={[0, 0.12 + (h - 0.18) / 2, d / 2 + 0.008]}>
        <planeGeometry args={[w - 0.12, h - 0.28]} />
        {hazardTex ? (
          <meshStandardMaterial map={hazardTex} roughness={0.42} metalness={0.5} />
        ) : (
          <meshStandardMaterial color="#1E293B" roughness={0.5} />
        )}
      </mesh>

      {/* +X Face: 3 Stacked Glowing Electric-Cyan Diagnostic Readout Displays */}
      <mesh position={[w / 2 + 0.008, 0.12 + (h - 0.18) / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d - 0.12, h - 0.26]} />
        {diagTex ? (
          <meshStandardMaterial
            map={diagTex}
            emissive="#FFFFFF"
            emissiveMap={diagTex}
            emissiveIntensity={1.1}
            roughness={0.25}
            metalness={0.35}
          />
        ) : (
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.5} />
        )}
      </mesh>
    </group>
  );
});

/**
 * Heavy Industrial Heat-Exchanger / Transformer Cabinet with Amber Edge Rim
 * and Dual Smooth Curved Brushed-Chrome Cooling Pipes feeding the Cryogenic Bay.
 */
export const IndustrialHeatExchangerBay = memo(function IndustrialHeatExchangerBay({
  position = [2.08, 0, 0.48] as Vec3,
}: {
  position?: Vec3;
}) {
  const faceTex = useMemo(() => getEnterpriseRackFaceTexture('#00E5FF', '#F59E0B', 'cyan'), []);

  // Dual parallel thick chrome cooling pipes curving boldly out the +X manifold and plunging down
  const pipeA: Vec3[] = useMemo(
    () => [
      [0.36, 1.62, -0.22],
      [0.92, 1.66, -0.22],
      [1.12, 1.46, -0.08],
      [1.14, 0.7, 0.04],
      [1.14, 0.02, 0.04],
    ],
    [],
  );
  const pipeB: Vec3[] = useMemo(
    () => [
      [0.36, 1.62, 0.18],
      [0.92, 1.66, 0.18],
      [1.12, 1.46, 0.34],
      [1.14, 0.7, 0.48],
      [1.14, 0.02, 0.48],
    ],
    [],
  );

  return (
    <group position={position}>
      {/* Main Heavy Brushed-Gunmetal Industrial Cabinet */}
      <RoundedBox args={[1.26, 1.88, 1.24]} radius={0.05} smoothness={2} position={[0, 0.94, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#253043" roughness={0.3} metalness={0.84} />
      </RoundedBox>

      {/* Beveled Top Metallic Cover Plate */}
      <RoundedBox args={[1.18, 0.09, 1.16]} radius={0.03} smoothness={2} position={[0, 1.9, 0]} castShadow>
        <meshStandardMaterial color="#475569" roughness={0.24} metalness={0.88} />
      </RoundedBox>

      {/* Warm Amber Illuminated Edge Trim along Core-Facing Corner (-X / +Z edge) */}
      <mesh position={[-0.635, 1.72, 0]}>
        <boxGeometry args={[0.026, 0.04, 1.16]} />
        <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.5} />
      </mesh>
      <mesh position={[-0.635, 0.96, 0.61]}>
        <boxGeometry args={[0.026, 1.52, 0.04]} />
        <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.5} />
      </mesh>
      <mesh position={[0, 1.72, 0.625]}>
        <boxGeometry args={[1.2, 0.04, 0.026]} />
        <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.3} />
      </mesh>

      {/* Recessed +X Manifold Blade Face */}
      <mesh position={[0.636, 0.92, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.02, 1.54]} />
        {faceTex ? (
          <meshStandardMaterial map={faceTex} emissive="#FFFFFF" emissiveMap={faceTex} emissiveIntensity={0.85} roughness={0.35} />
        ) : (
          <meshStandardMaterial color="#0F172A" />
        )}
      </mesh>

      {/* Twin Smooth Curved Brushed-Chrome Coolant Pipes with Flanges */}
      <CurvedChromePipe points={pipeA} radius={0.078} flangeIndices={[0, 1, 3]} />
      <CurvedChromePipe points={pipeB} radius={0.078} flangeIndices={[0, 1, 3]} />

      {/* Compact Auxiliary Junction / Pump Box tucked on Front-Left Side */}
      <group position={[-0.52, 0, 0.88]}>
        <RoundedBox args={[0.52, 1.14, 0.52]} radius={0.035} smoothness={2} position={[0, 0.57, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#334155" roughness={0.32} metalness={0.82} />
        </RoundedBox>
        <mesh position={[0, 0.62, 0.265]}>
          <planeGeometry args={[0.36, 0.64]} />
          <meshStandardMaterial color="#0A1220" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.82, 0.27]}>
          <boxGeometry args={[0.24, 0.05, 0.012]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00E5FF" emissiveIntensity={2.0} />
        </mesh>
      </group>
    </group>
  );
});

/** Tall Industrial Power & Server Cabinet with Yellow Hazard Door (+Z) and Blue Rack Array (+X). */
export const TallPowerServerCabinet = memo(function TallPowerServerCabinet({
  position = [2.48, 0, -1.45] as Vec3,
}: {
  position?: Vec3;
}) {
  const hazardTex = useMemo(() => getHazardDoorTexture(), []);
  const rackTex = useMemo(() => getEnterpriseRackFaceTexture('#00E5FF', '#60A5FA', 'cyan'), []);

  return (
    <group position={position}>
      <RoundedBox args={[1.24, 2.28, 1.22]} radius={0.05} smoothness={2} position={[0, 1.14, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1E293B" roughness={0.32} metalness={0.84} />
      </RoundedBox>
      <RoundedBox args={[1.28, 0.11, 1.26]} radius={0.04} smoothness={2} position={[0, 2.3, 0]} castShadow>
        <meshStandardMaterial color="#526075" roughness={0.24} metalness={0.88} />
      </RoundedBox>
      {/* Subtle amber trim along front top bevel */}
      <mesh position={[-0.63, 2.22, 0]}>
        <boxGeometry args={[0.025, 0.035, 1.14]} />
        <meshStandardMaterial color="#FDE047" emissive="#F59E0B" emissiveIntensity={2.1} />
      </mesh>
      {/* +Z Hazard Door Panel */}
      <mesh position={[0, 1.12, 0.618]}>
        <planeGeometry args={[1.04, 1.98]} />
        {hazardTex ? <meshStandardMaterial map={hazardTex} roughness={0.4} metalness={0.5} /> : <meshStandardMaterial color="#1E293B" />}
      </mesh>
      {/* +X Full-Height Illuminated Server Rack Face */}
      <mesh position={[0.628, 1.12, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.02, 2.02]} />
        {rackTex ? (
          <meshStandardMaterial map={rackTex} emissive="#FFFFFF" emissiveMap={rackTex} emissiveIntensity={0.95} roughness={0.32} />
        ) : (
          <meshStandardMaterial color="#0A1220" />
        )}
      </mesh>
    </group>
  );
});

/** 3-Tier Industrial Stack Signal Light Beacon (Green / Amber / Red Patlite). */
export const StackSignalTower = memo(function StackSignalTower({
  position,
  activeRef,
}: {
  position: Vec3;
  activeRef?: React.RefObject<boolean>;
}) {
  const reducedMotion = useReducedMotion();
  const redRef = useRef<MeshStandardMaterial>(null);
  const amberRef = useRef<MeshStandardMaterial>(null);
  const greenRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const active = Boolean(activeRef?.current);
    const wave = 0.5 + 0.5 * Math.sin(t * 5.2);
    if (greenRef.current) greenRef.current.emissiveIntensity = active ? 2.8 + 0.8 * wave : 2.2;
    if (amberRef.current) amberRef.current.emissiveIntensity = active ? 2.4 + 0.6 * (1 - wave) : 1.75;
    if (redRef.current) redRef.current.emissiveIntensity = 2.0 + 0.4 * Math.sin(t * 2.4);
  });

  return (
    <group position={position}>
      {/* Stainless Mast & Base Collar */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.075, 0.09, 0.08, 14]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.32, 12]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.94} roughness={0.14} />
      </mesh>
      {/* Tier 1: Green */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.056, 0.056, 0.1, 16]} />
        <meshStandardMaterial ref={greenRef} color="#34D399" emissive="#10B981" emissiveIntensity={2.3} />
      </mesh>
      {/* Tier 2: Amber */}
      <mesh position={[0, 0.53, 0]}>
        <cylinderGeometry args={[0.056, 0.056, 0.1, 16]} />
        <meshStandardMaterial ref={amberRef} color="#FBBF24" emissive="#F59E0B" emissiveIntensity={2.0} />
      </mesh>
      {/* Tier 3: Red */}
      <mesh position={[0, 0.64, 0]}>
        <cylinderGeometry args={[0.056, 0.056, 0.1, 16]} />
        <meshStandardMaterial ref={redRef} color="#F87171" emissive="#EF4444" emissiveIntensity={2.1} />
      </mesh>
      {/* Top Cap */}
      <mesh position={[0, 0.71, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.036, 16]} />
        <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.22} />
      </mesh>
    </group>
  );
});

/** Back-Right Tall Corner Mainframe Tower with Glowing Blue Side Bay & Patlite Stack Signal Beacon. */
export const CornerBeaconMainframe = memo(function CornerBeaconMainframe({
  position = [3.58, 0, -2.95] as Vec3,
  activeRef,
}: {
  position?: Vec3;
  activeRef: React.RefObject<boolean>;
}) {
  const rackTex = useMemo(() => getEnterpriseRackFaceTexture('#00E5FF', '#38BDF8', 'cyan'), []);

  return (
    <group position={position}>
      <RoundedBox args={[1.16, 2.68, 1.16]} radius={0.05} smoothness={2} position={[0, 1.34, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#141C2B" roughness={0.3} metalness={0.86} />
      </RoundedBox>
      <RoundedBox args={[1.2, 0.12, 1.2]} radius={0.04} smoothness={2} position={[0, 2.7, 0]} castShadow>
        <meshStandardMaterial color="#475569" roughness={0.22} metalness={0.88} />
      </RoundedBox>

      {/* Front (+Z) Recessed Blade Bay */}
      <mesh position={[0, 1.32, 0.588]}>
        <planeGeometry args={[0.94, 2.34]} />
        {rackTex ? (
          <meshStandardMaterial map={rackTex} emissive="#FFFFFF" emissiveMap={rackTex} emissiveIntensity={1.0} roughness={0.3} />
        ) : (
          <meshStandardMaterial color="#0B132B" />
        )}
      </mesh>

      {/* Right (+X) Signature Glowing Electric-Blue Side Diffuser Window */}
      <mesh position={[0.586, 1.32, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.88, 2.28]} />
        <meshStandardMaterial color="#38BDF8" emissive="#0088FF" emissiveIntensity={1.65} roughness={0.2} />
      </mesh>
      {/* Horizontal dark louver slats over the blue side bay */}
      {[-0.85, -0.45, -0.05, 0.35, 0.75].map((ly, i) => (
        <mesh key={i} position={[0.594, 1.32 + ly, 0]}>
          <boxGeometry args={[0.015, 0.045, 0.9]} />
          <meshStandardMaterial color="#0F172A" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}

      {/* Patlite 3-Tier Industrial Stack Signal Light at Front-Top Corner */}
      <StackSignalTower position={[-0.36, 2.75, 0.36]} activeRef={activeRef} />
    </group>
  );
});

/**
 * Cryogenic Liquid Coolant Tank Cylinder matching the reference's vivid glowing blue chambers:
 * - Chamfered dark metallic base plinth + bolted circular flange
 * - Glossy borosilicate glass cylinder with 4 brushed-chrome structural tie-rods
 * - Multi-layer electric cobalt-cyan glowing liquid core + animated rising plasma rings
 * - Heavy machined chrome top dome cap with bolts & manifold nozzle
 */
export const CryogenicCoolantTank = memo(function CryogenicCoolantTank({
  position,
  activeRef,
  phaseOffset = 0,
}: {
  position: Vec3;
  activeRef?: React.RefObject<boolean>;
  phaseOffset?: number;
}) {
  const reducedMotion = useReducedMotion();
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  const coreMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime + phaseOffset;
    const active = Boolean(activeRef?.current);
    if (ring1Ref.current && !reducedMotion) {
      const u1 = (t * (active ? 0.55 : 0.28)) % 1;
      ring1Ref.current.position.y = 0.28 + u1 * 1.04;
    }
    if (ring2Ref.current && !reducedMotion) {
      const u2 = (t * (active ? 0.55 : 0.28) + 0.5) % 1;
      ring2Ref.current.position.y = 0.28 + u2 * 1.04;
    }
    if (coreMatRef.current) {
      coreMatRef.current.emissiveIntensity = active ? 3.2 + 0.5 * Math.sin(t * 5) : 2.65;
    }
  });

  return (
    <group position={position}>
      {/* Square Chamfered Industrial Base Plinth */}
      <RoundedBox args={[0.98, 0.14, 0.98]} radius={0.04} smoothness={2} position={[0, 0.07, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1E293B" metalness={0.86} roughness={0.28} />
      </RoundedBox>
      {/* Circular Flanged Base Collar */}
      <mesh position={[0, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.49, 0.12, 20]} />
        <meshStandardMaterial color="#64748B" metalness={0.92} roughness={0.2} />
      </mesh>

      {/* Outer Translucent Borosilicate Glass Wall */}
      <mesh position={[0, 0.84, 0]}>
        <cylinderGeometry args={[0.41, 0.41, 1.22, 24]} />
        <meshStandardMaterial
          color="#7DD3FC"
          transparent
          opacity={0.24}
          roughness={0.06}
          metalness={0.25}
          depthWrite={false}
        />
      </mesh>

      {/* Outer Electric Cobalt-Blue Liquid Layer */}
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.355, 0.355, 1.14, 20]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color="#00A8FF"
          emissive="#0077FF"
          emissiveIntensity={2.65}
          roughness={0.1}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Inner Bright Electric-Cyan Core Column */}
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 1.12, 16]} />
        <meshStandardMaterial color="#CFFAFE" emissive="#00E5FF" emissiveIntensity={3.2} roughness={0.08} />
      </mesh>

      {/* Animated Rising Cryogenic Agitation Rings */}
      <mesh ref={ring1Ref} position={[0, 0.65, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.018, 8, 20]} />
        <meshBasicMaterial color="#E0F7FF" transparent opacity={0.75} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ring2Ref} position={[0, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.26, 0.016, 8, 20]} />
        <meshBasicMaterial color="#7DD3FC" transparent opacity={0.68} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* 4 External Brushed-Chrome Vertical Tie-Rods */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((ang, idx) => (
        <mesh key={idx} position={[Math.cos(ang + Math.PI / 4) * 0.43, 0.84, Math.sin(ang + Math.PI / 4) * 0.43]}>
          <cylinderGeometry args={[0.018, 0.018, 1.24, 8]} />
          <meshStandardMaterial color="#CBD5E1" metalness={0.94} roughness={0.14} />
        </mesh>
      ))}

      {/* Heavy Machined Brushed-Chrome Top Cap & Pressure Fitting */}
      <mesh position={[0, 1.49, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.47, 0.14, 24]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.94} roughness={0.15} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.1, 18]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.92} roughness={0.18} />
      </mesh>
      <mesh position={[0, 1.69, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.1, 14]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.22} />
      </mesh>
    </group>
  );
});

/** Reusable Industrial Safety-Yellow Handrail with Double Rails, Flanged Stanchions & Dark Kickplate. */
export const IndustrialSafetyRail = memo(function IndustrialSafetyRail({
  start,
  length,
  rotation = [0, 0, 0],
}: {
  start: Vec3;
  length: number;
  rotation?: [number, number, number];
}) {
  const postsCount = Math.max(2, Math.floor(length / 0.72) + 1);
  const railColor = '#EAB308';
  return (
    <group position={start} rotation={rotation}>
      {/* Top Rail */}
      <mesh position={[length / 2, 0.56, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, length, 10]} />
        <meshStandardMaterial color={railColor} metalness={0.62} roughness={0.28} />
      </mesh>
      {/* Mid Rail */}
      <mesh position={[length / 2, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, length, 10]} />
        <meshStandardMaterial color={railColor} metalness={0.62} roughness={0.28} />
      </mesh>
      {/* Dark Steel Kickplate */}
      <mesh position={[length / 2, 0.06, 0]}>
        <boxGeometry args={[length, 0.11, 0.022]} />
        <meshStandardMaterial color="#1E293B" metalness={0.84} roughness={0.32} />
      </mesh>
      {/* Flanged Vertical Stanchions */}
      {Array.from({ length: postsCount }).map((_, idx) => {
        const px = (idx / (postsCount - 1)) * length;
        return (
          <group key={idx} position={[px, 0.28, 0]}>
            <mesh>
              <cylinderGeometry args={[0.024, 0.024, 0.56, 10]} />
              <meshStandardMaterial color={railColor} metalness={0.62} roughness={0.28} />
            </mesh>
            <mesh position={[0, -0.27, 0]}>
              <cylinderGeometry args={[0.055, 0.055, 0.026, 10]} />
              <meshStandardMaterial color="#0F172A" metalness={0.88} roughness={0.24} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

/**
 * Giant Rear Holographic Monitoring Wall (Back-Right) with Prominent Cyan Mechanical Gear Icon,
 * Glowing Frame Border, Structural Support Pylons, and Lower Brushed-Chrome Cooling Pipe Manifold.
 */
export const HolographicMonitoringWall = memo(function HolographicMonitoringWall({
  position = [0.68, 2.55, -3.72] as Vec3,
  activeRef,
}: {
  position?: Vec3;
  activeRef: React.RefObject<boolean>;
}) {
  const reducedMotion = useReducedMotion();
  const wallTex = useMemo(() => getHoloWallTexture(), []);
  const borderMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!borderMatRef.current) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const active = Boolean(activeRef.current);
    borderMatRef.current.emissiveIntensity = active ? 2.8 + 0.6 * Math.sin(t * 5) : 2.1;
  });

  const rearPipeTop: Vec3[] = useMemo(
    () => [
      [-1.75, -1.62, 0.42],
      [-1.75, -1.12, 0.42],
      [1.85, -1.12, 0.42],
      [1.85, -1.62, 0.42],
    ],
    [],
  );
  const rearPipeLow: Vec3[] = useMemo(
    () => [
      [-1.55, -1.72, 0.56],
      [-1.55, -1.32, 0.56],
      [1.65, -1.32, 0.56],
      [1.65, -1.72, 0.56],
    ],
    [],
  );

  return (
    <group position={position}>
      {/* Main Widescreen Translucent Holographic Cyan Display */}
      <mesh>
        <planeGeometry args={[4.45, 2.22]} />
        {wallTex ? (
          <meshBasicMaterial map={wallTex} transparent opacity={0.94} side={DoubleSide} />
        ) : (
          <meshBasicMaterial color="#00E5FF" transparent opacity={0.75} side={DoubleSide} />
        )}
      </mesh>

      {/* Crisp Glowing Cyan Perimeter Frame Bars */}
      {[
        { pos: [0, 1.12, 0] as Vec3, size: [4.5, 0.045, 0.04] as Vec3 },
        { pos: [0, -1.12, 0] as Vec3, size: [4.5, 0.045, 0.04] as Vec3 },
        { pos: [-2.24, 0, 0] as Vec3, size: [0.045, 2.26, 0.04] as Vec3 },
        { pos: [2.24, 0, 0] as Vec3, size: [0.045, 2.26, 0.04] as Vec3 },
      ].map((bar, i) => (
        <mesh key={i} position={bar.pos}>
          <boxGeometry args={bar.size} />
          <meshStandardMaterial
            ref={i === 0 ? borderMatRef : undefined}
            color="#9CF6FF"
            emissive="#00D8FF"
            emissiveIntensity={2.2}
          />
        </mesh>
      ))}

      {/* Heavy Rear Structural Support Pylons Down to Deck */}
      {[-1.55, 1.55].map((px, i) => (
        <mesh key={i} position={[px, -1.3, -0.08]} castShadow>
          <boxGeometry args={[0.12, 2.55, 0.12]} />
          <meshStandardMaterial color="#1E293B" metalness={0.86} roughness={0.28} />
        </mesh>
      ))}

      {/* Lower Rear Manifold Cabinets + Horizontal Chrome Coolant Header Pipes */}
      <RoundedBox args={[3.35, 0.88, 0.62]} radius={0.04} smoothness={2} position={[0, -2.1, 0.25]} castShadow receiveShadow>
        <meshStandardMaterial color="#1B2538" metalness={0.82} roughness={0.34} />
      </RoundedBox>
      {[-1.1, 0, 1.1].map((mx, i) => (
        <mesh key={`rm-${i}`} position={[mx, -2.02, 0.568]}>
          <boxGeometry args={[0.52, 0.06, 0.014]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00C8FF" emissiveIntensity={1.8} />
        </mesh>
      ))}
      <CurvedChromePipe points={rearPipeTop} radius={0.048} flangeIndices={[1, 2]} />
      <CurvedChromePipe points={rearPipeLow} radius={0.042} flangeIndices={[1, 2]} />
    </group>
  );
});

/** Sculpted Multi-Frond Potted Cyber Plant matching the reference's lush organic accents. */
export const SculptedCyberPlant = memo(function SculptedCyberPlant({
  position,
  scale = 1,
}: {
  position: Vec3;
  scale?: number;
}) {
  const fronds = useMemo(
    () => [
      { yaw: 0, tilt: 0.42, h: 0.34, col: '#16A34A' },
      { yaw: 0.9, tilt: 0.55, h: 0.3, col: '#22C55E' },
      { yaw: 1.85, tilt: 0.48, h: 0.36, col: '#15803D' },
      { yaw: 2.75, tilt: 0.58, h: 0.28, col: '#4ADE80' },
      { yaw: 3.7, tilt: 0.44, h: 0.33, col: '#16A34A' },
      { yaw: 4.65, tilt: 0.52, h: 0.31, col: '#22C55E' },
      { yaw: 5.5, tilt: 0.36, h: 0.38, col: '#15803D' },
    ],
    [],
  );

  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Sleek Dark Anodized Planter Pot */}
      <mesh position={[0, 0.13, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.13, 0.26, 12]} />
        <meshStandardMaterial color="#111827" metalness={0.78} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.025, 12]} />
        <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Layered Angled Foliage Fronds */}
      <group position={[0, 0.26, 0]}>
        {fronds.map((f, idx) => (
          <group key={idx} rotation={[0, f.yaw, 0]}>
            <mesh position={[0, f.h * 0.42, 0.08]} rotation={[f.tilt, 0, 0]}>
              <boxGeometry args={[0.075, f.h, 0.016]} />
              <meshStandardMaterial color={f.col} roughness={0.55} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
});
