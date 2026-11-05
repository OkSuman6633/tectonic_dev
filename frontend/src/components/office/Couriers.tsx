import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group, type Mesh, type MeshBasicMaterial, type Sprite } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { Packet } from '../../types/telemetry';
import { Halo } from './glow';
import type { OfficeLayout, Vec3 } from './officeLayout';

/**
 * Every live connection (a delegation between agents, or an agent calling a platform module) is carried
 * across the office by a little robot courier: it takes off from the sender, flies an arc over the desks
 * holding a glowing data cube, lands at the receiver and pings. Trips outlive the store's short-lived
 * packets, so each one is copied into a local trip list with its own, distance-based duration.
 */

const DELEGATION = '#2DD4FF';
const MODULE = '#A78BFA';
const SPEED = 5.2; // floor units per second
const MIN_S = 1.5;
const MAX_S = 3.4;
const PING_S = 0.55; // arrival ring after landing
const MAX_TRIPS = 10; // keep busy offices smooth
const STAND_OFF = 1.15; // take off / land just in front of a desk or station, not inside it

interface Trip {
  key: string;
  from: Vec3;
  to: Vec3;
  color: string;
  bornAt: number;
  duration: number;
}

function endpoints(edgeId: string, layout: OfficeLayout): { from: Vec3; to: Vec3; module: boolean } | null {
  let a: Vec3 | undefined;
  let b: Vec3 | undefined;
  let module = false;
  if (edgeId.startsWith('h:')) {
    const [parent, child] = edgeId.slice(2).split('->');
    [a, b] = [layout.desks[parent], layout.desks[child]];
  } else if (edgeId.startsWith('m:')) {
    const [agent, mod] = edgeId.slice(2).split('->');
    [a, b] = [layout.desks[agent], layout.stations[mod]];
    module = true;
  } else if (edgeId.startsWith('x:')) {
    const [x, y] = edgeId.slice(2).split('<->');
    [a, b] = [layout.desks[x], layout.desks[y]];
  }
  return a && b ? { from: a, to: b, module } : null;
}

function toTrip(p: Packet, layout: OfficeLayout): Trip | null {
  const ends = endpoints(p.edgeId, layout);
  if (!ends) return null;
  const [from, to] = p.reverse ? [ends.to, ends.from] : [ends.from, ends.to];
  const a = new Vector3(from[0], 0, from[2]);
  const b = new Vector3(to[0], 0, to[2]);
  const dir = b.clone().sub(a);
  const dist = dir.length();
  if (dist < 0.5) return null;
  dir.normalize();
  const start = a.clone().addScaledVector(dir, STAND_OFF);
  const end = b.clone().addScaledVector(dir, -STAND_OFF);
  return {
    key: p.key,
    from: [start.x, 0, start.z],
    to: [end.x, 0, end.z],
    color: ends.module ? MODULE : DELEGATION,
    bornAt: performance.now(),
    duration: Math.min(MAX_S, Math.max(MIN_S, dist / SPEED)),
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** The cartoon robot itself (local origin = its feet). Refs let the trip animate eyes, antenna and jet. */
function Robot({ color, eyes, bulb, flame, cube }: {
  color: string;
  eyes: React.Ref<Group>;
  bulb: React.Ref<MeshBasicMaterial>;
  flame: React.Ref<Sprite>;
  cube: React.Ref<Mesh>;
}) {
  const shell = '#E9EEF6';
  const trim = '#9AA4B5';
  return (
    <group scale={0.78}>
      {/* Jet nozzle + flame */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 0.16, 16]} />
        <meshStandardMaterial color={trim} metalness={0.6} roughness={0.3} />
      </mesh>
      <Halo ref={flame} color="#FDBA74" size={0.7} opacity={0.9} position={[0, 0.02, 0]} />
      {/* Body */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <capsuleGeometry args={[0.34, 0.32, 8, 20]} />
        <meshStandardMaterial color={shell} metalness={0.25} roughness={0.35} />
      </mesh>
      {/* Chest light in the connection's colour */}
      <mesh position={[0, 0.66, 0.335]}>
        <circleGeometry args={[0.1, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* Head */}
      <group position={[0, 1.22, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.3, 28, 28]} />
          <meshStandardMaterial color={shell} metalness={0.25} roughness={0.35} />
        </mesh>
        {/* Visor */}
        <mesh position={[0, 0.0, 0.17]} scale={[1, 0.72, 0.55]}>
          <sphereGeometry args={[0.24, 24, 24]} />
          <meshStandardMaterial color="#0B1020" metalness={0.4} roughness={0.15} />
        </mesh>
        <group ref={eyes} position={[0, 0.02, 0.3]}>
          {[-0.085, 0.085].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <capsuleGeometry args={[0.035, 0.05, 4, 10]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          ))}
        </group>
        {/* Ear bolts */}
        {[-0.31, 0.31].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 14]} />
            <meshStandardMaterial color={trim} metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
        {/* Antenna */}
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.18, 6]} />
          <meshStandardMaterial color={trim} />
        </mesh>
        <mesh position={[0, 0.47, 0]}>
          <sphereGeometry args={[0.055, 14, 14]} />
          <meshBasicMaterial ref={bulb} color={color} toneMapped={false} transparent />
        </mesh>
      </group>
      {/* Arms reaching forward to hold the data cube */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.36, 0.7, 0.16]} rotation={[-1.1, 0, s * 0.25]} castShadow>
          <capsuleGeometry args={[0.065, 0.24, 4, 10]} />
          <meshStandardMaterial color={trim} metalness={0.4} roughness={0.35} />
        </mesh>
      ))}
      <mesh ref={cube} position={[0, 0.66, 0.5]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Halo color={color} size={0.75} opacity={0.6} position={[0, 0.66, 0.5]} />
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
  const trail = useRef<MeshBasicMaterial>(null);
  const done = useRef(false);

  const { a, b, dist, mid, heading, cruise } = useMemo(() => {
    const from = new Vector3(...trip.from);
    const to = new Vector3(...trip.to);
    const d = from.distanceTo(to);
    return { a: from, b: to, dist: d, mid: from.clone().lerp(to, 0.5), heading: Math.atan2(to.x - from.x, to.z - from.z),
             cruise: 1.5 + d * 0.1 };
  }, [trip]);

  useFrame(({ clock }) => {
    const elapsed = (performance.now() - trip.bornAt) / 1000;
    const t = Math.min(1, elapsed / trip.duration);
    const e = easeInOut(t);
    const now = clock.elapsedTime;

    if (body.current) {
      const x = a.x + (b.x - a.x) * e;
      const z = a.z + (b.z - a.z) * e;
      const lift = Math.sin(Math.PI * e) * cruise; // take off, arc over the desks, land
      body.current.position.set(x, 0.05 + lift + 0.05 * Math.sin(now * 9), z);
      body.current.rotation.set(0.28 * Math.sin(Math.PI * t), heading, 0.06 * Math.sin(now * 5)); // lean into the flight
      body.current.visible = t < 1;
    }
    if (eyes.current) eyes.current.scale.y = Math.sin(now * 2.3 + trip.bornAt) > 0.96 ? 0.15 : 1; // blink
    if (bulb.current) bulb.current.opacity = 0.55 + 0.45 * Math.sin(now * 10);
    if (cube.current) { cube.current.rotation.y = now * 3; cube.current.rotation.x = now * 2; }
    if (flame.current) {
      const s = t < 1 ? 0.55 + 0.25 * Math.random() + Math.sin(Math.PI * e) * 0.35 : 0;
      flame.current.scale.set(s, s * 1.4, 1);
    }
    if (shadow.current && body.current) {
      const h = body.current.position.y;
      shadow.current.position.set(body.current.position.x, 0.02, body.current.position.z);
      const s = Math.max(0.35, 1 - h * 0.22);
      shadow.current.scale.set(s, s, s);
      shadow.current.visible = t < 1;
    }
    if (trail.current) trail.current.opacity = t < 1 ? 0.35 * Math.sin(Math.PI * t) : 0;

    // Arrival: an expanding ring at the receiver, then the courier is gone.
    const after = elapsed - trip.duration;
    if (ping.current) {
      ping.current.visible = after > -0.1 && after < PING_S;
      const p = Math.max(0, after) / PING_S;
      ping.current.scale.setScalar(0.4 + p * 1.6);
      (ping.current.material as MeshBasicMaterial).opacity = 0.85 * (1 - p);
    }
    if (after > PING_S && !done.current) {
      done.current = true;
      onDone(trip.key);
    }
  });

  return (
    <group>
      {/* The route, faintly drawn on the floor while the courier is underway */}
      <mesh position={[mid.x, 0.015, mid.z]} rotation={[-Math.PI / 2, 0, heading]}>
        <planeGeometry args={[0.08, dist]} />
        <meshBasicMaterial ref={trail} color={trip.color} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <group ref={body}>
        <Robot color={trip.color} eyes={eyes} bulb={bulb} flame={flame} cube={cube} />
      </group>
      <mesh ref={ping} position={[b.x, 0.03, b.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.55, 0.68, 40]} />
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

  // Each new packet dispatches one courier (a burst is capped so the office stays smooth).
  useEffect(() => useTelemetryStore.subscribe((s, prev) => {
    if (s.packets === prev.packets) return;
    const fresh = s.packets.filter((p) => !seen.current.has(p.key));
    if (fresh.length === 0) return;
    fresh.forEach((p) => seen.current.add(p.key));
    if (seen.current.size > 2000) seen.current = new Set(s.packets.map((p) => p.key));
    const added = fresh.map((p) => toTrip(p, layoutRef.current)).filter((t): t is Trip => !!t);
    if (added.length) setTrips((cur) => [...cur, ...added].slice(-MAX_TRIPS));
  }), []);

  const finish = useCallback((key: string) => setTrips((cur) => cur.filter((t) => t.key !== key)), []);

  return (
    <>
      {trips.map((t) => (
        <Courier key={t.key} trip={t} onDone={finish} />
      ))}
    </>
  );
}

export const Couriers = memo(CouriersImpl);

/** For the legend: the two courier colours. */
export const COURIER_COLORS = { delegation: DELEGATION, module: MODULE };
