import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import {
  CanvasTexture,
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { moduleZoneKind, type CampusBridge, type CampusZone, type OfficeLayout, type Vec3, type CampusZoneKind } from './officeLayout';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

/** Shared mutable activity sets updated inside useFrame by EmployeeWorkforce (zero per-frame React re-renders). */
export interface CampusActivityRefs {
  activeBridges: Set<string>;
  activeZones: Set<string>;
}

const SUB_GRID_Y = -0.005;

/** Procedural circuit grid floor texture for the outer AI infrastructure campus (adapts to Dark & Light themes). */
function makeCampusGridTexture(isDark = true): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = isDark ? '#040B1A' : '#E6DEC8';
  ctx.fillRect(0, 0, 512, 512);

  // Fine tech grid
  ctx.strokeStyle = isDark ? 'rgba(0, 212, 255, 0.09)' : 'rgba(15, 23, 42, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Major glowing circuit / architectural lines
  ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.28)' : 'rgba(2, 132, 199, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Diagonal 45-degree bus connectors
  ctx.strokeStyle = isDark ? 'rgba(168, 85, 247, 0.18)' : 'rgba(168, 85, 247, 0.22)';
  ctx.lineWidth = 1.5;
  for (let i = 64; i < 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 48, 48);
    ctx.lineTo(512, 48);
    ctx.stroke();
  }

  // Glowing circuit node pads
  ctx.fillStyle = isDark ? 'rgba(0, 229, 255, 0.42)' : 'rgba(2, 132, 199, 0.45)';
  for (let x = 0; x <= 512; x += 128) {
    for (let y = 0; y <= 512; y += 128) {
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Procedural vector gear generator for technical engineering HUD panels (Image 1 visual target).
 */
function drawGearIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  holeR: number,
  teeth: number,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.25;
    const a2 = a0 + step * 0.5;
    const a3 = a0 + step * 0.75;
    const a4 = (i + 1) * step;

    if (i === 0) {
      ctx.moveTo(cx + Math.cos(a0) * innerR, cy + Math.sin(a0) * innerR);
    } else {
      ctx.lineTo(cx + Math.cos(a0) * innerR, cy + Math.sin(a0) * innerR);
    }
    ctx.lineTo(cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR);
    ctx.lineTo(cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR);
    ctx.lineTo(cx + Math.cos(a3) * innerR, cy + Math.sin(a3) * innerR);
    ctx.lineTo(cx + Math.cos(a4) * innerR, cy + Math.sin(a4) * innerR);
  }
  ctx.closePath();
  ctx.fill();

  // Cut out center circular axle hole
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Inner ring outline & axle dot
  ctx.beginPath();
  ctx.arc(cx, cy, holeR + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Procedural high-contrast architectural facility nameplate plaque (Reference Image 2).
 * Rendered with dark obsidian acrylic gradient, glowing neon perimeter border, 4 metallic corner
 * rivet pins, and crisp bold illuminated white typography.
 */
function makePlatformSignTexture(title: string, accent: string, secondary: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep obsidian acrylic gradient background (Reference Image 2)
  const grad = ctx.createLinearGradient(0, 0, 800, 200);
  grad.addColorStop(0, '#040A17');
  grad.addColorStop(0.5, '#0B172E');
  grad.addColorStop(1, '#040A17');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 200);

  // Outer glowing neon border
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4.5;
  ctx.strokeRect(6, 6, 788, 188);

  // Subtle inner chamfer line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, 772, 172);

  // 4 Metallic Corner Rivet / Screws (Signature Reference Image 2 detail)
  const pinOffsets = [
    [24, 24],
    [776, 24],
    [24, 176],
    [776, 176],
  ];
  pinOffsets.forEach(([px, py]) => {
    // Outer metal ring
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(px, py, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner reflective white/gold pin
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Top and bottom glowing accent runner lines
  ctx.fillStyle = accent;
  ctx.fillRect(45, 6, 710, 3.5);
  ctx.fillStyle = secondary;
  ctx.fillRect(45, 190.5, 710, 3.5);

  // Primary Title: Bold, crisp, illuminated uppercase white typography
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';

  // Responsive font size to guarantee crisp zero-overflow fitting
  const fontSize = title.length > 25 ? 36 : title.length > 18 ? 44 : 52;
  ctx.font = `bold ${fontSize}px Inter, "Segoe UI", -apple-system, sans-serif`;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.fillText(title, 400, 100);
  ctx.shadowBlur = 0;

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural futuristic holographic data readout texture tailored to each zone domain (Image 1 gear/cog, etc.). */
function makeHoloPanelTexture(accent: string, secondary: string, kind: CampusZoneKind): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Translucent dark glass background
  ctx.fillStyle = 'rgba(6, 15, 34, 0.94)';
  ctx.fillRect(0, 0, 512, 300);

  // Holographic outer frame with corner notches
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(6, 6, 500, 288);

  // Top header status bar
  ctx.fillStyle = accent;
  ctx.fillRect(6, 6, 210, 20);
  ctx.fillStyle = '#050D1B';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('ACTIVE TELEMETRY // CONNECTED', 14, 21);

  // Left side: Waveform & telemetry bars
  ctx.fillStyle = secondary;
  ctx.fillRect(24, 44, 150, 5);

  for (let i = 0; i < 9; i++) {
    const barH = 24 + ((i * 37) % 75);
    ctx.fillStyle = i % 2 === 0 ? accent : secondary;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(24 + i * 22, 235 - barH, 16, barH);
  }
  ctx.globalAlpha = 1;

  // Code-like text streams
  ctx.fillStyle = '#94A3B8';
  for (let y = 64; y <= 124; y += 12) {
    const w = 180 - (y % 28) * 4;
    ctx.fillRect(24, y, w, 3.5);
  }

  // Right side: Domain-specific high-tech visual icon
  const iconCx = 385;
  const iconCy = 145;

  if (kind === 'tools') {
    // Crisp glowing mechanical GEAR / COG icon matching Reference Image 1!
    drawGearIcon(ctx, iconCx, iconCy, 72, 54, 22, 10, accent);
    // Radiating circuit bus traces
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(iconCx - 95, iconCy);
    ctx.lineTo(iconCx - 76, iconCy);
    ctx.moveTo(iconCx + 76, iconCy);
    ctx.lineTo(iconCx + 95, iconCy);
    ctx.moveTo(iconCx, iconCy - 95);
    ctx.lineTo(iconCx, iconCy - 76);
    ctx.moveTo(iconCx, iconCy + 76);
    ctx.lineTo(iconCx, iconCy + 95);
    ctx.stroke();
  } else if (kind === 'memory') {
    // 3 Segmented Database Storage Cylinders + Lattice
    for (let c = 0; c < 3; c++) {
      const cx = iconCx - 60 + c * 60;
      const cy = iconCy - 38;
      ctx.fillStyle = c === 1 ? accent : secondary;
      ctx.fillRect(cx - 20, cy, 40, 80);
      ctx.strokeStyle = '#050D1B';
      ctx.lineWidth = 3;
      for (let s = 15; s < 80; s += 18) {
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + s);
        ctx.lineTo(cx + 20, cy + s);
        ctx.stroke();
      }
    }
  } else if (kind === 'process') {
    // Cyclic Workflow Execution Loop with Pipeline Nodes
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, 60, 0, Math.PI * 2);
    ctx.stroke();
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2;
      const nx = iconCx + Math.cos(ang) * 60;
      const ny = iconCy + Math.sin(ang) * 60;
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.arc(nx, ny, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'content') {
    // Hexagonal Creative Node + Audio/Content waveform
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let h = 0; h < 6; h++) {
      const ang = (h * Math.PI) / 3;
      const hx = iconCx + Math.cos(ang) * 65;
      const hy = iconCy + Math.sin(ang) * 65;
      if (h === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
  } else {
    // Operations & Safety / Command Center Shield Radar
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, 65, 0, Math.PI * 2);
    ctx.arc(iconCx, iconCy, 42, 0, Math.PI * 2);
    ctx.arc(iconCx, iconCy, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(iconCx - 70, iconCy);
    ctx.lineTo(iconCx + 70, iconCy);
    ctx.moveTo(iconCx, iconCy - 70);
    ctx.lineTo(iconCx, iconCy + 70);
    ctx.stroke();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Physical illuminated futuristic skybridge connecting the central human office to an elevated
 * external AI infrastructure platform, with structural support piers, glass balustrades,
 * illuminated walking deck, portal archways, and animated directional data-flow particles.
 */
const FuturisticBridge = memo(function FuturisticBridge({
  bridge,
  activityRef,
  isDark = true,
}: {
  bridge: CampusBridge;
  activityRef: React.RefObject<CampusActivityRefs>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const particleRefs = useRef<(Mesh | null)[]>([]);
  const stripMatRef = useRef<MeshStandardMaterial>(null);
  const portalMatRef = useRef<MeshStandardMaterial>(null);

  const wallT = 0.34;

  const geom = useMemo(() => {
    // Determine portal orientation and exterior connection point based on bridge.wallSide
    // so the door frame is 100% flush in the wall and the diagonal bridge starts strictly outside
    const isNorth = bridge.wallSide === 'north';
    const isWest = bridge.wallSide === 'west';
    const isEast = bridge.wallSide === 'east';

    const portalYaw = isNorth ? 0 : Math.PI / 2;

    let portalX = bridge.from[0];
    let portalZ = bridge.from[2];
    let extStartX = bridge.from[0];
    let extStartY = bridge.from[1];
    let extStartZ = bridge.from[2];

    if (isNorth) {
      portalZ -= wallT / 2;
      extStartZ -= wallT;
    } else if (isWest) {
      portalX -= wallT / 2;
      extStartX -= wallT;
    } else if (isEast) {
      portalX += wallT / 2;
      extStartX += wallT;
    }

    const start = new Vector3(extStartX, extStartY, extStartZ);
    const end = new Vector3(...bridge.to);
    const delta = end.clone().sub(start);
    const horizLen = Math.hypot(delta.x, delta.z);
    const fullLen = delta.length();
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const yaw = Math.atan2(delta.x, delta.z);
    const pitch = -Math.atan2(delta.y, horizLen);

    return {
      start,
      end,
      fullLen,
      mid,
      yaw,
      pitch,
      portalPos: [portalX, 0, portalZ] as Vec3,
      portalYaw,
    };
  }, [bridge.from, bridge.to, bridge.wallSide]);

  const particles = useMemo(() => [0.08, 0.25, 0.42, 0.58, 0.75, 0.92], []);

  useFrame(({ clock }) => {
    const active = Boolean(activityRef.current?.activeBridges.has(bridge.id));
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const speed = active ? 0.62 : 0.24;

    if (stripMatRef.current) {
      stripMatRef.current.emissiveIntensity = active ? 2.5 + 0.6 * Math.sin(t * 7) : 1.35;
    }
    if (portalMatRef.current) {
      portalMatRef.current.emissiveIntensity = active ? 2.4 + 0.5 * Math.sin(t * 6) : 1.3;
    }

    for (let i = 0; i < particles.length; i++) {
      const m = particleRefs.current[i];
      if (!m) continue;
      const u = (particles[i] + t * speed) % 1;
      m.position.z = (u - 0.5) * (geom.fullLen - 0.4);
      const s = active ? 1.4 : 0.95;
      m.scale.set(s, s, active ? 1.8 : 1.15);
    }
  });

  const bw = bridge.width;

  const underGirderColor = isDark ? '#0B1933' : '#1E293B';
  const walkwayColor = isDark ? '#122442' : '#273859';
  const handrailColor = isDark ? '#1E3A63' : '#0F172A';
  const stanchionColor = isDark ? '#13294B' : '#334155';
  const portalArchColor = isDark ? '#122442' : '#1E293B';

  return (
    <group>
      {/* Level Ground-Height Promenade Walkway, Translucent Glass Railings & Light Particles */}
      <group position={[geom.mid.x, 0.015, geom.mid.z]} rotation={[0, geom.yaw, 0]}>
        {/* Sleek low-profile structural under-deck trim resting directly on the floor */}
        <RoundedBox args={[bw + 0.16, 0.03, geom.fullLen + 0.16]} radius={0.01} smoothness={2} position={[0, -0.015, 0]} receiveShadow>
          <meshStandardMaterial color={underGirderColor} roughness={0.42} metalness={0.65} />
        </RoundedBox>

        {/* Textured anti-slip walking surface */}
        <mesh position={[0, 0.002, 0]} receiveShadow>
          <boxGeometry args={[bw - 0.12, 0.02, geom.fullLen + 0.14]} />
          <meshStandardMaterial color={walkwayColor} roughness={0.55} metalness={0.4} />
        </mesh>

        {/* Center illuminated cyan/accent walking pathway strip */}
        <mesh position={[0, 0.014, 0]}>
          <boxGeometry args={[bw * 0.36, 0.014, geom.fullLen + 0.12]} />
          <meshStandardMaterial
            ref={stripMatRef}
            color={bridge.secondaryAccent ?? '#00E5FF'}
            emissive={bridge.secondaryAccent ?? '#00E5FF'}
            emissiveIntensity={1.25}
            roughness={0.2}
          />
        </mesh>

        {/* Side glowing neon runner rails & translucent glass balustrades */}
        {[-bw / 2, bw / 2].map((sx, idx) => (
          <group key={idx} position={[sx, 0, 0]}>
            {/* Neon edge runner */}
            <mesh position={[0, 0.035, 0]}>
              <boxGeometry args={[0.08, 0.06, geom.fullLen + 0.16]} />
              <meshStandardMaterial color={bridge.accent} emissive={bridge.accent} emissiveIntensity={1.75} />
            </mesh>
            {/* Translucent energy glass railing */}
            <mesh position={[0, 0.44, 0]}>
              <boxGeometry args={[0.04, 0.78, geom.fullLen]} />
              <meshPhysicalMaterial
                color="#67E8F9"
                transparent
                opacity={0.32}
                roughness={0.1}
                metalness={0.2}
                depthWrite={false}
              />
            </mesh>
            {/* Top sleek handrail */}
            <mesh position={[0, 0.84, 0]} castShadow>
              <boxGeometry args={[0.08, 0.06, geom.fullLen + 0.12]} />
              <meshStandardMaterial color={handrailColor} metalness={0.72} roughness={0.28} />
            </mesh>
            {/* Stanchion posts */}
            {[-0.42, 0, 0.42].map((u, pi) => (
              <mesh key={pi} position={[0, 0.42, u * geom.fullLen]} castShadow>
                <boxGeometry args={[0.08, 0.84, 0.08]} />
                <meshStandardMaterial color={stanchionColor} metalness={0.68} roughness={0.34} />
              </mesh>
            ))}
          </group>
        ))}

        {/* Animated directional light particles flowing along the walkway */}
        {particles.map((u, idx) => (
          <mesh
            key={idx}
            ref={(el) => {
              particleRefs.current[idx] = el;
            }}
            position={[0, 0.04, (u - 0.5) * geom.fullLen]}
          >
            <boxGeometry args={[bw * 0.26, 0.024, 0.36]} />
            <meshBasicMaterial color={idx % 2 === 0 ? '#7DD3FC' : bridge.accent} transparent opacity={0.96} />
          </mesh>
        ))}
      </group>

      {/* Straight Luminous Portal Archway & Floor Threshold Flush in Wall Opening */}
      <group position={geom.portalPos} rotation={[0, geom.portalYaw, 0]}>
        {/* Doorway Floor Threshold Slab through the wall thickness */}
        <mesh position={[0, 0.012, 0]} receiveShadow>
          <boxGeometry args={[bw + 0.04, 0.024, wallT + 0.02]} />
          <meshStandardMaterial color={walkwayColor} roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Center illuminated walking strip through doorway */}
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[bw * 0.36, 0.012, wallT + 0.04]} />
          <meshStandardMaterial
            color={bridge.secondaryAccent ?? '#00E5FF'}
            emissive={bridge.secondaryAccent ?? '#00E5FF'}
            emissiveIntensity={1.25}
          />
        </mesh>

        {/* Vertical Portal Pillars flush against wall opening */}
        {[-bw / 2 - 0.09, bw / 2 + 0.09].map((px, i) => (
          <mesh key={i} position={[px, 1.45, 0]} castShadow>
            <boxGeometry args={[0.18, 2.9, wallT + 0.04]} />
            <meshStandardMaterial color={portalArchColor} metalness={0.7} roughness={0.3} />
          </mesh>
        ))}

        {/* Top Arch Lintel Beam meeting the wall upper lintel beam */}
        <mesh position={[0, 2.96, 0]} castShadow>
          <boxGeometry args={[bw + 0.36, 0.22, wallT + 0.04]} />
          <meshStandardMaterial color={portalArchColor} metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Neon Accent Runner Underneath Portal Lintel */}
        <mesh position={[0, 2.84, 0]}>
          <boxGeometry args={[bw + 0.08, 0.06, wallT + 0.06]} />
          <meshStandardMaterial ref={portalMatRef} color={bridge.accent} emissive={bridge.accent} emissiveIntensity={1.4} />
        </mesh>
      </group>
    </group>
  );
});

/** Decorative low-profile cyber planter adding high-tech warmth to external campus platforms (Image 1 detail). */
const CyberPlanter = memo(function CyberPlanter({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* Sleek metallic pot */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.18, 0.32, 16]} />
        <meshStandardMaterial color="#0F172A" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Dark nutrient bed */}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.02, 16]} />
        <meshStandardMaterial color="#1E293B" roughness={0.8} />
      </mesh>
      {/* Stylized organic foliage spheres */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial color="#10B981" roughness={0.6} />
      </mesh>
      <mesh position={[0.08, 0.65, 0.05]} castShadow>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshStandardMaterial color="#34D399" roughness={0.6} />
      </mesh>
    </group>
  );
});

/** High-density industrial server blade tower with glowing cyan and emerald blade LEDs (Image 1 visual target). */
const ServerBladeTower = memo(function ServerBladeTower({
  position,
  size = [0.95, 2.2, 0.95],
  primaryLed = '#00E5FF',
  secondaryLed = '#10B981',
}: {
  position: Vec3;
  size?: Vec3;
  primaryLed?: string;
  secondaryLed?: string;
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      {/* Main Server Tower Chassis */}
      <RoundedBox args={[w, h, d]} radius={0.05} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial color="#0B132B" roughness={0.32} metalness={0.75} />
      </RoundedBox>
      {/* Glowing Top Beacon Cap */}
      <mesh position={[0, h + 0.025, 0]}>
        <boxGeometry args={[w * 0.72, 0.05, d * 0.72]} />
        <meshStandardMaterial color={primaryLed} emissive={primaryLed} emissiveIntensity={1.8} />
      </mesh>
      {/* Front Face Blade Slots with Alternating Vibrant Cyan & Emerald LEDs */}
      {Array.from({ length: 8 }).map((_, idx) => {
        const slotY = 0.3 + idx * ((h - 0.52) / 8);
        const col = idx % 3 === 0 ? secondaryLed : primaryLed;
        return (
          <group key={idx} position={[0, slotY, d / 2 + 0.015]}>
            {/* Dark slot bay */}
            <mesh>
              <boxGeometry args={[w * 0.78, 0.065, 0.015]} />
              <meshStandardMaterial color="#030814" roughness={0.5} />
            </mesh>
            {/* Left LED indicator bar */}
            <mesh position={[-w * 0.22, 0, 0.01]}>
              <boxGeometry args={[w * 0.26, 0.038, 0.01]} />
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1.8} />
            </mesh>
            {/* Right LED indicator bar */}
            <mesh position={[w * 0.22, 0, 0.01]}>
              <boxGeometry args={[w * 0.22, 0.038, 0.01]} />
              <meshStandardMaterial color={primaryLed} emissive={primaryLed} emissiveIntensity={1.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

// =========================================================================================
// TOOL ORCHESTRATION 3D RECONSTRUCTION (Exact Match to Generated Reference Image)
// =========================================================================================

/** High-definition procedural canvas HUD texture matching the exact Tool Orchestration gear monitor. */
function makeToolOrchestrationHudTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep translucent midnight blue glass plate
  ctx.fillStyle = 'rgba(5, 14, 36, 0.94)';
  ctx.fillRect(0, 0, 768, 384);

  // Outer glowing cyan technical border brackets with cut-corner notches
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(10, 10, 748, 364);

  // Technical corner brackets
  ctx.lineWidth = 7;
  const bLen = 32;
  // Top-left
  ctx.beginPath(); ctx.moveTo(10, 10 + bLen); ctx.lineTo(10, 10); ctx.lineTo(10 + bLen, 10); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(758 - bLen, 10); ctx.lineTo(758, 10); ctx.lineTo(758, 10 + bLen); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(10, 374 - bLen); ctx.lineTo(10, 374); ctx.lineTo(10 + bLen, 374); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(758 - bLen, 374); ctx.lineTo(758, 374); ctx.lineTo(758, 374 - bLen); ctx.stroke();

  // Top header status bar
  ctx.fillStyle = '#00E5FF';
  ctx.fillRect(10, 10, 340, 26);
  ctx.fillStyle = '#030A18';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('SYSTEM // TOOL ORCHESTRATION ENGINE', 20, 28);

  // Left Side: System Telemetry, Bar Graphs & Data Buses
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(28, 54, 210, 4);

  // Multi-column telemetry bars
  for (let i = 0; i < 11; i++) {
    const barH = 30 + ((i * 43) % 95);
    ctx.fillStyle = i % 2 === 0 ? '#00E5FF' : '#38BDF8';
    ctx.fillRect(28 + i * 20, 270 - barH, 14, barH);
  }

  // Code streams and buffer readout lines
  ctx.fillStyle = '#94A3B8';
  for (let y = 72; y <= 144; y += 14) {
    const w = 210 - (y % 32) * 4;
    ctx.fillRect(28, y, w, 4);
  }

  // Center: Large, Radiant Glowing Mechanical Cog/Gear Icon matching the reference image!
  const iconCx = 465;
  const iconCy = 192;
  drawGearIcon(ctx, iconCx, iconCy, 84, 62, 26, 10, '#00F0FF');

  // Radiating circuit bus traces connecting the gear icon to the surrounding panels
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(iconCx - 110, iconCy); ctx.lineTo(iconCx - 90, iconCy);
  ctx.moveTo(iconCx + 90, iconCy); ctx.lineTo(iconCx + 110, iconCy);
  ctx.moveTo(iconCx, iconCy - 110); ctx.lineTo(iconCx, iconCy - 90);
  ctx.moveTo(iconCx, iconCy + 90); ctx.lineTo(iconCx, iconCy + 110);
  ctx.stroke();

  // Right Side: Waveform Monitor & System Diagnostic Grid
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(595, 54, 150, 100);
  ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
  ctx.fillRect(595, 54, 150, 100);

  // Sine/Oscilloscope Waveform
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 0; x < 150; x += 4) {
    const wy = 104 + Math.sin(x * 0.12) * 24 + Math.sin(x * 0.28) * 12;
    if (x === 0) ctx.moveTo(595 + x, wy);
    else ctx.lineTo(595 + x, wy);
  }
  ctx.stroke();

  // Memory buffer load bars
  for (let r = 0; r < 4; r++) {
    const by = 175 + r * 22;
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(595, by, 150, 14);
    ctx.fillStyle = r === 3 ? '#F59E0B' : '#00E5FF';
    ctx.fillRect(595, by, 60 + ((r * 35) % 85), 14);
  }

  // Diagnostic status text on bottom right
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('STATUS: SYNCHRONIZED', 595, 290);
  ctx.fillText('LINK: ACTIVE (10Gbps)', 595, 310);
  ctx.fillText('CORE: OPTIMAL (34°C)', 595, 330);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural screen texture for workstation terminal displays. */
function makeConsoleTerminalTexture(mode: 'radar' | 'code' | 'topology'): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#040C1E';
  ctx.fillRect(0, 0, 256, 144);
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 136);

  if (mode === 'radar') {
    const cx = 128;
    const cy = 72;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 55, cy); ctx.lineTo(cx + 55, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 55); ctx.lineTo(cx, cy + 55); ctx.stroke();
    // Radar blips
    ctx.fillStyle = '#00F0FF';
    ctx.beginPath(); ctx.arc(cx + 22, cy - 18, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 15, cy + 24, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath(); ctx.arc(cx + 34, cy + 12, 3, 0, Math.PI * 2); ctx.fill();
  } else if (mode === 'code') {
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(8, 8, 80, 10);
    ctx.fillStyle = '#67E8F9';
    for (let y = 26; y < 136; y += 10) {
      const w = 60 + ((y * 19) % 150);
      ctx.fillRect(12, y, w, 4);
    }
  } else {
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(16, 20, 48, 28);
    ctx.strokeRect(100, 56, 56, 32);
    ctx.strokeRect(184, 20, 48, 28);
    ctx.strokeRect(184, 92, 48, 28);
    ctx.beginPath();
    ctx.moveTo(64, 34); ctx.lineTo(100, 72);
    ctx.moveTo(156, 72); ctx.lineTo(184, 34);
    ctx.moveTo(156, 72); ctx.lineTo(184, 106);
    ctx.stroke();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Cryogenic liquid coolant containment cylinder with outer glass and glowing cyan liquid (Matching Reference Image). */
const CoolantCryoTank = memo(function CoolantCryoTank({
  position,
  rotation = [0, 0, 0],
}: {
  position: Vec3;
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Heavy-Duty Flanged Metallic Base */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.44, 0.48, 0.16, 24]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
      </mesh>
      {/* Outer Transparent Cryo Chamber */}
      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 1.35, 24]} />
        <meshPhysicalMaterial
          color="#38BDF8"
          transparent
          opacity={0.32}
          roughness={0.06}
          transmission={0.82}
          ior={1.42}
          depthWrite={false}
        />
      </mesh>
      {/* Inner Glowing Electric Cyan Coolant Liquid Core */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.33, 0.33, 1.25, 20]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.5} roughness={0.15} />
      </mesh>
      {/* Inner Concentric Core Rod */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.3, 16]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#E0F2FE" emissiveIntensity={1.8} />
      </mesh>
      {/* Top Metallic Dome Cap */}
      <mesh position={[0, 1.56, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.44, 0.16, 24]} />
        <meshStandardMaterial color="#E2E8F0" metalness={0.92} roughness={0.14} />
      </mesh>
      {/* Top Pipe Fitting Collar */}
      <mesh position={[0, 1.68, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.1, 16]} />
        <meshStandardMaterial color="#64748B" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Chrome Manual Valve Handwheel */}
      <mesh position={[0, 1.76, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.11, 0.022, 8, 18]} />
        <meshStandardMaterial color="#E2E8F0" metalness={0.9} roughness={0.15} />
      </mesh>
    </group>
  );
});

/** Industrial yellow / amber safety handrail protecting platforms and catwalks (Matching Reference Image). */
const IndustrialSafetyRail = memo(function IndustrialSafetyRail({
  start,
  length,
  rotation = [0, 0, 0],
}: {
  start: Vec3;
  length: number;
  rotation?: [number, number, number];
}) {
  const postsCount = Math.max(2, Math.floor(length / 0.75) + 1);
  const railColor = '#FBBF24';
  return (
    <group position={start} rotation={rotation}>
      {/* Top Rail Bar */}
      <mesh position={[length / 2, 0.72, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, length, 12]} />
        <meshStandardMaterial color={railColor} metalness={0.78} roughness={0.25} />
      </mesh>
      {/* Mid Rail Bar */}
      <mesh position={[length / 2, 0.38, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, length, 12]} />
        <meshStandardMaterial color={railColor} metalness={0.78} roughness={0.25} />
      </mesh>
      {/* Base Kickplate */}
      <mesh position={[length / 2, 0.08, 0]}>
        <boxGeometry args={[length, 0.14, 0.025]} />
        <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Vertical Stanchion Posts */}
      {Array.from({ length: postsCount }).map((_, idx) => {
        const px = (idx / (postsCount - 1)) * length;
        return (
          <group key={idx} position={[px, 0.36, 0]}>
            <mesh>
              <cylinderGeometry args={[0.028, 0.028, 0.72, 12]} />
              <meshStandardMaterial color={railColor} metalness={0.78} roughness={0.25} />
            </mesh>
            {/* Base mounting flange */}
            <mesh position={[0, -0.34, 0]}>
              <cylinderGeometry args={[0.065, 0.065, 0.03, 12]} />
              <meshStandardMaterial color="#0F172A" metalness={0.9} roughness={0.2} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

/** 3-Tier industrial stack signal light beacon (Patlite: Red / Amber / Green). */
const StackSignalTower = memo(function StackSignalTower({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* Metallic Base Mast */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.24, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Tier 1: Green Signal (Bottom) */}
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
        <meshStandardMaterial color="#10B981" emissive="#10B981" emissiveIntensity={2.0} />
      </mesh>
      {/* Tier 2: Amber Signal (Middle) */}
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
        <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={2.0} />
      </mesh>
      {/* Tier 3: Red Signal (Top) */}
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
        <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={2.0} />
      </mesh>
      {/* Top Cap */}
      <mesh position={[0, 0.54, 0]}>
        <cylinderGeometry args={[0.058, 0.058, 0.03, 16]} />
        <meshStandardMaterial color="#0F172A" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
});

/** Dual-tier operator control console with overhead displays and chrome cooling pipes. */
const OperatorWorkstation = memo(function OperatorWorkstation({
  position,
  rotation = [0, 0, 0],
  radarTex,
  codeTex,
  topoTex,
}: {
  position: Vec3;
  rotation?: [number, number, number];
  radarTex: CanvasTexture | null;
  codeTex: CanvasTexture | null;
  topoTex: CanvasTexture | null;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Main Console Desk Base */}
      <RoundedBox args={[2.2, 0.85, 0.9]} radius={0.04} position={[0, 0.425, 0]} castShadow>
        <meshStandardMaterial color="#0B132B" roughness={0.38} metalness={0.7} />
      </RoundedBox>
      {/* Lower Desk Skirt Glowing Cyan Strip */}
      <mesh position={[0, 0.12, 0.46]}>
        <boxGeometry args={[2.08, 0.04, 0.02]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.8} />
      </mesh>
      {/* Illuminated Cyan Keyboard & Control Deck on desktop */}
      <mesh position={[0, 0.86, 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 0.36]} />
        <meshStandardMaterial color="#0284C7" emissive="#00E5FF" emissiveIntensity={1.5} roughness={0.2} />
      </mesh>

      {/* Dual Lower Desktop Displays angled towards operator */}
      {/* Left Desktop Monitor */}
      <group position={[-0.52, 1.05, -0.06]} rotation={[-0.32, 0.18, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.78, 0.44, 0.04]} />
          <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.74, 0.4]} />
          {radarTex ? <meshBasicMaterial map={radarTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>

      {/* Right Desktop Monitor */}
      <group position={[0.52, 1.05, -0.06]} rotation={[-0.32, -0.18, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.78, 0.44, 0.04]} />
          <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.74, 0.4]} />
          {codeTex ? <meshBasicMaterial map={codeTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>

      {/* Overhead Monitor Mounting Frame */}
      <mesh position={[-0.85, 1.45, -0.38]}>
        <cylinderGeometry args={[0.025, 0.025, 1.25, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
      </mesh>
      <mesh position={[0.85, 1.45, -0.38]}>
        <cylinderGeometry args={[0.025, 0.025, 1.25, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.82, -0.38]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 1.85, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
      </mesh>

      {/* Dual Upper Overhead Displays */}
      <group position={[-0.52, 1.76, -0.32]} rotation={[0.18, 0.12, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.82, 0.46, 0.04]} />
          <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.78, 0.42]} />
          {topoTex ? <meshBasicMaterial map={topoTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>

      <group position={[0.52, 1.76, -0.32]} rotation={[0.18, -0.12, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.82, 0.46, 0.04]} />
          <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.78, 0.42]} />
          {codeTex ? <meshBasicMaterial map={codeTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>

      {/* Overhead Brushed Chrome Cooling Pipes Arcing Over the Desk */}
      <mesh position={[-0.92, 1.65, -0.25]}>
        <cylinderGeometry args={[0.05, 0.05, 1.35, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[-0.92, 2.32, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.05, 10, 16, Math.PI / 2]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[-0.92, 2.32, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.048, 0.048, 0.48, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[-0.92, 1.58, 0.52]}>
        <cylinderGeometry args={[0.048, 0.048, 1.15, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>

      {/* Potted Cyber Bonsai Plant on Desk Ledge */}
      <CyberPlanter position={[0.88, 0.85, -0.22]} />

      {/* Modular Power Storage Battery Crates on Left */}
      <group position={[-1.75, 0, 0.15]}>
        {/* Crate 1: Dark Slate Industrial Module */}
        <RoundedBox args={[0.68, 0.56, 0.52]} radius={0.03} position={[0, 0.28, 0]} castShadow>
          <meshStandardMaterial color="#1E293B" metalness={0.75} roughness={0.3} />
        </RoundedBox>
        <mesh position={[0, 0.38, 0.27]}>
          <boxGeometry args={[0.58, 0.05, 0.02]} />
          <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.5} />
        </mesh>

        {/* Crate 2: Safety Yellow Power Pack */}
        <RoundedBox args={[0.62, 0.52, 0.52]} radius={0.03} position={[0.68, 0.26, 0]} castShadow>
          <meshStandardMaterial color="#EAB308" metalness={0.65} roughness={0.35} />
        </RoundedBox>
        <mesh position={[0.68, 0.26, 0.27]}>
          <boxGeometry args={[0.5, 0.36, 0.015]} />
          <meshStandardMaterial color="#0F172A" roughness={0.6} />
        </mesh>
        <mesh position={[0.68, 0.26, 0.28]}>
          <boxGeometry args={[0.42, 0.04, 0.01]} />
          <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={1.8} />
        </mesh>
      </group>
    </group>
  );
});

/** Central Tiered Core with Golden Containment Chamber and Floating Hypercube. */
const ToolOrchestrationCore = memo(function ToolOrchestrationCore({
  activeRef,
}: {
  activeRef: React.RefObject<boolean>;
}) {
  const reducedMotion = useReducedMotion();
  const spinRingRef = useRef<Group>(null);
  const coreMeshRef = useRef<Mesh>(null);
  const pulseMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const active = Boolean(activeRef.current);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    if (spinRingRef.current && !reducedMotion) {
      spinRingRef.current.rotation.y += dt * (active ? 0.95 : 0.42);
    }
    if (coreMeshRef.current && !reducedMotion) {
      coreMeshRef.current.rotation.y -= dt * (active ? 0.65 : 0.28);
      coreMeshRef.current.rotation.x = Math.sin(t * 0.8) * 0.12;
      coreMeshRef.current.position.y = 1.37 + Math.sin(t * 1.5) * 0.04;
    }
    if (pulseMatRef.current && !reducedMotion) {
      pulseMatRef.current.emissiveIntensity = active
        ? 3.2 + Math.sin(t * 5.0) * 0.8
        : 2.4 + Math.sin(t * 3.2) * 0.5;
    }
  });

  return (
    <group position={[0.1, 0, -0.15]}>
      {/* Tier 1 Base Plinth with Chamfered Corners */}
      <RoundedBox args={[3.2, 0.28, 3.2]} radius={0.06} position={[0, 0.14, 0]} castShadow>
        <meshStandardMaterial color="#0F172A" roughness={0.34} metalness={0.8} />
      </RoundedBox>

      {/* Recessed Mechanical Vent Channel */}
      <mesh position={[0, 0.285, 0]}>
        <boxGeometry args={[3.05, 0.03, 3.05]} />
        <meshStandardMaterial color="#020617" roughness={0.6} />
      </mesh>

      {/* Tier 2 Stepped Pedestal */}
      <RoundedBox args={[2.4, 0.24, 2.4]} radius={0.04} position={[0, 0.42, 0]} castShadow>
        <meshStandardMaterial color="#1E293B" roughness={0.32} metalness={0.75} />
      </RoundedBox>

      {/* Continuous Glowing Golden / Amber Neon Border Runner */}
      {[
        { pos: [0, 0.545, 1.2] as Vec3, size: [2.42, 0.025, 0.03] as Vec3 },
        { pos: [0, 0.545, -1.2] as Vec3, size: [2.42, 0.025, 0.03] as Vec3 },
        { pos: [1.2, 0.545, 0] as Vec3, size: [0.03, 0.025, 2.42] as Vec3 },
        { pos: [-1.2, 0.545, 0] as Vec3, size: [0.03, 0.025, 2.42] as Vec3 },
      ].map((trim, i) => (
        <mesh key={i} position={trim.pos}>
          <boxGeometry args={trim.size} />
          <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={2.5} />
        </mesh>
      ))}

      {/* Golden Recessed Surface Pad */}
      <mesh position={[0, 0.542, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.3, 2.3]} />
        <meshStandardMaterial color="#B45309" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Outer Holographic Transparent Containment Chamber Cube */}
      <RoundedBox args={[1.48, 1.48, 1.48]} radius={0.04} position={[0, 1.37, 0]} castShadow>
        <meshPhysicalMaterial
          color="#FEF08A"
          transparent
          opacity={0.3}
          roughness={0.06}
          metalness={0.12}
          transmission={0.8}
          ior={1.45}
          depthWrite={false}
        />
      </RoundedBox>

      {/* 4 Corner Holographic Projector Emitter Pins Framing the Chamber */}
      {[
        [-0.72, -0.72],
        [0.72, -0.72],
        [-0.72, 0.72],
        [0.72, 0.72],
      ].map(([px, pz], idx) => (
        <group key={idx} position={[px, 1.37, pz]}>
          <mesh>
            <cylinderGeometry args={[0.025, 0.025, 1.48, 12]} />
            <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.76, 0]}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={2.2} />
          </mesh>
        </group>
      ))}

      {/* Inner Floating Radiant Glowing Golden Hypercube Core & Circuit Rings */}
      <group position={[0, 0, 0]}>
        {/* Floating Glowing Hypercube */}
        <mesh ref={coreMeshRef} position={[0, 1.37, 0]} castShadow>
          <boxGeometry args={[0.76, 0.76, 0.76]} />
          <meshStandardMaterial ref={pulseMatRef} color="#FEF08A" emissive="#F59E0B" emissiveIntensity={2.8} roughness={0.12} />
        </mesh>

        {/* Outer Volumetric Glow Aura */}
        <mesh position={[0, 1.37, 0]}>
          <sphereGeometry args={[0.62, 16, 16]} />
          <meshBasicMaterial color="#FBBF24" transparent opacity={0.16} depthWrite={false} />
        </mesh>

        {/* Rotating Concentric Golden and Cyan Holographic Circuit Rings */}
        <group ref={spinRingRef} position={[0, 1.37, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.98, 0.026, 12, 36]} />
            <meshStandardMaterial color="#FDE047" emissive="#F59E0B" emissiveIntensity={2.0} />
          </mesh>
          <mesh rotation={[Math.PI / 3, 0.4, 0]}>
            <torusGeometry args={[0.82, 0.022, 10, 32]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.0} />
          </mesh>
        </group>
      </group>
    </group>
  );
});

/** Full Reconstructed Tool Orchestration External Infrastructure Model (Image Reference Target). */
const ToolOrchestrationFacility = memo(function ToolOrchestrationFacility({
  activeRef,
}: {
  activeRef: React.RefObject<boolean>;
}) {
  const hudTex = useMemo(() => makeToolOrchestrationHudTexture(), []);
  const radarTex = useMemo(() => makeConsoleTerminalTexture('radar'), []);
  const codeTex = useMemo(() => makeConsoleTerminalTexture('code'), []);
  const topoTex = useMemo(() => makeConsoleTerminalTexture('topology'), []);

  return (
    <group position={[0, 0, 0]}>
      {/* 1. Central Processing Core & Containment Chamber */}
      <ToolOrchestrationCore activeRef={activeRef} />

      {/* 2. Giant Floating Cyan Holographic Screen with Central Cog/Gear Icon (Back-Right) */}
      <group position={[2.0, 2.65, -2.4]} rotation={[-0.08, -0.16, 0]}>
        {/* Rear Mounting Frame Backing */}
        <mesh position={[0, 0, -0.018]} castShadow>
          <boxGeometry args={[3.54, 1.88, 0.03]} />
          <meshStandardMaterial color="#0F172A" metalness={0.88} roughness={0.25} />
        </mesh>
        {/* High-Definition Procedural Holographic Display Surface */}
        <mesh>
          <planeGeometry args={[3.5, 1.84]} />
          {hudTex ? (
            <meshBasicMaterial map={hudTex} transparent opacity={0.92} side={DoubleSide} />
          ) : (
            <meshBasicMaterial color="#00E5FF" transparent opacity={0.65} side={DoubleSide} />
          )}
        </mesh>
        {/* Vertical Structural Steel Mounting Pylons Anchored to Platform */}
        <mesh position={[-1.4, -1.35, -0.03]}>
          <cylinderGeometry args={[0.045, 0.045, 2.7, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
        </mesh>
        <mesh position={[1.4, -1.35, -0.03]}>
          <cylinderGeometry args={[0.045, 0.045, 2.7, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
        </mesh>
      </group>

      {/* 3. Left-Back Operator Console & Cyber Workstation */}
      <OperatorWorkstation
        position={[-2.7, 0, -1.8]}
        radarTex={radarTex}
        codeTex={codeTex}
        topoTex={topoTex}
      />

      {/* 4. Front-Center Server Blade Tower Farm (3 Racks + Hazard Cabinet) */}
      <ServerBladeTower position={[-1.4, 0, 0.75]} size={[0.95, 2.05, 0.85]} primaryLed="#00E5FF" secondaryLed="#FFFFFF" />
      <ServerBladeTower position={[-0.35, 0, 0.95]} size={[0.95, 2.05, 0.85]} primaryLed="#00E5FF" secondaryLed="#38BDF8" />
      <ServerBladeTower position={[0.7, 0, 1.15]} size={[0.95, 2.05, 0.85]} primaryLed="#00E5FF" secondaryLed="#F59E0B" />

      {/* Slim Hazard Warning Cabinet Beside Front Racks */}
      <group position={[1.42, 0, 1.35]}>
        <RoundedBox args={[0.62, 1.62, 0.62]} radius={0.03} position={[0, 0.81, 0]} castShadow>
          <meshStandardMaterial color="#1E293B" metalness={0.78} roughness={0.28} />
        </RoundedBox>
        {/* Yellow Warning Badge (⚠ Triangle Representation) */}
        <mesh position={[0, 1.25, 0.32]}>
          <cylinderGeometry args={[0.12, 0.12, 0.02, 3]} />
          <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.8} />
        </mesh>
        {/* Lower Cyan Diagnostic Display */}
        <mesh position={[0, 0.72, 0.32]}>
          <planeGeometry args={[0.48, 0.38]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.6} />
        </mesh>
      </group>

      {/* 5. Liquid Coolant Tanks & Cryogenic Infrastructure (Right Foreground & Mid-Right) */}
      <CoolantCryoTank position={[2.25, 0, 1.45]} />
      <CoolantCryoTank position={[3.35, 0, 0.25]} />

      {/* Interconnecting Brushed Chrome Cooling Pipes Between Coolant Tanks and Core */}
      {/* Pipe from Tank 1 top cap curving towards Tank 2 */}
      <mesh position={[2.75, 1.76, 0.95]} rotation={[0, -Math.PI / 4, Math.PI / 2]}>
        <cylinderGeometry args={[0.048, 0.048, 1.45, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      {/* Dual Horizontal Chrome Pipes entering the Right Server Cabinet */}
      <mesh position={[3.35, 0.95, -0.6]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 1.5, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[3.35, 1.25, -0.6]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 1.5, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      {/* Vertical Pipe Drop into Floor Drainage Collar */}
      <mesh position={[2.25, 0.35, 2.05]}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 16]} />
        <meshStandardMaterial color="#64748B" metalness={0.88} roughness={0.2} />
      </mesh>

      {/* 6. Industrial Yellow Safety Handrails Protecting Coolant & Catwalk Zone */}
      <IndustrialSafetyRail start={[1.15, 0, 2.18]} length={1.8} />
      <IndustrialSafetyRail start={[2.95, 0, 2.18]} length={1.4} rotation={[0, -Math.PI / 2, 0]} />

      {/* 7. Right-Side Server Cabinet with 3-Tier Industrial Stack Signal Light Beacon */}
      <group position={[3.1, 0, -1.35]}>
        <RoundedBox args={[1.1, 2.4, 1.1]} radius={0.05} position={[0, 1.2, 0]} castShadow>
          <meshStandardMaterial color="#0B132B" roughness={0.32} metalness={0.78} />
        </RoundedBox>
        {/* Front Cyan LED blade arrays */}
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} position={[0, 0.45 + i * 0.32, 0.56]}>
            <boxGeometry args={[0.85, 0.08, 0.02]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.8} />
          </mesh>
        ))}
        {/* 3-Tier Industrial Stack Signal Light Beacon (Red/Amber/Green) on Top */}
        <StackSignalTower position={[0, 2.4, 0]} />
      </group>
      {/* Decorative Potted Cyber Plant beside Right Mainframe */}
      <CyberPlanter position={[3.85, 0, -1.0]} />

      {/* 8. Back-Left Massive Server Mainframe Block */}
      <group position={[-2.6, 0, -3.1]}>
        <RoundedBox args={[1.05, 2.4, 0.95]} radius={0.05} position={[0, 1.2, 0]} castShadow>
          <meshStandardMaterial color="#0A0F1D" roughness={0.34} metalness={0.8} />
        </RoundedBox>
        <mesh position={[0, 1.2, 0.49]}>
          <boxGeometry args={[0.78, 1.8, 0.02]} />
          <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.5} />
        </mesh>
      </group>
      <group position={[-1.45, 0, -3.1]}>
        <RoundedBox args={[1.05, 2.4, 0.95]} radius={0.05} position={[0, 1.2, 0]} castShadow>
          <meshStandardMaterial color="#0A0F1D" roughness={0.34} metalness={0.8} />
        </RoundedBox>
        <mesh position={[0, 1.2, 0.49]}>
          <boxGeometry args={[0.78, 1.8, 0.02]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.5} />
        </mesh>
      </group>
    </group>
  );
});

/** Monumental architectural backdrop structures tailored to each Image 2 infrastructure domain. */
const PlatformHeroStructure = memo(function PlatformHeroStructure({
  zone,
  activeRef,
}: {
  zone: CampusZone;
  activeRef: React.RefObject<boolean>;
}) {
  const reducedMotion = useReducedMotion();
  const spinRingRef = useRef<Group>(null);
  const pulseMatRef = useRef<MeshStandardMaterial>(null);
  const coreMeshRef = useRef<Mesh>(null);
  const holoTex = useMemo(() => makeHoloPanelTexture(zone.accent, zone.secondaryAccent, zone.kind), [zone.accent, zone.secondaryAccent, zone.kind]);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const active = Boolean(activeRef.current);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    if (spinRingRef.current && !reducedMotion) {
      spinRingRef.current.rotation.y += dt * (active ? 1.5 : 0.45);
    }
    if (pulseMatRef.current) {
      pulseMatRef.current.emissiveIntensity = active ? 2.5 + 0.65 * Math.sin(t * 6.5) : 1.35 + 0.25 * Math.sin(t * 2.5);
    }
    if (coreMeshRef.current && !reducedMotion) {
      const s = 1.0 + 0.05 * Math.sin(t * 3.5);
      coreMeshRef.current.scale.set(s, s, s);
    }
  });

  const backZ = -zone.depth / 2 + 1.35;

  // =========================================================================================
  // FACILITY A: DATA & KNOWLEDGE / MEMORY CENTER (Reference Image 2: Purple Memory Reactor)
  // =========================================================================================
  if (zone.kind === 'memory') {
    const foundationColor = '#0F172A';
    const crownColor = '#1E1B4B';
    const monolithColor = '#181236';

    return (
      <group position={[0, 0, backZ]}>
        {/* Central Cylindrical Plasma Core Reactor */}
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[1.75, 1.95, 0.44, 32]} />
            <meshStandardMaterial color={foundationColor} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[1.6, 1.6, 0.08, 32]} />
            <meshStandardMaterial color="#C084FC" emissive="#A855F7" emissiveIntensity={1.65} />
          </mesh>

          {/* Translucent purple containment cylinder */}
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[1.45, 1.45, 4.0, 32]} />
            <meshPhysicalMaterial
              color="#C084FC"
              transparent
              opacity={0.45}
              roughness={0.1}
              metalness={0.25}
              depthWrite={false}
            />
          </mesh>

          {/* Inner pulsating purple plasma core cylinder */}
          <mesh ref={coreMeshRef} position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.95, 0.95, 3.8, 24]} />
            <meshStandardMaterial ref={pulseMatRef} color="#A855F7" emissive="#9333EA" emissiveIntensity={1.85} />
          </mesh>

          {/* Stack of 4 horizontal glowing neon energy rings orbiting along reactor height */}
          {[1.2, 2.0, 2.9, 3.8].map((ry, i) => (
            <mesh key={i} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.52, 0.055, 12, 38]} />
              <meshStandardMaterial color={i % 2 === 0 ? '#C084FC' : '#38BDF8'} emissive={i % 2 === 0 ? '#A855F7' : '#00E5FF'} emissiveIntensity={1.8} />
            </mesh>
          ))}

          {/* Reactor crown cap & floating crystal */}
          <mesh position={[0, 4.65, 0]} castShadow>
            <cylinderGeometry args={[1.55, 1.35, 0.35, 32]} />
            <meshStandardMaterial color={crownColor} roughness={0.3} metalness={0.75} />
          </mesh>
          <group ref={spinRingRef} position={[0, 5.25, 0]}>
            <mesh>
              <octahedronGeometry args={[0.48, 0]} />
              <meshStandardMaterial color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.2} roughness={0.15} />
            </mesh>
            <mesh rotation={[Math.PI / 3, 0.2, 0]}>
              <torusGeometry args={[0.92, 0.04, 10, 32]} />
              <meshStandardMaterial color="#38BDF8" emissive="#00E5FF" emissiveIntensity={1.65} />
            </mesh>
          </group>
        </group>

        {/* Flanking Monumental Database Monoliths */}
        {[-4.6, 4.6].map((tx, idx) => (
          <group key={idx} position={[tx, 0, 0.2]}>
            <RoundedBox args={[1.35, 4.2, 1.35]} radius={0.08} position={[0, 2.1, 0]} castShadow>
              <meshStandardMaterial color={monolithColor} roughness={0.32} metalness={0.7} />
            </RoundedBox>
            {[0.8, 1.6, 2.4, 3.2, 3.8].map((ry, ri) => (
              <mesh key={ri} position={[0, ry, 0]}>
                <boxGeometry args={[1.44, 0.12, 1.44]} />
                <meshStandardMaterial color="#C084FC" emissive="#A855F7" emissiveIntensity={1.65} />
              </mesh>
            ))}
            <mesh position={[0, 4.45, 0]} castShadow>
              <octahedronGeometry args={[0.38, 0]} />
              <meshStandardMaterial color="#C084FC" emissive="#A855F7" emissiveIntensity={1.9} roughness={0.18} />
            </mesh>
          </group>
        ))}

        {/* Industrial Server Blade Towers with Purple and Cyan LED Arrays */}
        <ServerBladeTower position={[-2.6, 0, 0.5]} size={[1.05, 2.8, 1.05]} primaryLed="#C084FC" secondaryLed="#38BDF8" />
        <ServerBladeTower position={[2.6, 0, 0.5]} size={[1.05, 2.8, 1.05]} primaryLed="#38BDF8" secondaryLed="#C084FC" />

        {/* Floating Holographic Memory Matrix Panels with Storage Cylinder HUD */}
        {[-3.6, 3.6].map((hx, idx) => (
          <mesh key={idx} position={[hx, 3.5, 1.25]} rotation={[0, idx === 0 ? 0.28 : -0.28, 0]}>
            <planeGeometry args={[1.8, 1.2]} />
            {holoTex ? (
              <meshBasicMaterial map={holoTex} transparent opacity={0.92} side={DoubleSide} />
            ) : (
              <meshBasicMaterial color="#A855F7" transparent opacity={0.6} side={DoubleSide} />
            )}
          </mesh>
        ))}

        {/* Corner Cyber Planters with Green Foliage */}
        <CyberPlanter position={[-zone.width / 2 + 0.7, 0, zone.depth / 2 - 0.7]} />
        <CyberPlanter position={[zone.width / 2 - 0.7, 0, zone.depth / 2 - 0.7]} />
      </group>
    );
  }

  // =========================================================================================
  // FACILITY B: PROCESS STUDIO (Reference Image 2: Pink/Magenta Stepped Compute Cubes + Halo Ring)
  // =========================================================================================
  if (zone.kind === 'process') {
    const cubes = [
      { x: -1.6, z: -0.6, w: 1.1, h: 2.2, d: 1.1 },
      { x: 0.0, z: -0.8, w: 1.25, h: 2.6, d: 1.25 },
      { x: 1.6, z: -0.6, w: 1.1, h: 2.1, d: 1.1 },
      { x: -2.3, z: 0.6, w: 0.95, h: 1.5, d: 0.95 },
      { x: -0.9, z: 0.7, w: 1.05, h: 1.8, d: 1.05 },
      { x: 0.9, z: 0.7, w: 1.05, h: 1.9, d: 1.05 },
      { x: 2.3, z: 0.6, w: 0.95, h: 1.4, d: 0.95 },
    ];
    const cubeColor = '#221233';

    return (
      <group position={[0, 0, backZ]}>
        {/* Monumental Vertical Glowing Magenta circular halo ring standing upright */}
        <group ref={spinRingRef} position={[0, 3.6, -1.0]}>
          <mesh>
            <torusGeometry args={[2.3, 0.085, 16, 48]} />
            <meshStandardMaterial ref={pulseMatRef} color="#F472B6" emissive="#EC4899" emissiveIntensity={1.85} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <torusGeometry args={[1.65, 0.05, 12, 38]} />
            <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.5} />
          </mesh>
        </group>

        {/* Dense Cluster of Stepped Glowing Compute Cubes */}
        {cubes.map((c, idx) => (
          <group key={idx} position={[c.x, 0, c.z]}>
            <RoundedBox args={[c.w, c.h, c.d]} radius={0.06} position={[0, c.h / 2, 0]} castShadow>
              <meshStandardMaterial color={cubeColor} roughness={0.32} metalness={0.7} />
            </RoundedBox>
            <mesh position={[0, c.h + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[c.w - 0.12, c.d - 0.12]} />
              <meshStandardMaterial color="#F472B6" emissive="#EC4899" emissiveIntensity={1.75} />
            </mesh>
            <mesh position={[0, c.h * 0.6, c.d / 2 + 0.01]}>
              <boxGeometry args={[c.w - 0.15, 0.065, 0.02]} />
              <meshStandardMaterial color="#F472B6" emissive="#EC4899" emissiveIntensity={1.6} />
            </mesh>
          </group>
        ))}

        {/* Server Blade Towers with Pink & Amber Blade LEDs */}
        <ServerBladeTower position={[-3.6, 0, 0.5]} size={[0.95, 2.4, 0.95]} primaryLed="#EC4899" secondaryLed="#F59E0B" />
        <ServerBladeTower position={[3.6, 0, 0.5]} size={[0.95, 2.4, 0.95]} primaryLed="#EC4899" secondaryLed="#00E5FF" />

        {/* Floating Holographic Workflow Pipeline Execution HUD */}
        <group position={[0, 4.4, -0.4]} rotation={[-0.1, 0, 0]}>
          <mesh>
            <planeGeometry args={[2.8, 1.4]} />
            {holoTex ? (
              <meshBasicMaterial map={holoTex} transparent opacity={0.92} side={DoubleSide} />
            ) : (
              <meshBasicMaterial color="#EC4899" transparent opacity={0.6} side={DoubleSide} />
            )}
          </mesh>
        </group>

        {/* Corner Cyber Planters */}
        <CyberPlanter position={[-zone.width / 2 + 0.7, 0, zone.depth / 2 - 0.7]} />
        <CyberPlanter position={[zone.width / 2 - 0.7, 0, zone.depth / 2 - 0.7]} />
      </group>
    );
  }

  // =========================================================================================
  // FACILITY C: TOOL ORCHESTRATION (Exact 3D Reconstruction from Reference Image)
  // =========================================================================================
  if (zone.kind === 'tools') {
    return <ToolOrchestrationFacility activeRef={activeRef} />;
  }

  // =========================================================================================
  // FACILITY D: CONTENT STUDIO - RCP (Reference Image 2: Cyan Geodesic Cyber-Dome + Holograms)
  // =========================================================================================
  if (zone.kind === 'content') {
    const domeBaseColor = '#0A1E3C';
    const monolithColor = '#0C1F3D';

    return (
      <group position={[0, 0, backZ]}>
        {/* Monumental Luminous Cyan Geodesic Cyber-Dome */}
        <group position={[-1.8, 0, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow>
            <cylinderGeometry args={[2.1, 2.3, 0.3, 32]} />
            <meshStandardMaterial color={domeBaseColor} roughness={0.35} metalness={0.65} />
          </mesh>
          <mesh position={[0, 0.31, 0]}>
            <cylinderGeometry args={[1.95, 1.95, 0.06, 32]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.5} />
          </mesh>

          <mesh position={[0, 1.85, 0]}>
            <icosahedronGeometry args={[1.75, 2]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.8} wireframe />
          </mesh>

          <group ref={spinRingRef} position={[0, 1.85, 0]}>
            <mesh>
              <octahedronGeometry args={[0.55, 0]} />
              <meshStandardMaterial ref={pulseMatRef} color="#38BDF8" emissive="#06B6D4" emissiveIntensity={1.75} />
            </mesh>
            <mesh rotation={[Math.PI / 2.5, 0.3, 0]}>
              <torusGeometry args={[0.95, 0.045, 10, 32]} />
              <meshStandardMaterial color="#F472B6" emissive="#EC4899" emissiveIntensity={1.65} />
            </mesh>
          </group>
        </group>

        {/* Flanking Synthesis Monolith on Right */}
        <group position={[2.4, 0, 0]}>
          <RoundedBox args={[1.35, 3.6, 1.35]} radius={0.07} position={[0, 1.8, 0]} castShadow>
            <meshStandardMaterial color={monolithColor} roughness={0.32} metalness={0.7} />
          </RoundedBox>
          <mesh position={[0, 1.8, 0.69]}>
            <boxGeometry args={[0.18, 3.2, 0.04]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.7} />
          </mesh>
          <mesh position={[0, 2.5, 1.1]}>
            <planeGeometry args={[1.6, 1.1]} />
            {holoTex ? (
              <meshBasicMaterial map={holoTex} transparent opacity={0.92} side={DoubleSide} />
            ) : (
              <meshBasicMaterial color="#00E5FF" transparent opacity={0.6} side={DoubleSide} />
            )}
          </mesh>
        </group>

        {/* Server Blade Tower */}
        <ServerBladeTower position={[3.6, 0, -1.0]} size={[0.95, 2.3, 0.95]} primaryLed="#00E5FF" secondaryLed="#EC4899" />

        {/* Floating Hexagonal Holographic Panels */}
        {[-3.6, 1.0].map((px, idx) => (
          <mesh key={idx} position={[px, 3.4, 1.2]} rotation={[0, idx === 0 ? 0.3 : -0.3, 0]}>
            <circleGeometry args={[0.85, 6]} />
            <meshBasicMaterial color="#38BDF8" transparent opacity={0.45} side={DoubleSide} wireframe />
          </mesh>
        ))}

        {/* Corner Cyber Planters */}
        <CyberPlanter position={[-zone.width / 2 + 0.7, 0, zone.depth / 2 - 0.7]} />
        <CyberPlanter position={[zone.width / 2 - 0.7, 0, zone.depth / 2 - 0.7]} />
      </group>
    );
  }

  // =========================================================================================
  // FACILITY E: OPERATIONS & SAFETY (Reference Image 2: Cyan Command Dais & Security Obelisks)
  // =========================================================================================
  const daisColor = '#081832';
  const obeliskColor = '#0C2042';

  return (
    <group position={[0, 0, backZ]}>
      {/* Central Stepped Security Dais & Containment Chamber */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <boxGeometry args={[3.2, 0.44, 3.2]} />
          <meshStandardMaterial color={daisColor} roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[3.0, 0.06, 3.0]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.6} />
        </mesh>

        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 2.6, 32]} />
          <meshPhysicalMaterial
            color="#38BDF8"
            transparent
            opacity={0.35}
            roughness={0.1}
            metalness={0.2}
            depthWrite={false}
          />
        </mesh>

        <group ref={spinRingRef} position={[0, 1.8, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.35, 0.055, 12, 38]} />
            <meshStandardMaterial ref={pulseMatRef} color="#00E5FF" emissive="#38BDF8" emissiveIntensity={1.75} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.42, 24, 24]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={1.6} roughness={0.18} />
          </mesh>
        </group>
      </group>

      {/* Flanking Twin Security Scanner Obelisks */}
      {[-3.4, 3.4].map((tx, idx) => (
        <group key={idx} position={[tx, 0, 0.2]}>
          <RoundedBox args={[1.1, 4.0, 1.1]} radius={0.07} position={[0, 2.0, 0]} castShadow>
            <meshStandardMaterial color={obeliskColor} roughness={0.32} metalness={0.72} />
          </RoundedBox>
          <mesh position={[0, 2.0, 0.57]}>
            <boxGeometry args={[0.16, 3.5, 0.05]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.75} />
          </mesh>
          <mesh position={[0, 4.25, 0]} castShadow>
            <octahedronGeometry args={[0.34, 0]} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={1.9} />
          </mesh>
        </group>
      ))}

      {/* Server Blade Towers with Electric Cyan Blade LEDs */}
      <ServerBladeTower position={[-1.8, 0, 1.8]} size={[0.95, 2.2, 0.95]} primaryLed="#00E5FF" secondaryLed="#38BDF8" />

      {/* Floating Holographic Security Shield Panels */}
      {[-2.2, 2.2].map((hx, idx) => (
        <mesh key={idx} position={[hx, 3.4, 1.3]} rotation={[0, idx === 0 ? 0.3 : -0.3, 0]}>
          <planeGeometry args={[1.65, 1.15]} />
          {holoTex ? (
            <meshBasicMaterial map={holoTex} transparent opacity={0.92} side={DoubleSide} />
          ) : (
            <meshBasicMaterial color="#00E5FF" transparent opacity={0.6} side={DoubleSide} />
          )}
        </mesh>
      ))}

      {/* Corner Cyber Planters */}
      <CyberPlanter position={[-zone.width / 2 + 0.7, 0, zone.depth / 2 - 0.7]} />
      <CyberPlanter position={[zone.width / 2 - 0.7, 0, zone.depth / 2 - 0.7]} />
    </group>
  );
});

/** Single elevated futuristic AI infrastructure platform with multi-tier foundations, neon conduits, signage & hero architecture. */
const ExternalPlatform = memo(function ExternalPlatform({
  zone,
  activityRef,
  isDark = true,
}: {
  zone: CampusZone;
  activityRef: React.RefObject<CampusActivityRefs>;
  isDark?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const rimMatRef = useRef<MeshStandardMaterial>(null);
  const beaconMatRef = useRef<MeshBasicMaterial>(null);
  const isActiveRef = useRef(false);

  const signTex = useMemo(
    () => makePlatformSignTexture(zone.label, zone.accent, zone.secondaryAccent),
    [zone.label, zone.accent, zone.secondaryAccent],
  );

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const store = useTelemetryStore.getState();
    const hasBusyMod = store.moduleOrder.some((mId) => {
      if (moduleZoneKind(mId) !== zone.kind) return false;
      const st = store.modules[mId]?.state;
      if (st === 'busy' || st === 'booting') return true;
      const last = store.moduleCalls[mId]?.at(-1)?.startedAt ?? 0;
      return Date.now() / 1000 - last < 1.8;
    });
    const active = hasBusyMod || Boolean(activityRef.current?.activeZones.has(zone.id));
    isActiveRef.current = active;

    if (rimMatRef.current) {
      rimMatRef.current.emissiveIntensity = active ? 2.5 + 0.6 * Math.sin(t * 6.5) : 1.35;
    }
    if (beaconMatRef.current) {
      beaconMatRef.current.opacity = active ? 0.4 + 0.15 * Math.sin(t * 5) : 0.12;
    }
  });

  const py = zone.height;

  // Solid, high-contrast architectural colors that stand out in both light & dark environments
  const baseSlabColor = isDark ? '#071329' : '#1E293B';
  const deckSlabColor = isDark ? zone.surfaceTint : '#13213B';
  const deckPlateColor = isDark ? '#091734' : '#0B1528';

  // Position signboard along the front deck lip (Image 1 & 2 reference target)
  const isMemory = zone.kind === 'memory';
  const signPos: Vec3 = isMemory
    ? [0, 2.7, zone.depth / 2 - 0.22]
    : zone.kind === 'tools'
    ? [-2.35, 0.52, zone.depth / 2 - 0.22]
    : zone.kind === 'process'
    ? [1.4, 0.52, zone.depth / 2 - 0.22]
    : zone.kind === 'hub'
    ? [-1.4, 0.52, zone.depth / 2 - 0.22]
    : [0, 0.52, zone.depth / 2 - 0.22];

  const signRot: [number, number, number] = isMemory
    ? [0, 0, 0]
    : [-0.14, 0, 0];

  return (
    <group position={[zone.center[0], py, zone.center[2]]}>
      {/* TIER 1: Ground-Level Foundation Base Slab with Neon Border */}
      <RoundedBox
        args={[zone.width + 0.6, 0.04, zone.depth + 0.6]}
        radius={0.02}
        smoothness={2}
        position={[0, 0.02, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={baseSlabColor} roughness={0.45} metalness={0.65} />
      </RoundedBox>
      {/* Glowing neon runner along Tier 1 base perimeter */}
      {[
        { pos: [0, 0.035, (zone.depth + 0.6) / 2] as Vec3, size: [zone.width + 0.64, 0.025, 0.03] as Vec3 },
        { pos: [0, 0.035, -(zone.depth + 0.6) / 2] as Vec3, size: [zone.width + 0.64, 0.025, 0.03] as Vec3 },
        { pos: [(zone.width + 0.6) / 2, 0.035, 0] as Vec3, size: [0.03, 0.025, zone.depth + 0.64] as Vec3 },
        { pos: [-(zone.width + 0.6) / 2, 0.035, 0] as Vec3, size: [0.03, 0.025, zone.depth + 0.64] as Vec3 },
      ].map((trim, i) => (
        <mesh key={i} position={trim.pos}>
          <boxGeometry args={trim.size} />
          <meshStandardMaterial color={zone.accent} emissive={zone.accent} emissiveIntensity={1.5} />
        </mesh>
      ))}

      {/* For TOOL ORCHESTRATION: Signature Inset Electric Cyan Neon Vents on Sub-Chassis Skirt (Matching Reference Image) */}
      {zone.kind === 'tools' && (
        <group position={[0, 0.02, 0]}>
          {/* Front skirt cyan louvers */}
          {[-3.6, -1.2, 1.2, 3.6].map((lx, idx) => (
            <mesh key={`f-${idx}`} position={[lx, 0, (zone.depth + 0.6) / 2 + 0.012]}>
              <boxGeometry args={[1.25, 0.022, 0.02]} />
              <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.0} />
            </mesh>
          ))}
          {/* Back skirt cyan louvers */}
          {[-3.6, -1.2, 1.2, 3.6].map((lx, idx) => (
            <mesh key={`b-${idx}`} position={[lx, 0, -(zone.depth + 0.6) / 2 - 0.012]}>
              <boxGeometry args={[1.25, 0.022, 0.02]} />
              <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.0} />
            </mesh>
          ))}
          {/* Left skirt cyan louvers */}
          {[-2.4, 0, 2.4].map((lz, idx) => (
            <mesh key={`l-${idx}`} position={[-(zone.width + 0.6) / 2 - 0.012, 0, lz]}>
              <boxGeometry args={[0.02, 0.022, 1.25]} />
              <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.0} />
            </mesh>
          ))}
          {/* Right skirt cyan louvers */}
          {[-2.4, 0, 2.4].map((lz, idx) => (
            <mesh key={`r-${idx}`} position={[(zone.width + 0.6) / 2 + 0.012, 0, lz]}>
              <boxGeometry args={[0.02, 0.022, 1.25]} />
              <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.0} />
            </mesh>
          ))}
        </group>
      )}

      {/* TIER 2: Main Platform Deck Slab */}
      <RoundedBox
        args={[zone.width, 0.03, zone.depth]}
        radius={0.02}
        smoothness={2}
        position={[0, 0.055, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={deckSlabColor} roughness={0.4} metalness={0.55} />
      </RoundedBox>

      {/* Recessed inner deck plate */}
      <mesh position={[0, 0.071, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[zone.width - 0.4, zone.depth - 0.4]} />
        <meshStandardMaterial color={deckPlateColor} roughness={0.46} metalness={0.45} />
      </mesh>

      {/* Glowing Perimeter Neon Rim Framing the Platform Deck */}
      {[
        { pos: [0, 0.065, zone.depth / 2 + 0.01] as Vec3, size: [zone.width + 0.02, 0.025, 0.02] as Vec3 },
        { pos: [0, 0.065, -zone.depth / 2 - 0.01] as Vec3, size: [zone.width + 0.02, 0.025, 0.02] as Vec3 },
        { pos: [zone.width / 2 + 0.01, 0.065, 0] as Vec3, size: [0.02, 0.025, zone.depth + 0.02] as Vec3 },
        { pos: [-zone.width / 2 - 0.01, 0.065, 0] as Vec3, size: [0.02, 0.025, zone.depth + 0.02] as Vec3 },
      ].map((edge, idx) => (
        <mesh key={idx} position={edge.pos}>
          <boxGeometry args={edge.size} />
          <meshStandardMaterial
            ref={idx === 0 ? rimMatRef : undefined}
            color={zone.accent}
            emissive={zone.accent}
            emissiveIntensity={1.45}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Ambient platform surface glow aura */}
      <mesh position={[0, 0.073, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[zone.width - 0.3, zone.depth - 0.3]} />
        <meshBasicMaterial ref={beaconMatRef} color={zone.accent} transparent opacity={0.12} depthWrite={false} />
      </mesh>

      {/* Sleek Front-Rim Mounted Facility Nameplate Plaque (Reference Image 1 & 2) */}
      <group position={signPos} rotation={signRot}>
        {/* Low-profile metallic mounting brackets connected directly to platform deck */}
        {!isMemory &&
          [-1.6, 1.6].map((bx, i) => (
            <mesh key={i} position={[bx, -0.28, -0.04]} castShadow>
              <boxGeometry args={[0.08, 0.58, 0.08]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.25} />
            </mesh>
          ))}
        {/* Dark Obsidian Acrylic Plaque Body */}
        <RoundedBox args={[4.4, 0.95, 0.08]} radius={0.03} castShadow>
          <meshStandardMaterial color="#050C1B" metalness={0.75} roughness={0.25} />
        </RoundedBox>
        {/* Neon Glow Rim */}
        <mesh position={[0, 0, 0.042]}>
          <planeGeometry args={[4.32, 0.88]} />
          <meshBasicMaterial color={zone.accent} transparent opacity={0.3} />
        </mesh>
        {/* 4 Corner Metallic Rivet Pins (Signature Image 2 Detail) */}
        {[
          [-2.05, 0.35],
          [2.05, 0.35],
          [-2.05, -0.35],
          [2.05, -0.35],
        ].map(([rx, ry], idx) => (
          <group key={idx} position={[rx, ry, 0.046]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.015, 12]} />
              <meshStandardMaterial color="#FFFFFF" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
        ))}
        {/* High-Resolution Printed Illuminated Face */}
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[4.28, 0.85]} />
          {signTex ? (
            <meshBasicMaterial map={signTex} />
          ) : (
            <meshBasicMaterial color={zone.accent} />
          )}
        </mesh>
      </group>

      {/* Domain-Specific Monumental 3D Infrastructure Architecture */}
      <PlatformHeroStructure zone={zone} activeRef={isActiveRef} />
    </group>
  );
});

/**
 * Surrounding Futuristic External AI Infrastructure Campus (Image 2 visual direction):
 * High-contrast, deeply colorful architectural centers that pop with maximum clarity in both Light and Dark themes.
 */
function ExternalCampusImpl({
  layout,
  activityRef,
  isDark: propIsDark,
}: {
  layout: OfficeLayout;
  activityRef: React.RefObject<CampusActivityRefs>;
  isDark?: boolean;
}) {
  const hookIsDark = useIsDarkMode();
  const isDark = propIsDark ?? hookIsDark;

  const gridTex = useMemo(() => makeCampusGridTexture(isDark), [isDark]);
  const { minX, maxX, minZ, maxZ } = layout.floorBounds;
  const officeW = maxX - minX;
  const officeD = maxZ - minZ;
  const officeCx = (minX + maxX) / 2;
  const officeCz = (minZ + maxZ) / 2;
  const beaconColor = isDark ? '#08162E' : '#334155';

  return (
    <group>
      {/* Expansive Tech Grid Base Directly on the Ground Floor */}
      <mesh position={[layout.center[0], SUB_GRID_Y, layout.center[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        {gridTex ? (
          <meshStandardMaterial map={gridTex} roughness={0.6} metalness={isDark ? 0.38 : 0.15} />
        ) : (
          <meshStandardMaterial color={isDark ? '#040B1A' : '#E6DEC8'} roughness={0.65} />
        )}
      </mesh>

      {/* Central Human Office Ground-Level Cyan Perimeter Docking Ring */}
      <group position={[officeCx, 0, officeCz]}>
        {[
          { pos: [0, 0.012, officeD / 2 + 0.16] as Vec3, size: [officeW + 0.36, 0.024, 0.03] as Vec3 },
          { pos: [0, 0.012, -officeD / 2 - 0.16] as Vec3, size: [officeW + 0.36, 0.024, 0.03] as Vec3 },
          { pos: [officeW / 2 + 0.16, 0.012, 0] as Vec3, size: [0.03, 0.024, officeD + 0.36] as Vec3 },
          { pos: [-officeW / 2 - 0.16, 0.012, 0] as Vec3, size: [0.03, 0.024, officeD + 0.36] as Vec3 },
        ].map((trim, i) => (
          <mesh key={i} position={trim.pos}>
            <boxGeometry args={trim.size} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.45} />
          </mesh>
        ))}
      </group>

      {/* Distant Perimeter Energy Beacons */}
      {[
        [-36, -30, '#00E5FF'],
        [36, -30, '#EC4899'],
        [-36, 18, '#38BDF8'],
        [36, 18, '#F59E0B'],
      ].map(([bx, bz, col], i) => (
        <group key={i} position={[bx as number, SUB_GRID_Y, bz as number]}>
          <mesh position={[0, 2.0, 0]}>
            <cylinderGeometry args={[0.18, 0.36, 4.0, 8]} />
            <meshStandardMaterial color={beaconColor} roughness={0.45} metalness={0.7} />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <octahedronGeometry args={[0.28, 0]} />
            <meshStandardMaterial color={col as string} emissive={col as string} emissiveIntensity={1.7} />
          </mesh>
        </group>
      ))}

      {/* 5 Separate Elevated External AI Infrastructure Platforms (Image 2 Centers) */}
      {layout.externalZones.map((zone) => (
        <ExternalPlatform key={zone.id} zone={zone} activityRef={activityRef} isDark={isDark} />
      ))}

      {/* 5 Physical Illuminated Skybridges Connecting Office <-> External Infrastructure */}
      {layout.bridges.map((bridge) => (
        <FuturisticBridge key={bridge.id} bridge={bridge} activityRef={activityRef} isDark={isDark} />
      ))}
    </group>
  );
}

export const ExternalCampus = memo(ExternalCampusImpl);
