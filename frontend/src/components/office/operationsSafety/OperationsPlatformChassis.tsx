import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, ExtrudeGeometry, Shape, type MeshStandardMaterial } from 'three';
import type { CampusZone, Vec3 } from '../officeLayout';
import { getOpsDeckTexture, getOpsFrontSignTexture } from './textures';

/**
 * Brushed-Brass Tubular & Tempered-Glass Safety Balustrade matching the reference's perimeter railings.
 */
const OpsGlassBrassRailing = memo(function OpsGlassBrassRailing({
  start,
  length,
  rotation = [0, 0, 0],
  height = 0.68,
}: {
  start: Vec3;
  length: number;
  rotation?: [number, number, number];
  height?: number;
}) {
  const posts = useMemo(() => {
    const count = Math.max(2, Math.round(length / 1.05) + 1);
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((i / (count - 1)) * length);
    return out;
  }, [length]);

  return (
    <group position={start} rotation={rotation}>
      {/* Upper & mid brushed-brass tubular handrails */}
      {[height, height * 0.56].map((ry, i) => (
        <mesh key={i} position={[length / 2, ry, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.024, 0.024, length + 0.04, 10]} />
          <meshStandardMaterial color="#D4AF6A" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      {/* Tempered glass infill panel */}
      <mesh position={[length / 2, height * 0.5, 0]}>
        <boxGeometry args={[length - 0.04, height * 0.76, 0.022]} />
        <meshStandardMaterial
          color="#7DD3FC"
          emissive="#0284C7"
          emissiveIntensity={0.22}
          transparent
          opacity={0.2}
          roughness={0.08}
          metalness={0.18}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Brushed-brass stanchions with machined base collars */}
      {posts.map((px, i) => (
        <group key={i} position={[px, 0, 0]}>
          <mesh position={[0, height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, height, 10]} />
            <meshStandardMaterial color="#C8A25B" metalness={0.88} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.022, 0]}>
            <cylinderGeometry args={[0.048, 0.056, 0.044, 10]} />
            <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.28} />
          </mesh>
          <mesh position={[0, height + 0.014, 0]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshStandardMaterial color="#E5C585" metalness={0.92} roughness={0.16} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/**
 * Multi-Tier Metallic Industrial Platform Chassis for Operations & Safety Center:
 * - Dark gunmetal armor skirt with recessed cyan-blue vent LEDs & continuous lower cyan corner bars
 * - Stepped brushed-titanium upper collar with continuous warm amber-gold illuminated perimeter rim
 * - Reflective mirror-sheen dark tiled metallic deck floor
 * - Integrated ExtrudeGeometry beveled "OPERATIONS & SAFETY" front signboard with glowing cyan shield icon
 * - Tempered-glass & brushed-brass perimeter railings with unobstructed front-right dock for `bridge-operations`
 */
export const OperationsPlatformChassis = memo(function OperationsPlatformChassis({
  zone,
  alertLevelRef,
  activeRef,
}: {
  zone: CampusZone;
  alertLevelRef: React.RefObject<'ok' | 'warn' | 'alert'>;
  activeRef: React.RefObject<boolean>;
}) {
  const reducedMotion = useReducedMotion();
  const cyanRimRef = useRef<MeshStandardMaterial>(null);
  const amberRimRef = useRef<MeshStandardMaterial>(null);

  const deckTex = useMemo(() => getOpsDeckTexture(), []);
  const signTex = useMemo(() => getOpsFrontSignTexture(), []);

  const w = zone.width; // 12.6
  const d = zone.depth; // 8.8
  const h = Math.max(0.55, zone.height); // 0.62

  const baseW = w + 0.64;
  const baseD = d + 0.64;
  const midW = w + 0.3;
  const midD = d + 0.3;

  // Extruded beveled "OPERATIONS & SAFETY" front signboard
  const signGeometry = useMemo(() => {
    const sw = 5.15;
    const sh = 0.98;
    const cut = 0.24;
    const hw = sw / 2;
    const hh = sh / 2;
    const shape = new Shape();
    shape.moveTo(-hw + cut, -hh);
    shape.lineTo(hw - cut, -hh);
    shape.lineTo(hw, -hh + cut);
    shape.lineTo(hw, hh - cut);
    shape.lineTo(hw - cut, hh);
    shape.lineTo(-hw + cut, hh);
    shape.lineTo(-hw, hh - cut);
    shape.lineTo(-hw, -hh + cut);
    shape.closePath();

    const geom = new ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.045,
      bevelSegments: 2,
    });
    geom.center();
    return geom;
  }, []);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const lvl = alertLevelRef.current ?? 'ok';
    const active = Boolean(activeRef.current);
    const pulse = 0.5 + 0.5 * Math.sin(t * (lvl === 'alert' ? 9.0 : 4.8));

    if (cyanRimRef.current) {
      cyanRimRef.current.emissiveIntensity = active ? 2.85 + 0.55 * pulse : 2.3;
    }
    if (amberRimRef.current) {
      if (lvl === 'alert') {
        amberRimRef.current.emissive.set('#EF4444');
        amberRimRef.current.emissiveIntensity = 2.6 + 1.4 * pulse;
      } else if (lvl === 'warn') {
        amberRimRef.current.emissive.set('#F59E0B');
        amberRimRef.current.emissiveIntensity = 2.6 + 1.1 * pulse;
      } else {
        amberRimRef.current.emissive.set('#F59E0B');
        amberRimRef.current.emissiveIntensity = active ? 2.5 + 0.5 * pulse : 2.1;
      }
    }
  });

  // `bridge-operations` docks at front-right of +Z edge: local x ≈ +4.9 (spanning x ∈ [+3.8, +6.0])
  const dockCenterX = 4.9;

  return (
    <group>
      {/* TIER 1: HEAVY DARK GUNMETAL SUB-CHASSIS ARMOR SKIRT */}
      <RoundedBox
        args={[baseW, h - 0.2, baseD]}
        radius={0.18}
        smoothness={3}
        position={[0, -h + (h - 0.2) / 2, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color="#0E1525" roughness={0.34} metalness={0.86} />
      </RoundedBox>

      {/* Recessed Shadow Reveal Groove */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[baseW - 0.14, 0.04, baseD - 0.14]} />
        <meshStandardMaterial color="#04070E" roughness={0.75} metalness={0.5} />
      </mesh>

      {/* TIER 2: BRUSHED-TITANIUM STEPPED UPPER COLLAR */}
      <RoundedBox
        args={[midW, 0.16, midD]}
        radius={0.15}
        smoothness={3}
        position={[0, -0.12, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color="#334155" roughness={0.26} metalness={0.9} />
      </RoundedBox>

      {/* UPPER CONTINUOUS WARM AMBER-GOLD PERIMETER LIGHT STRIP (exact reference dual-tone rim) */}
      <group position={[0, -0.055, 0]}>
        {/* +Z left of bridge dock */}
        <mesh position={[-1.4, 0, midD / 2 + 0.015]}>
          <boxGeometry args={[midW - 2.9, 0.048, 0.036]} />
          <meshStandardMaterial ref={amberRimRef} color="#FDE68A" emissive="#F59E0B" emissiveIntensity={2.25} roughness={0.14} />
        </mesh>
        {/* -X left edge */}
        <mesh position={[-midW / 2 - 0.015, 0, 0]}>
          <boxGeometry args={[0.036, 0.048, midD + 0.04]} />
          <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={2.2} roughness={0.14} />
        </mesh>
        {/* +X right edge */}
        <mesh position={[midW / 2 + 0.015, 0, 0]}>
          <boxGeometry args={[0.036, 0.048, midD + 0.04]} />
          <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={2.2} roughness={0.14} />
        </mesh>
        {/* -Z rear edge */}
        <mesh position={[0, 0, -midD / 2 - 0.015]}>
          <boxGeometry args={[midW + 0.04, 0.048, 0.036]} />
          <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={1.9} roughness={0.14} />
        </mesh>
      </group>

      {/* LOWER SUB-CHASSIS ELECTRIC CYAN-BLUE CORNER BARS & RECESSED VENT LEDS */}
      <group position={[0, -h + 0.22, 0]}>
        {/* +Z Front-Left & Front-Right Cyan Corner Bars */}
        <mesh position={[-baseW / 2 + 1.15, 0.02, baseD / 2 + 0.015]}>
          <boxGeometry args={[1.9, 0.08, 0.028]} />
          <meshStandardMaterial ref={cyanRimRef} color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.45} roughness={0.14} />
        </mesh>
        <mesh position={[2.65, 0.02, baseD / 2 + 0.015]}>
          <boxGeometry args={[1.4, 0.08, 0.028]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} roughness={0.14} />
        </mesh>

        {/* +Z Recessed dark louvers with blue telemetry micro-LED strips */}
        {[-4.05, 1.95].map((vx, i) => (
          <group key={`vz-${i}`} position={[vx, -0.05, baseD / 2 + 0.008]}>
            <mesh>
              <boxGeometry args={[1.15, 0.18, 0.022]} />
              <meshStandardMaterial color="#050812" roughness={0.8} metalness={0.4} />
            </mesh>
            {[-0.3, -0.1, 0.1, 0.3].map((dx, j) => (
              <mesh key={j} position={[dx, 0.0, 0.014]}>
                <boxGeometry args={[0.12, 0.032, 0.01]} />
                <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={2.1} />
              </mesh>
            ))}
          </group>
        ))}

        {/* +X Right Edge Cyan Corner Bars & Recessed Vent Grilles */}
        <mesh position={[baseW / 2 + 0.015, 0.02, baseD / 2 - 1.1]}>
          <boxGeometry args={[0.028, 0.08, 1.65]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.45} roughness={0.14} />
        </mesh>
        <mesh position={[baseW / 2 + 0.015, 0.02, -baseD / 2 + 1.1]}>
          <boxGeometry args={[0.028, 0.08, 1.65]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} roughness={0.14} />
        </mesh>
        <group position={[baseW / 2 + 0.008, -0.04, 0]}>
          <mesh>
            <boxGeometry args={[0.022, 0.22, 2.8]} />
            <meshStandardMaterial color="#050812" roughness={0.8} metalness={0.4} />
          </mesh>
          {[-0.7, -0.25, 0.25, 0.7].map((dz, j) => (
            <mesh key={j} position={[0.014, 0, dz]}>
              <boxGeometry args={[0.01, 0.032, 0.28]} />
              <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={2.0} />
            </mesh>
          ))}
        </group>

        {/* -X Left Edge Cyan Accent Bar */}
        <mesh position={[-baseW / 2 - 0.015, 0.02, 0]}>
          <boxGeometry args={[0.026, 0.08, baseD * 0.55]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.1} />
        </mesh>
      </group>

      {/* TIER 3: REFLECTIVE DARK MIRROR-SHEEN TILED DECK (top at local y = 0) */}
      <RoundedBox args={[w, 0.08, d]} radius={0.08} smoothness={2} position={[0, -0.04, 0]} receiveShadow>
        <meshStandardMaterial color="#172033" roughness={0.22} metalness={0.86} />
      </RoundedBox>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.16, d - 0.16]} />
        {deckTex ? (
          <meshStandardMaterial map={deckTex} roughness={0.16} metalness={0.86} />
        ) : (
          <meshStandardMaterial color="#101828" roughness={0.16} metalness={0.86} />
        )}
      </mesh>

      {/* Subtle cyan ambient deck reflection wash in front of the command desk & dashboard */}
      <mesh position={[0, 0.004, 0.75]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.4, 4.6]} />
        <meshBasicMaterial color="#00B8FF" transparent opacity={0.06} depthWrite={false} />
      </mesh>

      {/* Flush Bridge Docking Threshold at Front-Right (+Z, local x ≈ +4.9) */}
      <group position={[dockCenterX, 0.006, d / 2 - 0.12]}>
        <mesh receiveShadow>
          <boxGeometry args={[2.25, 0.024, 0.52]} />
          <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.28} />
        </mesh>
        {[-1.12, 1.12].map((gx, i) => (
          <mesh key={i} position={[gx, 0.015, 0]}>
            <boxGeometry args={[0.05, 0.022, 0.54]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={2.15} />
          </mesh>
        ))}
      </group>

      {/* INTEGRATED BEVELED "OPERATIONS & SAFETY" ARCHITECTURAL SIGNBOARD (+Z FRONT FASCIA) */}
      <group position={[-0.75, -0.06, baseD / 2 + 0.14]} rotation={[-0.06, 0, 0]}>
        <mesh geometry={signGeometry} castShadow receiveShadow>
          <meshStandardMaterial color="#091122" roughness={0.26} metalness={0.88} />
        </mesh>
        <mesh position={[0, 0.49, 0.06]}>
          <boxGeometry args={[4.65, 0.036, 0.06]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.4} />
        </mesh>
        <mesh position={[0, -0.49, 0.06]}>
          <boxGeometry args={[4.65, 0.036, 0.06]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.3} />
        </mesh>
        {/* Amber diagonal side accents framing the sign */}
        {[-2.58, 2.58].map((sx, i) => (
          <mesh key={i} position={[sx, -0.22, 0.06]} rotation={[0, 0, i === 0 ? -0.78 : 0.78]}>
            <boxGeometry args={[0.38, 0.042, 0.05]} />
            <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={2.5} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.128]}>
          <planeGeometry args={[5.02, 0.92]} />
          {signTex ? (
            <meshStandardMaterial
              map={signTex}
              emissive="#FFFFFF"
              emissiveMap={signTex}
              emissiveIntensity={0.94}
              roughness={0.2}
              metalness={0.28}
            />
          ) : (
            <meshStandardMaterial color="#091122" emissive="#00E5FF" emissiveIntensity={0.8} />
          )}
        </mesh>
      </group>

      {/* TEMPERED-GLASS & BRUSHED-BRASS PERIMETER RAILINGS (Clear at front-right bridge dock x ∈ [+3.75, +6.05]) */}
      {/* Front-left (+Z) glass railing west of signboard */}
      <OpsGlassBrassRailing start={[-w / 2 + 0.25, 0, d / 2 - 0.16]} length={2.55} />
      {/* Left (-X) glass railing */}
      <OpsGlassBrassRailing start={[-w / 2 + 0.16, 0, d / 2 - 0.24]} length={3.65} rotation={[0, Math.PI / 2, 0]} />
      {/* Right (+X) glass railing */}
      <OpsGlassBrassRailing start={[w / 2 - 0.16, 0, d / 2 - 0.24]} length={5.2} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
});
