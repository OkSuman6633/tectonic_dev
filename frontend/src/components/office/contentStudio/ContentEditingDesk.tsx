import { memo, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Vec3 } from '../officeLayout';
import { getContentMonitorTexture } from './textures';

/**
 * Studio Near-Field Reference Monitor Speaker (tweeter + mid-woofer cones) flanking the editing desk.
 */
const StudioSpeaker = memo(function StudioSpeaker({ position, rotY = 0 }: { position: Vec3; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <RoundedBox args={[0.24, 0.36, 0.24]} radius={0.018} smoothness={2} position={[0, 0.18, 0]} castShadow>
        <meshStandardMaterial color="#111827" roughness={0.38} metalness={0.45} />
      </RoundedBox>
      {/* Upper tweeter dome */}
      <mesh position={[0, 0.27, 0.122]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.042, 0.048, 0.012, 14]} />
        <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.27, 0.128]}>
        <sphereGeometry args={[0.022, 10, 10]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Lower woofer cone */}
      <mesh position={[0, 0.13, 0.122]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.072, 0.082, 0.016, 16]} />
        <meshStandardMaterial color="#1E293B" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.13, 0.129]}>
        <sphereGeometry args={[0.032, 10, 10]} />
        <meshStandardMaterial color="#475569" metalness={0.75} roughness={0.28} />
      </mesh>
      {/* Tiny cyan power LED */}
      <mesh position={[0, 0.035, 0.122]}>
        <boxGeometry args={[0.028, 0.01, 0.008]} />
        <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={2.0} />
      </mesh>
    </group>
  );
});

/**
 * Sleek Black Ergonomic Swivel Studio Chair matching the reference.
 */
const StudioSwivelChair = memo(function StudioSwivelChair({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {[0, 1, 2, 3, 4].map((i) => {
        const ang = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation={[0, ang, 0]}>
            <mesh position={[0.16, 0.04, 0]}>
              <boxGeometry args={[0.32, 0.024, 0.035]} />
              <meshStandardMaterial color="#64748B" metalness={0.88} roughness={0.22} />
            </mesh>
            <mesh position={[0.31, 0.022, 0]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#0F172A" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.036, 0.38, 12]} />
        <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.25} />
      </mesh>
      <RoundedBox args={[0.52, 0.075, 0.48]} radius={0.03} smoothness={2} position={[0, 0.44, 0]} castShadow>
        <meshStandardMaterial color="#0F172A" roughness={0.48} metalness={0.18} />
      </RoundedBox>
      <RoundedBox args={[0.48, 0.62, 0.06]} radius={0.03} smoothness={2} position={[0, 0.78, 0.22]} rotation={[0.08, 0, 0]} castShadow>
        <meshStandardMaterial color="#111827" roughness={0.45} metalness={0.22} />
      </RoundedBox>
      {[-0.27, 0.27].map((ax, i) => (
        <group key={i} position={[ax, 0.57, 0.02]}>
          <mesh position={[0, -0.05, 0.04]}>
            <boxGeometry args={[0.028, 0.16, 0.038]} />
            <meshStandardMaterial color="#334155" metalness={0.82} roughness={0.26} />
          </mesh>
          <RoundedBox args={[0.055, 0.03, 0.28]} radius={0.01} smoothness={2} position={[0, 0.04, 0]}>
            <meshStandardMaterial color="#0F172A" roughness={0.48} />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
});

/**
 * Central Curved 3-Monitor Studio Editing & PromptOps Workstation matching the reference centerpiece:
 * - Matte brushed-silver / white curved console desktop with dark equipment drawers & glowing blue seam LEDs
 * - 3 wide curved studio monitors (Left: Media Bins, Center: Sunset NLE Editor, Right: Color & Asset Grid)
 * - Flanking studio reference monitor speakers, edit control deck, keyboard, mouse, mini desk succulent
 * - Black ergonomic swivel chair
 */
export const ContentEditingDesk = memo(function ContentEditingDesk({
  position = [-0.2, 0, 0.45],
  onSelect,
}: {
  position?: Vec3;
  onSelect?: () => void;
}) {
  const texL = useMemo(() => getContentMonitorTexture('left'), []);
  const texC = useMemo(() => getContentMonitorTexture('center'), []);
  const texR = useMemo(() => getContentMonitorTexture('right'), []);

  return (
    <group
      position={position}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* WIDE CURVED MATTE-SILVER / BRUSHED-ALUMINUM STUDIO DESKTOP */}
      <RoundedBox args={[2.35, 0.085, 0.96]} radius={0.025} smoothness={2} position={[0, 0.78, -0.18]} castShadow receiveShadow>
        <meshStandardMaterial color="#CBD5E1" roughness={0.28} metalness={0.62} />
      </RoundedBox>
      <RoundedBox
        args={[1.25, 0.085, 0.88]}
        radius={0.025}
        smoothness={2}
        position={[-1.56, 0.78, 0.08]}
        rotation={[0, 0.34, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#CBD5E1" roughness={0.28} metalness={0.62} />
      </RoundedBox>
      <RoundedBox
        args={[1.25, 0.085, 0.88]}
        radius={0.025}
        smoothness={2}
        position={[1.56, 0.78, 0.08]}
        rotation={[0, -0.34, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#CBD5E1" roughness={0.28} metalness={0.62} />
      </RoundedBox>

      {/* Dark recessed modesty wall behind legs */}
      <RoundedBox args={[2.1, 0.72, 0.2]} radius={0.02} smoothness={2} position={[0, 0.37, -0.46]} castShadow receiveShadow>
        <meshStandardMaterial color="#0F172A" roughness={0.38} metalness={0.82} />
      </RoundedBox>

      {/* Left & Right Heavy Studio Pedestal Cabinets with Glowing Blue Vertical Seams */}
      {[-1.72, 1.72].map((px, i) => (
        <group key={i} position={[px, 0.37, 0.14]} rotation={[0, i === 0 ? 0.34 : -0.34, 0]}>
          <RoundedBox args={[0.68, 0.74, 0.78]} radius={0.03} smoothness={2} castShadow receiveShadow>
            <meshStandardMaterial color={i === 0 ? '#1E293B' : '#94A3B8'} roughness={0.3} metalness={0.78} />
          </RoundedBox>
          {/* Drawer horizontal detail grooves */}
          {[-0.16, 0.04, 0.22].map((dy, j) => (
            <mesh key={j} position={[0, dy, 0.394]}>
              <boxGeometry args={[0.52, 0.018, 0.015]} />
              <meshStandardMaterial color="#0F172A" roughness={0.5} />
            </mesh>
          ))}
          {/* Vertical electric-blue neon seam strip */}
          <mesh position={[i === 0 ? 0.345 : -0.345, 0, 0.35]}>
            <boxGeometry args={[0.026, 0.68, 0.026]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} />
          </mesh>
        </group>
      ))}

      {/* 3 WIDE CURVED STUDIO MONITORS (Left, Wide Center Sunset NLE, Right Inspector) */}
      {[
        { pos: [-1.18, 1.13, -0.14] as Vec3, rotY: 0.34, w: 0.96, tex: texL },
        { pos: [0, 1.13, -0.34] as Vec3, rotY: 0, w: 1.24, tex: texC },
        { pos: [1.18, 1.13, -0.14] as Vec3, rotY: -0.34, w: 0.96, tex: texR },
      ].map((m, i) => (
        <group key={i} position={m.pos} rotation={[0, m.rotY, 0]}>
          <mesh position={[0, -0.23, -0.04]}>
            <boxGeometry args={[0.055, 0.18, 0.045]} />
            <meshStandardMaterial color="#475569" metalness={0.86} roughness={0.22} />
          </mesh>
          <mesh position={[0, -0.3, -0.02]}>
            <boxGeometry args={[0.26, 0.02, 0.18]} />
            <meshStandardMaterial color="#334155" metalness={0.86} roughness={0.26} />
          </mesh>
          <RoundedBox args={[m.w, 0.5, 0.038]} radius={0.012} smoothness={2} castShadow>
            <meshStandardMaterial color="#0F172A" roughness={0.26} metalness={0.84} />
          </RoundedBox>
          <mesh position={[0, 0, 0.021]}>
            <planeGeometry args={[m.w - 0.06, 0.44]} />
            {m.tex ? (
              <meshStandardMaterial
                map={m.tex}
                emissive="#FFFFFF"
                emissiveMap={m.tex}
                emissiveIntensity={0.96}
                roughness={0.18}
              />
            ) : (
              <meshStandardMaterial color="#061124" emissive="#00B8FF" emissiveIntensity={0.8} />
            )}
          </mesh>
        </group>
      ))}

      {/* Twin Flanking Studio Near-Field Reference Speakers */}
      <StudioSpeaker position={[-1.78, 0.82, 0.08]} rotY={0.36} />
      <StudioSpeaker position={[1.78, 0.82, 0.08]} rotY={-0.36} />

      {/* Center Keyboard, Edit Control Surface & Mouse */}
      <mesh position={[0, 0.83, 0.02]}>
        <boxGeometry args={[0.56, 0.02, 0.16]} />
        <meshStandardMaterial color="#1E293B" roughness={0.35} metalness={0.65} />
      </mesh>
      <mesh position={[0, 0.841, 0.02]}>
        <boxGeometry args={[0.5, 0.005, 0.11]} />
        <meshStandardMaterial color="#38E8FF" emissive="#00B8FF" emissiveIntensity={0.65} />
      </mesh>
      {/* Left macro edit keypad / color control deck */}
      <mesh position={[-1.45, 0.835, 0.24]} rotation={[0, 0.32, 0]}>
        <boxGeometry args={[0.26, 0.032, 0.18]} />
        <meshStandardMaterial color="#111827" roughness={0.32} metalness={0.72} />
      </mesh>
      {/* Tiny white potted succulent on far-left desk edge */}
      <group position={[-1.96, 0.82, 0.28]}>
        <mesh position={[0, 0.055, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.048, 0.11, 12]} />
          <meshStandardMaterial color="#F1F5F9" roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <dodecahedronGeometry args={[0.075, 0]} />
          <meshStandardMaterial color="#16A34A" roughness={0.6} />
        </mesh>
      </group>

      {/* Sleek Ergonomic Swivel Studio Chair */}
      <StudioSwivelChair position={[0, 0, 0.72]} />
    </group>
  );
});
