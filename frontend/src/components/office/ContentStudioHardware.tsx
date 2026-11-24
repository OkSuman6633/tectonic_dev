import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import type { Mesh } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { CampusZone, Vec3 } from './officeLayout';
import { ContentPlatformChassis } from './contentStudio/ContentPlatformChassis';
import { ContentStudioWall } from './contentStudio/ContentStudioWall';
import { ContentEditingDesk } from './contentStudio/ContentEditingDesk';
import { ContentProductionRig } from './contentStudio/ContentProductionRig';

/**
 * Content Studio – RCP 3D Infrastructure Assembly (`content-zone`, `kind: 'content'`):
 * Exact 3D architectural reconstruction matching the attached reference image:
 * 1. Multi-tier metallic platform with continuous electric cyan-blue contour bars, recessed glowing purple vents,
 *    reflective tiled deck, chamfered "Content Studio – RCP" front signboard with purple play emblem, and glass railings
 * 2. Monumental rear chamfered main editing display wall (live sunset skyline + multi-track timeline + 3 amber top lights)
 *    + right vertical RCP feature monolith (AI-Powered Editing, Multi-Format Export, Real-Time Preview, Collaborative Workflows)
 * 3. Central curved 3-monitor studio editing workstation with reference speakers, edit deck & ergonomic swivel chair
 * 4. Left chroma-key green screen, studio softbox key light, pro cinema camera on tripod, blue-lit media server rack,
 *    and aluminum-trimmed flight cases with a foreground pro DSLR camera
 */
export const ContentStudioHardware = memo(function ContentStudioHardware({
  zone,
  onSelectModule,
}: {
  zone: CampusZone;
  onSelectModule?: (moduleId: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const activeRef = useRef(false);
  const pulseOrbRef = useRef<Mesh>(null);
  const pulseProgressRef = useRef(0);

  // Subtle floor telemetry conduit path linking Media Server Rack -> Editing Desk -> Rear Display Wall
  const pulseWaypoints: Vec3[] = [
    [-3.35, 0.05, -1.65],
    [-1.45, 0.05, -0.35],
    [-0.2, 0.05, 0.15],
    [-0.2, 0.05, -2.15],
  ];

  useFrame((_, delta) => {
    const s = useTelemetryStore.getState();
    const pState = s.modules.promptops?.state;
    const iState = s.modules.image_generation?.state;
    const anyActive = pState === 'busy' || iState === 'busy' || s.activeRuns > 0;
    activeRef.current = anyActive;

    const orb = pulseOrbRef.current;
    if (orb) {
      if (!reducedMotion && anyActive) {
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
      {/* 1. Multi-Tier Metallic Studio Platform, Front Signboard & Glass/Chrome Railings */}
      <ContentPlatformChassis zone={zone} activeRef={activeRef} />

      {/* 2. Monumental Rear Main Editing Display Wall + Right Vertical Feature Monolith (bound to image_generation) */}
      <ContentStudioWall
        position={[-0.45, 0, -2.75]}
        onSelectImageGen={onSelectModule ? () => onSelectModule('image_generation') : undefined}
      />

      {/* 3. Central Curved 3-Monitor Studio Editing Workstation (bound to promptops) */}
      <ContentEditingDesk
        position={[-0.2, 0, 0.45]}
        onSelect={onSelectModule ? () => onSelectModule('promptops') : undefined}
      />

      {/* 4. Left Chroma-Key Production Set, Server Rack, Flight Cases, Foreground Pro DSLR & Planters */}
      <ContentProductionRig />

      {/* Flush Floor Telemetry Conduit Lines linking Server Rack, Editing Desk & Main Display Wall */}
      <group position={[0, 0.008, 0]}>
        <mesh position={[-0.2, 0, -0.95]}>
          <boxGeometry args={[0.045, 0.01, 2.35]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={1.65} />
        </mesh>
        <mesh position={[-1.85, 0, -0.65]} rotation={[0, -0.45, 0]}>
          <boxGeometry args={[2.25, 0.01, 0.042]} />
          <meshStandardMaterial color="#C084FC" emissive="#A855F7" emissiveIntensity={1.65} />
        </mesh>
        <mesh ref={pulseOrbRef} visible={false}>
          <sphereGeometry args={[0.085, 12, 12]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#C084FC" emissiveIntensity={3.5} />
        </mesh>
      </group>
    </group>
  );
});
