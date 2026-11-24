import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import type { Mesh } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { CampusZone, Vec3 } from './officeLayout';
import { OperationsPlatformChassis } from './operationsSafety/OperationsPlatformChassis';
import { OperationsDashboardWall } from './operationsSafety/OperationsDashboardWall';
import { OperationsCommandDesk } from './operationsSafety/OperationsCommandDesk';
import { OperationsEquipmentBays } from './operationsSafety/OperationsEquipmentBays';

/**
 * Operations & Safety Center 3D Infrastructure Assembly (`operations-zone`, `kind: 'hub'`):
 * Reconstructs the attached 3D visual reference with real interactive Three.js / R3F geometry:
 * 1. Multi-tier metallic platform with electric cyan lower lights, warm amber upper perimeter rims,
 *    reflective tiled deck, chamfered "OPERATIONS & SAFETY" signboard, and glass/brass railings
 * 2. Large rear chamfered Operations & Safety Dashboard Display driven live by `useTelemetryStore`
 * 3. Central curved 4-monitor command workstation with keyboards, mini plants, and swivel chair
 * 4. Left realistic enterprise server racks, emergency red fire extinguisher + fire sign, and white planter
 * 5. Right glowing cyan "SAFETY FIRST" cabinet, reactive 3-tier Red/Amber/Green warning beacon,
 *    heavy curved chrome/brass industrial pipework, red First-Aid Kit, and yellow Safety Helmet
 */
export const OperationsSafetyHardware = memo(function OperationsSafetyHardware({
  zone,
  onSelectModule,
}: {
  zone: CampusZone;
  onSelectModule?: (moduleId: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const alertLevelRef = useRef<'ok' | 'warn' | 'alert'>('ok');
  const activeRef = useRef(false);
  const pulseOrbRef = useRef<Mesh>(null);
  const pulseProgressRef = useRef(0);

  // Subtle floor telemetry conduit path connecting Right Safety Cabinet → Command Desk → Rear Dashboard
  const pulseWaypoints: Vec3[] = [
    [3.85, 0.05, -0.55],
    [1.65, 0.05, 0.25],
    [-0.15, 0.05, 0.25],
    [-0.15, 0.05, -2.15],
  ];

  useFrame((_, delta) => {
    const s = useTelemetryStore.getState();
    const gState = s.modules.guardrails?.state;
    const iState = s.modules.intent_detection?.state;
    const anyError =
      gState === 'error' ||
      iState === 'error' ||
      Object.values(s.agents).some((a) => a.state === 'error');
    const anyBusy = gState === 'busy' || iState === 'busy' || s.activeRuns > 0;
    activeRef.current = anyBusy || anyError;

    // Animate subtle floor telemetry pulse packet when guardrails or intent detection are active
    const orb = pulseOrbRef.current;
    if (orb) {
      if (!reducedMotion && (anyBusy || anyError)) {
        pulseProgressRef.current = (pulseProgressRef.current + delta * 0.65) % 1;
        const segs = pulseWaypoints.length - 1;
        const scaled = pulseProgressRef.current * segs;
        const idx = Math.min(segs - 1, Math.floor(scaled));
        const frac = scaled - idx;
        const a = pulseWaypoints[idx];
        const b = pulseWaypoints[idx + 1];
        orb.visible = true;
        orb.position.set(
          a[0] + (b[0] - a[0]) * frac,
          a[1] + (b[1] - a[1]) * frac,
          a[2] + (b[2] - a[2]) * frac,
        );
      } else {
        orb.visible = false;
      }
    }
  });

  return (
    <group>
      {/* 1. Multi-Tier Industrial Metallic Platform, Signboard & Glass/Brass Railings */}
      <OperationsPlatformChassis zone={zone} alertLevelRef={alertLevelRef} activeRef={activeRef} />

      {/* 2. Large Rear Operations & Safety Live Dashboard Display Wall */}
      <OperationsDashboardWall position={[0.05, 0, -2.75]} alertLevelRef={alertLevelRef} />

      {/* 3. Central Curved 4-Monitor Command Workstation (bound to intent_detection) */}
      <OperationsCommandDesk
        position={[-0.15, 0, 0.45]}
        onSelect={onSelectModule ? () => onSelectModule('intent_detection') : undefined}
      />

      {/* 4 & 5. Left Enterprise Servers + Fire Extinguisher & Right Safety Bay + Beacon + Pipework + First-Aid + Helmet */}
      <OperationsEquipmentBays
        alertLevelRef={alertLevelRef}
        onSelectGuardrails={onSelectModule ? () => onSelectModule('guardrails') : undefined}
      />

      {/* Flush Floor Telemetry Conduit Lines linking Safety Cabinet, Command Desk & Operations Wall */}
      <group position={[0, 0.008, 0]}>
        <mesh position={[1.85, 0, 0.25]}>
          <boxGeometry args={[4.1, 0.01, 0.045]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[-0.15, 0, -0.95]}>
          <boxGeometry args={[0.045, 0.01, 2.4]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={1.6} />
        </mesh>
        <mesh ref={pulseOrbRef} visible={false}>
          <sphereGeometry args={[0.085, 12, 12]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#38E8FF" emissiveIntensity={3.5} />
        </mesh>
      </group>
    </group>
  );
});
