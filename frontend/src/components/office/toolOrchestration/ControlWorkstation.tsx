import { memo, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Vec3 } from '../officeLayout';
import { CurvedChromePipe, EnterpriseBladeRack } from './ServerAndCoolingHardware';
import { getWorkstationScreenTexture } from './textures';

/**
 * Operator Control Workstation (Back-Left of Tool Orchestration):
 * Oriented along the -X edge facing +X toward the corridor & core so it stays 100% clear
 * of the bridge-tools walkway at z = 0:
 * - Heavy dark metallic desk with glowing electric-blue under-desk foot bar & shelf strip
 * - Dual lower angled cyan displays + glowing backlit keyboard deck
 * - Wide dual-pane upper panoramic telemetry monitor (circular radar dial + topology map)
 * - Slim vertical side compute pillar with glowing blue LED bars
 * - Twin thick curved brushed-chrome overhead conduit pipes arching cleanly over the desk
 */
export const OperatorControlWorkstation = memo(function OperatorControlWorkstation({
  position = [-4.02, 0, 2.02] as Vec3,
  rotation = [0, Math.PI / 2, 0] as [number, number, number],
  isDark = true,
}: {
  position?: Vec3;
  rotation?: [number, number, number];
  isDark?: boolean;
}) {
  const upperTex = useMemo(() => getWorkstationScreenTexture('upper-pano', isDark), [isDark]);
  const leftTex = useMemo(() => getWorkstationScreenTexture('console-left', isDark), [isDark]);
  const rightTex = useMemo(() => getWorkstationScreenTexture('console-right', isDark), [isDark]);

  // Arched thick chrome pipes looping from the left side pillar up and into the rear console housing
  const archPipeA: Vec3[] = useMemo(
    () => [
      [-0.96, 1.48, 0.08],
      [-0.96, 2.06, 0.02],
      [-0.78, 2.16, -0.22],
      [-0.45, 2.02, -0.34],
      [-0.45, 1.48, -0.34],
    ],
    [],
  );
  const archPipeB: Vec3[] = useMemo(
    () => [
      [-0.84, 1.48, 0.14],
      [-0.84, 1.94, 0.08],
      [-0.68, 2.04, -0.14],
      [-0.36, 1.9, -0.28],
      [-0.36, 1.48, -0.28],
    ],
    [],
  );

  return (
    <group position={position} rotation={rotation}>
      {/* Main Heavy Industrial Desk Pedestal Legs & Under-Shelf */}
      <RoundedBox args={[1.66, 0.09, 0.82]} radius={0.025} smoothness={2} position={[0, 0.78, 0.02]} castShadow receiveShadow>
        <meshStandardMaterial color={isDark ? '#1B2538' : '#DCE4EB'} roughness={isDark ? 0.34 : 0.28} metalness={isDark ? 0.8 : 0.66} />
      </RoundedBox>
      {/* Left & Right Angled Structural Desk Legs */}
      {[-0.74, 0.74].map((lx, i) => (
        <mesh key={i} position={[lx, 0.39, 0.02]} castShadow>
          <boxGeometry args={[0.12, 0.78, 0.74]} />
          <meshStandardMaterial color={isDark ? '#121A2A' : '#9EAFBF'} roughness={isDark ? 0.38 : 0.32} metalness={isDark ? 0.82 : 0.68} />
        </mesh>
      ))}
      {/* Back Modesty Panel */}
      <mesh position={[0, 0.44, -0.32]}>
        <boxGeometry args={[1.56, 0.68, 0.06]} />
        <meshStandardMaterial color={isDark ? '#0F172A' : '#536B83'} roughness={0.45} metalness={isDark ? 0.75 : 0.68} />
      </mesh>
      {/* Glowing Electric-Blue Under-Desk Foot & Shelf Light Strips */}
      <mesh position={[0, 0.12, 0.24]}>
        <boxGeometry args={[1.44, 0.045, 0.06]} />
        <meshStandardMaterial color="#67E8F9" emissive="#0098FF" emissiveIntensity={2.35} />
      </mesh>
      <mesh position={[0, 0.56, 0.18]}>
        <boxGeometry args={[1.38, 0.03, 0.03]} />
        <meshStandardMaterial color="#38E8FF" emissive="#00C8FF" emissiveIntensity={1.9} />
      </mesh>

      {/* Backlit Cyan Keyboard & Operator Control Pad */}
      <mesh position={[-0.32, 0.835, 0.24]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.52, 0.2]} />
        <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0.32, 0.835, 0.24]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.52, 0.2]} />
        <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={1.5} />
      </mesh>

      {/* Dual Lower Desktop Angled Cyan Monitors */}
      <group position={[-0.38, 1.07, -0.06]} rotation={[-0.22, 0.12, 0]}>
        <RoundedBox args={[0.68, 0.4, 0.038]} radius={0.015} smoothness={1} castShadow>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.82 : 0.7} roughness={0.28} />
        </RoundedBox>
        <mesh position={[0, 0, 0.022]}>
          <planeGeometry args={[0.63, 0.35]} />
          {leftTex ? <meshBasicMaterial map={leftTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>
      <group position={[0.38, 1.07, -0.06]} rotation={[-0.22, -0.12, 0]}>
        <RoundedBox args={[0.68, 0.4, 0.038]} radius={0.015} smoothness={1} castShadow>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.82 : 0.7} roughness={0.28} />
        </RoundedBox>
        <mesh position={[0, 0, 0.022]}>
          <planeGeometry args={[0.63, 0.35]} />
          {rightTex ? <meshBasicMaterial map={rightTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>

      {/* Monitor Mounting Gantry Posts */}
      {[-0.64, 0.64].map((px, i) => (
        <mesh key={i} position={[px, 1.38, -0.3]}>
          <cylinderGeometry args={[0.026, 0.026, 1.15, 10]} />
          <meshStandardMaterial color={isDark ? '#475569' : '#9EAFBF'} metalness={0.88} roughness={0.22} />
        </mesh>
      ))}

      {/* Wide Upper Panoramic Dual-Pane Cyan Telemetry Display (Radar Dial + Topology Map) */}
      <group position={[0, 1.66, -0.22]} rotation={[0.08, 0, 0]}>
        <RoundedBox args={[1.64, 0.56, 0.042]} radius={0.018} smoothness={1} castShadow>
          <meshStandardMaterial color={isDark ? '#0F172A' : '#536B83'} metalness={isDark ? 0.84 : 0.72} roughness={0.26} />
        </RoundedBox>
        <mesh position={[0, 0, 0.024]}>
          <planeGeometry args={[1.56, 0.49]} />
          {upperTex ? <meshBasicMaterial map={upperTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
        {/* Subtle cyan top & bottom bezel trim */}
        <mesh position={[0, 0.285, 0.01]}>
          <boxGeometry args={[1.62, 0.018, 0.025]} />
          <meshStandardMaterial color="#67E8F9" emissive="#00D4FF" emissiveIntensity={2.0} />
        </mesh>
      </group>

      {/* Slim Vertical Side Compute Pillar with Glowing Blue LED Bars (-X local = +Z world) */}
      <group position={[-0.98, 0, 0.02]}>
        <RoundedBox args={[0.32, 1.54, 0.72]} radius={0.04} smoothness={2} position={[0, 0.77, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#1B2436' : '#DCE4EB'} roughness={isDark ? 0.32 : 0.28} metalness={isDark ? 0.84 : 0.68} />
        </RoundedBox>
        {/* Glowing vertical electric-blue status bars on front face */}
        {[-0.4, -0.15, 0.1, 0.35].map((by, i) => (
          <mesh key={i} position={[0, 0.78 + by, 0.365]}>
            <boxGeometry args={[0.16, 0.14, 0.018]} />
            <meshStandardMaterial color="#67E8F9" emissive="#00A8FF" emissiveIntensity={2.3} />
          </mesh>
        ))}
        {/* Glowing blue base runner along side pillar */}
        <mesh position={[0.17, 0.06, 0]}>
          <boxGeometry args={[0.02, 0.045, 0.64]} />
          <meshStandardMaterial color="#67E8F9" emissive="#00B8FF" emissiveIntensity={2.2} />
        </mesh>
      </group>

      {/* Twin Arched Brushed-Chrome Overhead Cooling Conduits */}
      <CurvedChromePipe points={archPipeA} radius={0.045} flangeIndices={[0, 2, 4]} />
      <CurvedChromePipe points={archPipeB} radius={0.036} flangeIndices={[0, 2, 4]} />
    </group>
  );
});

/**
 * Modular Industrial Power / Battery Crates positioned at the far Front-Left Corner
 * (matching the silver + safety-yellow power pack pair on the left of the reference image).
 */
export const BatteryPackModules = memo(function BatteryPackModules({
  position = [-3.98, 0, 3.68] as Vec3,
  isDark = true,
}: {
  position?: Vec3;
  isDark?: boolean;
}) {
  return (
    <group position={position}>
      {/* Rear Brushed-Silver Industrial Power Pack */}
      <group position={[-0.32, 0, -0.04]}>
        <RoundedBox args={[0.58, 0.44, 0.56]} radius={0.04} smoothness={2} position={[0, 0.22, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#7C8BA1' : '#DCE4EB'} metalness={isDark ? 0.82 : 0.68} roughness={0.28} />
        </RoundedBox>
        <mesh position={[0, 0.44, 0]}>
          <boxGeometry args={[0.42, 0.03, 0.38]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#F5F7FA'} metalness={isDark ? 0.8 : 0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.24, 0.285]}>
          <boxGeometry args={[0.38, 0.14, 0.018]} />
          <meshStandardMaterial color={isDark ? '#0F172A' : '#162231'} roughness={0.5} />
        </mesh>
      </group>

      {/* Front Safety-Yellow Battery Pack Module */}
      <group position={[0.26, 0, 0.04]}>
        <RoundedBox args={[0.52, 0.42, 0.56]} radius={0.04} smoothness={2} position={[0, 0.21, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#EAB308" metalness={0.48} roughness={0.32} />
        </RoundedBox>
        {/* Status readout panel & indicator dots on +Z front */}
        <mesh position={[0, 0.22, 0.285]}>
          <boxGeometry args={[0.36, 0.24, 0.016]} />
          <meshStandardMaterial color={isDark ? '#0F172A' : '#263B52'} roughness={0.5} />
        </mesh>
        <mesh position={[-0.08, 0.27, 0.296]}>
          <boxGeometry args={[0.12, 0.03, 0.01]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00E5FF" emissiveIntensity={2.0} />
        </mesh>
        <mesh position={[0.1, 0.27, 0.296]}>
          <boxGeometry args={[0.05, 0.03, 0.01]} />
          <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={2.0} />
        </mesh>
        {/* Top clamp strap */}
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.14, 0.025, 0.54]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.85 : 0.72} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
});

/**
 * Back-Left Compute Server Cluster (North of the bridge entry corridor):
 * - Compact auxiliary diagnostic rack
 * - Heavy rounded-silver-hood server cabinet with glowing cyan blade bay
 * - Tall rear-top mainframe tower with signature vertical glowing amber status blocks
 */
export const BackLeftComputeCluster = memo(function BackLeftComputeCluster({
  isDark = true,
}: {
  isDark?: boolean;
}) {
  return (
    <group>
      {/* Compact Auxiliary Cabinet tucked between corridor and back-left tower */}
      <group position={[-3.32, 0, -1.52]}>
        <RoundedBox args={[0.56, 1.02, 0.56]} radius={0.035} smoothness={2} position={[0, 0.51, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#475569' : '#9EAFBF'} roughness={0.32} metalness={isDark ? 0.82 : 0.68} />
        </RoundedBox>
        <mesh position={[0.285, 0.52, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.42, 0.78]} />
          <meshStandardMaterial color={isDark ? '#0C121E' : '#141E2C'} roughness={0.5} />
        </mesh>
        <mesh position={[0.29, 0.78, 0]}>
          <boxGeometry args={[0.014, 0.05, 0.26]} />
          <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={2.0} />
        </mesh>
      </group>

      {/* Mid-Back Heavy Server Cabinet with Rounded Top Cap */}
      <EnterpriseBladeRack
        position={[-3.82, 0, -2.55]}
        rotation={[0, Math.PI / 2, 0]}
        size={[1.05, 1.98, 1.02]}
        primaryLed="#00E5FF"
        secondaryLed="#38BDF8"
        hoodColor="#7C8BA1"
        isDark={isDark}
      />

      {/* Tall Back-Top Mainframe Tower with Glowing Vertical Amber Status Blocks (matches top-left of reference) */}
      <EnterpriseBladeRack
        position={[-2.52, 0, -3.45]}
        rotation={[0, Math.PI / 2, 0]}
        size={[1.04, 2.52, 1.0]}
        primaryLed="#FFB020"
        secondaryLed="#FFE082"
        accentStyle="amber-vertical"
        hoodColor="#334155"
        isDark={isDark}
      />
    </group>
  );
});
