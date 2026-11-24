import { memo, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { CampusZone, Vec3 } from './officeLayout';
import { PlatformChassisBase } from './toolOrchestration/PlatformChassis';
import { CentralHolographicCore } from './toolOrchestration/ProcessingCore';
import {
  CornerBeaconMainframe,
  CryogenicCoolantTank,
  CurvedChromePipe,
  EnterpriseBladeRack,
  HazardDiagnosticCabinet,
  HolographicMonitoringWall,
  IndustrialHeatExchangerBay,
  IndustrialSafetyRail,
  SculptedCyberPlant,
  TallPowerServerCabinet,
} from './toolOrchestration/ServerAndCoolingHardware';
import {
  BackLeftComputeCluster,
  BatteryPackModules,
  OperatorControlWorkstation,
} from './toolOrchestration/ControlWorkstation';

export {
  PlatformChassisBase,
  CentralHolographicCore,
  EnterpriseBladeRack,
  HazardDiagnosticCabinet,
  IndustrialHeatExchangerBay,
  TallPowerServerCabinet,
  CornerBeaconMainframe,
  CryogenicCoolantTank,
  CurvedChromePipe,
  IndustrialSafetyRail,
  HolographicMonitoringWall,
  SculptedCyberPlant,
  OperatorControlWorkstation,
  BatteryPackModules,
  BackLeftComputeCluster,
};

const FALLBACK_ZONE: CampusZone = {
  id: 'tooling-zone',
  label: 'TOOL ORCHESTRATION',
  subtitle: 'AUTOMATION & CONNECTORS',
  kind: 'tools',
  center: [22.8, 0.62, 1.8],
  width: 10.4,
  depth: 8.8,
  height: 0.62,
  thickness: 0.62,
  accent: '#F59E0B',
  secondaryAccent: '#FDE047',
  surfaceTint: '#141B29',
  signPlacement: 'front',
};

/**
 * High-Fidelity 3D Tool Orchestration External Infrastructure Platform:
 * Reconstructed from actual interactive 3D geometry & reusable hardware components:
 * - Multi-tier chamfered foundation plinth with cyan sub-chassis vents, dual amber illuminated rims,
 *   and integrated beveled "TOOL ORCHESTRATION" architectural signboard
 * - Central 3-tier golden holographic processing core with glass containment & wireframe circuit cube
 * - Foreground row of 4 enterprise blade server racks + tall silver-titanium hazard diagnostic cabinet
 * - Right industrial cooling & cryogenic bay: heat-exchanger cabinet with curved chrome pipes,
 *   tall hazard power cabinet, corner beacon mainframe, dual glowing electric-blue cryogenic tanks,
 *   secondary stainless steel filter cylinders, sunken metallic basin, and safety-yellow handrails
 * - Giant rear cyan holographic monitoring wall with crisp mechanical gear icon & rear pipe manifold
 * - Back-left 4-screen operator workstation, arched chrome conduits, silver/yellow battery packs,
 *   back-left compute towers, and sculpted potted cyber plants
 * - Unobstructed west bridge entry corridor preserving seamless courier/employee navigation
 */
export const ToolOrchestrationHardware = memo(function ToolOrchestrationHardware({
  zone = FALLBACK_ZONE,
  activeRef,
  isDark = true,
}: {
  zone?: CampusZone;
  activeRef: React.RefObject<boolean>;
  isDark?: boolean;
}) {
  // Curved chrome manifold pipe linking the back cryogenic tank to the secondary stainless filter vessels
  const backTankToFilterPipeA: Vec3[] = useMemo(
    () => [
      [3.95, 1.66, -0.85],
      [4.02, 1.82, -1.25],
      [4.24, 1.72, -1.78],
      [4.24, 1.18, -1.78],
    ],
    [],
  );
  const backTankToFilterPipeB: Vec3[] = useMemo(
    () => [
      [4.24, 1.24, -1.78],
      [4.46, 1.48, -2.02],
      [4.56, 1.22, -2.26],
      [4.56, 0.04, -2.26],
    ],
    [],
  );
  // Subtle deck-level chrome return line linking front cryo tank to back cryo bay
  const cryoLinkPipe: Vec3[] = useMemo(
    () => [
      [3.25, 0.24, 1.48],
      [3.42, 0.24, 0.65],
      [3.78, 0.24, -0.35],
    ],
    [],
  );

  // Clicking non-station hardware selects the primary tool_orchestration module if registered
  const handleHardwareClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const store = useTelemetryStore.getState();
    const targetId =
      (store.modules.tool_orchestration && 'tool_orchestration') ||
      store.moduleOrder.find((id) => id === 'connectors' || id === 'external_connectors');
    if (targetId) {
      store.selectModule(targetId, 'office');
    }
  };

  return (
    <group onClick={handleHardwareClick}>
      {/* ================================================================================= */}
      {/* 1. MULTI-TIERED FOUNDATION PLINTH, CYAN VENTS, DUAL AMBER EDGES & BEVELED SIGN */}
      {/* ================================================================================= */}
      <PlatformChassisBase zone={zone} activeRef={activeRef} isDark={isDark} />

      {/* ================================================================================= */}
      {/* 2. CENTRAL MONUMENTAL HOLOGRAPHIC PROCESSING CORE */}
      {/* ================================================================================= */}
      <CentralHolographicCore position={[-0.15, 0, -0.35]} activeRef={activeRef} isDark={isDark} />

      {/* ================================================================================= */}
      {/* 3. FOREGROUND ROW: 4 ENTERPRISE SERVER RACKS + FRONT-RIGHT HAZARD CABINET */}
      {/* ================================================================================= */}
      <EnterpriseBladeRack position={[-2.05, 0, 2.28]} size={[0.78, 1.56, 0.8]} primaryLed="#00E5FF" secondaryLed="#93C5FD" isDark={isDark} />
      <EnterpriseBladeRack position={[-1.05, 0, 2.28]} size={[0.78, 1.56, 0.8]} primaryLed="#00E5FF" secondaryLed="#7DD3FC" isDark={isDark} />
      <EnterpriseBladeRack position={[-0.05, 0, 2.28]} size={[0.78, 1.56, 0.8]} primaryLed="#38BDF8" secondaryLed="#00E5FF" isDark={isDark} />
      <EnterpriseBladeRack position={[0.95, 0, 2.28]} size={[0.78, 1.56, 0.8]} primaryLed="#00E5FF" secondaryLed="#BAE6FD" isDark={isDark} />

      <HazardDiagnosticCabinet position={[2.05, 0, 2.55]} size={[0.66, 1.74, 0.72]} isDark={isDark} />

      {/* ================================================================================= */}
      {/* 4. RIGHT INDUSTRIAL COOLING BAY, HEAT EXCHANGER, POWER CABINET & BEACON MAINFRAME */}
      {/* ================================================================================= */}
      <IndustrialHeatExchangerBay position={[2.08, 0, 0.48]} isDark={isDark} />
      <TallPowerServerCabinet position={[2.48, 0, -1.45]} isDark={isDark} />
      <CornerBeaconMainframe position={[3.58, 0, -2.95]} activeRef={activeRef} isDark={isDark} />

      {/* Sunken Reflective Metallic Maintenance Bay under the Cryogenic Coolant Tanks */}
      <group position={[3.68, 0.004, 0.55]}>
        {/* Outer beveled metallic catch-basin border */}
        <mesh receiveShadow>
          <boxGeometry args={[2.18, 0.018, 5.15]} />
          <meshStandardMaterial color={isDark ? '#0A101B' : '#9EAFBF'} roughness={0.22} metalness={isDark ? 0.86 : 0.72} />
        </mesh>
        {/* Inner mirror-sheen floor plate */}
        <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1.98, 4.92]} />
          <meshStandardMaterial color={isDark ? '#070C16' : '#6A7E92'} roughness={0.16} metalness={isDark ? 0.92 : 0.76} />
        </mesh>
        {/* Subtle metallic maintenance grate strip */}
        <mesh position={[-0.78, 0.013, 0.2]}>
          <boxGeometry args={[0.26, 0.008, 3.8]} />
          <meshStandardMaterial color={isDark ? '#273449' : '#536B83'} roughness={0.45} metalness={0.82} />
        </mesh>
      </group>

      {/* Dual Glowing Electric-Blue Cryogenic Liquid Coolant Tanks */}
      <CryogenicCoolantTank position={[3.25, 0, 1.95]} activeRef={activeRef} phaseOffset={0} isDark={isDark} />
      <CryogenicCoolantTank position={[3.95, 0, -0.85]} activeRef={activeRef} phaseOffset={1.9} isDark={isDark} />

      {/* Twin Secondary Brushed-Stainless Pressure Filter Vessels & Interconnect Piping */}
      <group position={[4.24, 0, -1.78]}>
        <mesh position={[0, 0.56, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 1.12, 16]} />
          <meshStandardMaterial color={isDark ? '#94A3B8' : '#DCE4EB'} metalness={0.9} roughness={0.18} />
        </mesh>
        <mesh position={[0, 1.14, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.06, 16]} />
          <meshStandardMaterial color={isDark ? '#CBD5E1' : '#F5F7FA'} metalness={0.92} roughness={0.14} />
        </mesh>
      </group>
      <group position={[4.52, 0, -1.62]}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.84, 14]} />
          <meshStandardMaterial color={isDark ? '#7C8BA1' : '#9EAFBF'} metalness={0.88} roughness={0.22} />
        </mesh>
        <RoundedBox args={[0.32, 0.34, 0.28]} radius={0.03} smoothness={1} position={[0, 0.17, 0.14]}>
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={0.8} roughness={0.34} />
        </RoundedBox>
      </group>

      <CurvedChromePipe points={backTankToFilterPipeA} radius={0.044} flangeIndices={[0, 2]} />
      <CurvedChromePipe points={backTankToFilterPipeB} radius={0.038} flangeIndices={[1, 2]} />
      <CurvedChromePipe points={cryoLinkPipe} radius={0.04} flangeIndices={[1]} />

      {/* Industrial Safety-Yellow Handrails Framing the Cryogenic Bay & Catwalk Edges */}
      {/* Front-bottom corner barrier protecting the hazard cabinet & front cryo tank */}
      <IndustrialSafetyRail start={[1.75, 0, 3.88]} length={1.65} isDark={isDark} />
      <IndustrialSafetyRail start={[3.4, 0, 3.88]} length={0.95} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
      {/* Inner divider railing between the cryogenic bay and tall power cabinet */}
      <IndustrialSafetyRail start={[3.18, 0, 0.35]} length={1.15} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
      {/* Far-right corner railing protecting secondary stainless pressure vessels */}
      <IndustrialSafetyRail start={[4.76, 0, -1.25]} length={1.45} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />

      {/* ================================================================================= */}
      {/* 5. GIANT REAR CYAN HOLOGRAPHIC MONITORING WALL + REAR PIPE MANIFOLD */}
      {/* ================================================================================= */}
      <HolographicMonitoringWall position={[0.82, 2.6, -3.72]} activeRef={activeRef} isDark={isDark} />

      {/* ================================================================================= */}
      {/* 6. BACK-LEFT OPERATOR WORKSTATION, BATTERY PACKS & COMPUTE TOWERS */}
      {/* ================================================================================= */}
      <OperatorControlWorkstation position={[-4.02, 0, 2.02]} rotation={[0, Math.PI / 2, 0]} isDark={isDark} />
      <BatteryPackModules position={[-3.98, 0, 3.68]} isDark={isDark} />
      <BackLeftComputeCluster isDark={isDark} />

      {/* ================================================================================= */}
      {/* 7. ORGANIC SCULPTED CYBER PLANTS (Left & Right Corner Accents) */}
      {/* ================================================================================= */}
      <SculptedCyberPlant position={[-4.6, 0, 3.08]} scale={1.05} isDark={isDark} />
      <SculptedCyberPlant position={[4.12, 0, -2.28]} scale={1.0} isDark={isDark} />
    </group>
  );
});
