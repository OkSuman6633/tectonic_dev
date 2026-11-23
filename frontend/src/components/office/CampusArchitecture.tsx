import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid, Line, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { AdditiveBlending, DoubleSide, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { BeaconRing, Halo, HoloScreen, NeonPlant, ServerRack, SoftFloorGlow, ZoneMarquee } from './glow';
import type { CampusBridge, CampusZone, OfficeLayout, SatellitePad, Vec3 } from './officeLayout';

/**
 * Neon Cyberpunk stepped island platform matching the reference Neon AI Operations Campus:
 * - Multi-tier dark obsidian/midnight-navy architectural slab
 * - Double bright glowing neon perimeter strips (primary top rim + secondary lower tier rim)
 * - Soft additive outer glow shells + colored reflection bleed onto the dark glossy floor below
 * - Crisp glowing ZoneMarquee sign (top-mounted on back edge or front-mounted on front-left rim)
 */
export const CampusPlatform = memo(function CampusPlatform({
  zone,
}: {
  zone: CampusZone;
  light?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const outerTrimRef = useRef<MeshBasicMaterial>(null);
  const lowerTrimRef = useRef<MeshBasicMaterial>(null);
  const [zx, topY, zz] = zone.center;
  const { width: w, depth: d, thickness: t, accent, secondaryAccent, surfaceTint, signPlacement } = zone;
  const phase = zx * 0.17 + zz * 0.23;

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const wave = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.4 + phase);
    if (outerTrimRef.current) outerTrimRef.current.opacity = 0.85 + 0.15 * wave;
    if (lowerTrimRef.current) lowerTrimRef.current.opacity = 0.65 + 0.25 * wave;
  });

  const slabCenterY = topY - t / 2;
  const lowerSkirtY = topY - t + 0.14;
  const sideWallColor = '#050E24';
  const skirtColor = '#03091A';

  // Top signs sit cleanly along the back edge facing +Z (down-left toward the isometric camera).
  // Front signs mount right on the front-left (+Z) beveled face of Agent Command Zone & Tool Orchestration.
  const marqueeWidth =
    zone.kind === 'command'
      ? 5.3
      : zone.kind === 'tools'
        ? 4.35
        : zone.kind === 'content'
          ? 4.55
          : zone.kind === 'memory'
            ? 4.65
            : 4.3;

  const topSignPos: [number, number, number] = [
    zone.kind === 'content' ? -0.15 : 0,
    topY + 0.04,
    -d / 2 + 0.14,
  ];

  const frontSignPos: [number, number, number] = [
    zone.kind === 'command' ? -0.35 : 0,
    topY - t * 0.34,
    d / 2 + 0.18,
  ];

  const neonTopRails = [
    { pos: [0, topY + 0.024, d / 2 - 0.04] as Vec3, args: [w - 0.08, 0.042, 0.075] as Vec3, glowArgs: [w + 0.06, 0.11, 0.2] as Vec3 },
    { pos: [0, topY + 0.024, -d / 2 + 0.04] as Vec3, args: [w - 0.08, 0.042, 0.075] as Vec3, glowArgs: [w + 0.06, 0.11, 0.2] as Vec3 },
    { pos: [w / 2 - 0.04, topY + 0.024, 0] as Vec3, args: [0.075, 0.042, d - 0.08] as Vec3, glowArgs: [0.2, 0.11, d + 0.06] as Vec3 },
    { pos: [-w / 2 + 0.04, topY + 0.024, 0] as Vec3, args: [0.075, 0.042, d - 0.08] as Vec3, glowArgs: [0.2, 0.11, d + 0.06] as Vec3 },
  ];

  const neonLowerRails = [
    { pos: [0, lowerSkirtY + 0.15, (d + 0.32) / 2 - 0.03] as Vec3, args: [w + 0.28, 0.038, 0.06] as Vec3 },
    { pos: [0, lowerSkirtY + 0.15, -(d + 0.32) / 2 + 0.03] as Vec3, args: [w + 0.28, 0.038, 0.06] as Vec3 },
    { pos: [(w + 0.32) / 2 - 0.03, lowerSkirtY + 0.15, 0] as Vec3, args: [0.06, 0.038, d + 0.28] as Vec3 },
    { pos: [-(w + 0.32) / 2 + 0.03, lowerSkirtY + 0.15, 0] as Vec3, args: [0.06, 0.038, d + 0.28] as Vec3 },
  ];

  return (
    <group position={[zx, 0, zz]}>
      {/* Vivid colored reflection bleed on the glossy dark cyber floor beneath this island */}
      <SoftFloorGlow
        color={accent}
        width={w + 4.8}
        depth={d + 4.8}
        position={[0, 0.015, 0]}
        opacity={0.44}
      />
      <SoftFloorGlow
        color={secondaryAccent}
        width={w + 2.4}
        depth={d + 2.4}
        position={[0, 0.02, 0]}
        opacity={0.28}
      />

      {/* Lower stepped skirt tier resting just above the reflective floor */}
      <RoundedBox
        args={[w + 0.36, 0.3, d + 0.36]}
        radius={0.07}
        smoothness={2}
        position={[0, lowerSkirtY, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={skirtColor} metalness={0.72} roughness={0.26} />
      </RoundedBox>

      {/* Main thick stepped obsidian platform slab */}
      <RoundedBox args={[w, t, d]} radius={0.1} smoothness={3} position={[0, slabCenterY, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={sideWallColor} metalness={0.68} roughness={0.28} />
      </RoundedBox>

      {/* Glossy dark top deck inset */}
      <mesh position={[0, topY + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.18, d - 0.18]} />
        <meshStandardMaterial color={surfaceTint} metalness={0.58} roughness={0.34} />
      </mesh>

      {/* Precision glowing circuit grid on the platform deck */}
      <Grid
        position={[0, topY + 0.012, 0]}
        args={[w - 0.32, d - 0.32]}
        cellSize={0.85}
        sectionSize={2.55}
        cellThickness={0.5}
        sectionThickness={1.0}
        cellColor="#0E254D"
        sectionColor={accent}
        fadeDistance={75}
        infiniteGrid={false}
      />

      {/* Primary hot-neon top perimeter trim + soft additive bloom shell */}
      {neonTopRails.map((rail, i) => (
        <group key={`top-${i}`} position={rail.pos}>
          <mesh>
            <boxGeometry args={rail.args} />
            <meshBasicMaterial ref={i === 0 ? outerTrimRef : undefined} color={accent} transparent opacity={0.96} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.012, 0]}>
            <boxGeometry args={[rail.args[0] * 0.99, 0.016, rail.args[2] * 0.52]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.75} toneMapped={false} />
          </mesh>
          <mesh raycast={() => null}>
            <boxGeometry args={rail.glowArgs} />
            <meshBasicMaterial
              color={accent}
              transparent
              opacity={0.22}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* Secondary luminous lower step perimeter trim */}
      {neonLowerRails.map((rail, i) => (
        <mesh key={`low-${i}`} position={rail.pos}>
          <boxGeometry args={rail.args} />
          <meshBasicMaterial ref={i === 0 ? lowerTrimRef : undefined} color={secondaryAccent} transparent opacity={0.78} toneMapped={false} />
        </mesh>
      ))}

      {/* Corner luminous vertical accent pillars */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`c-${sx}:${sz}`} position={[sx * (w / 2 - 0.06), slabCenterY, sz * (d / 2 - 0.06)]}>
            <boxGeometry args={[0.14, t + 0.04, 0.14]} />
            <meshStandardMaterial color="#0A1B3C" metalness={0.78} roughness={0.22} />
          </mesh>
        )),
      )}

      {/* Glowing Zone Marquee Sign (top floating framed sign or front-edge beveled sign) */}
      <ZoneMarquee
        title={zone.label}
        accent={accent}
        position={signPlacement === 'front' ? frontSignPos : topSignPos}
        rotationY={0}
        width={marqueeWidth}
        stalkHeight={zone.kind === 'hub' ? 2.45 : zone.kind === 'memory' ? 2.25 : zone.kind === 'process' ? 2.25 : 1.55}
        variant={signPlacement}
      />
    </group>
  );
});

/**
 * Glowing neon glass skybridge connecting platforms across open floor channels,
 * with translucent illuminated walkway deck, dual neon rails, under-floor reflection,
 * and animated light-pulse strips gliding across the conduit.
 */
export const SkyBridge = memo(function SkyBridge({
  bridge,
}: {
  bridge: CampusBridge;
  light?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const pulseRefs = [useRef<Mesh>(null), useRef<Mesh>(null), useRef<Mesh>(null)];

  const { mid, length, rotY, tiltX } = useMemo(() => {
    const a = new Vector3(...bridge.from);
    const b = new Vector3(...bridge.to);
    const delta = b.clone().sub(a);
    const horiz = Math.hypot(delta.x, delta.z);
    return {
      mid: a.clone().lerp(b, 0.5),
      length: delta.length(),
      rotY: Math.atan2(delta.x, delta.z),
      tiltX: -Math.atan2(delta.y, Math.max(0.001, horiz)),
    };
  }, [bridge]);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const t = clock.elapsedTime * 0.45;
    pulseRefs.forEach((ref, idx) => {
      if (!ref.current) return;
      const u = ((t + idx / 3) % 1) - 0.5;
      ref.current.position.z = u * (length * 0.88);
    });
  });

  const secondary = bridge.secondaryAccent ?? bridge.accent;

  return (
    <group>
      {/* Colored glow bleed on the dark floor under the bridge */}
      <SoftFloorGlow
        color={bridge.accent}
        width={bridge.width + 1.6}
        depth={length + 1.2}
        position={[mid.x, 0.018, mid.z]}
        opacity={0.3}
      />
      <group position={[mid.x, mid.y - 0.05, mid.z]} rotation={[0, rotY, 0]}>
        <group rotation={[tiltX, 0, 0]}>
          {/* Dark structural truss beneath walkway */}
          <RoundedBox args={[bridge.width * 0.9, 0.14, length]} radius={0.03} smoothness={2} position={[0, -0.09, 0]}>
            <meshStandardMaterial color="#05112B" metalness={0.75} roughness={0.28} />
          </RoundedBox>
          {/* Illuminated translucent neon glass deck */}
          <mesh position={[0, 0.01, 0]} receiveShadow>
            <boxGeometry args={[bridge.width, 0.05, length]} />
            <meshPhysicalMaterial
              color={bridge.accent}
              emissive={bridge.accent}
              emissiveIntensity={0.48}
              metalness={0.25}
              roughness={0.14}
              transparent
              opacity={0.58}
            />
          </mesh>
          {/* Bright glowing guard rails */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (bridge.width / 2 - 0.04), 0.055, 0]}>
              <mesh>
                <boxGeometry args={[0.055, 0.05, length]} />
                <meshBasicMaterial color={side < 0 ? bridge.accent : secondary} toneMapped={false} />
              </mesh>
              <mesh position={[0, 0.015, 0]}>
                <boxGeometry args={[0.022, 0.02, length]} />
                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.75} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {/* Center illuminated data trace */}
          <mesh position={[0, 0.044, 0]}>
            <boxGeometry args={[0.12, 0.012, length * 0.96]} />
            <meshBasicMaterial color="#E0F9FF" transparent opacity={0.8} toneMapped={false} />
          </mesh>
          {/* Transverse illuminated walkway ribs */}
          {[-0.36, -0.12, 0.12, 0.36].map((frac) => (
            <mesh key={frac} position={[0, 0.04, frac * length]}>
              <boxGeometry args={[bridge.width - 0.16, 0.015, 0.07]} />
              <meshBasicMaterial color={bridge.accent} transparent opacity={0.82} toneMapped={false} />
            </mesh>
          ))}
          {/* Animated data-pulse light beads gliding continuously along the bridge */}
          {pulseRefs.map((ref, idx) => (
            <mesh key={idx} ref={ref} position={[0, 0.06, 0]}>
              <boxGeometry args={[0.26, 0.024, 0.42]} />
              <meshBasicMaterial color="#FFFFFF" transparent opacity={0.92} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
});

/**
 * Satellite pads around the campus:
 * - sat-globe (front-left of Content Studio): glowing cyan wireframe geodesic dome/globe on a stepped neon pad!
 * - sat-front-plinth & sat-right-accent: stepped dark glowing floor blocks framing the outer perimeter.
 */
export const SatelliteCluster = memo(function SatelliteCluster({
  satellites,
}: {
  satellites: SatellitePad[];
  light?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const globeRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!reducedMotion && globeRef.current) {
      globeRef.current.rotation.y += delta * 0.35;
    }
  });

  return (
    <group>
      {satellites.map((sat) => {
        const [sx, sy, sz] = sat.center;
        const slabCenterY = sy - sat.thickness / 2;

        return (
          <group key={sat.id}>
            {sat.tetherTo && (
              <Line
                points={[
                  [sx, sy - 0.04, sz - sat.depth / 2],
                  [sat.tetherTo[0], sat.tetherTo[1] - 0.04, sat.tetherTo[2]],
                ]}
                color={sat.accent}
                lineWidth={2.2}
                transparent
                opacity={0.78}
              />
            )}

            <group position={[sx, 0, sz]}>
              <SoftFloorGlow color={sat.accent} width={sat.width + 2.6} depth={sat.depth + 2.6} position={[0, 0.014, 0]} opacity={0.38} />
              {/* Lower stepped base */}
              <RoundedBox args={[sat.width + 0.24, 0.22, sat.depth + 0.24]} radius={0.06} smoothness={2} position={[0, 0.12, 0]}>
                <meshStandardMaterial color="#030A1C" metalness={0.72} roughness={0.28} />
              </RoundedBox>
              {/* Main thick satellite slab */}
              <RoundedBox args={[sat.width, sat.thickness, sat.depth]} radius={0.08} smoothness={2} position={[0, slabCenterY, 0]} castShadow receiveShadow>
                <meshStandardMaterial color="#061430" metalness={0.68} roughness={0.28} />
              </RoundedBox>
              {/* Glowing neon perimeter rim */}
              {[
                { p: [0, sy + 0.02, sat.depth / 2 - 0.04] as Vec3, a: [sat.width - 0.08, 0.036, 0.06] as Vec3 },
                { p: [0, sy + 0.02, -sat.depth / 2 + 0.04] as Vec3, a: [sat.width - 0.08, 0.036, 0.06] as Vec3 },
                { p: [sat.width / 2 - 0.04, sy + 0.02, 0] as Vec3, a: [0.06, 0.036, sat.depth - 0.08] as Vec3 },
                { p: [-sat.width / 2 + 0.04, sy + 0.02, 0] as Vec3, a: [0.06, 0.036, sat.depth - 0.08] as Vec3 },
              ].map((r, i) => (
                <mesh key={i} position={r.p}>
                  <boxGeometry args={r.a} />
                  <meshBasicMaterial color={sat.accent} transparent opacity={0.92} toneMapped={false} />
                </mesh>
              ))}

              {/* Iconic front-left glowing cyan wireframe geodesic dome/globe! */}
              {sat.feature === 'globe' && (
                <group position={[0, sy + 0.03, 0]}>
                  {/* Glowing base emitter ring */}
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                    <ringGeometry args={[1.05, 1.24, 48]} />
                    <meshBasicMaterial color="#00F0FF" transparent opacity={0.85} side={DoubleSide} toneMapped={false} />
                  </mesh>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
                    <circleGeometry args={[1.05, 48]} />
                    <meshBasicMaterial color="#00B4D8" transparent opacity={0.28} toneMapped={false} />
                  </mesh>
                  {/* Rotating holographic wireframe geodesic dome */}
                  <group ref={globeRef} position={[0, 0.06, 0]}>
                    <mesh>
                      <sphereGeometry args={[1.08, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
                      <meshBasicMaterial color="#38F2FF" wireframe transparent opacity={0.82} toneMapped={false} />
                    </mesh>
                    {/* Translucent glowing inner shell */}
                    <mesh>
                      <sphereGeometry args={[1.04, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
                      <meshBasicMaterial
                        color="#00E5FF"
                        transparent
                        opacity={0.18}
                        blending={AdditiveBlending}
                        depthWrite={false}
                        toneMapped={false}
                      />
                    </mesh>
                    {/* Bright latitude rings */}
                    {[0.25, 0.55, 0.82].map((h, idx) => (
                      <mesh key={idx} position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[Math.sqrt(Math.max(0.05, 1.08 * 1.08 - h * h)), 0.016, 8, 36]} />
                        <meshBasicMaterial color="#A5F3FC" transparent opacity={0.78} toneMapped={false} />
                      </mesh>
                    ))}
                  </group>
                  <Halo color="#00F0FF" size={3.2} opacity={0.55} position={[0, 0.65, 0]} />
                </group>
              )}

              {/* Stepped dark-blue glowing top cap for front/outer decorative floor plinths */}
              {(sat.feature === 'plinth' || sat.feature === 'accent') && (
                <RoundedBox args={[sat.width * 0.58, 0.36, sat.depth * 0.58]} radius={0.04} smoothness={2} position={[0, sy + 0.18, 0]} castShadow>
                  <meshStandardMaterial color="#0B224D" metalness={0.62} roughness={0.3} />
                </RoundedBox>
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
});

/**
 * AGENT COMMAND ZONE landmarks (Center Foreground):
 * - Left flank glowing blue & violet server racks
 * - Right flank tall server cabinet behind the supervisory holographic terminal
 * - Sleek elevated command dais under agent_builder
 * - Glowing cyan floor circuit traces connecting workstation rings
 * - Front corner lush potted plant
 */
export const AgentCommandLandmarks = memo(function AgentCommandLandmarks({
  zone,
  builderDais,
  desks,
}: {
  zone: CampusZone;
  builderDais: OfficeLayout['builderDais'];
  desks: Record<string, Vec3>;
}) {
  const [zx, topY, zz] = zone.center;
  const leftEdge = zx - zone.width / 2;
  const rightEdge = zx + zone.width / 2;
  const frontEdge = zz + zone.depth / 2;

  // Build subtle glowing circuit traces linking adjacent workstation floor rings
  const deskLinks = useMemo(() => {
    const pts = Object.values(desks);
    const links: [Vec3, Vec3][] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = Math.abs(pts[i][0] - pts[j][0]);
        const dz = Math.abs(pts[i][2] - pts[j][2]);
        const dist = Math.hypot(dx, dz);
        if (dist > 1.0 && dist < 3.4 && (dx < 0.45 || dz < 0.45)) {
          links.push([
            [pts[i][0], topY + 0.025, pts[i][2]],
            [pts[j][0], topY + 0.025, pts[j][2]],
          ]);
        }
      }
    }
    return links;
  }, [desks, topY]);

  return (
    <group>
      {/* Left flank server rack cluster matching reference image */}
      <ServerRack position={[leftEdge + 1.0, topY, zz + 2.35]} height={1.38} width={0.64} depth={0.62} accent="#00D8FF" />
      <ServerRack position={[leftEdge + 1.85, topY, zz + 1.55]} height={1.65} width={0.7} depth={0.66} accent="#8B5CF6" />

      {/* Tall translucent cyan server tower behind the right-side supervisory desk */}
      <ServerRack position={[rightEdge - 1.55, topY, zz - 3.05]} height={2.25} width={0.72} depth={0.66} accent="#38BDF8" />

      {/* Sleek glowing command dais under agent_builder */}
      {builderDais && (
        <group position={[builderDais.center[0], builderDais.baseY, builderDais.center[2]]}>
          <RoundedBox args={[2.85, 0.22, 2.55]} radius={0.05} smoothness={2} position={[0, 0.11, 0.1]} receiveShadow castShadow>
            <meshStandardMaterial color="#0A1D42" metalness={0.68} roughness={0.28} />
          </RoundedBox>
          {[
            { pos: [0, 0.225, 1.35] as Vec3, args: [2.75, 0.025, 0.04] as Vec3 },
            { pos: [0, 0.225, -1.15] as Vec3, args: [2.75, 0.025, 0.04] as Vec3 },
            { pos: [1.4, 0.225, 0.1] as Vec3, args: [0.04, 0.025, 2.5] as Vec3 },
            { pos: [-1.4, 0.225, 0.1] as Vec3, args: [0.04, 0.025, 2.5] as Vec3 },
          ].map((r, i) => (
            <mesh key={i} position={r.pos}>
              <boxGeometry args={r.args} />
              <meshBasicMaterial color="#00E5FF" toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}

      {/* Glowing floor circuit links between workstations */}
      {deskLinks.map((seg, i) => (
        <Line key={i} points={seg} color="#00D8FF" lineWidth={1.3} transparent opacity={0.42} />
      ))}

      {/* Front corner lush green potted plant */}
      <NeonPlant position={[rightEdge - 0.85, topY, frontEdge - 0.72]} scale={1.15} />
    </group>
  );
});

/**
 * COMMAND CENTER landmarks (Back-Left Electric Cyan Hub):
 * - 4-tier concentric glowing cyan stepped pyramid dais
 * - Translucent glass cube frame crowning the pyramid enclosing a bright floating neon cyan torus ring
 * - 4 translucent holographic telemetry screens floating around the pyramid
 * - Vertical cyan light pillars / data rods + left server cabinet
 */
export const CommandCenterLandmarks = memo(function CommandCenterLandmarks({
  zone,
}: {
  zone: CampusZone;
}) {
  const [zx, topY, zz] = zone.center;
  const tiers = [
    { size: 3.75, h: 0.24, y: 0.12 },
    { size: 3.05, h: 0.24, y: 0.36 },
    { size: 2.38, h: 0.24, y: 0.60 },
    { size: 1.72, h: 0.24, y: 0.84 },
  ];

  return (
    <group position={[zx, topY, zz]}>
      {/* 4-tier glowing cyan stepped pyramid */}
      {tiers.map((tier, idx) => (
        <group key={idx} position={[0, tier.y, 0]}>
          <RoundedBox args={[tier.size, tier.h, tier.size]} radius={0.04} smoothness={2} castShadow receiveShadow>
            <meshStandardMaterial color="#081C44" metalness={0.7} roughness={0.25} />
          </RoundedBox>
          {[
            { p: [0, tier.h / 2 + 0.01, tier.size / 2 - 0.02] as Vec3, a: [tier.size, 0.026, 0.045] as Vec3 },
            { p: [0, tier.h / 2 + 0.01, -tier.size / 2 + 0.02] as Vec3, a: [tier.size, 0.026, 0.045] as Vec3 },
            { p: [tier.size / 2 - 0.02, tier.h / 2 + 0.01, 0] as Vec3, a: [0.045, 0.026, tier.size] as Vec3 },
            { p: [-tier.size / 2 + 0.02, tier.h / 2 + 0.01, 0] as Vec3, a: [0.045, 0.026, tier.size] as Vec3 },
          ].map((edge, ei) => (
            <mesh key={ei} position={edge.p}>
              <boxGeometry args={edge.a} />
              <meshBasicMaterial color={idx === 3 ? '#A5F3FC' : '#00E5FF'} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Translucent glass cube crowning the pyramid enclosing the bright glowing cyan ring */}
      <group position={[0, 1.56, 0]}>
        <mesh>
          <boxGeometry args={[1.38, 1.24, 1.38]} />
          <meshPhysicalMaterial
            color="#00D8FF"
            emissive="#0096FF"
            emissiveIntensity={0.42}
            metalness={0.18}
            roughness={0.1}
            transparent
            opacity={0.28}
          />
        </mesh>
        <mesh>
          <boxGeometry args={[1.4, 1.26, 1.4]} />
          <meshBasicMaterial color="#7DD3FC" wireframe transparent opacity={0.78} toneMapped={false} />
        </mesh>
      </group>

      {/* Iconic glowing cyan/white torus ring floating inside the Command Center glass cube */}
      <BeaconRing position={[0, 1.56, 0]} color="#00E5FF" radius={0.46} orientation="vertical" rotationY={Math.PI / 4} phase={0.2} />

      {/* Translucent holographic screens flanking the pyramid */}
      <HoloScreen variant="command" accent="#00E5FF" position={[-1.95, 1.35, -0.35]} rotation={[0, 0.35, 0]} width={1.25} height={0.95} />
      <HoloScreen variant="code" accent="#38BDF8" position={[1.85, 1.3, -0.55]} rotation={[0, -0.45, 0]} width={1.2} height={0.92} />
      <HoloScreen variant="command" accent="#00D8FF" position={[-0.95, 0.85, 2.05]} rotation={[0, 0.1, 0]} width={1.1} height={0.72} />

      {/* Thin glowing vertical light pillars / data rods */}
      {[
        [-1.4, 1.2, -1.4],
        [1.4, 1.35, -1.4],
        [-1.55, 1.05, 1.25],
        [1.55, 1.1, 1.25],
      ].map(([px, h, pz], i) => (
        <mesh key={i} position={[px, h / 2, pz]} raycast={() => null}>
          <cylinderGeometry args={[0.014, 0.014, h, 8]} />
          <meshBasicMaterial color="#7DD3FC" transparent opacity={0.62} toneMapped={false} />
        </mesh>
      ))}

      {/* Back-left server tower */}
      <ServerRack position={[-2.35, 0, -1.75]} height={1.32} width={0.62} depth={0.58} accent="#00E5FF" />
    </group>
  );
});

/**
 * CONTENT STUDIO - RCP landmarks (Far Left Cyan Island):
 * - Left holographic glass screen displaying glowing cyan hexagon wireframe
 * - Right bright glowing cyan circular energy disc / floating ring emitter
 * - Left corner lush green potted plant
 */
export const ContentStudioLandmarks = memo(function ContentStudioLandmarks({
  zone,
}: {
  zone: CampusZone;
}) {
  const [zx, topY, zz] = zone.center;
  return (
    <group position={[zx, topY, zz]}>
      {/* Left holographic hexagon display panel */}
      <HoloScreen variant="hex" accent="#00E5FF" position={[-0.95, 1.02, -0.15]} rotation={[0, 0.18, 0]} width={1.9} height={1.35} />
      {/* Glowing emitter plinth under hexagon screen */}
      <RoundedBox args={[1.65, 0.14, 0.72]} radius={0.04} smoothness={2} position={[-0.95, 0.07, -0.15]}>
        <meshStandardMaterial color="#0A1F46" metalness={0.7} roughness={0.28} />
      </RoundedBox>

      {/* Right circular neon emitter pad + glowing cyan torus ring */}
      <group position={[1.1, 0.04, 0.25]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 0.94, 40]} />
          <meshBasicMaterial color="#00E5FF" transparent opacity={0.85} side={DoubleSide} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[0.72, 40]} />
          <meshBasicMaterial color="#00B4D8" transparent opacity={0.32} toneMapped={false} />
        </mesh>
        <BeaconRing position={[0, 0.88, 0]} color="#00E5FF" radius={0.46} orientation="vertical" rotationY={Math.PI / 4} phase={1.3} />
      </group>

      {/* Corner potted plant */}
      <NeonPlant position={[-zone.width / 2 + 0.58, 0, zone.depth / 2 - 0.58]} scale={1.0} />
    </group>
  );
});

/**
 * SHORT-TERM & LONG-TERM MEMORY landmarks (Back-Right Purple & Cyan Island):
 * - Center glowing purple pedestal cube supporting translucent purple/blue vertical cylinder
 *   filled with 5 stacked glowing neon cyan/white horizontal memory rings
 * - Flanking left & right glowing translucent blue-violet glass cubes
 * - Left holographic memory metrics screen
 * - Dual corner potted plants
 */
export const MemoryLandmarks = memo(function MemoryLandmarks({
  zone,
}: {
  zone: CampusZone;
}) {
  const reducedMotion = useReducedMotion();
  const ringsRef = useRef<Group>(null);
  const [zx, topY, zz] = zone.center;

  useFrame(({ clock }) => {
    if (!reducedMotion && ringsRef.current) {
      ringsRef.current.rotation.y = clock.elapsedTime * 0.65;
    }
  });

  return (
    <group position={[zx, topY, zz]}>
      {/* Central purple cube pedestal */}
      <group position={[0, 0.42, 0.1]}>
        <RoundedBox args={[1.05, 0.84, 1.05]} radius={0.05} smoothness={2} castShadow>
          <meshPhysicalMaterial
            color="#6D28D9"
            emissive="#8B5CF6"
            emissiveIntensity={0.62}
            metalness={0.35}
            roughness={0.18}
            transparent
            opacity={0.88}
          />
        </RoundedBox>
        <mesh>
          <boxGeometry args={[1.08, 0.86, 1.08]} />
          <meshBasicMaterial color="#D8B4FE" wireframe transparent opacity={0.55} toneMapped={false} />
        </mesh>
      </group>

      {/* Translucent glowing purple/cyan vertical memory core cylinder + stacked neon rings */}
      <group position={[0, 1.56, 0.1]}>
        <mesh>
          <cylinderGeometry args={[0.56, 0.56, 1.48, 32, 1, true]} />
          <meshPhysicalMaterial
            color="#7C3AED"
            emissive="#6366F1"
            emissiveIntensity={0.45}
            transparent
            opacity={0.32}
            roughness={0.1}
            side={DoubleSide}
          />
        </mesh>
        {/* Top & bottom cylinder rim rings */}
        {[-0.74, 0.74].map((ry, idx) => (
          <mesh key={idx} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.56, 0.024, 10, 36]} />
            <meshBasicMaterial color="#C084FC" toneMapped={false} />
          </mesh>
        ))}
        {/* Stacked luminous horizontal memory disks */}
        <group ref={ringsRef}>
          {[-0.5, -0.25, 0, 0.25, 0.5].map((y, idx) => (
            <group key={idx} position={[0, y, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.42, 0.036, 10, 32]} />
                <meshBasicMaterial color={idx % 2 === 0 ? '#E0F9FF' : '#38BDF8'} toneMapped={false} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.4, 24]} />
                <meshBasicMaterial color="#A855F7" transparent opacity={0.22} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
        {/* Central luminous data spine */}
        <mesh>
          <cylinderGeometry args={[0.045, 0.045, 1.42, 12]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} toneMapped={false} />
        </mesh>
        <Halo color="#A855F7" size={3.2} opacity={0.55} position={[0, 0, 0]} />
      </group>

      {/* Flanking glowing electric-blue translucent cubes */}
      {[
        { pos: [-1.18, 0.44, -0.05] as Vec3, c: '#38BDF8', e: '#0EA5E9' },
        { pos: [1.18, 0.44, -0.05] as Vec3, c: '#60A5FA', e: '#3B82F6' },
      ].map((cube, idx) => (
        <group key={idx} position={cube.pos}>
          <RoundedBox args={[0.84, 0.84, 0.84]} radius={0.04} smoothness={2} castShadow>
            <meshPhysicalMaterial
              color={cube.c}
              emissive={cube.e}
              emissiveIntensity={0.52}
              metalness={0.3}
              roughness={0.15}
              transparent
              opacity={0.78}
            />
          </RoundedBox>
          <mesh>
            <boxGeometry args={[0.86, 0.86, 0.86]} />
            <meshBasicMaterial color="#BAE6FD" wireframe transparent opacity={0.62} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Left holographic memory telemetry display */}
      <HoloScreen variant="memory" accent="#38BDF8" secondaryAccent="#C084FC" position={[-2.05, 1.25, -0.65]} rotation={[0, 0.25, 0]} width={1.35} height={1.12} />

      {/* Dual corner lush potted plants matching reference image */}
      <NeonPlant position={[-zone.width / 2 + 0.62, 0, zone.depth / 2 - 0.68]} scale={1.0} />
      <NeonPlant position={[zone.width / 2 - 0.62, 0, zone.depth / 2 - 0.68]} scale={1.0} />
    </group>
  );
});

/**
 * PROCESS STUDIO landmarks (Far-Right Hot Magenta / Pink Island):
 * - Dense matrix of glowing translucent hot-pink/magenta glass cubes of varied heights
 * - Prominent floating glowing neon pink/white vertical torus ring
 * - Angled pink & cyan holographic code/workflow panels
 * - Corner potted plant
 */
export const ProcessStudioLandmarks = memo(function ProcessStudioLandmarks({
  zone,
}: {
  zone: CampusZone;
}) {
  const [zx, topY, zz] = zone.center;

  const pinkCubes: { p: Vec3; s: Vec3; c: string; e: string }[] = [
    { p: [-1.75, 0.42, 0.85], s: [0.85, 0.84, 0.85], c: '#EC4899', e: '#FF2AA6' },
    { p: [-0.35, 0.56, 0.95], s: [0.88, 1.12, 0.88], c: '#F472B6', e: '#FF2AA6' },
    { p: [0.88, 0.48, 0.72], s: [0.86, 0.96, 0.86], c: '#DB2777', e: '#EC4899' },
    { p: [-0.95, 0.36, -0.15], s: [0.76, 0.72, 0.76], c: '#D946EF', e: '#FF2AA6' },
    { p: [0.22, 0.46, -0.25], s: [0.82, 0.92, 0.82], c: '#EC4899', e: '#F472B6' },
    { p: [1.55, 0.54, 0.12], s: [0.88, 1.08, 0.88], c: '#F472B6', e: '#FF2AA6' },
    { p: [-0.45, 0.64, -1.25], s: [0.78, 1.28, 0.78], c: '#C026D3', e: '#EC4899' },
    { p: [1.15, 0.42, -1.12], s: [0.74, 0.84, 0.74], c: '#EC4899', e: '#FF2AA6' },
    { p: [0.32, 0.32, 1.85], s: [0.76, 0.64, 0.76], c: '#F43F98', e: '#FF2AA6' },
  ];

  return (
    <group position={[zx, topY, zz]}>
      {/* Cluster of glowing translucent magenta glass cubes */}
      {pinkCubes.map((cube, idx) => (
        <group key={idx} position={cube.p}>
          <RoundedBox args={cube.s} radius={0.04} smoothness={2} castShadow>
            <meshPhysicalMaterial
              color={cube.c}
              emissive={cube.e}
              emissiveIntensity={0.55}
              metalness={0.28}
              roughness={0.14}
              transparent
              opacity={0.82}
            />
          </RoundedBox>
          <mesh>
            <boxGeometry args={[cube.s[0] + 0.02, cube.s[1] + 0.02, cube.s[2] + 0.02]} />
            <meshBasicMaterial color="#FBCFE8" wireframe transparent opacity={0.52} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Prominent glowing hot-pink/white torus ring floating above the cube matrix */}
      <BeaconRing position={[0.35, 1.65, -0.45]} color="#FF2AA6" radius={0.72} orientation="vertical" rotationY={Math.PI / 4} phase={2.2} />

      {/* Holographic code & workflow UI panels */}
      <HoloScreen variant="workflow" accent="#FF2AA6" secondaryAccent="#FBCFE8" position={[-1.95, 1.38, -1.15]} rotation={[0, 0.25, 0]} width={1.55} height={1.25} />
      <HoloScreen variant="code" accent="#38BDF8" secondaryAccent="#FF2AA6" position={[-2.65, 1.0, 0.95]} rotation={[0, 0.35, 0]} width={1.15} height={0.82} />
      <HoloScreen variant="code" accent="#38BDF8" secondaryAccent="#FBCFE8" position={[2.45, 1.32, 0.55]} rotation={[0, -0.45, 0]} width={1.25} height={1.38} />

      {/* Right corner potted plant */}
      <NeonPlant position={[zone.width / 2 - 0.58, 0, zone.depth / 2 - 0.65]} scale={1.0} />
    </group>
  );
});

/**
 * TOOL ORCHESTRATION landmarks (Bottom-Right Foreground Warm Amber/Gold Island):
 * - Central stepped golden dais crowned with a glowing golden energy core inside a translucent glass wireframe cube
 * - Surrounding metallic gold/bronze tool server blocks + glowing amber deck circuit traces
 * - Large back-right cyan holographic display screen with crisp gear/cog schematic
 * - Front-left corner potted plant
 */
export const ToolOrchestrationLandmarks = memo(function ToolOrchestrationLandmarks({
  zone,
}: {
  zone: CampusZone;
}) {
  const [zx, topY, zz] = zone.center;

  const goldModules: { p: Vec3; s: Vec3; c: string }[] = [
    { p: [-1.85, 0.42, 0.35], s: [0.85, 0.84, 0.85], c: '#B47A1E' },
    { p: [-1.25, 0.32, 1.45], s: [0.68, 0.64, 0.68], c: '#D99B26' },
    { p: [0.1, 0.54, 1.45], s: [0.95, 1.08, 0.95], c: '#E6A82E' },
    { p: [1.45, 0.62, 0.55], s: [1.15, 1.24, 0.95], c: '#C68C22' },
    { p: [2.15, 0.36, 1.35], s: [0.62, 0.72, 0.62], c: '#9E6B1A' },
    { p: [-1.75, 0.46, -1.15], s: [0.76, 0.92, 0.76], c: '#C68C22' },
  ];

  return (
    <group position={[zx, topY, zz]}>
      {/* Central stepped amber-gold dais */}
      {[
        { size: 2.35, h: 0.22, y: 0.11 },
        { size: 1.72, h: 0.22, y: 0.33 },
      ].map((step, idx) => (
        <group key={idx} position={[0, step.y, -0.35]}>
          <RoundedBox args={[step.size, step.h, step.size]} radius={0.04} smoothness={2} castShadow receiveShadow>
            <meshStandardMaterial color="#2A1D0A" metalness={0.72} roughness={0.28} />
          </RoundedBox>
          {[
            { p: [0, step.h / 2 + 0.01, step.size / 2 - 0.02] as Vec3, a: [step.size, 0.026, 0.04] as Vec3 },
            { p: [0, step.h / 2 + 0.01, -step.size / 2 + 0.02] as Vec3, a: [step.size, 0.026, 0.04] as Vec3 },
            { p: [step.size / 2 - 0.02, step.h / 2 + 0.01, 0] as Vec3, a: [0.04, 0.026, step.size] as Vec3 },
            { p: [-step.size / 2 + 0.02, step.h / 2 + 0.01, 0] as Vec3, a: [0.04, 0.026, step.size] as Vec3 },
          ].map((edge, ei) => (
            <mesh key={ei} position={edge.p}>
              <boxGeometry args={edge.a} />
              <meshBasicMaterial color="#FFC233" toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Glowing golden energy cube core inside translucent glass wireframe cube */}
      <group position={[0, 1.08, -0.35]}>
        <mesh>
          <boxGeometry args={[0.68, 0.68, 0.68]} />
          <meshBasicMaterial color="#FFFBEB" toneMapped={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[1.18, 1.18, 1.18]} />
          <meshPhysicalMaterial
            color="#FFAE00"
            emissive="#F59E0B"
            emissiveIntensity={0.62}
            metalness={0.25}
            roughness={0.12}
            transparent
            opacity={0.42}
          />
        </mesh>
        <mesh>
          <boxGeometry args={[1.22, 1.22, 1.22]} />
          <meshBasicMaterial color="#FDE68A" wireframe transparent opacity={0.85} toneMapped={false} />
        </mesh>
        <Halo color="#FFAE00" size={3.6} opacity={0.68} position={[0, 0.05, 0]} />
      </group>

      {/* Surrounding metallic gold/amber tool server blocks */}
      {goldModules.map((m, idx) => (
        <group key={idx} position={m.p}>
          <RoundedBox args={m.s} radius={0.04} smoothness={2} castShadow receiveShadow>
            <meshStandardMaterial color={m.c} emissive="#78350F" emissiveIntensity={0.28} metalness={0.68} roughness={0.28} />
          </RoundedBox>
          <mesh position={[0, m.s[1] / 2 + 0.01, 0]}>
            <boxGeometry args={[m.s[0] * 0.88, 0.024, m.s[2] * 0.88]} />
            <meshBasicMaterial color="#FCD34D" transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.05, m.s[2] / 2 + 0.008]}>
            <boxGeometry args={[m.s[0] * 0.65, 0.045, 0.014]} />
            <meshBasicMaterial color="#FEF08A" transparent opacity={0.85} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Back-right tall cyan-blue server tower beside the cog screen */}
      <ServerRack position={[2.25, 0, -1.05]} height={1.45} width={0.66} depth={0.66} accent="#38BDF8" />

      {/* Large glowing cyan holographic gear/cog screen behind the golden core */}
      <HoloScreen variant="gear" accent="#38BDF8" position={[1.15, 1.58, -1.85]} rotation={[0, -0.15, 0]} width={2.55} height={1.85} />

      {/* Front-left corner potted plant */}
      <NeonPlant position={[-zone.width / 2 + 0.65, 0, zone.depth / 2 - 0.65]} scale={1.0} />
    </group>
  );
});

/**
 * Glossy midnight-blue reflective cyber floor + distant translucent dark-blue monolith silhouettes
 * matching the Neon AI Operations Campus background atmosphere.
 */
export const NeonFloorAndBackdrop = memo(function NeonFloorAndBackdrop({
  center,
}: {
  center: [number, number, number];
  light?: boolean;
}) {
  // Distant dark city monoliths rising softly in the upper background behind the campus
  const monoliths = useMemo(
    () => [
      { pos: [-19, 4.2, -16] as Vec3, size: [2.2, 8.4, 2.2] as Vec3, accent: '#0EA5E9' },
      { pos: [-14, 2.8, -19] as Vec3, size: [1.8, 5.6, 1.8] as Vec3, accent: '#1D4ED8' },
      { pos: [-5, 3.6, -21] as Vec3, size: [2.4, 7.2, 2.0] as Vec3, accent: '#3B82F6' },
      { pos: [4, 5.2, -22] as Vec3, size: [2.8, 10.4, 2.4] as Vec3, accent: '#1D4ED8' },
      { pos: [11, 3.4, -19] as Vec3, size: [1.9, 6.8, 1.9] as Vec3, accent: '#2563EB' },
      { pos: [19, 4.0, -15] as Vec3, size: [2.3, 8.0, 2.2] as Vec3, accent: '#4F46E5' },
      { pos: [-22, 3.2, -5] as Vec3, size: [2.0, 6.4, 2.0] as Vec3, accent: '#0284C7' },
    ],
    [],
  );

  // Subtle scattered low cyber tiles around the outer reflective floor
  const floorBlocks = useMemo(
    () => [
      { pos: [-16, 0.14, 10.5] as Vec3, size: [1.7, 0.28, 1.7] as Vec3 },
      { pos: [1.5, 0.14, 14.5] as Vec3, size: [1.8, 0.28, 1.8] as Vec3 },
      { pos: [15.5, 0.15, 9.2] as Vec3, size: [1.9, 0.3, 1.9] as Vec3 },
      { pos: [18.5, 0.14, 1.8] as Vec3, size: [1.6, 0.28, 1.6] as Vec3 },
      { pos: [-17.5, 0.14, 2.4] as Vec3, size: [1.5, 0.28, 1.5] as Vec3 },
      { pos: [14.0, 0.14, -12.5] as Vec3, size: [2.1, 0.28, 2.1] as Vec3 },
    ],
    [],
  );

  return (
    <group>
      {/* Glossy dark midnight-blue cyber floor receiving island glows & shadows */}
      <mesh position={[center[0], 0, center[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#030A1E" metalness={0.78} roughness={0.26} />
      </mesh>

      {/* Crisp deep-blue cyber circuit floor grid */}
      <Grid
        position={[center[0], 0.006, center[2]]}
        args={[130, 130]}
        cellSize={1.8}
        sectionSize={7.2}
        cellThickness={0.45}
        sectionThickness={0.85}
        cellColor="#091D48"
        sectionColor="#123C8C"
        fadeDistance={78}
        infiniteGrid={false}
      />

      {/* Ambient central floor glow pool tying the campus together */}
      <SoftFloorGlow color="#0B5ED7" width={34} depth={30} position={[center[0], 0.01, center[2]]} opacity={0.28} />

      {/* Scattered low glowing architectural floor blocks */}
      {floorBlocks.map((b, i) => (
        <group key={i} position={b.pos}>
          <RoundedBox args={b.size} radius={0.04} smoothness={2} receiveShadow>
            <meshStandardMaterial color="#061638" metalness={0.7} roughness={0.28} />
          </RoundedBox>
          <mesh position={[0, b.size[1] / 2 + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[b.size[0] * 0.44, b.size[0] * 0.48, 4]} />
            <meshBasicMaterial color="#1D6BFF" transparent opacity={0.48} side={DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Distant translucent midnight-blue monolith towers in the upper fog */}
      {monoliths.map((m, i) => (
        <group key={`m-${i}`} position={m.pos} raycast={() => null}>
          <mesh>
            <boxGeometry args={m.size} />
            <meshStandardMaterial color="#051333" metalness={0.75} roughness={0.35} transparent opacity={0.72} />
          </mesh>
          <mesh position={[0, m.size[1] / 2 + 0.02, 0]}>
            <boxGeometry args={[m.size[0] * 0.96, 0.04, m.size[2] * 0.96]} />
            <meshBasicMaterial color={m.accent} transparent opacity={0.35} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
});
