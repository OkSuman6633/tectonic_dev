import { memo, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { Group } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { STATE_STYLES, agentRole, formatCount } from '../command/agentStateStyles';
import { HumanCharacter, type HumanPoseInput } from './HumanCharacter';
import {
  getEmployeeAppearance,
  resolveEmployeeDirective,
  type EmployeePhase,
  type TaskDirective,
} from './employeeWorkflow';
import { buildNavGrid, computeAvoidanceOffset, findOfficePath, type NavGrid, type Point2D } from './officePathfinding';
import { OFFICE_FLOOR_Y, type OfficeLayout, type Vec3 } from './officeLayout';

/**
 * Human-Operated Employee Activity Controller (replaces flying robot couriers).
 * Each live agent in Tectonic is represented by an articulated 3D human employee who:
 * 1. Works naturally at their assigned desk while idle (typing, reading, reviewing).
 * 2. Reacts immediately when a real backend task, tool call, module call, or A2A collaboration starts.
 * 3. Stands up from their chair, navigates along collision-free A* floor paths with smooth turning,
 *    and avoids colliding with other walking employees.
 * 4. Performs resource-specific working animations at the destination workstation or conference table.
 * 5. Displays a brief completion reaction when done, then walks back to their desk (or directly to the next task).
 */

const WALK_SPEED = 2.85; // office floor units per second
const REACT_DURATION_S = 0.32;
const STAND_SIT_DURATION_S = 0.45;
const COMPLETE_DURATION_S = 0.65;
const MIN_INTERACT_HOLD_S = 1.35; // ensures rapid backend module calls remain visibly clear without faking tasks

const DELEGATION_COLOR = '#2563EB';
const MODULE_COLOR = '#7C3AED';

function shortestAngleDiff(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

interface ActorRuntime {
  phase: EmployeePhase;
  phaseTime: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  standBlend: number;
  directive: TaskDirective | null;
  waypoints: Point2D[];
  waypointIndex: number;
  interactHeldS: number;
  completedBanner: string | null;
}

const HumanEmployeeActor = memo(function HumanEmployeeActor({
  id,
  layout,
  navGrid,
  sharedPositions,
  showLabels,
  indexSeed,
}: {
  id: string;
  layout: OfficeLayout;
  navGrid: NavGrid;
  sharedPositions: React.MutableRefObject<Record<string, Point2D>>;
  showLabels: boolean;
  indexSeed: number;
}) {
  const agent = useTelemetryStore((s) => s.agents[id]);
  const selected = useTelemetryStore((s) => s.selectedAgentId === id);
  const selectAgent = useTelemetryStore((s) => s.selectAgent);

  const appearance = useMemo(() => getEmployeeAppearance(id), [id]);
  const deskPos = layout.desks[id] ?? ([0, OFFICE_FLOOR_Y, 0] as Vec3);
  const standPoint = layout.deskStandPoints[id] ?? ([deskPos[0], OFFICE_FLOOR_Y, deskPos[2] + 1.15] as Vec3);
  const deskYaw = layout.deskRotations[id] ?? Math.PI;
  const chairPos: Vec3 = [deskPos[0], deskPos[1], deskPos[2] + 0.5];

  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [badgeState, setBadgeState] = useState<{
    phase: EmployeePhase;
    taskLabel: string | null;
    completedLabel: string | null;
    pathPoints: [number, number, number][] | null;
    pathColor: string;
  }>({
    phase: 'seated_idle',
    taskLabel: null,
    completedLabel: null,
    pathPoints: null,
    pathColor: MODULE_COLOR,
  });

  const actor = useRef<ActorRuntime>({
    phase: 'seated_idle',
    phaseTime: 0,
    x: chairPos[0],
    y: chairPos[1],
    z: chairPos[2],
    yaw: deskYaw,
    standBlend: 0,
    directive: null,
    waypoints: [],
    waypointIndex: 0,
    interactHeldS: 0,
    completedBanner: null,
  });

  const poseRef = useRef<HumanPoseInput>({
    phase: 'seated_idle',
    activity: 'coding',
    standBlend: 0,
    walkSpeed: 0,
    seed: indexSeed * 1.73,
    workingAtDesk: false,
  });

  const lastBadgeKey = useRef('');

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const store = useTelemetryStore.getState();
    const liveAgent = store.agents[id];
    if (!liveAgent) return;

    const a = actor.current;
    a.phaseTime += dt;

    // Resolve live backend task directive from real telemetry
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

    const needsWalkTo = (d: TaskDirective | null): d is TaskDirective =>
      Boolean(d && (d.targetKind === 'station' || d.targetKind === 'meeting'));

    // Handle live task assignment / reassignment / cancellation cleanly
    if (needsWalkTo(liveDirective)) {
      const sameTarget = a.directive && a.directive.targetId === liveDirective.targetId && a.directive.targetKind === liveDirective.targetKind;
      if (!sameTarget) {
        a.directive = liveDirective;
        a.completedBanner = null;
        a.interactHeldS = 0;
        if (a.phase === 'seated_idle' || a.phase === 'sitting_down') {
          a.phase = 'reacting';
          a.phaseTime = 0;
        } else {
          // Already standing/walking/interacting -> smoothly reroute via A* directly to new resource
          a.waypoints = findOfficePath(navGrid, [a.x, OFFICE_FLOOR_Y, a.z], liveDirective.destination);
          a.waypointIndex = 0;
          a.phase = 'walking_to_resource';
          a.phaseTime = 0;
        }
      } else if (a.directive) {
        // Keep updated label/activity while staying on the same resource
        a.directive = liveDirective;
      }
    } else if (a.directive && needsWalkTo(a.directive)) {
      // Backend finished the remote resource operation
      if (a.phase === 'interacting' && a.interactHeldS >= MIN_INTERACT_HOLD_S) {
        a.completedBanner = a.directive.label;
        a.directive = null;
        a.phase = 'completing';
        a.phaseTime = 0;
      } else if (a.phase === 'reacting' || a.phase === 'standing_up') {
        // Task cancelled or finished before employee left desk -> sit back smoothly
        a.directive = null;
        a.phase = 'sitting_down';
        a.phaseTime = 0;
      }
      // If currently walking_to_resource, let them arrive and briefly interact before completing so motion never snaps
    }

    let walkSpeedNorm = 0;

    switch (a.phase) {
      case 'seated_idle': {
        a.x += (chairPos[0] - a.x) * Math.min(1, dt * 8);
        a.y += (chairPos[1] - a.y) * Math.min(1, dt * 8);
        a.z += (chairPos[2] - a.z) * Math.min(1, dt * 8);
        a.yaw += shortestAngleDiff(a.yaw, deskYaw) * Math.min(1, dt * 8);
        a.standBlend = Math.max(0, a.standBlend - dt * 3);
        break;
      }

      case 'reacting': {
        a.standBlend = Math.max(0, a.standBlend - dt * 2);
        if (a.phaseTime >= REACT_DURATION_S) {
          a.phase = 'standing_up';
          a.phaseTime = 0;
        }
        break;
      }

      case 'standing_up': {
        const p = Math.min(1, a.phaseTime / STAND_SIT_DURATION_S);
        a.standBlend = p;
        // Smoothly step out from chair onto desk stand point
        a.x = chairPos[0] + (standPoint[0] - chairPos[0]) * p;
        a.y = chairPos[1] + (standPoint[1] - chairPos[1]) * p;
        a.z = chairPos[2] + (standPoint[2] - chairPos[2]) * p;
        if (p >= 1) {
          if (a.directive && needsWalkTo(a.directive)) {
            a.waypoints = findOfficePath(navGrid, [a.x, OFFICE_FLOOR_Y, a.z], a.directive.destination);
            a.waypointIndex = 0;
            a.phase = 'walking_to_resource';
            a.phaseTime = 0;
          } else {
            a.phase = 'sitting_down';
            a.phaseTime = 0;
          }
        }
        break;
      }

      case 'walking_to_resource':
      case 'walking_back': {
        a.standBlend = 1;
        a.y += (OFFICE_FLOOR_Y - a.y) * Math.min(1, dt * 10);
        const wp = a.waypoints[a.waypointIndex];
        if (!wp) {
          if (a.phase === 'walking_to_resource') {
            a.phase = 'interacting';
            a.phaseTime = 0;
            a.interactHeldS = 0;
          } else {
            a.phase = 'sitting_down';
            a.phaseTime = 0;
          }
          break;
        }
        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.14) {
          a.waypointIndex += 1;
          if (a.waypointIndex >= a.waypoints.length) {
            if (a.phase === 'walking_to_resource') {
              a.phase = 'interacting';
              a.phaseTime = 0;
              a.interactHeldS = 0;
            } else {
              a.phase = 'sitting_down';
              a.phaseTime = 0;
            }
          }
          break;
        }

        // Pairwise collision avoidance with other walking/standing employees
        const avoid = computeAvoidanceOffset(id, { x: a.x, z: a.z }, sharedPositions.current);
        const dirX = dx / dist + avoid.x;
        const dirZ = dz / dist + avoid.z;
        const mag = Math.hypot(dirX, dirZ) || 1;
        const step = Math.min(dist, WALK_SPEED * dt);
        a.x += (dirX / mag) * step;
        a.z += (dirZ / mag) * step;

        const targetYaw = Math.atan2(dirX, dirZ);
        a.yaw += shortestAngleDiff(a.yaw, targetYaw) * Math.min(1, dt * 10);
        walkSpeedNorm = Math.min(1, step / Math.max(0.001, WALK_SPEED * dt));
        break;
      }

      case 'interacting': {
        a.standBlend = 1;
        a.interactHeldS += dt;
        if (a.directive) {
          a.x += (a.directive.destination[0] - a.x) * Math.min(1, dt * 6);
          a.z += (a.directive.destination[2] - a.z) * Math.min(1, dt * 6);
          a.yaw += shortestAngleDiff(a.yaw, a.directive.facingYaw) * Math.min(1, dt * 8);
        }
        // Complete once backend finishes AND minimum readable interaction window elapsed
        const stillSameRemote =
          liveDirective &&
          a.directive &&
          liveDirective.targetId === a.directive.targetId &&
          liveDirective.targetKind === a.directive.targetKind;
        if (!stillSameRemote && a.interactHeldS >= MIN_INTERACT_HOLD_S) {
          a.completedBanner = a.directive?.label ?? 'Task done';
          a.directive = null;
          a.phase = 'completing';
          a.phaseTime = 0;
        }
        break;
      }

      case 'completing': {
        a.standBlend = 1;
        if (a.phaseTime >= COMPLETE_DURATION_S) {
          a.completedBanner = null;
          a.waypoints = findOfficePath(navGrid, [a.x, OFFICE_FLOOR_Y, a.z], standPoint);
          a.waypointIndex = 0;
          a.phase = 'walking_back';
          a.phaseTime = 0;
        }
        break;
      }

      case 'sitting_down': {
        const p = Math.min(1, a.phaseTime / STAND_SIT_DURATION_S);
        a.standBlend = 1 - p;
        a.x = standPoint[0] + (chairPos[0] - standPoint[0]) * p;
        a.y = standPoint[1] + (chairPos[1] - standPoint[1]) * p;
        a.z = standPoint[2] + (chairPos[2] - standPoint[2]) * p;
        a.yaw += shortestAngleDiff(a.yaw, deskYaw) * Math.min(1, dt * 10);
        if (p >= 1) {
          a.phase = 'seated_idle';
          a.phaseTime = 0;
        }
        break;
      }
    }

    // Publish live floor coordinates for multi-employee collision avoidance
    sharedPositions.current[id] = { x: a.x, z: a.z };

    if (groupRef.current) {
      groupRef.current.position.set(a.x, a.y, a.z);
      groupRef.current.rotation.y = a.yaw;
    }

    // Update pose ref (zero React re-renders)
    const workingAtDesk = Boolean(liveDirective && liveDirective.targetKind === 'desk');
    poseRef.current.phase = a.phase;
    poseRef.current.activity = a.directive?.activity ?? liveDirective?.activity ?? 'coding';
    poseRef.current.standBlend = a.standBlend;
    poseRef.current.walkSpeed = walkSpeedNorm;
    poseRef.current.workingAtDesk = workingAtDesk;

    // Sync lightweight UI badge/path state only when phase or label changes
    const taskLabel = a.directive?.label ?? (workingAtDesk ? liveDirective?.label ?? null : null);
    const showPath = a.phase === 'walking_to_resource' || a.phase === 'walking_back';
    const badgeKey = `${a.phase}|${taskLabel ?? ''}|${a.completedBanner ?? ''}|${showPath ? a.waypoints.length : 0}`;
    if (badgeKey !== lastBadgeKey.current) {
      lastBadgeKey.current = badgeKey;
      setBadgeState({
        phase: a.phase,
        taskLabel,
        completedLabel: a.completedBanner,
        pathPoints:
          showPath && a.waypoints.length >= 2
            ? a.waypoints.map((pt) => [pt.x, OFFICE_FLOOR_Y + 0.035, pt.z])
            : null,
        pathColor: a.directive?.targetKind === 'meeting' ? DELEGATION_COLOR : MODULE_COLOR,
      });
    }
  });

  if (!agent) return null;
  const style = STATE_STYLES[agent.state];
  const role = agentRole(id);
  const isWorking =
    badgeState.phase !== 'seated_idle' ||
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
    <group>
      {/* Subtle floor walking-path breadcrumb shown only while employee is actively walking to a real task */}
      {badgeState.pathPoints && (
        <Line
          points={badgeState.pathPoints}
          color={badgeState.pathColor}
          lineWidth={2}
          dashed
          dashSize={0.28}
          gapSize={0.18}
          transparent
          opacity={0.55}
        />
      )}

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

        {showTag && (
          <Html position={[0, 1.88, 0]} center distanceFactor={12} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
            <div
              className={`office-tag flex min-w-[146px] max-w-[220px] flex-col rounded-xl border px-2.5 py-1.5 shadow-lg backdrop-blur-md transition-all ${
                selected
                  ? 'border-blue-500/80 bg-white/95 text-slate-900'
                  : 'border-stone-300/90 bg-white/92 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11.5px] font-semibold text-slate-900">
                  {appearance.displayFirstName} · <span className="font-mono text-[10.5px] text-slate-600">{agent.id}</span>
                </span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-stone-600">
                  {role}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px]">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} />
                  {badgeState.phase === 'walking_to_resource'
                    ? 'Walking to resource'
                    : badgeState.phase === 'interacting'
                      ? 'Working at resource'
                      : badgeState.phase === 'completing'
                        ? 'Completed'
                        : badgeState.phase === 'walking_back'
                          ? 'Returning to desk'
                          : style.label}
                </span>
                <span className="font-mono text-[9.5px] text-slate-500">
                  {agent.toolCallCount} tools · {formatCount(agent.tokens.total)} tok
                </span>
              </div>
              {(badgeState.taskLabel || badgeState.completedLabel) && (
                <div
                  className={`mt-0.5 truncate border-t border-stone-200 pt-0.5 font-mono text-[9.5px] ${
                    badgeState.completedLabel ? 'font-semibold text-emerald-700' : 'text-blue-700'
                  }`}
                >
                  {badgeState.completedLabel ? `✓ ${badgeState.completedLabel}` : `→ ${badgeState.taskLabel}`}
                </div>
              )}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
});

function EmployeeWorkforceImpl({ layout, showLabels = false }: { layout: OfficeLayout; showLabels?: boolean }) {
  const navGrid = useMemo(() => buildNavGrid(layout), [layout]);
  const sharedPositions = useRef<Record<string, Point2D>>({});
  const agentIds = useMemo(() => Object.keys(layout.desks), [layout.desks]);

  return (
    <group>
      {agentIds.map((id, idx) => (
        <HumanEmployeeActor
          key={id}
          id={id}
          layout={layout}
          navGrid={navGrid}
          sharedPositions={sharedPositions}
          showLabels={showLabels}
          indexSeed={idx + 1}
        />
      ))}
    </group>
  );
}

export const Couriers = memo(EmployeeWorkforceImpl);

/** Legend colors for active walking paths (team collaboration vs resource visit). */
export const COURIER_COLORS = { delegation: DELEGATION_COLOR, module: MODULE_COLOR };


