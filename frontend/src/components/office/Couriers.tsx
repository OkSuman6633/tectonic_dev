import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { CatmullRomCurve3, Vector3, type Group, type Mesh, type MeshBasicMaterial, type Sprite } from 'three';
import { shallow } from 'zustand/shallow';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { Packet } from '../../types/telemetry';
import { Halo } from './glow';
import { moduleZoneKind, type OfficeLayout, type Vec3 } from './officeLayout';

/**
 * Runtime-Driven Communication System & Courier Fleet:
 * 1. Persistent architectural topology conduits between real agents & modules (subtle when idle).
 * 2. When real runtime packets occur, routes brighten with directional flowing light particles,
 *    glowing arched splines clearing island gaps, destination arrival rings, and humanoid/drone couriers.
 *    Never generates random or fake traffic when no runtime events are occurring.
 */

const DELEGATION = '#2DD4FF';
const MODULE = '#A78BFA';
const SPEED = 6.2; // campus units per second
const MIN_S = 1.4;
const MAX_S = 3.2;
const PING_S = 0.65; // arrival ring after landing
const MAX_TRIPS = 12; // keep busy offices smooth
const STAND_OFF = 1.15; // take off / land cleanly beside a workstation or module plinth

interface Trip {
  key: string;
  edgeId: string;
  from: Vec3;
  to: Vec3;
  color: string;
  isModule: boolean;
  bornAt: number;
  duration: number;
}

interface NetworkRoute {
  id: string;
  fromId: string;
  toId: string;
  from: Vec3;
  to: Vec3;
  isModule: boolean;
  color: string;
  points: [number, number, number][];
  curve: CatmullRomCurve3;
}

function routeColor(isModule: boolean, toId: string): string {
  if (!isModule) return DELEGATION;
  const kind = moduleZoneKind(toId);
  if (kind === 'tools') return '#FFAE00';
  if (kind === 'process') return '#FF2AA6';
  if (kind === 'hub' || kind === 'content') return '#00D8FF';
  return MODULE;
}

function endpoints(edgeId: string, layout: OfficeLayout): { from: Vec3; to: Vec3; module: boolean; fromId: string; toId: string } | null {
  let a: Vec3 | undefined;
  let b: Vec3 | undefined;
  let module = false;
  let fromId = '';
  let toId = '';
  if (edgeId.startsWith('h:')) {
    const [parent, child] = edgeId.slice(2).split('->');
    [a, b] = [layout.desks[parent], layout.desks[child]];
    fromId = parent;
    toId = child;
  } else if (edgeId.startsWith('m:')) {
    const [agent, mod] = edgeId.slice(2).split('->');
    [a, b] = [layout.desks[agent], layout.stations[mod]];
    module = true;
    fromId = agent;
    toId = mod;
  } else if (edgeId.startsWith('x:')) {
    const [x, y] = edgeId.slice(2).split('<->');
    [a, b] = [layout.desks[x], layout.desks[y]];
    fromId = x;
    toId = y;
  }
  return a && b ? { from: a, to: b, module, fromId, toId } : null;
}

function toTrip(p: Packet, layout: OfficeLayout): Trip | null {
  const ends = endpoints(p.edgeId, layout);
  if (!ends) return null;
  const [from, to] = p.reverse ? [ends.to, ends.from] : [ends.from, ends.to];
  const a = new Vector3(from[0], from[1], from[2]);
  const b = new Vector3(to[0], to[1], to[2]);
  const dir = new Vector3(b.x - a.x, 0, b.z - a.z);
  const dist = dir.length();
  if (dist < 0.5) return null;
  dir.normalize();
  const start = a.clone().addScaledVector(dir, STAND_OFF);
  const end = b.clone().addScaledVector(dir, -STAND_OFF);
  return {
    key: p.key,
    edgeId: p.edgeId,
    from: [start.x, from[1], start.z],
    to: [end.x, to[1], end.z],
    color: routeColor(ends.module, ends.toId),
    isModule: ends.module,
    bornAt: performance.now(),
    duration: Math.min(MAX_S, Math.max(MIN_S, dist / SPEED)),
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Runtime-driven communication pathway: subtle topology line when idle; directional particles only during real active trips. */
const CommunicationPathway = memo(function CommunicationPathway({
  route,
  activeTrip,
}: {
  route: NetworkRoute;
  activeTrip: Trip | undefined;
}) {
  const reducedMotion = useReducedMotion();
  const pulseA = useRef<Mesh>(null);
  const pulseB = useRef<Mesh>(null);
  const pulseC = useRef<Mesh>(null);
  const destRing = useRef<Mesh>(null);
  const isActive = !!activeTrip;

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0.5 : clock.elapsedTime;
    const speed = 0.92;

    if (pulseA.current) {
      pulseA.current.visible = isActive;
      if (isActive) {
        pulseA.current.position.copy(route.curve.getPointAt((t * speed) % 1));
      }
    }
    if (pulseB.current) {
      pulseB.current.visible = isActive;
      if (isActive) {
        pulseB.current.position.copy(route.curve.getPointAt((t * speed + 0.33) % 1));
      }
    }
    if (pulseC.current) {
      pulseC.current.visible = isActive;
      if (isActive) {
        pulseC.current.position.copy(route.curve.getPointAt((t * speed + 0.66) % 1));
      }
    }
    if (destRing.current) {
      destRing.current.visible = isActive;
      if (isActive) {
        const s = 0.88 + 0.22 * Math.sin(t * 7);
        destRing.current.scale.set(s, s, 1);
      }
    }
  });

  return (
    <group>
      <Line
        points={route.points}
        color={route.color}
        lineWidth={isActive ? 2.6 : 1.0}
        transparent
        opacity={isActive ? 0.82 : 0.14}
      />
      {/* Directional flowing light particles — active only during live runtime transmissions */}
      <mesh ref={pulseA} visible={false}>
        <sphereGeometry args={[0.095, 10, 10]} />
        <meshBasicMaterial color={route.color} transparent opacity={0.95} toneMapped={false} />
      </mesh>
      <mesh ref={pulseB} visible={false}>
        <sphereGeometry args={[0.085, 10, 10]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.92} toneMapped={false} />
      </mesh>
      <mesh ref={pulseC} visible={false}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshBasicMaterial color={route.color} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {/* Active destination highlight ring */}
      <mesh
        ref={destRing}
        position={[route.to[0], route.to[1] + 0.14, route.to[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.92, 1.08, 32]} />
        <meshBasicMaterial color={route.color} transparent opacity={0.72} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
});

/** Upgraded futuristic humanoid/drone courier with distinct visuals for Delegation vs. Module Calls. */
function CourierRobot({
  color,
  isModule,
  eyes,
  bulb,
  flame,
  cube,
}: {
  color: string;
  isModule: boolean;
  eyes: React.Ref<Group>;
  bulb: React.Ref<MeshBasicMaterial>;
  flame: React.Ref<Sprite>;
  cube: React.Ref<Mesh>;
}) {
  const shell = isModule ? '#E9D5FF' : '#E0F2FE';
  const trim = isModule ? '#6D28D9' : '#0284C7';
  const darkMetal = '#09152B';
  return (
    <group scale={0.8}>
      {/* Thruster nozzle + plasma flame */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.11, 0.17, 0.16, 16]} />
        <meshStandardMaterial color={trim} metalness={0.65} roughness={0.28} />
      </mesh>
      <Halo ref={flame} color={isModule ? '#C084FC' : '#38BDF8'} size={0.75} opacity={0.9} position={[0, 0.02, 0]} />

      {/* Articulated lower thrusters / legs */}
      {[-0.12, 0.12].map((lx) => (
        <mesh key={lx} position={[lx, 0.28, -0.04]} rotation={[0.35, 0, 0]} castShadow>
          <capsuleGeometry args={[0.042, 0.18, 4, 10]} />
          <meshStandardMaterial color={darkMetal} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

      {/* Armored Torso */}
      <mesh position={[0, 0.64, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.3, 8, 20]} />
        <meshStandardMaterial color={shell} metalness={0.45} roughness={0.25} />
      </mesh>

      {/* Distinct back wing stabilizers for delegation vs orbital ring for module calls */}
      {isModule ? (
        <mesh position={[0, 0.68, -0.05]} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.42, 0.024, 10, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      ) : (
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.36, 0.72, -0.12]} rotation={[0.2, side * -0.35, side * 0.4]}>
            <boxGeometry args={[0.28, 0.08, 0.03]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        ))
      )}

      {/* Chest reactor core */}
      <mesh position={[0, 0.68, 0.3]}>
        <circleGeometry args={[0.1, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Robotic Head */}
      <group position={[0, 1.22, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.28, 28, 28]} />
          <meshStandardMaterial color={shell} metalness={0.45} roughness={0.25} />
        </mesh>
        {/* Visor */}
        <mesh position={[0, 0.0, 0.16]} scale={[1, 0.7, 0.55]}>
          <sphereGeometry args={[0.23, 24, 24]} />
          <meshStandardMaterial color={darkMetal} metalness={0.75} roughness={0.15} />
        </mesh>
        <group ref={eyes} position={[0, 0.02, 0.28]}>
          {[-0.08, 0.08].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <capsuleGeometry args={[0.032, 0.048, 4, 10]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          ))}
        </group>
        {/* Ear transceivers */}
        {[-0.29, 0.29].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.065, 0.065, 0.055, 14]} />
            <meshStandardMaterial color={trim} metalness={0.65} roughness={0.28} />
          </mesh>
        ))}
        {/* Crown Antenna */}
        <mesh position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.16, 6]} />
          <meshStandardMaterial color={trim} />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <sphereGeometry args={[0.052, 14, 14]} />
          <meshBasicMaterial ref={bulb} color={color} toneMapped={false} transparent />
        </mesh>
      </group>

      {/* Articulated arms holding payload */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.34, 0.7, 0.16]} rotation={[-1.1, 0, s * 0.25]} castShadow>
          <capsuleGeometry args={[0.058, 0.24, 4, 10]} />
          <meshStandardMaterial color={trim} metalness={0.5} roughness={0.3} />
        </mesh>
      ))}

      {/* Payload: Octahedron crystal for Delegation, Data Cube for Module Call */}
      <mesh ref={cube} position={[0, 0.66, 0.5]}>
        {isModule ? <boxGeometry args={[0.21, 0.21, 0.21]} /> : <octahedronGeometry args={[0.16, 0]} />}
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Halo color={color} size={0.82} opacity={0.65} position={[0, 0.66, 0.5]} />
    </group>
  );
}

const Courier = memo(function Courier({ trip, onDone }: { trip: Trip; onDone: (key: string) => void }) {
  const body = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const bulb = useRef<MeshBasicMaterial>(null);
  const flame = useRef<Sprite>(null);
  const cube = useRef<Mesh>(null);
  const shadow = useRef<Mesh>(null);
  const ping = useRef<Mesh>(null);
  const done = useRef(false);

  const { a, b, heading, cruise, arcPoints } = useMemo(() => {
    const from = new Vector3(...trip.from);
    const to = new Vector3(...trip.to);
    const d = from.distanceTo(to);
    const h = 1.45 + d * 0.1;
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.max(from.y, to.y) + h * 0.65;
    const curve = new CatmullRomCurve3([
      new Vector3(from.x, from.y + 0.15, from.z),
      mid,
      new Vector3(to.x, to.y + 0.15, to.z),
    ]);
    const pts = curve.getPoints(24).map((p) => [p.x, p.y, p.z] as [number, number, number]);
    return {
      a: from,
      b: to,
      heading: Math.atan2(to.x - from.x, to.z - from.z),
      cruise: h,
      arcPoints: pts,
    };
  }, [trip]);

  useFrame(({ clock }) => {
    const elapsed = (performance.now() - trip.bornAt) / 1000;
    const t = Math.min(1, elapsed / trip.duration);
    const e = easeInOut(t);
    const now = clock.elapsedTime;

    if (body.current) {
      const x = a.x + (b.x - a.x) * e;
      const z = a.z + (b.z - a.z) * e;
      const baseY = a.y + (b.y - a.y) * e;
      const lift = Math.sin(Math.PI * e) * cruise;
      body.current.position.set(x, baseY + 0.05 + lift + 0.05 * Math.sin(now * 9), z);
      body.current.rotation.set(0.28 * Math.sin(Math.PI * t), heading, 0.06 * Math.sin(now * 5));
      body.current.visible = t < 1;
    }
    if (eyes.current) eyes.current.scale.y = Math.sin(now * 2.3 + trip.bornAt) > 0.96 ? 0.15 : 1;
    if (bulb.current) bulb.current.opacity = 0.55 + 0.45 * Math.sin(now * 10);
    if (cube.current) {
      cube.current.rotation.y = now * 3.2;
      cube.current.rotation.x = now * 2.1;
    }
    if (flame.current) {
      const s = t < 1 ? 0.58 + 0.2 * Math.sin(now * 18) + Math.sin(Math.PI * e) * 0.35 : 0;
      flame.current.scale.set(s, s * 1.4, 1);
    }
    if (shadow.current && body.current) {
      const h = body.current.position.y;
      const groundY = a.y + (b.y - a.y) * e + 0.02;
      shadow.current.position.set(body.current.position.x, groundY, body.current.position.z);
      const s = Math.max(0.32, 1 - h * 0.2);
      shadow.current.scale.set(s, s, s);
      shadow.current.visible = t < 1;
    }

    const after = elapsed - trip.duration;
    if (ping.current) {
      ping.current.visible = after > -0.1 && after < PING_S;
      const p = Math.max(0, after) / PING_S;
      ping.current.scale.setScalar(0.45 + p * 1.75);
      (ping.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - p);
    }
    if (after > PING_S && !done.current) {
      done.current = true;
      onDone(trip.key);
    }
  });

  return (
    <group>
      {/* Glowing arched telemetry beam while courier is in flight */}
      <Line points={arcPoints} color={trip.color} lineWidth={2.2} transparent opacity={0.55} />
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <group ref={body}>
        <CourierRobot color={trip.color} isModule={trip.isModule} eyes={eyes} bulb={bulb} flame={flame} cube={cube} />
      </group>
      <mesh ref={ping} position={[b.x, b.y + 0.04, b.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.58, 0.74, 40]} />
        <meshBasicMaterial color={trip.color} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
});

function CouriersImpl({ layout }: { layout: OfficeLayout }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const seen = useRef(new Set<string>());
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Build persistent communication pathways from actual store topology (hierarchy, extraEdges, moduleLinks)
  const edgeTopology = useTelemetryStore(
    (s) => ({
      hierarchy: s.agentOrder
        .map((id) => (s.agents[id]?.parentId ? `h:${s.agents[id].parentId}->${id}` : ''))
        .filter(Boolean)
        .join('|'),
      extra: s.extraEdges.map((e) => e.id).join('|'),
      modules: s.moduleLinks.map((m) => m.id).join('|'),
    }),
    shallow,
  );

  const routes = useMemo<NetworkRoute[]>(() => {
    const edgeIds = [
      ...edgeTopology.hierarchy.split('|').filter(Boolean),
      ...edgeTopology.extra.split('|').filter(Boolean),
      ...edgeTopology.modules.split('|').filter(Boolean),
    ];
    const built: NetworkRoute[] = [];
    for (const id of edgeIds) {
      const ends = endpoints(id, layout);
      if (!ends) continue;
      const p0 = new Vector3(ends.from[0], ends.from[1] + 0.16, ends.from[2]);
      const p2 = new Vector3(ends.to[0], ends.to[1] + 0.16, ends.to[2]);
      const dist = p0.distanceTo(p2);
      const mid = p0.clone().lerp(p2, 0.5);
      // Graceful elevated arc so inter-island conduits clear platform edges & structures cleanly
      mid.y = Math.max(p0.y, p2.y) + (ends.module ? 0.85 + Math.min(1.4, dist * 0.07) : 0.35 + Math.min(0.6, dist * 0.04));
      const curve = new CatmullRomCurve3([p0, mid, p2]);
      const points = curve.getPoints(24).map((pt) => [pt.x, pt.y, pt.z] as [number, number, number]);
      built.push({
        id,
        fromId: ends.fromId,
        toId: ends.toId,
        from: ends.from,
        to: ends.to,
        isModule: ends.module,
        color: routeColor(ends.module, ends.toId),
        points,
        curve,
      });
    }
    return built;
  }, [edgeTopology, layout]);

  useEffect(() =>
    useTelemetryStore.subscribe((s, prev) => {
      if (s.packets === prev.packets) return;
      const fresh = s.packets.filter((p) => !seen.current.has(p.key));
      if (fresh.length === 0) return;
      fresh.forEach((p) => seen.current.add(p.key));
      if (seen.current.size > 2000) seen.current = new Set(s.packets.map((p) => p.key));
      const added = fresh.map((p) => toTrip(p, layoutRef.current)).filter((t): t is Trip => !!t);
      if (added.length) setTrips((cur) => [...cur, ...added].slice(-MAX_TRIPS));
    }), []);

  const finish = useCallback((key: string) => setTrips((cur) => cur.filter((t) => t.key !== key)), []);

  const activeByEdge = useMemo(() => {
    const map = new Map<string, Trip>();
    for (const t of trips) map.set(t.edgeId, t);
    return map;
  }, [trips]);

  return (
    <group>
      {routes.map((route) => (
        <CommunicationPathway key={route.id} route={route} activeTrip={activeByEdge.get(route.id)} />
      ))}
      {trips.map((t) => (
        <Courier key={t.key} trip={t} onDone={finish} />
      ))}
    </group>
  );
}

export const Couriers = memo(CouriersImpl);

/** For the legend: the two courier colours. */
export const COURIER_COLORS = { delegation: DELEGATION, module: MODULE };

