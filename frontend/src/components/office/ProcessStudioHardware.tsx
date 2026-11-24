import { memo, useCallback, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { CampusZone } from './officeLayout';
import { ProcessPlatformChassis } from './processStudio/ProcessPlatformChassis';
import { WorkflowCoreDisplay } from './processStudio/WorkflowCoreDisplay';
import { ProcessServerRack, ProcessWorkflowMonolith } from './processStudio/ProcessServerHardware';
import { ArchitecturalPlanter, ProcessWorkstation } from './processStudio/ProcessWorkstation';

export {
  ProcessPlatformChassis,
  WorkflowCoreDisplay,
  ProcessServerRack,
  ProcessWorkflowMonolith,
  ProcessWorkstation,
  ArchitecturalPlanter,
};

const FALLBACK_PROCESS_ZONE: CampusZone = {
  id: 'process-zone',
  label: 'PROCESS STUDIO',
  subtitle: 'PROCESSING & GOVERNANCE',
  kind: 'process',
  center: [22.5, 0.62, -16.2],
  width: 12.2,
  depth: 8.4,
  height: 0.62,
  thickness: 0.62,
  accent: '#A855F7',
  secondaryAccent: '#00E5FF',
  surfaceTint: '#111827',
  signPlacement: 'front',
};

/**
 * Clean, Premium Enterprise 3D Process Studio Infrastructure:
 * Reconstructed from actual interactive Three.js / R3F geometry matching the visual reference:
 * - Sculpted metallic platform with cyan-blue corner illumination, purple side & signboard accents,
 *   reflective dark tiled floor, chamfered "PROCESS STUDIO" front sign, and glass balustrades
 * - Central Holographic Workflow Core & large translucent monitoring display showing live workflow
 *   stages (Build, Test, Deploy, Monitor) driven directly by Tectonic runtime execution events
 * - Clean enterprise server racks on left & right + signature purple-emblem workflow monolith
 * - Single 3-monitor operator workstation with ergonomic swivel chair & minimalist white planters
 */
export const ProcessStudioHardware = memo(function ProcessStudioHardware({
  zone = FALLBACK_PROCESS_ZONE,
  activeRef,
}: {
  zone?: CampusZone;
  activeRef: React.RefObject<boolean>;
  isDark?: boolean;
}) {
  const workflowActivityRef = useRef(0);

  const handleSelectProcess = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const store = useTelemetryStore.getState();
    const target =
      (store.modules.auditability && 'auditability') ||
      (store.modules.finops && 'finops') ||
      store.moduleOrder.find((id) => id === 'auditability' || id === 'finops');
    if (target) store.selectModule(target, 'office');
  }, []);

  return (
    <group onClick={handleSelectProcess}>
      {/* 1. Multi-Tier Sculpted Metallic Platform, Cyan/Purple Lighting, Front Sign & Glass Balustrades */}
      <ProcessPlatformChassis zone={zone} activityRef={workflowActivityRef} />

      {/* 2. Central Holographic Workflow Core & Live Build / Test / Deploy / Monitor Display */}
      <WorkflowCoreDisplay
        position={[0.05, 0, -0.75]}
        platformActiveRef={activeRef}
        activityRef={workflowActivityRef}
      />

      {/* 3. Realistic Enterprise Server Racks (Left Pair & Right Pair) + Purple Workflow Monolith */}
      <ProcessServerRack position={[-4.25, 0, -1.78]} size={[1.05, 2.48, 0.96]} activityRef={workflowActivityRef} phase={0.0} />
      <ProcessServerRack position={[-2.95, 0, -2.35]} size={[1.08, 2.66, 0.98]} activityRef={workflowActivityRef} phase={1.2} />

      <ProcessServerRack position={[2.82, 0, -1.88]} size={[1.02, 2.48, 0.96]} activityRef={workflowActivityRef} phase={2.1} />
      <ProcessServerRack position={[3.92, 0, -1.68]} size={[0.96, 2.18, 0.92]} activityRef={workflowActivityRef} phase={3.3} />
      <ProcessWorkflowMonolith position={[5.05, 0, -1.35]} activityRef={workflowActivityRef} />

      {/* 4. Clean 3-Monitor Operator Workstation & Minimalist White Corner Planters */}
      <ProcessWorkstation position={[-2.58, 0, 0.42]} rotation={[0, 0.1, 0]} activityRef={workflowActivityRef} />
      <ArchitecturalPlanter position={[-5.35, 0, 0.48]} potHeight={0.86} potWidth={0.56} />
      <ArchitecturalPlanter position={[5.35, 0, 1.38]} potHeight={0.56} potWidth={0.54} />
    </group>
  );
});
