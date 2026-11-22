import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid, Line, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { AdditiveBlending, DoubleSide, Vector3, type Group, type MeshBasicMaterial } from 'three';
import { BeaconRing, Halo, HoloBanner } from './glow';
import type { CampusBridge, CampusZone, OfficeLayout, SatellitePad } from './officeLayout';

/**
 * Independent elevated 3D floating island platform with visible thickness,
 * tiered underside foundations, chamfered side ribs, recessed luminous wall trims,
 * crisp double-line glowing perimeter border, subtle top-deck technical grid,
 * and a floating 3D holographic zone header banner.
 */
export const CampusPlatform = memo(function CampusPlatform({
  zone,
  light,
}: {
  zone: CampusZone;
  light: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const outerTrimRef = useRef<MeshBasicMaterial>(null);
  const sideGlowRef = useRef<MeshBasicMaterial>(null);
  const [zx, topY, zz] = zone.center;
  const { width: w, depth: d, thickness: t, accent, secondaryAccent, surfaceTint } = zone;
  const phase = zx * 0.17 + zz * 0.23;

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const wave = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.35 + phase);
    if (outerTrimRef.current) outerTrimRef.current.opacity = 0.78 + 0.2 * wave;
    if (sideGlowRef.current) sideGlowRef.current.opacity = 0.42 + 0.26 * wave;
  });

  const slabCenterY = topY - t / 2;
  const mainBodyColor = light ? '#CBD8EC' : surfaceTint;
  const sideWallColor = light ? '#9FB3CE' : '#08152C';
  const underTierColor = light ? '#889FBD' : '#050E20';
  const topSurfaceColor = light ? '#E2ECF8' : surfaceTint;
  const ribCountX = Math.max(3, Math.floor(w / 2.2));
  const ribCountZ = Math.max(2, Math.floor(d / 2.2));

  // Position holographic banner cleanly along the back-left architectural rim, angled toward the isometric camera
  const bannerPos: [number, number, number] =
    zone.kind === 'command'
      ? [-w / 2 + 2.8, topY + 0.02, -d / 2 + 0.45]
      : zone.kind === 'tools'
        ? [-0.45, topY + 0.02, -d / 2 + 0.24]
        : [-w / 2 + 2.5, topY + 0.02, -d / 2 + 0.42];

  return (
    <group position={[zx, 0, zz]}>
      {/* Luminous under-platform ambient aura bleeding into the deep electric-blue void */}
      <mesh position={[0, topY - t - 0.56, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[w + 3.2, d + 3.2]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={light ? 0.08 : 0.14}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Main thick chamfered architectural island slab */}
      <RoundedBox args={[w, t, d]} radius={0.13} smoothness={3} position={[0, slabCenterY, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={sideWallColor} metalness={0.62} roughness={0.32} />
      </RoundedBox>

      {/* Recessed top deck surface (clean contrast against glowing borders) */}
      <mesh position={[0, topY + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.24, d - 0.24]} />
        <meshStandardMaterial color={topSurfaceColor} metalness={0.44} roughness={0.54} />
      </mesh>

      {/* Precision local technical grid ONLY on this island's deck */}
      <Grid
        position={[0, topY + 0.01, 0]}
        args={[w - 0.36, d - 0.36]}
        cellSize={0.8}
        sectionSize={3.2}
        cellThickness={0.5}
        sectionThickness={0.95}
        cellColor={light ? '#BDD0E8' : '#122C52'}
        sectionColor={light ? '#94B1D4' : accent}
        fadeDistance={75}
        infiniteGrid={false}
      />

      {/* Second stepped foundation tier underneath */}
      <RoundedBox
        args={[w - 0.72, 0.34, d - 0.72]}
        radius={0.1}
        smoothness={2}
        position={[0, topY - t - 0.16, 0]}
      >
        <meshStandardMaterial color={underTierColor} metalness={0.7} roughness={0.28} />
      </RoundedBox>

      {/* Third tapered floating core keel underneath */}
      <RoundedBox
        args={[w - 1.9, 0.22, d - 1.9]}
        radius={0.08}
        smoothness={2}
        position={[0, topY - t - 0.42, 0]}
      >
        <meshStandardMaterial color={light ? '#7B93B4' : '#030A18'} metalness={0.76} roughness={0.25} />
      </RoundedBox>

      {/* Luminous under-glow band between main slab and second tier */}
      <mesh position={[0, topY - t - 0.02, d / 2 - 0.36]}>
        <boxGeometry args={[w - 0.85, 0.03, 0.03]} />
        <meshBasicMaterial ref={sideGlowRef} color={accent} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh position={[w / 2 - 0.36, topY - t - 0.02, 0]}>
        <boxGeometry args={[0.03, 0.03, d - 0.85]} />
        <meshBasicMaterial color={accent} transparent opacity={0.48} toneMapped={false} />
      </mesh>

      {/* Recessed luminous mid-wall accent groove wrapping all 4 visible side faces */}
      {[
        { pos: [0, slabCenterY + 0.08, d / 2 + 0.008] as [number, number, number], args: [w - 0.4, 0.035, 0.018] as [number, number, number] },
        { pos: [0, slabCenterY + 0.08, -d / 2 - 0.008] as [number, number, number], args: [w - 0.4, 0.035, 0.018] as [number, number, number] },
        { pos: [w / 2 + 0.008, slabCenterY + 0.08, 0] as [number, number, number], args: [0.018, 0.035, d - 0.4] as [number, number, number] },
        { pos: [-w / 2 - 0.008, slabCenterY + 0.08, 0] as [number, number, number], args: [0.018, 0.035, d - 0.4] as [number, number, number] },
      ].map((strip, idx) => (
        <mesh key={idx} position={strip.pos}>
          <boxGeometry args={strip.args} />
          <meshBasicMaterial color={idx % 2 === 0 ? accent : secondaryAccent} transparent opacity={0.55} toneMapped={false} />
        </mesh>
      ))}

      {/* Vertical architectural side-wall ribs along front (+Z) and right (+X) visible faces */}
      {Array.from({ length: ribCountX }, (_, i) => {
        const rx = -w / 2 + 0.9 + (i * (w - 1.8)) / Math.max(1, ribCountX - 1);
        return (
          <mesh key={`rx-${i}`} position={[rx, slabCenterY - 0.04, d / 2 + 0.025]}>
            <boxGeometry args={[0.12, t * 0.68, 0.05]} />
            <meshStandardMaterial color={mainBodyColor} metalness={0.72} roughness={0.28} />
          </mesh>
        );
      })}
      {Array.from({ length: ribCountZ }, (_, i) => {
        const rz = -d / 2 + 0.9 + (i * (d - 1.8)) / Math.max(1, ribCountZ - 1);
        return (
          <mesh key={`rz-${i}`} position={[w / 2 + 0.025, slabCenterY - 0.04, rz]}>
            <boxGeometry args={[0.05, t * 0.68, 0.12]} />
            <meshStandardMaterial color={mainBodyColor} metalness={0.72} roughness={0.28} />
          </mesh>
        );
      })}

      {/* Four corner architectural stabilizer buttresses */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <group key={`corner-${sx}:${sz}`} position={[sx * (w / 2 - 0.14), slabCenterY - 0.12, sz * (d / 2 - 0.14)]}>
            <mesh>
              <boxGeometry args={[0.36, t + 0.24, 0.36]} />
              <meshStandardMaterial color={underTierColor} metalness={0.75} roughness={0.26} />
            </mesh>
            <mesh position={[0, t / 2 + 0.135, 0]}>
              <boxGeometry args={[0.24, 0.03, 0.24]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          </group>
        )),
      )}

      {/* Crisp luminous outer top perimeter trim (4 glowing rails forming the iconic glowing island edge) */}
      {[
        { pos: [0, topY + 0.022, d / 2 - 0.06] as [number, number, number], args: [w - 0.12, 0.032, 0.065] as [number, number, number] },
        { pos: [0, topY + 0.022, -d / 2 + 0.06] as [number, number, number], args: [w - 0.12, 0.032, 0.065] as [number, number, number] },
        { pos: [w / 2 - 0.06, topY + 0.022, 0] as [number, number, number], args: [0.065, 0.032, d - 0.12] as [number, number, number] },
        { pos: [-w / 2 + 0.06, topY + 0.022, 0] as [number, number, number], args: [0.065, 0.032, d - 0.12] as [number, number, number] },
      ].map((rail, i) => (
        <mesh key={`outer-${i}`} position={rail.pos}>
          <boxGeometry args={rail.args} />
          <meshBasicMaterial ref={i === 0 ? outerTrimRef : undefined} color={accent} transparent opacity={0.92} toneMapped={false} />
        </mesh>
      ))}

      {/* Secondary fine inner accent line (gives the crisp double-border sci-fi blueprint framing) */}
      {[
        { pos: [0, topY + 0.015, d / 2 - 0.26] as [number, number, number], args: [w - 0.56, 0.014, 0.024] as [number, number, number] },
        { pos: [0, topY + 0.015, -d / 2 + 0.26] as [number, number, number], args: [w - 0.56, 0.014, 0.024] as [number, number, number] },
        { pos: [w / 2 - 0.26, topY + 0.015, 0] as [number, number, number], args: [0.024, 0.014, d - 0.56] as [number, number, number] },
        { pos: [-w / 2 + 0.26, topY + 0.015, 0] as [number, number, number], args: [0.024, 0.014, d - 0.56] as [number, number, number] },
      ].map((rail, i) => (
        <mesh key={`inner-${i}`} position={rail.pos}>
          <boxGeometry args={rail.args} />
          <meshBasicMaterial color={secondaryAccent} transparent opacity={0.42} toneMapped={false} />
        </mesh>
      ))}

      {/* Floating 3D Holographic Zone Header Banner angled toward the isometric camera */}
      <HoloBanner
        title={zone.label}
        subtitle={zone.subtitle}
        accent={accent}
        position={bannerPos}
        rotationY={Math.PI / 5.5}
        width={zone.kind === 'command' ? 4.8 : 4.1}
        stalkHeight={zone.kind === 'command' ? 1.65 : zone.kind === 'tools' ? 1.85 : 1.35}
        light={light}
      />
    </group>
  );
});

/**
 * Glowing translucent futuristic skyway bridge connecting two spatially separated islands,
 * with dark metallic underside truss, glowing side rails, subtle energy strips,
 * and optional hovering luminous ring beacon (as on the magenta Tool Orchestration bridge).
 */
export const SkyBridge = memo(function SkyBridge({
  bridge,
  light,
}: {
  bridge: CampusBridge;
  light: boolean;
}) {
  const { mid, length, rotY, tiltX } = useMemo(() => {
    const a = new Vector3(...bridge.from);
    const b = new Vector3(...bridge.to);
    const delta = b.clone().sub(a);
    const horiz = Math.hypot(delta.x, delta.z);
    const len = delta.length();
    return {
      mid: a.clone().lerp(b, 0.5),
      length: len,
      rotY: Math.atan2(delta.x, delta.z),
      tiltX: -Math.atan2(delta.y, Math.max(0.001, horiz)),
    };
  }, [bridge]);

  const deckColor = light ? '#B8CCE4' : '#0A1C3A';

  return (
    <group>
      <group position={[mid.x, mid.y - 0.06, mid.z]} rotation={[0, rotY, 0]}>
        <group rotation={[tiltX, 0, 0]}>
          {/* Structural underside metallic beam */}
          <RoundedBox args={[bridge.width * 0.86, 0.14, length]} radius={0.03} smoothness={2} position={[0, -0.09, 0]}>
            <meshStandardMaterial color={deckColor} metalness={0.72} roughness={0.28} />
          </RoundedBox>
          {/* Translucent illuminated glass walkway deck */}
          <mesh position={[0, 0.01, 0]} receiveShadow>
            <boxGeometry args={[bridge.width, 0.055, length]} />
            <meshPhysicalMaterial
              color={bridge.accent}
              emissive={bridge.accent}
              emissiveIntensity={0.28}
              metalness={0.2}
              roughness={0.18}
              transparent
              opacity={0.44}
            />
          </mesh>
          {/* Twin glowing energy guard rails */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (bridge.width / 2 - 0.04), 0.065, 0]}>
              <mesh>
                <boxGeometry args={[0.05, 0.05, length]} />
                <meshBasicMaterial color={bridge.accent} toneMapped={false} />
              </mesh>
              <mesh position={[0, 0.14, 0]}>
                <boxGeometry args={[0.022, 0.022, length * 0.96]} />
                <meshBasicMaterial color={bridge.secondaryAccent ?? bridge.accent} transparent opacity={0.55} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {/* Center glowing optical fiber conduit */}
          <mesh position={[0, 0.046, 0]}>
            <boxGeometry args={[0.07, 0.012, length * 0.94]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.65} toneMapped={false} />
          </mesh>
          {/* Transverse illuminated walkway ribs */}
          {[-0.32, 0, 0.32].map((frac) => (
            <mesh key={frac} position={[0, 0.042, frac * length]}>
              <boxGeometry args={[bridge.width - 0.16, 0.014, 0.06]} />
              <meshBasicMaterial color={bridge.accent} transparent opacity={0.7} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>

      {bridge.hasBeacon && (
        <BeaconRing
          position={[mid.x, mid.y + 1.55, mid.z]}
          color={bridge.accent}
          radius={0.52}
          tetherHeight={1.45}
          phase={2.1}
        />
      )}
    </group>
  );
});

/**
 * Three independent floating satellite pads off the left flank of Agent Command:
 * - Pad 1: Holographic cyan wireframe spiral/cone spire + floating white-cyan beacon halo
 * - Pad 2: Dark-navy elevated data tile with recessed cyan telemetry grid
 * - Pad 3: Dark-navy elevated pad with translucent cobalt & turquoise micro-cubes
 */
export const SatelliteCluster = memo(function SatelliteCluster({
  satellites,
  light,
}: {
  satellites: SatellitePad[];
  light: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const spireRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!reducedMotion && spireRef.current) {
      spireRef.current.rotation.y += delta * 0.42;
    }
  });

  return (
    <group>
      {satellites.map((sat) => {
        const [sx, sy, sz] = sat.center;
        const slabCenterY = sy - sat.thickness / 2;
        const linePts: [number, number, number][] = [
          [sx + sat.width / 2, sy - 0.05, sz],
          [sat.tetherTo[0], sat.tetherTo[1] - 0.05, sat.tetherTo[2]],
        ];

        return (
          <group key={sat.id}>
            {/* Glowing optical tether linking satellite pad to main island */}
            <Line points={linePts} color={sat.accent} lineWidth={1.8} transparent opacity={0.62} />

            <group position={[sx, 0, sz]}>
              {/* Thick beveled floating satellite slab */}
              <RoundedBox args={[sat.width, sat.thickness, sat.depth]} radius={0.09} smoothness={2} position={[0, slabCenterY, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={light ? '#BACBE2' : '#081834'} metalness={0.65} roughness={0.32} />
              </RoundedBox>
              {/* Stepped underside plinth */}
              <RoundedBox args={[sat.width - 0.45, 0.2, sat.depth - 0.45]} radius={0.06} smoothness={2} position={[0, sy - sat.thickness - 0.09, 0]}>
                <meshStandardMaterial color={light ? '#94AAC8' : '#040C1D'} metalness={0.72} roughness={0.28} />
              </RoundedBox>
              {/* Crisp glowing perimeter frame */}
              {[
                { p: [0, sy + 0.015, sat.depth / 2 - 0.05] as [number, number, number], a: [sat.width - 0.1, 0.025, 0.045] as [number, number, number] },
                { p: [0, sy + 0.015, -sat.depth / 2 + 0.05] as [number, number, number], a: [sat.width - 0.1, 0.025, 0.045] as [number, number, number] },
                { p: [sat.width / 2 - 0.05, sy + 0.015, 0] as [number, number, number], a: [0.045, 0.025, sat.depth - 0.1] as [number, number, number] },
                { p: [-sat.width / 2 + 0.05, sy + 0.015, 0] as [number, number, number], a: [0.045, 0.025, sat.depth - 0.1] as [number, number, number] },
              ].map((r, i) => (
                <mesh key={i} position={r.p}>
                  <boxGeometry args={r.a} />
                  <meshBasicMaterial color={sat.accent} transparent opacity={0.88} toneMapped={false} />
                </mesh>
              ))}

              {/* Signature feature per satellite */}
              {sat.feature === 'spire' && (
                <group position={[0, sy, 0]}>
                  {/* Translucent holographic cyan wireframe cone/vortex spire */}
                  <group ref={spireRef} position={[0, 1.05, 0]}>
                    <mesh>
                      <coneGeometry args={[0.78, 1.95, 16, 4, true]} />
                      <meshBasicMaterial color="#2DD4FF" wireframe transparent opacity={0.48} toneMapped={false} />
                    </mesh>
                    {[0.3, 0.65, 1.0, 1.35].map((h, idx) => (
                      <mesh key={h} position={[0, h - 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.72 - idx * 0.16, 0.016, 8, 28]} />
                        <meshBasicMaterial color="#38BDF8" transparent opacity={0.68} toneMapped={false} />
                      </mesh>
                    ))}
                  </group>
                  <BeaconRing position={[0, 2.55, 0]} color="#2DD4FF" radius={0.36} phase={0.7} />
                </group>
              )}

              {sat.feature === 'grid' && (
                <group position={[0, sy + 0.04, 0]}>
                  {[-0.45, 0.45].flatMap((gx) =>
                    [-0.38, 0.38].map((gz) => (
                      <RoundedBox key={`${gx}:${gz}`} args={[0.68, 0.09, 0.56]} radius={0.02} smoothness={2} position={[gx, 0.04, gz]}>
                        <meshStandardMaterial color={light ? '#9CB4D4' : '#0D264D'} metalness={0.6} roughness={0.3} />
                      </RoundedBox>
                    )),
                  )}
                  <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.18, 0.24, 24]} />
                    <meshBasicMaterial color="#38BDF8" transparent opacity={0.75} side={DoubleSide} toneMapped={false} />
                  </mesh>
                </group>
              )}

              {sat.feature === 'cubes' && (
                <group position={[0, sy, 0]}>
                  {[
                    { p: [-0.4, 0.22, -0.25], s: [0.44, 0.44, 0.44], c: '#0EA5E9' },
                    { p: [0.35, 0.34, -0.15], s: [0.5, 0.68, 0.5], c: '#14B8A6' },
                    { p: [-0.05, 0.18, 0.38], s: [0.42, 0.36, 0.42], c: '#38BDF8' },
                  ].map((cube, idx) => (
                    <RoundedBox
                      key={idx}
                      args={cube.s as [number, number, number]}
                      radius={0.04}
                      smoothness={2}
                      position={cube.p as [number, number, number]}
                      castShadow
                    >
                      <meshPhysicalMaterial
                        color={cube.c}
                        emissive={cube.c}
                        emissiveIntensity={0.24}
                        metalness={0.35}
                        roughness={0.22}
                        transparent
                        opacity={0.78}
                      />
                    </RoundedBox>
                  ))}
                </group>
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
});

/**
 * Architectural installations integrated onto the Agent Command Island (Platform 1):
 * 1. Elevated 3-tier white/silver stepped Command Center Dais under agent_builder with cyan tether pillars & halo beacon
 * 2. Left-wing Cyan/Turquoise 6-tier Stepped Ziggurat / Pyramid
 * 3. Left-wing 3x3 Glossy Cobalt-Blue Beveled Cube Matrix
 * 4. Right-wing Illuminated Translucent Glass Skyscraper Towers + emerald/cyan base micro-cubes + beacon ring
 * 5. Front-edge Linear Sequence of 9 Luminous Colorful Glass Data Blocks (electric blue -> violet -> white -> cyan -> emerald)
 */
export const CommandIslandLandmarks = memo(function CommandIslandLandmarks({
  zone,
  builderDais,
  light,
}: {
  zone: CampusZone;
  builderDais: OfficeLayout['builderDais'];
  light: boolean;
}) {
  const [zx, topY, zz] = zone.center;
  const leftEdge = zx - zone.width / 2;
  const rightEdge = zx + zone.width / 2;
  const frontEdge = zz + zone.depth / 2;
  const backEdge = zz - zone.depth / 2;

  const dataBlockColors = [
    '#2563EB',
    '#3B82F6',
    '#6366F1',
    '#8B5CF6',
    '#E0F2FE',
    '#22D3EE',
    '#14B8A6',
    '#10B981',
    '#34D399',
  ];

  return (
    <group>
      {/* 1. Elevated White/Silver Stepped Command Center Dais under agent_builder */}
      {builderDais && (
        <group position={[builderDais.center[0], builderDais.baseY, builderDais.center[2]]}>
          {/* Base luminous anchor pad on deck */}
          <RoundedBox args={[4.45, 0.14, 3.25]} radius={0.05} smoothness={2} position={[0, 0.07, 0.1]} receiveShadow>
            <meshStandardMaterial color={light ? '#B8CBE3' : '#102A52'} metalness={0.55} roughness={0.32} />
          </RoundedBox>
          {/* Four glowing vertical cyan tether pillars supporting the elevated Command Dais */}
          {[-1.88, 1.88].flatMap((px) =>
            [-1.28, 1.28].map((pz) => (
              <group key={`pillar-${px}:${pz}`} position={[px, 0.36, pz + 0.1]}>
                <mesh>
                  <cylinderGeometry args={[0.045, 0.06, 0.68, 12]} />
                  <meshStandardMaterial color="#1E4A7A" metalness={0.75} roughness={0.25} />
                </mesh>
                <mesh>
                  <cylinderGeometry args={[0.018, 0.018, 0.7, 8]} />
                  <meshBasicMaterial color="#2DD4FF" toneMapped={false} />
                </mesh>
              </group>
            )),
          )}
          {/* Concentric white/ice-silver stepped dais terraces rising to topY (0.74 above deck) */}
          {[
            { w: 4.25, d: 3.05, y: 0.34, h: 0.16, c: light ? '#E2EBF6' : '#B8D4F4' },
            { w: 3.98, d: 2.82, y: 0.50, h: 0.16, c: light ? '#EDF3FA' : '#D5E7FC' },
            { w: 3.74, d: 2.62, y: 0.66, h: 0.16, c: light ? '#F8FBFF' : '#EBF4FF' },
          ].map((tier, idx) => (
            <group key={idx} position={[0, tier.y, 0.1]}>
              <RoundedBox args={[tier.w, tier.h, tier.d]} radius={0.04} smoothness={2} castShadow receiveShadow>
                <meshStandardMaterial color={tier.c} metalness={0.32} roughness={0.26} />
              </RoundedBox>
              <mesh position={[0, tier.h / 2 + 0.008, tier.d / 2 - 0.03]}>
                <boxGeometry args={[tier.w - 0.14, 0.018, 0.03]} />
                <meshBasicMaterial color="#2DD4FF" transparent opacity={0.85} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {/* Hovering white-cyan energy halo ring high above the Command Center */}
          <BeaconRing position={[0, 3.55, -0.35]} color="#38BDF8" radius={0.56} phase={0.2} />
        </group>
      )}

      {/* 2. Left Wing: Vibrant Cyan/Turquoise 6-Tier Stepped Ziggurat / Pyramid */}
      <group position={[leftEdge + 1.48, topY, backEdge + 2.35]}>
        {/* Recessed illuminated tray */}
        <RoundedBox args={[2.35, 0.08, 2.35]} radius={0.04} smoothness={2} position={[0, 0.04, 0]} receiveShadow>
          <meshStandardMaterial color={light ? '#9BC2DC' : '#082542'} metalness={0.6} roughness={0.3} />
        </RoundedBox>
        {[0, 1, 2, 3, 4, 5].map((lvl) => {
          const size = 2.05 - lvl * 0.28;
          const h = 0.28;
          const y = 0.08 + lvl * 0.27 + h / 2;
          const tierColor = lvl % 2 === 0 ? '#06B6D4' : '#14B8A6';
          return (
            <group key={lvl} position={[0, y, 0]}>
              <RoundedBox args={[size, h, size]} radius={0.03} smoothness={2} castShadow receiveShadow>
                <meshPhysicalMaterial
                  color={tierColor}
                  emissive={tierColor}
                  emissiveIntensity={0.25 + lvl * 0.07}
                  metalness={0.3}
                  roughness={0.22}
                  transparent
                  opacity={0.88}
                />
              </RoundedBox>
              {/* Luminous top lip per step */}
              <mesh position={[0, h / 2 + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[size * 0.44, size * 0.49, 4]} />
                <meshBasicMaterial color="#A5F3FC" transparent opacity={0.55} side={DoubleSide} toneMapped={false} />
              </mesh>
            </group>
          );
        })}
        <Halo color="#22D3EE" size={2.2} opacity={0.36} position={[0, 1.95, 0]} />
      </group>

      {/* 3. Left Wing Front: 3x3 Glossy Cobalt-Blue Beveled Cube Matrix */}
      <group position={[leftEdge + 1.48, topY, zz + 1.35]}>
        <RoundedBox args={[2.2, 0.08, 2.2]} radius={0.04} smoothness={2} position={[0, 0.04, 0]} receiveShadow>
          <meshStandardMaterial color={light ? '#A5BFE0' : '#0A2044'} metalness={0.6} roughness={0.32} />
        </RoundedBox>
        {[-0.62, 0, 0.62].flatMap((cx, ix) =>
          [-0.62, 0, 0.62].map((cz, iz) => {
            const h = 0.32 + ((ix + iz) % 3) * 0.14;
            const c = (ix + iz) % 2 === 0 ? '#2563EB' : '#38BDF8';
            return (
              <RoundedBox
                key={`${ix}:${iz}`}
                args={[0.46, h, 0.46]}
                radius={0.04}
                smoothness={2}
                position={[cx, 0.08 + h / 2, cz]}
                castShadow
              >
                <meshPhysicalMaterial
                  color={c}
                  emissive={c}
                  emissiveIntensity={0.32}
                  metalness={0.38}
                  roughness={0.18}
                  transparent
                  opacity={0.86}
                />
              </RoundedBox>
            );
          }),
        )}
      </group>

      {/* 4. Right Wing: Illuminated Translucent Glass Skyscraper Towers + Emerald Micro-Cube Clusters */}
      <group position={[rightEdge - 1.15, topY, backEdge + 3.05]}>
        {[
          { x: -0.25, z: -1.15, w: 0.72, d: 0.72, h: 2.35, c: '#38BDF8' },
          { x: 0.22, z: -0.15, w: 0.86, d: 0.86, h: 3.15, c: '#0EA5E9' },
          { x: -0.22, z: 0.95, w: 0.74, d: 0.74, h: 2.05, c: '#2DD4FF' },
        ].map((tower, idx) => (
          <group key={idx} position={[tower.x, tower.h / 2, tower.z]}>
            {/* Translucent glass monolith */}
            <RoundedBox args={[tower.w, tower.h, tower.d]} radius={0.04} smoothness={2} castShadow>
              <meshPhysicalMaterial
                color={light ? '#38BDF8' : '#0C3B75'}
                emissive={tower.c}
                emissiveIntensity={0.28}
                metalness={0.25}
                roughness={0.12}
                transparent
                opacity={0.68}
              />
            </RoundedBox>
            {/* Internal illuminated window dot matrix on front & right glass faces */}
            {[0.2, 0.38, 0.56, 0.74, 0.88].map((frac, row) => (
              <group key={row} position={[0, (frac - 0.5) * (tower.h - 0.3), 0]}>
                <mesh position={[0, 0, tower.d / 2 + 0.008]}>
                  <boxGeometry args={[tower.w * 0.68, 0.045, 0.012]} />
                  <meshBasicMaterial color={row % 2 === 0 ? '#E0F2FE' : '#2DD4FF'} transparent opacity={0.85} toneMapped={false} />
                </mesh>
                <mesh position={[tower.w / 2 + 0.008, 0, 0]}>
                  <boxGeometry args={[0.012, 0.045, tower.d * 0.68]} />
                  <meshBasicMaterial color={row % 2 === 0 ? '#2DD4FF' : '#E0F2FE'} transparent opacity={0.78} toneMapped={false} />
                </mesh>
              </group>
            ))}
            {/* Luminous crown rim */}
            <mesh position={[0, tower.h / 2 + 0.015, 0]}>
              <boxGeometry args={[tower.w * 0.92, 0.03, tower.d * 0.92]} />
              <meshBasicMaterial color="#BAE6FD" transparent opacity={0.9} toneMapped={false} />
            </mesh>
          </group>
        ))}

        {/* Cluster of tiny glowing emerald/cyan micro-cubes at the skyscrapers' base */}
        {[
          [-0.65, 0.14, 0.4],
          [-0.42, 0.22, 1.55],
          [0.35, 0.16, 1.48],
          [0.52, 0.2, 0.52],
          [-0.58, 0.15, -0.42],
        ].map(([mx, my, mz], i) => (
          <mesh key={`mc-${i}`} position={[mx, my, mz]} castShadow>
            <boxGeometry args={[0.24, my * 2, 0.24]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#10B981' : '#22D3EE'}
              emissive={i % 2 === 0 ? '#10B981' : '#22D3EE'}
              emissiveIntensity={0.48}
              metalness={0.3}
              roughness={0.2}
            />
          </mesh>
        ))}

        <BeaconRing position={[0.22, 3.85, -0.15]} color="#2DD4FF" radius={0.44} phase={1.4} />
      </group>

      {/* 5. Front Perimeter Linear Sequence of 9 Luminous Beveled Glass Data Blocks */}
      <group position={[zx - 0.15, topY, frontEdge - 0.72]}>
        {/* Glowing linear rail track */}
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[10.8, 0.04, 0.86]} />
          <meshStandardMaterial color={light ? '#9FB7D8' : '#0A1E3E'} metalness={0.62} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.052, 0.4]}>
          <boxGeometry args={[10.6, 0.015, 0.025]} />
          <meshBasicMaterial color="#2DD4FF" transparent opacity={0.8} toneMapped={false} />
        </mesh>
        {dataBlockColors.map((col, idx) => {
          const bx = (idx - (dataBlockColors.length - 1) / 2) * 1.15;
          const bh = idx === 4 ? 0.68 : 0.42 + ((idx * 3) % 4) * 0.08;
          return (
            <group key={idx} position={[bx, 0.05 + bh / 2, 0]}>
              <RoundedBox args={[0.78, bh, 0.58]} radius={0.05} smoothness={2} castShadow>
                <meshPhysicalMaterial
                  color={col}
                  emissive={col}
                  emissiveIntensity={idx === 4 ? 0.55 : 0.34}
                  metalness={0.28}
                  roughness={0.18}
                  transparent
                  opacity={0.86}
                />
              </RoundedBox>
              {/* Subtle glowing top cap */}
              <mesh position={[0, bh / 2 + 0.01, 0]}>
                <boxGeometry args={[0.62, 0.016, 0.42]} />
                <meshBasicMaterial color={col} transparent opacity={0.9} toneMapped={false} />
              </mesh>
            </group>
          );
        })}
        <Halo color="#38BDF8" size={2.2} opacity={0.34} position={[0, 0.85, 0]} />
      </group>
    </group>
  );
});

/**
 * Architectural landmarks integrated onto the Memory Infrastructure Island (Obsidian, Gold & Violet):
 * 1. Back-right Luminous Golden Network Node-Graph Matrix (grid of glowing gold orbs linked by golden laser filaments + gold BeaconRing)
 * 2. Front-left Warm Amber / Coral Stepped Architectural Blocks along the glowing gold rail
 */
export const MemoryIslandLandmarks = memo(function MemoryIslandLandmarks({
  zone,
}: {
  zone: CampusZone;
}) {
  const [zx, topY, zz] = zone.center;
  // Sits cleanly in the dedicated +X golden graph wing reserved in officeLayout.ts
  const graphCenterX = zx + zone.width / 2 - 1.68;
  const graphCenterZ = zz - 0.55;

  const { nodes, edges } = useMemo(() => {
    const pts: [number, number, number][] = [];
    const cols = 3;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        pts.push([
          (c - (cols - 1) / 2) * 0.72,
          0.16 + ((r + c) % 2) * 0.08,
          (r - (rows - 1) / 2) * 0.72,
        ]);
      }
    }
    const segs: [[number, number, number], [number, number, number]][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c + 1 < cols) segs.push([pts[i], pts[i + 1]]);
        if (r + 1 < rows) segs.push([pts[i], pts[i + cols]]);
        if (c + 1 < cols && r + 1 < rows && (r + c) % 2 === 0) segs.push([pts[i], pts[i + cols + 1]]);
      }
    }
    return { nodes: pts, edges: segs };
  }, []);

  return (
    <group>
      {/* 1. Luminous Golden Network Node-Graph Matrix in the reserved +X wing of Memory Island */}
      <group position={[graphCenterX, topY, graphCenterZ]}>
        <RoundedBox args={[2.35, 0.08, 3.1]} radius={0.04} smoothness={2} position={[0, 0.04, 0]}>
          <meshStandardMaterial color="#1B1826" metalness={0.68} roughness={0.3} />
        </RoundedBox>
        {edges.map(([a, b], idx) => (
          <Line key={idx} points={[a, b]} color="#FCD34D" lineWidth={1.6} transparent opacity={0.85} />
        ))}
        {nodes.map((p, idx) => (
          <group key={idx} position={p}>
            <mesh>
              <sphereGeometry args={[0.088, 12, 12]} />
              <meshBasicMaterial color={idx % 3 === 0 ? '#FEF3C7' : '#FBBF24'} toneMapped={false} />
            </mesh>
            <mesh position={[0, -p[1] / 2, 0]}>
              <cylinderGeometry args={[0.014, 0.014, p[1], 6]} />
              <meshBasicMaterial color="#F59E0B" transparent opacity={0.55} toneMapped={false} />
            </mesh>
          </group>
        ))}
        <BeaconRing position={[0, 1.55, 0]} color="#FBBF24" radius={0.44} phase={3.1} />
      </group>

      {/* 2. Front-right Warm Amber / Coral Stepped Architectural Micro-Blocks below the gold graph */}
      <group position={[graphCenterX, topY, zz + zone.depth / 2 - 1.1]}>
        {[
          { x: -0.78, h: 0.46, c: '#F59E0B' },
          { x: -0.26, h: 0.78, c: '#FB923C' },
          { x: 0.26, h: 0.58, c: '#F97316' },
          { x: 0.76, h: 0.38, c: '#FCD34D' },
        ].map((b, idx) => (
          <RoundedBox key={idx} args={[0.42, b.h, 0.56]} radius={0.035} smoothness={2} position={[b.x, b.h / 2, 0]} castShadow>
            <meshPhysicalMaterial
              color={b.c}
              emissive={b.c}
              emissiveIntensity={0.45}
              metalness={0.32}
              roughness={0.18}
              transparent
              opacity={0.9}
            />
          </RoundedBox>
        ))}
        <Halo color="#FBBF24" size={1.9} opacity={0.38} position={[0, 0.72, 0]} />
      </group>
    </group>
  );
});

/**
 * Open deep-electric-blue spatial void beneath the floating campus:
 * Replaces the old conventional rectangular office floor & walls with scattered
 * floating translucent architectural micro-tiles and a subtle deep-horizon spatial grid.
 */
export const DeepVoidBackdrop = memo(function DeepVoidBackdrop({
  center,
  light,
}: {
  center: [number, number, number];
  light: boolean;
}) {
  const tiles = useMemo(() => {
    const list: { pos: [number, number, number]; size: [number, number, number]; opacity: number; accent: boolean }[] = [];
    // Deterministic architectural scatter of subtle floating void tiles around the outer perimeter
    const coords = [
      [-18, -2.5, -10, 2.2, 1.6],
      [-15, -3.1, 10, 2.6, 2.1],
      [-6, -3.4, 12.5, 3.0, 1.8],
      [4, -2.8, 12.8, 2.4, 2.2],
      [15, -3.2, 10.5, 2.8, 2.0],
      [26, -2.6, 5.5, 2.2, 2.4],
      [27, -3.0, -7.5, 2.5, 1.9],
      [16, -3.3, -12.5, 2.9, 2.0],
      [2, -2.9, -13.2, 2.4, 1.8],
      [-12, -2.7, -12.0, 2.6, 2.0],
      [-21, -2.9, 1.5, 2.1, 2.5],
      [24, -3.5, 11.0, 2.0, 1.7],
    ];
    coords.forEach(([x, y, z, w, d], idx) => {
      list.push({
        pos: [x, y, z],
        size: [w, 0.16, d],
        opacity: light ? 0.22 : 0.34,
        accent: idx % 3 === 0,
      });
    });
    return list;
  }, [light]);

  return (
    <group>
      {/* Very faint deep-space architectural reference grid far below the floating islands */}
      <Grid
        position={[center[0], -3.8, center[2]]}
        args={[110, 80]}
        cellSize={2.4}
        sectionSize={9.6}
        cellThickness={0.35}
        sectionThickness={0.65}
        cellColor={light ? '#CBD8EA' : '#0A1E44'}
        sectionColor={light ? '#A8BEDB' : '#123670'}
        fadeDistance={75}
        infiniteGrid={false}
      />

      {/* Scattered low-elevation floating dark-blue void tiles echoing the reference's outer mosaic */}
      {tiles.map((t, i) => (
        <group key={i} position={t.pos}>
          <RoundedBox args={t.size} radius={0.04} smoothness={2}>
            <meshStandardMaterial
              color={light ? '#C4D4E8' : '#081C44'}
              metalness={0.55}
              roughness={0.4}
              transparent
              opacity={t.opacity}
            />
          </RoundedBox>
          {t.accent && (
            <mesh position={[0, t.size[1] / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[Math.min(t.size[0], t.size[2]) * 0.36, Math.min(t.size[0], t.size[2]) * 0.42, 4]} />
              <meshBasicMaterial
                color="#2DD4FF"
                transparent
                opacity={light ? 0.15 : 0.22}
                blending={AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
});
