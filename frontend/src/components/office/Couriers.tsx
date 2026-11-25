import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { Group } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { STATE_STYLES, agentRole, formatCount } from '../command/agentStateStyles';
import { HumanCharacter, type HumanPoseInput } from './HumanCharacter';
import {
  getEmployeeAppearance,
  resolveEmployeeDirective,
  type EmployeeAppearance,
  type TaskDirective,
} from './employeeWorkflow';
import {
  buildNavGrid,
  computeAvoidanceOffset,
  findOfficePath,
  type NavGrid,
  type Point2D,
  type Waypoint3D,
} from './officePathfinding';
import { OFFICE_FLOOR_Y, type OfficeLayout, type Vec3 } from './officeLayout';
import type { CampusActivityRefs } from './ExternalCampus';
import { getDeskEquipment } from './Desk';

/**
 * Knowledge Worker & Office Boy Courier Architecture:
 * 1. Seated Employees: Every desk agent sits permanently in their chair at their workstation.
 *    They never stand up, walk through aisles, or cross bridges to fetch data. When a task
 *    or simulation is active, they type intensely on their keyboard and interact with their screens.
 * 2. Office Boy / Courier Runners: When an employee needs external data or tool execution
 *    (Tool Orchestration, Memory, Operations & Safety, Process Studio, Content Studio, or team sync):
 *    - The seated employee instructs the dedicated Office Boy / Courier.
 *    - The Office Boy moves to the employee's desk to receive the task instruction.
 *    - The Office Boy navigates along office aisles, exits through the wall portal, crosses the
 *      illuminated skybridge to the external tech platform, and interacts with the hardware console.
 *    - The Office Boy walks back across the skybridge into the office, delivers the collected data
 *      directly to the seated employee's desk, and returns to standby in the office corridor.
 */

const RUNNER_WALK_SPEED = 4.8; // brisk athletic pace across office corridors & skybridges
const MIN_INTERACT_HOLD_S = 1.5; // ensures physical module interaction is clearly visible

const DELEGATION_COLOR = '#38BDF8';
const MODULE_COLOR = '#A855F7';

function shortestAngleDiff(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

interface AgentActivitySlot {
  bridgeId: string | null;
  zoneId: string | null;
}

function syncCampusActivity(
  slots: Record<string, AgentActivitySlot>,
  activityRef?: React.RefObject<CampusActivityRefs>,
) {
  const target = activityRef?.current;
  if (!target) return;
  target.activeBridges.clear();
  target.activeZones.clear();
  for (const s of Object.values(slots)) {
    if (s.bridgeId) target.activeBridges.add(s.bridgeId);
    if (s.zoneId) target.activeZones.add(s.zoneId);
  }
}

function zoneRouteColor(layout: OfficeLayout, zoneId?: string): string {
  if (!zoneId) return DELEGATION_COLOR;
  const z = layout.externalZones.find((ez) => ez.id === zoneId);
  return z?.accent ?? MODULE_COLOR;
}

export interface RunnerDispatch {
  taskKey: string;
  agentId: string;
  agentName: string;
  directive: TaskDirective;
  status: 'pending' | 'in_transit' | 'interacting' | 'delivering' | 'delivered';
  assignedRunnerId?: string;
  updatedAt: number;
}

// Dedicated appearances for the agile Office Boy / Courier runners
const RUNNER_APPEARANCES: EmployeeAppearance[] = [
  {
    skin: '#F0C7A6',
    hair: '#1E1B18',
    hairStyle: 'short',
    top: '#0EA5E9', // vibrant tech courier cyan
    jacket: '#1E293B', // dark slate service vest
    pants: '#0F172A', // dark trousers
    shoes: '#F8FAFC', // athletic white sneakers
    hasGlasses: false,
    idleStyle: 'reviewing',
    displayFirstName: 'Leo',
  },
  {
    skin: '#C8936D',
    hair: '#111827',
    hairStyle: 'fade',
    top: '#6366F1', // indigo courier polo
    jacket: '#18181B',
    pants: '#1E293B',
    shoes: '#E2E8F0',
    hasGlasses: true,
    idleStyle: 'reading',
    displayFirstName: 'Sam',
  },
];

// =========================================================================================
// 1. SEATED EMPLOYEE ACTOR (Knowledge Worker - Stays Seated at Desk at All Times)
// =========================================================================================

interface SeatedEmployeeProps {
  id: string;
  layout: OfficeLayout;
  showLabels: boolean;
  indexSeed: number;
  runnerMissionsRef: React.MutableRefObject<Record<string, { runnerName: string; label: string; phase: string } | null>>;
  recentDeliveriesRef: React.MutableRefObject<Record<string, { label: string; time: number }>>;
}

const SeatedEmployeeActor = memo(function SeatedEmployeeActor({
  id,
  layout,
  showLabels,
  indexSeed,
  runnerMissionsRef,
  recentDeliveriesRef,
}: SeatedEmployeeProps) {
  const agent = useTelemetryStore((s) => s.agents[id]);
  const selected = useTelemetryStore((s) => s.selectedAgentId === id);
  const selectAgent = useTelemetryStore((s) => s.selectAgent);

  const appearance = useMemo(() => getEmployeeAppearance(id), [id]);
  const equipment = useMemo(() => getDeskEquipment(id), [id]);
  const deskPos = layout.desks[id] ?? ([0, OFFICE_FLOOR_Y, 0] as Vec3);
  const deskYaw = layout.deskRotations[id] ?? Math.PI;
  // Exact seated position directly in the ergonomic desk chair
  const chairPos = useMemo<Vec3>(() => [deskPos[0], deskPos[1], deskPos[2] + 0.5], [deskPos]);

  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);

  const [tagState, setTagState] = useState<{
    statusText: string;
    taskLabel: string | null;
    completedLabel: string | null;
  }>({
    statusText: equipment === 'laptop' ? 'Laptop workstation' : equipment === 'hybrid' ? 'Multi-screen setup' : 'Monitor workstation',
    taskLabel: null,
    completedLabel: null,
  });

  const poseRef = useRef<HumanPoseInput>({
    phase: 'seated_idle',
    activity: equipment === 'laptop' ? 'coding' : 'data_analysis',
    standBlend: 0, // Permanently seated in chair (0 = seated)
    walkSpeed: 0,
    seed: indexSeed * 1.73,
    workingAtDesk: false,
    workEquipment: equipment,
  });

  const lastTagKey = useRef('');

  useFrame(() => {
    const store = useTelemetryStore.getState();
    const liveAgent = store.agents[id];
    if (!liveAgent) return;

    // Resolve live directive
    const liveDirective = resolveEmployeeDirective(
      id,
      liveAgent,
      layout,
      store.toolCalls,
      store.moduleCalls,
      store.packets,
      store.agentOrder,
      Date.now(),
    );

    const isSimulating = store.isSimulating;
    // Active working states: simulation active, or live agent execution, or active directive
    const isActivelyWorking =
      isSimulating ||
      liveAgent.state === 'thinking' ||
      liveAgent.state === 'tool_execution' ||
      liveAgent.state === 'running' ||
      liveAgent.state === 'waiting' ||
      Boolean(liveDirective);

    // Knowledge worker types at desk keyboard & reviews monitor while seated
    poseRef.current.standBlend = 0; // Strictly seated in chair
    poseRef.current.phase = 'seated_idle';
    poseRef.current.walkSpeed = 0;
    poseRef.current.workingAtDesk = isActivelyWorking;
    poseRef.current.workEquipment = equipment;
    poseRef.current.activity = liveDirective?.activity ?? (equipment === 'laptop' ? 'coding' : 'data_analysis');

    // Check if Office Boy runner is active for this agent
    const activeMission = runnerMissionsRef.current[id];
    const recentDelivery = recentDeliveriesRef.current[id];
    const hasRecentDelivery = recentDelivery && Date.now() - recentDelivery.time < 5000;

    let statusText = equipment === 'laptop' ? 'Laptop workstation' : equipment === 'hybrid' ? 'Multi-screen setup' : 'Monitor workstation';
    let taskLabel: string | null = null;
    let completedLabel: string | null = null;

    if (activeMission) {
      statusText = `Instructed ${activeMission.runnerName}`;
      taskLabel = activeMission.label;
    } else if (hasRecentDelivery) {
      statusText = 'Received external data';
      completedLabel = recentDelivery.label;
    } else if (liveDirective?.targetKind === 'desk') {
      statusText = equipment === 'laptop' ? 'Coding on laptop' : equipment === 'hybrid' ? 'Multi-screen workflow' : 'Working on monitor';
      taskLabel = liveDirective.label;
    } else if (isSimulating) {
      statusText = equipment === 'laptop' ? 'Active simulation (laptop)' : equipment === 'hybrid' ? 'Active simulation (hybrid)' : 'Active simulation (monitor)';
      taskLabel = 'Simulating agent workflow';
    } else if (liveAgent.state === 'thinking') {
      statusText = equipment === 'laptop' ? 'Analyzing on laptop' : 'Analyzing requirements';
    } else if (liveAgent.state === 'tool_execution') {
      statusText = equipment === 'laptop' ? 'Processing on laptop' : 'Processing on monitor';
    } else if (liveAgent.state === 'waiting') {
      statusText = 'Awaiting input';
    } else if (liveAgent.state === 'idle') {
      statusText = equipment === 'laptop' ? 'Ready (laptop)' : 'Ready for assignment';
    }

    const tagKey = `${statusText}|${taskLabel ?? ''}|${completedLabel ?? ''}`;
    if (tagKey !== lastTagKey.current) {
      lastTagKey.current = tagKey;
      setTagState({ statusText, taskLabel, completedLabel });
    }
  });

  if (!agent) return null;
  const isSimulating = useTelemetryStore((s) => s.isSimulating);
  const style = STATE_STYLES[agent.state];
  const role = agentRole(id);
  const isWorking =
    isSimulating ||
    agent.state === 'thinking' ||
    agent.state === 'tool_execution' ||
    agent.state === 'running' ||
    agent.state === 'waiting';
  const showTag = showLabels || hovered || selected || isWorking || agent.state === 'error';

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectAgent(id, 'office');
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = on ? 'pointer' : '';
    setHovered(on);
  };

  return (
    <group
      ref={groupRef}
      position={chairPos}
      rotation={[0, deskYaw, 0]}
      onClick={onClick}
      onDoubleClick={onClick}
      onPointerOver={hover(true)}
      onPointerOut={hover(false)}
    >
      <HumanCharacter appearance={appearance} poseRef={poseRef} />

      {/* Floating agent status card unhiding employee face and body */}
      {showTag && (
        <Html position={[0, 2.95, 0]} center distanceFactor={14} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag relative flex min-w-[158px] max-w-[245px] flex-col rounded-xl border px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all ${selected
              ? 'border-blue-500/90 dark:border-blue-400/90 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 shadow-blue-500/15'
              : 'border-stone-300/90 dark:border-slate-700/80 bg-white/92 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100'
              }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11.5px] font-semibold text-slate-900 dark:text-white">
                {appearance.displayFirstName} · <span className="font-mono text-[10.5px] text-slate-600 dark:text-slate-400">{agent.id}</span>
              </span>
              <span className="rounded bg-stone-100 dark:bg-slate-800 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300">
                {role}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px]">
              <span className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} />
                {tagState.statusText}
              </span>
              <span className="font-mono text-[9.5px] text-slate-500 dark:text-slate-400">
                {agent.toolCallCount} tools · {formatCount(agent.tokens.total)} tok
              </span>
            </div>
            {(tagState.taskLabel || tagState.completedLabel) && (
              <div
                className={`mt-0.5 truncate border-t border-stone-200 dark:border-slate-700/70 pt-0.5 font-mono text-[9.5px] ${tagState.completedLabel ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-cyan-400'
                  }`}
              >
                {tagState.completedLabel ? `✓ ${tagState.completedLabel}` : `→ ${tagState.taskLabel}`}
              </div>
            )}
            {/* Downward indicator pointer to employee head */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0 w-0 border-x-4 border-x-transparent border-t-4 border-t-stone-300 dark:border-t-slate-700" />
          </div>
        </Html>
      )}
    </group>
  );
});

// =========================================================================================
// 2. OFFICE BOY / COURIER RUNNER ACTOR (Handles physical dispatches, bridges, and delivery)
// =========================================================================================

type RunnerPhase =
  | 'standby'
  | 'walking_to_desk'
  | 'receiving_instruction'
  | 'walking_to_resource'
  | 'interacting'
  | 'walking_to_delivery'
  | 'delivering'
  | 'returning_to_standby';

interface RunnerActorProps {
  runnerId: string;
  appearance: EmployeeAppearance;
  standbyPos: Vec3;
  layout: OfficeLayout;
  navGrid: NavGrid;
  sharedPositions: React.MutableRefObject<Record<string, Point2D>>;
  activitySlots: React.MutableRefObject<Record<string, AgentActivitySlot>>;
  activityRef?: React.RefObject<CampusActivityRefs>;
  dispatchesRef: React.MutableRefObject<Record<string, RunnerDispatch>>;
  runnerMissionsRef: React.MutableRefObject<Record<string, { runnerName: string; label: string; phase: string } | null>>;
  recentDeliveriesRef: React.MutableRefObject<Record<string, { label: string; time: number }>>;
  laneOffset: number;
}

const OfficeRunnerActor = memo(function OfficeRunnerActor({
  runnerId,
  appearance,
  standbyPos,
  layout,
  navGrid,
  sharedPositions,
  activitySlots,
  activityRef,
  dispatchesRef,
  runnerMissionsRef,
  recentDeliveriesRef,
  laneOffset,
}: RunnerActorProps) {
  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);

  const [badgeState, setBadgeState] = useState<{
    phase: RunnerPhase;
    statusText: string;
    missionLabel: string | null;
    pathPoints: [number, number, number][] | null;
    pathColor: string;
  }>({
    phase: 'standby',
    statusText: 'Standby in office',
    missionLabel: null,
    pathPoints: null,
    pathColor: DELEGATION_COLOR,
  });

  const actor = useRef<{
    phase: RunnerPhase;
    phaseTime: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    standBlend: number;
    activeDispatch: RunnerDispatch | null;
    waypoints: Waypoint3D[];
    waypointIndex: number;
    interactHeldS: number;
    activeBridgeId: string | null;
    activeZoneId: string | null;
  }>({
    phase: 'standby',
    phaseTime: 0,
    x: standbyPos[0],
    y: standbyPos[1],
    z: standbyPos[2],
    yaw: Math.PI,
    standBlend: 1, // Standing upright on floor
    activeDispatch: null,
    waypoints: [],
    waypointIndex: 0,
    interactHeldS: 0,
    activeBridgeId: null,
    activeZoneId: null,
  });

  const poseRef = useRef<HumanPoseInput>({
    phase: 'seated_idle',
    activity: 'coding',
    standBlend: 1, // Always on feet
    walkSpeed: 0,
    seed: 42.5,
    workingAtDesk: false,
  });

  const lastBadgeKey = useRef('');

  useEffect(
    () => () => {
      delete sharedPositions.current[runnerId];
      delete activitySlots.current[runnerId];
      syncCampusActivity(activitySlots.current, activityRef);
    },
    [runnerId, sharedPositions, activitySlots, activityRef],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const a = actor.current;
    a.phaseTime += dt;

    let walkSpeedNorm = 0;
    let currentBridgeId: string | null = null;
    let currentZoneId: string | null = null;

    // -------------------------------------------------------------------------------------
    // Runner State Machine: Standby -> Instruction -> Bridge Transit -> Module -> Delivery
    // -------------------------------------------------------------------------------------
    switch (a.phase) {
      case 'standby': {
        a.x += (standbyPos[0] - a.x) * Math.min(1, dt * 6);
        a.y += (standbyPos[1] - a.y) * Math.min(1, dt * 8);
        a.z += (standbyPos[2] - a.z) * Math.min(1, dt * 6);
        a.yaw += shortestAngleDiff(a.yaw, Math.PI) * Math.min(1, dt * 6);
        a.standBlend = 1;

        // Check if there is an unassigned pending dispatch from any seated employee
        const pendingKey = Object.keys(dispatchesRef.current).find(
          (k) => dispatchesRef.current[k].status === 'pending',
        );

        if (pendingKey) {
          const dispatch = dispatchesRef.current[pendingKey];
          dispatch.status = 'in_transit';
          dispatch.assignedRunnerId = runnerId;
          dispatch.updatedAt = Date.now();
          a.activeDispatch = dispatch;

          // Notify employee of runner assignment
          runnerMissionsRef.current[dispatch.agentId] = {
            runnerName: appearance.displayFirstName,
            label: dispatch.directive.label,
            phase: 'dispatched',
          };

          const deskStand = layout.deskStandPoints[dispatch.agentId] ?? [0, OFFICE_FLOOR_Y, 0];
          const distToDesk = Math.hypot(deskStand[0] - a.x, deskStand[2] - a.z);

          if (distToDesk < 0.6) {
            a.phase = 'receiving_instruction';
            a.phaseTime = 0;
          } else {
            a.waypoints = findOfficePath(navGrid, [a.x, a.y, a.z], deskStand, laneOffset);
            a.waypointIndex = 0;
            a.phase = 'walking_to_desk';
            a.phaseTime = 0;
          }
        }
        break;
      }

      case 'walking_to_desk': {
        a.standBlend = 1;
        const wp = a.waypoints[a.waypointIndex];
        if (!wp) {
          a.phase = 'receiving_instruction';
          a.phaseTime = 0;
          break;
        }

        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.18) {
          a.y = wp.y;
          a.waypointIndex += 1;
          if (a.waypointIndex >= a.waypoints.length) {
            a.phase = 'receiving_instruction';
            a.phaseTime = 0;
          }
          break;
        }

        const avoid = computeAvoidanceOffset(runnerId, { x: a.x, z: a.z }, sharedPositions.current, 0.88, false);
        const dirX = dx / dist + avoid.x;
        const dirZ = dz / dist + avoid.z;
        const mag = Math.hypot(dirX, dirZ) || 1;
        const step = Math.min(dist, RUNNER_WALK_SPEED * dt);
        a.x += (dirX / mag) * step;
        a.z += (dirZ / mag) * step;
        a.y += (wp.y - a.y) * Math.min(1, dt * 10);

        const targetYaw = Math.atan2(dirX, dirZ);
        a.yaw += shortestAngleDiff(a.yaw, targetYaw) * Math.min(1, dt * 11);
        walkSpeedNorm = Math.min(1, step / Math.max(0.001, RUNNER_WALK_SPEED * dt));
        break;
      }

      case 'receiving_instruction': {
        a.standBlend = 1;
        if (a.activeDispatch) {
          const deskPos = layout.desks[a.activeDispatch.agentId];
          if (deskPos) {
            const chairPos: Vec3 = [deskPos[0], deskPos[1], deskPos[2] + 0.5];
            const targetYaw = Math.atan2(chairPos[0] - a.x, chairPos[2] - a.z);
            a.yaw += shortestAngleDiff(a.yaw, targetYaw) * Math.min(1, dt * 10);
          }
        }

        // Brief handover pause (~0.35s) receiving task assignment at the desk
        if (a.phaseTime >= 0.35) {
          if (a.activeDispatch) {
            a.waypoints = findOfficePath(
              navGrid,
              [a.x, a.y, a.z],
              a.activeDispatch.directive.destination,
              laneOffset,
            );
            a.waypointIndex = 0;
            a.phase = 'walking_to_resource';
            a.phaseTime = 0;
          } else {
            a.phase = 'returning_to_standby';
            a.phaseTime = 0;
          }
        }
        break;
      }

      case 'walking_to_resource': {
        a.standBlend = 1;
        currentBridgeId = a.waypoints.find((w) => w.bridgeId)?.bridgeId ?? null;
        if (a.activeDispatch?.directive.zoneId) {
          currentZoneId = a.activeDispatch.directive.zoneId;
        }

        const wp = a.waypoints[a.waypointIndex];
        if (!wp) {
          a.phase = 'interacting';
          a.phaseTime = 0;
          a.interactHeldS = 0;
          break;
        }

        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.18) {
          a.y = wp.y;
          a.waypointIndex += 1;
          if (a.waypointIndex >= a.waypoints.length) {
            a.phase = 'interacting';
            a.phaseTime = 0;
            a.interactHeldS = 0;
          }
          break;
        }

        const onBridge = Boolean(wp.bridgeId);
        const avoid = computeAvoidanceOffset(runnerId, { x: a.x, z: a.z }, sharedPositions.current, 0.88, onBridge);
        const dirX = dx / dist + avoid.x;
        const dirZ = dz / dist + avoid.z;
        const mag = Math.hypot(dirX, dirZ) || 1;
        const step = Math.min(dist, RUNNER_WALK_SPEED * dt);
        a.x += (dirX / mag) * step;
        a.z += (dirZ / mag) * step;

        const frac = Math.min(1, step / Math.max(0.001, dist));
        a.y += (wp.y - a.y) * Math.max(frac, Math.min(1, dt * 10));

        const targetYaw = Math.atan2(dirX, dirZ);
        a.yaw += shortestAngleDiff(a.yaw, targetYaw) * Math.min(1, dt * 11);
        walkSpeedNorm = Math.min(1, step / Math.max(0.001, RUNNER_WALK_SPEED * dt));
        break;
      }

      case 'interacting': {
        a.standBlend = 1;
        a.interactHeldS += dt;
        if (a.activeDispatch) {
          currentZoneId = a.activeDispatch.directive.zoneId ?? null;
          a.x += (a.activeDispatch.directive.destination[0] - a.x) * Math.min(1, dt * 6);
          a.y += (a.activeDispatch.directive.destination[1] - a.y) * Math.min(1, dt * 8);
          a.z += (a.activeDispatch.directive.destination[2] - a.z) * Math.min(1, dt * 6);
          a.yaw += shortestAngleDiff(a.yaw, a.activeDispatch.directive.facingYaw) * Math.min(1, dt * 8);
        }

        // Complete data collection after holding for minimum interaction duration
        if (a.interactHeldS >= MIN_INTERACT_HOLD_S) {
          if (a.activeDispatch) {
            const deskStand = layout.deskStandPoints[a.activeDispatch.agentId] ?? [0, OFFICE_FLOOR_Y, 0];
            a.waypoints = findOfficePath(navGrid, [a.x, a.y, a.z], deskStand, -laneOffset);
            a.waypointIndex = 0;
            a.phase = 'walking_to_delivery';
            a.phaseTime = 0;
          } else {
            a.phase = 'returning_to_standby';
            a.phaseTime = 0;
          }
        }
        break;
      }

      case 'walking_to_delivery': {
        a.standBlend = 1;
        currentBridgeId = a.waypoints.find((w) => w.bridgeId)?.bridgeId ?? null;
        if (a.activeDispatch?.directive.zoneId) {
          currentZoneId = a.activeDispatch.directive.zoneId;
        }

        const wp = a.waypoints[a.waypointIndex];
        if (!wp) {
          a.phase = 'delivering';
          a.phaseTime = 0;
          break;
        }

        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.18) {
          a.y = wp.y;
          a.waypointIndex += 1;
          if (a.waypointIndex >= a.waypoints.length) {
            a.phase = 'delivering';
            a.phaseTime = 0;
          }
          break;
        }

        const onBridge = Boolean(wp.bridgeId);
        const avoid = computeAvoidanceOffset(runnerId, { x: a.x, z: a.z }, sharedPositions.current, 0.88, onBridge);
        const dirX = dx / dist + avoid.x;
        const dirZ = dz / dist + avoid.z;
        const mag = Math.hypot(dirX, dirZ) || 1;
        const step = Math.min(dist, RUNNER_WALK_SPEED * dt);
        a.x += (dirX / mag) * step;
        a.z += (dirZ / mag) * step;

        const frac = Math.min(1, step / Math.max(0.001, dist));
        a.y += (wp.y - a.y) * Math.max(frac, Math.min(1, dt * 10));

        const targetYaw = Math.atan2(dirX, dirZ);
        a.yaw += shortestAngleDiff(a.yaw, targetYaw) * Math.min(1, dt * 11);
        walkSpeedNorm = Math.min(1, step / Math.max(0.001, RUNNER_WALK_SPEED * dt));
        break;
      }

      case 'delivering': {
        a.standBlend = 1;
        if (a.activeDispatch) {
          const deskPos = layout.desks[a.activeDispatch.agentId];
          if (deskPos) {
            const chairPos: Vec3 = [deskPos[0], deskPos[1], deskPos[2] + 0.5];
            const targetYaw = Math.atan2(chairPos[0] - a.x, chairPos[2] - a.z);
            a.yaw += shortestAngleDiff(a.yaw, targetYaw) * Math.min(1, dt * 10);
          }

          // Mark dispatch delivered and register completion for the seated employee
          a.activeDispatch.status = 'delivered';
          recentDeliveriesRef.current[a.activeDispatch.agentId] = {
            label: a.activeDispatch.directive.label,
            time: Date.now(),
          };
          runnerMissionsRef.current[a.activeDispatch.agentId] = null;
        }

        // Stand before the seated employee for ~0.7s handing over the data packet
        if (a.phaseTime >= 0.7) {
          a.waypoints = findOfficePath(navGrid, [a.x, a.y, a.z], standbyPos, 0);
          a.waypointIndex = 0;
          a.phase = 'returning_to_standby';
          a.phaseTime = 0;
          a.activeDispatch = null;
        }
        break;
      }

      case 'returning_to_standby': {
        a.standBlend = 1;
        const wp = a.waypoints[a.waypointIndex];
        if (!wp) {
          a.phase = 'standby';
          a.phaseTime = 0;
          break;
        }

        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.22) {
          a.y = wp.y;
          a.waypointIndex += 1;
          if (a.waypointIndex >= a.waypoints.length) {
            a.phase = 'standby';
            a.phaseTime = 0;
          }
          break;
        }

        const avoid = computeAvoidanceOffset(runnerId, { x: a.x, z: a.z }, sharedPositions.current, 0.88, false);
        const dirX = dx / dist + avoid.x;
        const dirZ = dz / dist + avoid.z;
        const mag = Math.hypot(dirX, dirZ) || 1;
        const step = Math.min(dist, RUNNER_WALK_SPEED * dt);
        a.x += (dirX / mag) * step;
        a.z += (dirZ / mag) * step;
        a.y += (wp.y - a.y) * Math.min(1, dt * 10);

        const targetYaw = Math.atan2(dirX, dirZ);
        a.yaw += shortestAngleDiff(a.yaw, targetYaw) * Math.min(1, dt * 11);
        walkSpeedNorm = Math.min(1, step / Math.max(0.001, RUNNER_WALK_SPEED * dt));
        break;
      }
    }

    // Publish runner position for collision avoidance
    sharedPositions.current[runnerId] = { x: a.x, z: a.z };

    // Synchronize bridge & platform illumination via activitySlots
    if (a.activeBridgeId !== currentBridgeId || a.activeZoneId !== currentZoneId) {
      a.activeBridgeId = currentBridgeId;
      a.activeZoneId = currentZoneId;
      activitySlots.current[runnerId] = { bridgeId: currentBridgeId, zoneId: currentZoneId };
      syncCampusActivity(activitySlots.current, activityRef);
    }

    if (groupRef.current) {
      groupRef.current.position.set(a.x, a.y, a.z);
      groupRef.current.rotation.y = a.yaw;
    }

    // Update runner articulation pose
    const isWalking =
      a.phase === 'walking_to_desk' ||
      a.phase === 'walking_to_resource' ||
      a.phase === 'walking_to_delivery' ||
      a.phase === 'returning_to_standby';

    poseRef.current.phase = isWalking ? 'walking_to_resource' : a.phase === 'interacting' ? 'interacting' : 'seated_idle';
    poseRef.current.activity = a.activeDispatch?.directive.activity ?? 'research';
    poseRef.current.standBlend = 1;
    poseRef.current.walkSpeed = walkSpeedNorm;
    poseRef.current.workingAtDesk = false;

    // Derived status text for runner floating badge
    let statusText = 'Standby in office';
    let missionLabel: string | null = null;
    if (a.phase === 'walking_to_desk') {
      statusText = `Dispatched to ${a.activeDispatch?.agentName ?? 'Desk'}`;
      missionLabel = 'Receiving assignment';
    } else if (a.phase === 'receiving_instruction') {
      statusText = `Briefing with ${a.activeDispatch?.agentName ?? 'Agent'}`;
      missionLabel = a.activeDispatch?.directive.label ?? null;
    } else if (a.phase === 'walking_to_resource') {
      statusText = a.activeDispatch?.directive.travelLabel ?? 'Crossing skybridge';
      missionLabel = a.activeDispatch?.directive.label ?? null;
    } else if (a.phase === 'interacting') {
      statusText = a.activeDispatch?.directive.interactLabel ?? 'Collecting data';
      missionLabel = a.activeDispatch?.directive.label ?? null;
    } else if (a.phase === 'walking_to_delivery') {
      statusText = `Delivering to ${a.activeDispatch?.agentName ?? 'Desk'}`;
      missionLabel = a.activeDispatch?.directive.label ?? null;
    } else if (a.phase === 'delivering') {
      statusText = `Handing data to ${a.activeDispatch?.agentName ?? 'Agent'}`;
      missionLabel = 'Task complete';
    } else if (a.phase === 'returning_to_standby') {
      statusText = 'Returning to standby';
    }

    const showPath = (a.phase === 'walking_to_resource' || a.phase === 'walking_to_delivery') && a.waypoints.length >= 2;
    const pathColor =
      a.activeDispatch?.directive.targetKind === 'meeting'
        ? DELEGATION_COLOR
        : zoneRouteColor(layout, a.activeDispatch?.directive.zoneId ?? currentZoneId ?? undefined);

    const badgeKey = `${a.phase}|${statusText}|${missionLabel ?? ''}|${showPath ? a.waypoints.length : 0}|${pathColor}`;
    if (badgeKey !== lastBadgeKey.current) {
      lastBadgeKey.current = badgeKey;
      setBadgeState({
        phase: a.phase,
        statusText,
        missionLabel,
        pathPoints: showPath ? a.waypoints.map((pt) => [pt.x, pt.y + 0.06, pt.z]) : null,
        pathColor,
      });
    }
  });

  const showRunnerTag = hovered || badgeState.phase !== 'standby';

  return (
    <group>
      {/* Illuminated 3D route ribbon following runner's path along corridor and skybridge */}
      {badgeState.pathPoints && (
        <Line
          points={badgeState.pathPoints}
          color={badgeState.pathColor}
          lineWidth={2.8}
          dashed
          dashSize={0.38}
          gapSize={0.2}
          transparent
          opacity={0.88}
        />
      )}

      <group
        ref={groupRef}
        position={standbyPos}
        rotation={[0, Math.PI, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <HumanCharacter appearance={appearance} poseRef={poseRef} />

        {/* Floating badge for Office Boy / Courier */}
        {showRunnerTag && (
          <Html position={[0, 2.45, 0]} center distanceFactor={14} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
            <div className="office-tag relative flex min-w-[145px] max-w-[230px] flex-col rounded-xl border border-sky-400/80 dark:border-sky-500/80 bg-white/95 dark:bg-slate-900/95 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 shadow-xl backdrop-blur-md transition-all">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold text-sky-800 dark:text-sky-300">
                  🏃 {appearance.displayFirstName}
                </span>
                <span className="rounded bg-sky-100 dark:bg-sky-950/80 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                  OFFICE RUNNER
                </span>
              </div>
              <div className="mt-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200">
                {badgeState.statusText}
              </div>
              {badgeState.missionLabel && (
                <div className="mt-0.5 truncate border-t border-stone-200 dark:border-slate-700/70 pt-0.5 font-mono text-[9px] text-cyan-700 dark:text-cyan-300">
                  {badgeState.missionLabel}
                </div>
              )}
              {/* Downward indicator pointer */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0 w-0 border-x-4 border-x-transparent border-t-4 border-t-sky-400 dark:border-t-sky-500" />
            </div>
          </Html>
        )}
      </group>
    </group>
  );
});

// =========================================================================================
// 3. WORKFORCE CONTROLLER (Orchestrates Seated Employees + Dedicated Office Runners)
// =========================================================================================

function EmployeeWorkforceImpl({
  layout,
  activityRef,
  showLabels = false,
}: {
  layout: OfficeLayout;
  activityRef?: React.RefObject<CampusActivityRefs>;
  showLabels?: boolean;
}) {
  const navGrid = useMemo(() => buildNavGrid(layout), [layout]);
  const sharedPositions = useRef<Record<string, Point2D>>({});
  const activitySlots = useRef<Record<string, AgentActivitySlot>>({});
  const agentIds = useMemo(() => Object.keys(layout.desks), [layout.desks]);

  // Shared dispatches queue and status registers
  const dispatchesRef = useRef<Record<string, RunnerDispatch>>({});
  const runnerMissionsRef = useRef<Record<string, { runnerName: string; label: string; phase: string } | null>>({});
  const recentDeliveriesRef = useRef<Record<string, { label: string; time: number }>>({});

  // Dynamic dispatch detection: Seated employees dispatch tasks to Office Boy runners
  useFrame(() => {
    const store = useTelemetryStore.getState();
    const now = Date.now();

    for (const agentId of agentIds) {
      const liveAgent = store.agents[agentId];
      if (!liveAgent) continue;

      const liveDirective = resolveEmployeeDirective(
        agentId,
        liveAgent,
        layout,
        store.toolCalls,
        store.moduleCalls,
        store.packets,
        store.agentOrder,
        now,
      );

      // External platforms / meeting rooms require physical data collection by the Office Runner
      if (liveDirective && (liveDirective.targetKind === 'station' || liveDirective.targetKind === 'meeting')) {
        const existing = dispatchesRef.current[liveDirective.taskKey];
        if (!existing) {
          const hasActiveForAgent = Object.values(dispatchesRef.current).some(
            (d) =>
              d.agentId === agentId &&
              (d.status === 'pending' || d.status === 'in_transit' || d.status === 'interacting' || d.status === 'delivering'),
          );

          if (!hasActiveForAgent) {
            const appearance = getEmployeeAppearance(agentId);
            dispatchesRef.current[liveDirective.taskKey] = {
              taskKey: liveDirective.taskKey,
              agentId,
              agentName: appearance.displayFirstName,
              directive: liveDirective,
              status: 'pending',
              updatedAt: now,
            };
          }
        }
      }
    }

    // Clean up delivered dispatches older than 8 seconds
    for (const [key, d] of Object.entries(dispatchesRef.current)) {
      if (d.status === 'delivered' && now - d.updatedAt > 8000) {
        delete dispatchesRef.current[key];
      }
    }
  });

  // Standby posts for the two Office Runners in the open central office corridor
  const runner1Standby = useMemo<Vec3>(() => [1.2, OFFICE_FLOOR_Y, 3.8], []);
  const runner2Standby = useMemo<Vec3>(() => [-0.8, OFFICE_FLOOR_Y, 3.8], []);

  return (
    <group>
      {/* 1. All knowledge worker employees remain permanently seated at their desks */}
      {agentIds.map((id, idx) => (
        <SeatedEmployeeActor
          key={id}
          id={id}
          layout={layout}
          showLabels={showLabels}
          indexSeed={idx + 1}
          runnerMissionsRef={runnerMissionsRef}
          recentDeliveriesRef={recentDeliveriesRef}
        />
      ))}

      {/* 2. Primary Office Runner "Leo" (Tech Courier) */}
      <OfficeRunnerActor
        runnerId="runner-1"
        appearance={RUNNER_APPEARANCES[0]}
        standbyPos={runner1Standby}
        layout={layout}
        navGrid={navGrid}
        sharedPositions={sharedPositions}
        activitySlots={activitySlots}
        activityRef={activityRef}
        dispatchesRef={dispatchesRef}
        runnerMissionsRef={runnerMissionsRef}
        recentDeliveriesRef={recentDeliveriesRef}
        laneOffset={0.18}
      />

      {/* 3. Secondary Office Runner "Sam" (Tech Courier) */}
      <OfficeRunnerActor
        runnerId="runner-2"
        appearance={RUNNER_APPEARANCES[1]}
        standbyPos={runner2Standby}
        layout={layout}
        navGrid={navGrid}
        sharedPositions={sharedPositions}
        activitySlots={activitySlots}
        activityRef={activityRef}
        dispatchesRef={dispatchesRef}
        runnerMissionsRef={runnerMissionsRef}
        recentDeliveriesRef={recentDeliveriesRef}
        laneOffset={-0.18}
      />
    </group>
  );
}

export const Couriers = memo(EmployeeWorkforceImpl);

/** Legend colors for active walking paths (team collaboration vs external infrastructure visit). */
export const COURIER_COLORS = { delegation: DELEGATION_COLOR, module: MODULE_COLOR };
