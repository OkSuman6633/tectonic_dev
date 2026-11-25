import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { ExtrudeGeometry, Shape, type MeshStandardMaterial } from 'three';
import type { CampusZone, Vec3 } from '../officeLayout';
import { getDeckPlateTexture, getSignPlaqueTexture } from './textures';

/**
 * Multi-Tiered Sculpted Industrial Foundation Chassis for Tool Orchestration:
 * Matches the reference's thick beveled metallic plinth:
 * - Tier 1: Lower dark gunmetal armor skirt with segmented vertical seams, electric cyan corner bars,
 *   vertical 4-bar cyan LED louvers, and micro amber side vents
 * - Tier 2: Stepped ledge wrapped in an outer continuous glowing amber/gold perimeter light bar
 * - Tier 3: Satin brushed metallic tile deck with an inner continuous glowing amber/gold perimeter rim
 *   and flush docking sill on the -X bridge side
 * - Integrated Beveled "TOOL ORCHESTRATION" Architectural Signboard mounted on the +Z front-left rim
 */
export const PlatformChassisBase = memo(function PlatformChassisBase({
  zone,
  activeRef,
  isDark = true,
}: {
  zone: CampusZone;
  activeRef: React.RefObject<boolean>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const outerAmberRef = useRef<MeshStandardMaterial>(null);
  const innerAmberRef = useRef<MeshStandardMaterial>(null);
  const cyanVentRef = useRef<MeshStandardMaterial>(null);

  const deckTex = useMemo(() => getDeckPlateTexture(isDark), [isDark]);
  const signTex = useMemo(() => getSignPlaqueTexture(zone.label, isDark), [zone.label, isDark]);

  const w = zone.width; // 10.4
  const d = zone.depth; // 8.8
  const h = Math.max(0.55, zone.height); // 0.62 (deck top sits at local y = 0, campus floor at y = -h)

  const baseW = w + 0.64;
  const baseD = d + 0.64;
  const midW = w + 0.3;
  const midD = d + 0.3;

  // Extruded chamfered architectural signboard polygon matching the reference's beveled front sign
  const signGeometry = useMemo(() => {
    const sw = 4.35;
    const sh = 0.96;
    const cut = 0.22;
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
    const active = Boolean(activeRef.current);
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.8);
    if (outerAmberRef.current) {
      outerAmberRef.current.emissiveIntensity = active ? 3.1 + 0.7 * pulse : 2.35;
    }
    if (innerAmberRef.current) {
      innerAmberRef.current.emissiveIntensity = active ? 3.2 + 0.7 * pulse : 2.45;
    }
    if (cyanVentRef.current) {
      cyanVentRef.current.emissiveIntensity = active ? 3.0 + 0.5 * pulse : 2.3;
    }
  });

  // Bridge dock opening on the -X side spans z in [-1.18, +1.18]
  const dockHalf = 1.18;
  const westSegOuterLen = baseD / 2 - dockHalf;
  const westSegInnerLen = d / 2 - dockHalf;
  const westSegOuterCenter = dockHalf + westSegOuterLen / 2;
  const westSegInnerCenter = dockHalf + westSegInnerLen / 2;

  return (
    <group>
      {/* ================================================================================= */}
      {/* TIER 1: LOWER SUB-CHASSIS DARK GUNMETAL ARMOR SKIRT (y = -h to y = -0.26) */}
      {/* ================================================================================= */}
      <RoundedBox
        args={[baseW, h - 0.24, baseD]}
        radius={0.09}
        smoothness={2}
        position={[0, -h + (h - 0.24) / 2, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={isDark ? '#0D131F' : '#8A98A8'} roughness={isDark ? 0.38 : 0.34} metalness={isDark ? 0.82 : 0.68} />
      </RoundedBox>

      {/* Recessed Horizontal Shadow Reveal Groove between Tier 1 & Tier 2 */}
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[baseW - 0.12, 0.04, baseD - 0.12]} />
        <meshStandardMaterial color={isDark ? '#05080F' : '#263B52'} roughness={0.7} metalness={0.5} />
      </mesh>

      {/* Segmented Armor Panel Vertical Seam Ribs along Front-Left (+Z) & Front-Right (+X) */}
      {[-3.4, -1.6, 1.6, 3.4].map((sx, idx) => (
        <mesh key={`seam-z-${idx}`} position={[sx, -h + 0.19, baseD / 2 + 0.008]}>
          <boxGeometry args={[0.055, h - 0.28, 0.025]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.85 : 0.72} roughness={0.28} />
        </mesh>
      ))}
      {[-2.6, 0.0, 2.6].map((sz, idx) => (
        <mesh key={`seam-x-${idx}`} position={[baseW / 2 + 0.008, -h + 0.19, sz]}>
          <boxGeometry args={[0.025, h - 0.28, 0.055]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.85 : 0.72} roughness={0.28} />
        </mesh>
      ))}

      {/* SIGNATURE ELECTRIC CYAN / BLUE SUB-CHASSIS CORNER LIGHT BARS & LOUVERS */}
      <group position={[0, -h + 0.16, 0]}>
        {/* Front-Left (+Z) corner horizontal cyan accent bars */}
        {[-baseW / 2 + 0.95, baseW / 2 - 0.95].map((lx, idx) => (
          <mesh key={`cz-${idx}`} position={[lx, 0, baseD / 2 + 0.014]}>
            <boxGeometry args={[1.15, 0.065, 0.024]} />
            <meshStandardMaterial
              ref={idx === 0 ? cyanVentRef : undefined}
              color="#38E8FF"
              emissive="#00A8FF"
              emissiveIntensity={2.35}
            />
          </mesh>
        ))}
        {/* Mid-front recessed blue slot */}
        <mesh position={[-2.45, 0.03, baseD / 2 + 0.012]}>
          <boxGeometry args={[0.55, 0.04, 0.02]} />
          <meshStandardMaterial color="#38E8FF" emissive="#00A8FF" emissiveIntensity={1.8} />
        </mesh>

        {/* Front-Right (+X) corner horizontal cyan accent bars */}
        {[-baseD / 2 + 0.95, baseD / 2 - 0.95].map((lz, idx) => (
          <mesh key={`cx-${idx}`} position={[baseW / 2 + 0.014, 0, lz]}>
            <boxGeometry args={[0.024, 0.065, 1.15]} />
            <meshStandardMaterial color="#38E8FF" emissive="#00A8FF" emissiveIntensity={2.35} />
          </mesh>
        ))}

        {/* Vertical 4-bar Cyan LED Louver Stack near Front-Bottom Corner (+X side) */}
        {[0, 1, 2, 3].map((row) => (
          <mesh key={`vl-${row}`} position={[baseW / 2 + 0.014, -0.07 + row * 0.05, baseD / 2 - 1.95]}>
            <boxGeometry args={[0.022, 0.028, 0.28]} />
            <meshStandardMaterial color="#67E8F9" emissive="#00B8FF" emissiveIntensity={2.4} />
          </mesh>
        ))}

        {/* Micro Amber Vent Dots along Front-Right Lower Skirt (+X side, matching reference image) */}
        {[-0.3, -0.15, 0, 0.15, 0.3].map((dz, idx) => (
          <mesh key={`ad-${idx}`} position={[baseW / 2 + 0.014, -0.04, 0.75 + dz]}>
            <boxGeometry args={[0.02, 0.026, 0.06]} />
            <meshStandardMaterial color="#FDE047" emissive="#F59E0B" emissiveIntensity={2.1} />
          </mesh>
        ))}

        {/* Back (-Z) corner cyan bars */}
        {[-baseW / 2 + 0.95, baseW / 2 - 0.95].map((lx, idx) => (
          <mesh key={`cb-${idx}`} position={[lx, 0, -baseD / 2 - 0.014]}>
            <boxGeometry args={[1.15, 0.065, 0.024]} />
            <meshStandardMaterial color="#38E8FF" emissive="#00A8FF" emissiveIntensity={2.0} />
          </mesh>
        ))}
      </group>

      {/* ================================================================================= */}
      {/* TIER 2: MID STEPPED BEVEL LEDGE + OUTER CONTINUOUS AMBER NEON RUNNER */}
      {/* ================================================================================= */}
      <RoundedBox
        args={[midW, 0.14, midD]}
        radius={0.05}
        smoothness={2}
        position={[0, -0.18, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={isDark ? '#182234' : '#B7C4D1'} roughness={isDark ? 0.32 : 0.28} metalness={isDark ? 0.82 : 0.68} />
      </RoundedBox>

      {/* Outer Glowing Molten-Amber Perimeter Light Track (Lower of the Dual Amber Edges) */}
      {[
        { pos: [0, -0.135, midD / 2 + 0.014] as Vec3, size: [midW + 0.03, 0.042, 0.034] as Vec3 },
        { pos: [0, -0.135, -midD / 2 - 0.014] as Vec3, size: [midW + 0.03, 0.042, 0.034] as Vec3 },
        { pos: [midW / 2 + 0.014, -0.135, 0] as Vec3, size: [0.034, 0.042, midD + 0.03] as Vec3 },
        // -X side split cleanly around bridge dock
        { pos: [-midW / 2 - 0.014, -0.135, westSegOuterCenter - 0.08] as Vec3, size: [0.034, 0.042, Math.max(0.5, westSegOuterLen - 0.16)] as Vec3 },
        { pos: [-midW / 2 - 0.014, -0.135, -westSegOuterCenter + 0.08] as Vec3, size: [0.034, 0.042, Math.max(0.5, westSegOuterLen - 0.16)] as Vec3 },
      ].map((bar, i) => (
        <mesh key={`outer-amb-${i}`} position={bar.pos}>
          <boxGeometry args={bar.size} />
          <meshStandardMaterial
            ref={i === 0 ? outerAmberRef : undefined}
            color="#FFE082"
            emissive="#FF9800"
            emissiveIntensity={2.4}
            roughness={0.18}
          />
        </mesh>
      ))}

      {/* ================================================================================= */}
      {/* TIER 3: UPPER WALKABLE METALLIC DECK + INNER CONTINUOUS AMBER NEON RIM */}
      {/* ================================================================================= */}
      <RoundedBox args={[w, 0.12, d]} radius={0.04} smoothness={2} position={[0, -0.06, 0]} receiveShadow castShadow>
        <meshStandardMaterial color={isDark ? '#131B29' : '#C8D3DE'} roughness={isDark ? 0.34 : 0.3} metalness={isDark ? 0.78 : 0.62} />
      </RoundedBox>

      {/* Reflective Brushed Metallic Deck Plate Top Surface (local y = 0.002) */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.24, d - 0.24]} />
        {deckTex ? (
          <meshStandardMaterial map={deckTex} roughness={isDark ? 0.32 : 0.34} metalness={isDark ? 0.72 : 0.56} />
        ) : (
          <meshStandardMaterial color={isDark ? '#162032' : '#C8D3DE'} roughness={0.35} metalness={isDark ? 0.7 : 0.55} />
        )}
      </mesh>

      {/* Inner Glowing Amber Perimeter Edge Strip (Upper of the Dual Amber Edges) */}
      {[
        { pos: [0, 0.014, d / 2 - 0.06] as Vec3, size: [w - 0.12, 0.032, 0.065] as Vec3 },
        { pos: [0, 0.014, -d / 2 + 0.06] as Vec3, size: [w - 0.12, 0.032, 0.065] as Vec3 },
        { pos: [w / 2 - 0.06, 0.014, 0] as Vec3, size: [0.065, 0.032, d - 0.12] as Vec3 },
        // -X side split cleanly around the walkable bridge entry corridor
        { pos: [-w / 2 + 0.06, 0.014, westSegInnerCenter] as Vec3, size: [0.065, 0.032, westSegInnerLen] as Vec3 },
        { pos: [-w / 2 + 0.06, 0.014, -westSegInnerCenter] as Vec3, size: [0.065, 0.032, westSegInnerLen] as Vec3 },
      ].map((bar, i) => (
        <mesh key={`inner-amb-${i}`} position={bar.pos}>
          <boxGeometry args={bar.size} />
          <meshStandardMaterial
            ref={i === 0 ? innerAmberRef : undefined}
            color="#FFE082"
            emissive="#FF9800"
            emissiveIntensity={2.5}
            roughness={0.18}
          />
        </mesh>
      ))}

      {/* Clean Walkable Bridge Docking Threshold & Guide Strips on -X Entry Bay (z = 0) */}
      <group position={[-w / 2 + 0.18, 0.006, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[0.56, 0.018, 2.34]} />
          <meshStandardMaterial color={isDark ? '#1E293B' : '#9EAFBF'} roughness={0.42} metalness={isDark ? 0.75 : 0.62} />
        </mesh>
        {/* Flanking cyan-amber entry guide strips */}
        {[-1.08, 1.08].map((gz, i) => (
          <mesh key={i} position={[0.72, 0.008, gz]}>
            <boxGeometry args={[1.65, 0.014, 0.045]} />
            <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={1.65} />
          </mesh>
        ))}
        {/* Subtle floor directional chevrons guiding couriers toward the Central Core */}
        {[0.35, 0.9, 1.45].map((cx, i) => (
          <mesh key={i} position={[cx, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.16, 0.72]} />
            <meshBasicMaterial color="#F59E0B" transparent opacity={0.28 + i * 0.08} />
          </mesh>
        ))}
      </group>

      {/* ================================================================================= */}
      {/* INTEGRATED BEVELED "TOOL ORCHESTRATION" ARCHITECTURAL SIGNBOARD (+Z Front-Left Rim) */}
      {/* ================================================================================= */}
      <group position={[-0.42, 0.34, d / 2 + 0.09]} rotation={[-0.08, 0, 0]}>
        {/* Sculpted Extruded Chamfered Titanium Plaque Body */}
        <mesh geometry={signGeometry} castShadow receiveShadow>
          <meshStandardMaterial color={isDark ? '#101826' : '#DCE4EB'} roughness={0.28} metalness={isDark ? 0.86 : 0.72} />
        </mesh>

        {/* Crisp Illuminated Typography Faceplate */}
        <mesh position={[0, 0, 0.132]}>
          <planeGeometry args={[3.96, 0.76]} />
          {signTex ? (
            <meshBasicMaterial map={signTex} />
          ) : (
            <meshBasicMaterial color={isDark ? '#0A0F1D' : '#263B52'} />
          )}
        </mesh>

        {/* Glowing Amber Beveled Contour Edge Runners (Top, Bottom, Angled Corner Chamfers) */}
        <mesh position={[0, 0.485, 0.06]}>
          <boxGeometry args={[3.94, 0.045, 0.13]} />
          <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.8} />
        </mesh>
        <mesh position={[0, -0.485, 0.06]}>
          <boxGeometry args={[3.94, 0.045, 0.13]} />
          <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.8} />
        </mesh>
        {/* Left & Right Vertical + 45-degree Chamfer Accent Bars */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 2.18, 0, 0.06]}>
              <boxGeometry args={[0.045, 0.56, 0.13]} />
              <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.5} />
            </mesh>
            <mesh position={[side * 2.07, 0.37, 0.06]} rotation={[0, 0, -side * (Math.PI / 4)]}>
              <boxGeometry args={[0.31, 0.042, 0.13]} />
              <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.6} />
            </mesh>
            <mesh position={[side * 2.07, -0.37, 0.06]} rotation={[0, 0, side * (Math.PI / 4)]}>
              <boxGeometry args={[0.31, 0.042, 0.13]} />
              <meshStandardMaterial color="#FFE082" emissive="#FF9800" emissiveIntensity={2.6} />
            </mesh>
          </group>
        ))}

        {/* Heavy Brushed-Steel Mounting Gussets Anchoring Plaque Directly to the Deck Lip */}
        {[-1.7, 0, 1.7].map((mx, i) => (
          <mesh key={i} position={[mx, -0.42, -0.14]} castShadow>
            <boxGeometry args={[0.24, 0.36, 0.22]} />
            <meshStandardMaterial color={isDark ? '#1E293B' : '#536B83'} metalness={isDark ? 0.85 : 0.72} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
});
