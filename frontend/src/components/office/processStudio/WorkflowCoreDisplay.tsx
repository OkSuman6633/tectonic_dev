import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import {
  AdditiveBlending,
  CatmullRomCurve3,
  DoubleSide,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three';
import { useTelemetryStore } from '../../../store/useTelemetryStore';
import type { Vec3 } from '../officeLayout';
import { getWorkflowDisplayTexture } from './textures';

export type WorkflowStageIndex = 0 | 1 | 2 | 3; // 0: BUILD, 1: TEST, 2: DEPLOY, 3: MONITOR

const LINGER_S = 2.6;

/**
 * Inspects real Tectonic telemetry state (`useTelemetryStore`) to determine active Process Studio
 * execution intensity and which workflow stage (Build, Test, Deploy, Monitor) is currently active.
 */
function resolveLiveWorkflowStage(nowS: number): { active: boolean; stage: WorkflowStageIndex; intensity: number } {
  const s = useTelemetryStore.getState();

  const auditMod = s.modules.auditability;
  const finopsMod = s.modules.finops;
  const auditLast = s.moduleCalls.auditability?.at(-1);
  const finopsLast = s.moduleCalls.finops?.at(-1);
  const monitorBusy =
    auditMod?.state === 'busy' ||
    finopsMod?.state === 'busy' ||
    Boolean(auditLast && (auditLast.status === 'running' || nowS - auditLast.startedAt < LINGER_S)) ||
    Boolean(finopsLast && (finopsLast.status === 'running' || nowS - finopsLast.startedAt < LINGER_S));
  if (monitorBusy) return { active: true, stage: 3, intensity: 1.0 };

  const guardMod = s.modules.guardrails;
  const intentMod = s.modules.intent_detection;
  const guardLast = s.moduleCalls.guardrails?.at(-1);
  const testBusy =
    guardMod?.state === 'busy' ||
    intentMod?.state === 'busy' ||
    Boolean(guardLast && (guardLast.status === 'running' || nowS - guardLast.startedAt < LINGER_S)) ||
    Object.values(s.toolCalls).some((list) => {
      const c = list[list.length - 1];
      return c && (c.status === 'running' || nowS - c.startedAt < 1.6) && /verify|test|guard|check|valid/i.test(c.toolName);
    });
  if (testBusy) return { active: true, stage: 1, intensity: 0.92 };

  const toolsMod = s.modules.tool_orchestration;
  const toolsLast = s.moduleCalls.tool_orchestration?.at(-1);
  const deployBusy =
    toolsMod?.state === 'busy' ||
    Boolean(toolsLast && (toolsLast.status === 'running' || nowS - toolsLast.startedAt < LINGER_S)) ||
    Object.values(s.agents).some(
      (a) => (a.state === 'tool_execution' || a.state === 'thinking') && /manager|worker|checkin|deploy/i.test(a.id),
    );
  if (deployBusy) return { active: true, stage: 2, intensity: 0.95 };

  const buildBusy =
    s.activeRuns > 0 ||
    Object.values(s.agents).some((a) => a.state === 'thinking' || a.state === 'tool_execution') ||
    s.packets.length > 0;
  if (buildBusy) return { active: true, stage: 0, intensity: 0.85 };

  return { active: false, stage: 0, intensity: 0 };
}

// Local 3D coordinates on the holographic monitoring display matching the 4 pipeline stages
const STAGE_POSITIONS: { pos: Vec3; color: string; label: string }[] = [
  { pos: [-0.72, 2.38, 0.08], color: '#00E5FF', label: 'BUILD' },
  { pos: [0.72, 2.38, 0.08], color: '#38BDF8', label: 'TEST' },
  { pos: [0.92, 1.72, 0.08], color: '#A855F7', label: 'DEPLOY' },
  { pos: [0.0, 0.98, 0.08], color: '#C084FC', label: 'MONITOR' },
];

/**
 * Central Holographic Workflow Core & Large Monitoring Display matching the reference centerpiece:
 * - Heavy brushed-titanium & dark gunmetal twin-pod base dock with glowing electric cyan under-glow
 * - Large rounded translucent glass holographic monitoring panel with bright cyan perimeter frame
 * - Crisp glowing Workflow Pipeline Diagram (Build, Test, Deploy, Monitor)
 * - Real-time animated stage highlight halos & traveling execution pulse driven by actual process events
 * - Recessed floor conduits carrying live pulses to the server racks and operator workstation
 */
export const WorkflowCoreDisplay = memo(function WorkflowCoreDisplay({
  position = [0, 0, -0.75],
  platformActiveRef,
  activityRef,
}: {
  position?: Vec3;
  platformActiveRef: React.RefObject<boolean>;
  activityRef: React.MutableRefObject<number>;
}) {
  const reducedMotion = useReducedMotion();
  const displayTex = useMemo(() => getWorkflowDisplayTexture(), []);

  const borderMatRef = useRef<MeshStandardMaterial>(null);
  const baseGlowRef = useRef<MeshStandardMaterial>(null);
  const screenMatRef = useRef<MeshStandardMaterial>(null);
  const pulseOrbRef = useRef<Mesh>(null);
  const stageHaloRefs = useRef<(MeshBasicMaterial | null)[]>([]);
  const conduitOrbLeftRef = useRef<Mesh>(null);
  const conduitOrbRightRef = useRef<Mesh>(null);

  // Smooth execution pulse spline tracing Top -> Build -> Test -> Gate -> Deploy -> Monitor
  const flowCurve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(0.0, 3.12, 0.09),
        new Vector3(-0.72, 2.38, 0.09),
        new Vector3(0.72, 2.38, 0.09),
        new Vector3(0.0, 1.72, 0.09),
        new Vector3(0.92, 1.72, 0.09),
        new Vector3(0.0, 0.98, 0.09),
      ]),
    [],
  );

  const leftConduit = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-1.85, 0.04, 0.1),
        new Vector3(-2.55, 0.04, 0.85),
        new Vector3(-3.45, 0.04, -1.1),
      ]),
    [],
  );
  const rightConduit = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(1.85, 0.04, 0.0),
        new Vector3(2.85, 0.04, -0.85),
        new Vector3(4.85, 0.04, -0.7),
      ]),
    [],
  );

  const tmpPos = useMemo(() => new Vector3(), []);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const nowS = Date.now() / 1000;

    const live = resolveLiveWorkflowStage(nowS);
    const active = live.active || Boolean(platformActiveRef.current);
    const targetIntensity = active ? Math.max(0.85, live.intensity) : 0;

    const rate = 1 - Math.exp(-6.0 * dt);
    activityRef.current += (targetIntensity - activityRef.current) * rate;
    const energy = activityRef.current;

    // Determine active stage: live telemetry stage when running, gentle cycle when idle
    const highlightedStage: WorkflowStageIndex = live.active
      ? live.stage
      : ((Math.floor(t * 0.45) % 4) as WorkflowStageIndex);

    if (borderMatRef.current) {
      borderMatRef.current.emissiveIntensity = 2.4 + energy * (1.2 + 0.4 * Math.sin(t * 6.0));
    }
    if (baseGlowRef.current) {
      baseGlowRef.current.emissiveIntensity = 2.3 + energy * (1.1 + 0.4 * Math.sin(t * 5.0));
    }
    if (screenMatRef.current) {
      screenMatRef.current.emissiveIntensity = 1.05 + energy * 0.45;
    }

    // Highlight active stage node halo
    stageHaloRefs.current.forEach((mat, i) => {
      if (!mat) return;
      const isCurrent = i === highlightedStage;
      mat.opacity = isCurrent
        ? (active ? 0.62 + 0.25 * Math.sin(t * 7.5) : 0.28 + 0.1 * Math.sin(t * 3.0))
        : 0.04;
    });

    // Traveling execution pulse orb moving through the holographic workflow graph
    if (pulseOrbRef.current && !reducedMotion) {
      const speed = active ? 0.58 : 0.16;
      const u = (t * speed) % 1;
      flowCurve.getPointAt(u, tmpPos);
      pulseOrbRef.current.position.copy(tmpPos);
      pulseOrbRef.current.scale.setScalar(active ? 1.15 + 0.25 * Math.sin(t * 10) : 0.72);
    }

    // Floor data pulses flowing to workstation & server racks during active process execution
    if (conduitOrbLeftRef.current) {
      const show = !reducedMotion && energy > 0.1;
      conduitOrbLeftRef.current.visible = show;
      if (show) {
        leftConduit.getPointAt((t * 0.85) % 1, tmpPos);
        conduitOrbLeftRef.current.position.copy(tmpPos);
      }
    }
    if (conduitOrbRightRef.current) {
      const show = !reducedMotion && energy > 0.1;
      conduitOrbRightRef.current.visible = show;
      if (show) {
        rightConduit.getPointAt((t * 0.78 + 0.4) % 1, tmpPos);
        conduitOrbRightRef.current.position.copy(tmpPos);
      }
    }
  });

  const panelW = 4.25;
  const panelH = 3.18;
  const panelY = 2.12;

  return (
    <group position={position}>
      {/* ================================================================================= */}
      {/* 1. SCULPTED HEAVY METALLIC HOLOGRAPHIC BASE DOCK (y = 0 to y = 0.56) */}
      {/* ================================================================================= */}
      {/* Continuous glowing cyan floor under-glow */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.85, 1.38]} />
        <meshBasicMaterial color="#00B8FF" transparent opacity={0.2} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Main Dark Gunmetal Recessed Center Trough */}
      <RoundedBox args={[3.45, 0.42, 0.82]} radius={0.05} smoothness={2} position={[0, 0.23, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#111827" roughness={0.32} metalness={0.86} />
      </RoundedBox>
      {/* Brushed-steel front fascia accent bar */}
      <mesh position={[0, 0.34, 0.415]}>
        <boxGeometry args={[2.9, 0.06, 0.024]} />
        <meshStandardMaterial color="#64748B" roughness={0.24} metalness={0.92} />
      </mesh>

      {/* Left & Right Heavy Brushed-Titanium End-Cap Pods (exact reference silhouette) */}
      {[-1.88, 1.88].map((px, i) => (
        <group key={i} position={[px, 0, 0]}>
          <RoundedBox args={[0.92, 0.52, 0.96]} radius={0.08} smoothness={2} position={[0, 0.28, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#334155" roughness={0.26} metalness={0.9} />
          </RoundedBox>
          <RoundedBox args={[0.76, 0.08, 0.82]} radius={0.03} position={[0, 0.55, 0]}>
            <meshStandardMaterial color="#64748B" roughness={0.22} metalness={0.92} />
          </RoundedBox>
        </group>
      ))}

      {/* Continuous Electric Cyan Base Rim Strip */}
      <mesh position={[0, 0.055, 0.47]}>
        <boxGeometry args={[4.55, 0.06, 0.04]} />
        <meshStandardMaterial ref={baseGlowRef} color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.5} roughness={0.14} />
      </mesh>
      <mesh position={[0, 0.055, -0.47]}>
        <boxGeometry args={[4.55, 0.06, 0.04]} />
        <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.1} roughness={0.14} />
      </mesh>

      {/* Emitter Slot Glow directly beneath Glass Display */}
      <mesh position={[0, 0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.15, 0.24]} />
        <meshBasicMaterial color="#38E8FF" transparent opacity={0.78} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* ================================================================================= */}
      {/* 2. LARGE TRANSPARENT HOLOGRAPHIC WORKFLOW MONITORING DISPLAY */}
      {/* ================================================================================= */}
      {/* Translucent Precision Glass Backing Volume */}
      <RoundedBox args={[panelW, panelH, 0.09]} radius={0.08} smoothness={2} position={[0, panelY, 0]}>
        <meshStandardMaterial
          color="#38BDF8"
          emissive="#0284C7"
          emissiveIntensity={0.45}
          transparent
          opacity={0.16}
          roughness={0.08}
          metalness={0.22}
          depthWrite={false}
        />
      </RoundedBox>

      {/* Luminous Outer Neon Cyan Glass Frame Tubing (4 edges) */}
      {[
        { pos: [0, panelY + panelH / 2, 0] as Vec3, args: [panelW - 0.08, 0.055, 0.1] as Vec3 },
        { pos: [0, panelY - panelH / 2, 0] as Vec3, args: [panelW - 0.08, 0.055, 0.1] as Vec3 },
        { pos: [-panelW / 2, panelY, 0] as Vec3, args: [0.055, panelH - 0.08, 0.1] as Vec3 },
        { pos: [panelW / 2, panelY, 0] as Vec3, args: [0.055, panelH - 0.08, 0.1] as Vec3 },
      ].map((bar, i) => (
        <mesh key={i} position={bar.pos}>
          <boxGeometry args={bar.args} />
          <meshStandardMaterial
            ref={i === 0 ? borderMatRef : undefined}
            color="#BAE6FD"
            emissive="#00E5FF"
            emissiveIntensity={2.6}
            roughness={0.12}
          />
        </mesh>
      ))}

      {/* Double-Sided Glowing Workflow Pipeline Diagram (Build, Test, Deploy, Monitor) */}
      <mesh position={[0, panelY, 0.052]}>
        <planeGeometry args={[panelW - 0.16, panelH - 0.16]} />
        {displayTex ? (
          <meshStandardMaterial
            ref={screenMatRef}
            map={displayTex}
            emissive="#FFFFFF"
            emissiveMap={displayTex}
            emissiveIntensity={1.15}
            transparent
            opacity={0.94}
            roughness={0.15}
            side={DoubleSide}
          />
        ) : (
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.0} transparent opacity={0.8} side={DoubleSide} />
        )}
      </mesh>

      {/* Dynamic Stage Execution Highlight Halos for BUILD / TEST / DEPLOY / MONITOR */}
      {STAGE_POSITIONS.map((st, idx) => (
        <mesh key={st.label} position={st.pos}>
          <planeGeometry args={[1.05, 0.44]} />
          <meshBasicMaterial
            ref={(el) => {
              stageHaloRefs.current[idx] = el;
            }}
            color={st.color}
            transparent
            opacity={0.12}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Animated Glowing Process Execution Pulse Orb Traveling Along the Workflow Graph */}
      <mesh ref={pulseOrbRef} position={[0, 2.38, 0.09]}>
        <sphereGeometry args={[0.085, 14, 12]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* ================================================================================= */}
      {/* 3. SUBTLE FLOOR TELEMETRY CONDUITS & ACTIVE EXECUTION PACKETS */}
      {/* ================================================================================= */}
      {/* Left conduit to Workstation & Racks */}
      <mesh position={[-2.55, 0.008, 0.35]} rotation={[0, -0.55, 0]}>
        <boxGeometry args={[1.85, 0.01, 0.06]} />
        <meshStandardMaterial color="#38BDF8" emissive="#00B8FF" emissiveIntensity={1.2} />
      </mesh>
      {/* Right conduit to Server Racks & Purple Monolith */}
      <mesh position={[3.15, 0.008, -0.55]} rotation={[0, 0.35, 0]}>
        <boxGeometry args={[2.6, 0.01, 0.06]} />
        <meshStandardMaterial color="#C084FC" emissive="#A855F7" emissiveIntensity={1.2} />
      </mesh>

      <mesh ref={conduitOrbLeftRef} visible={false}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#38E8FF" transparent opacity={0.92} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={conduitOrbRightRef} visible={false}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#C084FC" transparent opacity={0.92} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
});
