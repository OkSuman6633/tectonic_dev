import { forwardRef, memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  SRGBColorSpace,
  type Group,
  type Sprite,
  type Texture,
} from 'three';

let glowTexture: Texture | null = null;
let rectGlowTexture: Texture | null = null;

/** Soft radial falloff, generated once and shared by every halo. */
function getGlowTexture(): Texture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.68)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new CanvasTexture(canvas);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
}

/** Soft rounded-rectangle floor bloom for under-island neon reflections. */
function getRectGlowTexture(): Texture {
  if (rectGlowTexture) return rectGlowTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.14, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  rectGlowTexture = new CanvasTexture(canvas);
  rectGlowTexture.colorSpace = SRGBColorSpace;
  return rectGlowTexture;
}

interface HaloProps {
  color: string;
  size?: number;
  opacity?: number;
  position?: [number, number, number];
}

/** Additive billboard glow: dependency-free selective bloom stand-in. */
export const Halo = forwardRef<Sprite, HaloProps>(function Halo({ color, size = 1.6, opacity = 0.5, position }, ref) {
  const map = useMemo(getGlowTexture, []);
  return (
    <sprite ref={ref} position={position} scale={[size, size, 1]} renderOrder={10}>
      <spriteMaterial
        map={map}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
});

/** Soft additive floor reflection glow beneath islands and bridges. */
export const SoftFloorGlow = memo(function SoftFloorGlow({
  color,
  width,
  depth,
  position,
  opacity = 0.32,
}: {
  color: string;
  width: number;
  depth: number;
  position: [number, number, number];
  opacity?: number;
}) {
  const map = useMemo(getRectGlowTexture, []);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        map={map}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
});

/**
 * Signature glowing neon torus ring (hot white-core torus + colored outer aura + soft bloom).
 * Supports flat (horizontal) or upright (vertical/angled) orientation matching Command Center,
 * Process Studio, and Content Studio landmarks.
 */
export const BeaconRing = memo(function BeaconRing({
  position,
  color,
  radius = 0.52,
  phase = 0,
  tetherHeight = 0,
  orientation = 'horizontal',
  rotationY = 0,
}: {
  position: [number, number, number];
  color: string;
  radius?: number;
  phase?: number;
  tetherHeight?: number;
  orientation?: 'horizontal' | 'vertical';
  rotationY?: number;
}) {
  const reducedMotion = useReducedMotion();
  const groupRef = useRef<Group>(null);
  const haloRef = useRef<Sprite>(null);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(t * 1.9 + phase) * 0.06;
    }
    if (haloRef.current) {
      const s = radius * (4.4 + 0.45 * Math.sin(t * 2.2 + phase));
      haloRef.current.scale.set(s, s, 1);
    }
  });

  const ringRot: [number, number, number] = orientation === 'horizontal' ? [Math.PI / 2, 0, 0] : [0, rotationY, 0];

  return (
    <group>
      {tetherHeight > 0 && (
        <mesh position={[position[0], position[1] - tetherHeight / 2, position[2]]} raycast={() => null}>
          <cylinderGeometry args={[0.012, 0.012, tetherHeight, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.38} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <group ref={groupRef} position={position} raycast={() => null}>
        {/* Hot white-core inner ring */}
        <mesh rotation={ringRot}>
          <torusGeometry args={[radius, radius * 0.16, 16, 48]} />
          <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
        </mesh>
        {/* Saturated luminous mid halo */}
        <mesh rotation={ringRot}>
          <torusGeometry args={[radius * 1.02, radius * 0.3, 16, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.62}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {/* Wide outer soft aura */}
        <mesh rotation={ringRot}>
          <torusGeometry args={[radius * 1.04, radius * 0.48, 12, 40]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.22}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <Halo ref={haloRef} color={color} size={radius * 4.5} opacity={0.55} position={[0, 0, 0]} />
      </group>
    </group>
  );
});

/**
 * Glowing holographic zone marquee sign matching the exact framed neon signage in the reference campus:
 * - variant="top": dark translucent framed glass board mounted on thin glowing vertical stalks above the back rim
 * - variant="front": beveled neon-trimmed plaque mounted directly on the front-left (+Z) rim of a platform
 */
export const ZoneMarquee = memo(function ZoneMarquee({
  title,
  accent,
  position,
  rotationY = 0,
  width = 3.8,
  stalkHeight = 1.1,
  variant = 'top',
}: {
  title: string;
  accent: string;
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  stalkHeight?: number;
  variant?: 'top' | 'front';
}) {
  const lines = useMemo(() => title.split('\n'), [title]);
  const isTwoLine = lines.length > 1;
  const aspectH = isTwoLine ? 200 : 124;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = aspectH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pad = 12;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;
    const r = 10;

    // Rounded glass panel background
    ctx.beginPath();
    ctx.roundRect(pad, pad, w, h, r);
    const grad = ctx.createLinearGradient(0, pad, 0, pad + h);
    grad.addColorStop(0, variant === 'front' ? 'rgba(6, 18, 44, 0.94)' : 'rgba(5, 16, 42, 0.84)');
    grad.addColorStop(1, variant === 'front' ? 'rgba(4, 12, 30, 0.96)' : 'rgba(8, 22, 54, 0.72)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle colored top/bottom neon glow wash inside sign
    ctx.save();
    ctx.clip();
    const glow = ctx.createLinearGradient(0, pad, 0, pad + h);
    glow.addColorStop(0, `${accent}36`);
    glow.addColorStop(0.5, 'rgba(0,0,0,0)');
    glow.addColorStop(1, `${accent}44`);
    ctx.fillStyle = glow;
    ctx.fillRect(pad, pad, w, h);
    ctx.restore();

    // Crisp outer luminous border
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(pad, pad, w, h, r);
    ctx.stroke();

    // Bright inner highlight rim
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(pad + 3, pad + 3, w - 6, h - 6, Math.max(4, r - 2));
    ctx.stroke();

    // Crisp uppercase glowing white text
    ctx.fillStyle = '#F8FDFF';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = isTwoLine ? 38 : title.length > 18 ? 38 : 44;
    ctx.font = `700 ${fontSize}px "Geist", "Segoe UI", system-ui, sans-serif`;

    if (isTwoLine) {
      ctx.fillText(lines[0], canvas.width / 2, pad + h * 0.34);
      ctx.fillText(lines[1], canvas.width / 2, pad + h * 0.68);
    } else {
      ctx.fillText(lines[0], canvas.width / 2, pad + h / 2 + 1);
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [title, accent, variant, aspectH, isTwoLine, lines]);

  useEffect(() => () => texture.dispose(), [texture]);

  const height = width * (aspectH / 640);

  if (variant === 'front') {
    return (
      <group position={position} rotation={[0, rotationY, 0]} raycast={() => null}>
        <mesh>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} transparent side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} rotation={[0, rotationY, 0]} raycast={() => null}>
      {/* Twin glowing vertical support stalks */}
      {[-width * 0.38, width * 0.38].map((sx) => (
        <group key={sx}>
          <mesh position={[sx, stalkHeight / 2, 0]}>
            <cylinderGeometry args={[0.018, 0.018, stalkHeight, 8]} />
            <meshBasicMaterial color={accent} transparent opacity={0.72} toneMapped={false} />
          </mesh>
          <mesh position={[sx, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.04, 0.09, 16]} />
            <meshBasicMaterial color={accent} transparent opacity={0.8} toneMapped={false} side={DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* Main framed holographic plaque */}
      <mesh position={[0, stalkHeight + height / 2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} transparent side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
});

/** Backwards-compatible alias if imported elsewhere. */
export const HoloBanner = ZoneMarquee;

export type HoloScreenVariant = 'hex' | 'gear' | 'code' | 'memory' | 'workflow' | 'command' | 'monitor';

/**
 * Translucent glowing holographic glass display with procedural crisp sci-fi telemetry graphics
 * (hexagon emblem for Content Studio, gear schematic for Tool Orchestration, code/charts for Process/Command/Memory).
 */
export const HoloScreen = memo(function HoloScreen({
  variant,
  accent,
  secondaryAccent = '#FFFFFF',
  position,
  rotation = [0, 0, 0],
  width = 1.6,
  height = 1.1,
  opacity = 0.92,
}: {
  variant: HoloScreenVariant;
  accent: string;
  secondaryAccent?: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  opacity?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 288;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Translucent glass panel
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `${accent}48`);
    grad.addColorStop(0.5, 'rgba(6, 20, 52, 0.68)');
    grad.addColorStop(1, `${accent}30`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(8, 8, W - 16, H - 16, 10);
    ctx.fill();

    // Glowing border
    ctx.strokeStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Header bar
    ctx.fillStyle = `${accent}55`;
    ctx.fillRect(20, 22, W - 40, 14);
    ctx.fillStyle = '#E0F7FF';
    ctx.fillRect(26, 26, 48, 6);
    ctx.fillRect(W - 60, 26, 28, 6);

    if (variant === 'hex') {
      // Content Studio hexagon wireframe emblem
      const cx = W / 2;
      const cy = H / 2 + 12;
      for (const rad of [64, 42]) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const x = cx + Math.cos(a) * rad;
          const y = cy + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = rad === 64 ? '#FFFFFF' : accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 12;
        ctx.lineWidth = rad === 64 ? 5 : 3;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = `${accent}44`;
      ctx.fill();
    } else if (variant === 'gear') {
      // Tool Orchestration glowing cyan gear/cog schematic
      const cx = W / 2;
      const cy = H / 2 + 14;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = '#E0F9FF';
      ctx.shadowColor = accent;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 5;
      const teeth = 8;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i * Math.PI) / teeth;
        const r = i % 2 === 0 ? 64 : 49;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    } else if (variant === 'code' || variant === 'workflow') {
      // Crisp glowing code / workflow lines
      const lengths = [190, 240, 145, 270, 210, 160, 250, 185, 220, 130];
      lengths.forEach((len, idx) => {
        const y = 56 + idx * 20;
        ctx.fillStyle = idx % 3 === 0 ? '#FFFFFF' : idx % 2 === 0 ? accent : secondaryAccent;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(28 + (idx % 3) * 14, y, Math.min(len, W - 72), 6);
      });
      ctx.globalAlpha = 1;
    } else if (variant === 'memory') {
      // Memory bars & neural waveform
      for (let i = 0; i < 8; i++) {
        const bh = 35 + ((i * 37) % 95);
        ctx.fillStyle = i % 2 === 0 ? accent : '#38BDF8';
        ctx.fillRect(36 + i * 40, H - 36 - bh, 22, bh);
      }
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const x = 28 + i * 30;
        const y = 92 + Math.sin(i * 0.9) * 26;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (variant === 'monitor') {
      // Bright agent workstation monitor with green/cyan glowing UI
      ctx.fillStyle = 'rgba(4, 34, 42, 0.72)';
      ctx.fillRect(14, 14, W - 28, H - 28);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i === 0 ? '#A7F3D0' : i % 2 === 0 ? '#34D399' : '#38BDF8';
        ctx.fillRect(26, 48 + i * 28, 120 + ((i * 73) % 180), 10);
      }
    } else {
      // Command Center radar + telemetry
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(105, 165, 58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(105, 165, 32, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#E0F7FF' : accent;
        ctx.fillRect(190, 72 + i * 30, 140 - (i % 3) * 28, 8);
      }
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [variant, accent, secondaryAccent]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position} rotation={rotation} raycast={() => null}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} side={DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
});

/** Miniature sleek dark pot with lush vibrant green foliage at platform corners (signature detail in reference image). */
export const NeonPlant = memo(function NeonPlant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale} raycast={() => null}>
      {/* Sleek dark planter pot */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.11, 0.28, 10]} />
        <meshStandardMaterial color="#12213B" metalness={0.45} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.03, 10]} />
        <meshStandardMaterial color="#1E293B" roughness={0.8} />
      </mesh>
      {/* Central stem */}
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.018, 0.024, 0.34, 6]} />
        <meshStandardMaterial color="#15803D" roughness={0.6} />
      </mesh>
      {/* Lush layered green leaves */}
      {[
        { pos: [0, 0.64, 0], rot: [0.15, 0, 0.1], s: [0.18, 0.24, 0.05] },
        { pos: [0.14, 0.54, 0.08], rot: [0.45, 0.6, -0.55], s: [0.16, 0.26, 0.04] },
        { pos: [-0.14, 0.52, 0.06], rot: [0.4, -0.5, 0.55], s: [0.16, 0.24, 0.04] },
        { pos: [0.06, 0.55, -0.14], rot: [-0.5, 0.3, -0.25], s: [0.15, 0.25, 0.04] },
        { pos: [-0.09, 0.48, -0.11], rot: [-0.45, -0.4, 0.4], s: [0.15, 0.22, 0.04] },
      ].map((leaf, i) => (
        <mesh
          key={i}
          position={leaf.pos as [number, number, number]}
          rotation={leaf.rot as [number, number, number]}
          scale={leaf.s as [number, number, number]}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#22C55E' : '#16A34A'}
            emissive="#15803D"
            emissiveIntensity={0.32}
            roughness={0.45}
          />
        </mesh>
      ))}
    </group>
  );
});

/** Sleek dark cyberpunk server rack cabinet with glowing cyan/violet horizontal LED bars. */
export const ServerRack = memo(function ServerRack({
  position,
  height = 1.45,
  width = 0.62,
  depth = 0.58,
  accent = '#00D8FF',
  rotationY = 0,
}: {
  position: [number, number, number];
  height?: number;
  width?: number;
  depth?: number;
  accent?: string;
  rotationY?: number;
}) {
  const rows = Math.max(4, Math.floor(height / 0.22));
  return (
    <group position={position} rotation={[0, rotationY, 0]} raycast={() => null}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#0A1734" metalness={0.72} roughness={0.28} />
      </mesh>
      {/* Top luminous rim */}
      <mesh position={[0, height + 0.015, 0]}>
        <boxGeometry args={[width * 0.94, 0.03, depth * 0.94]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      {/* Glowing horizontal LED blade strips on both visible isometric faces (+Z and +X) */}
      {Array.from({ length: rows }, (_, i) => {
        const y = 0.16 + i * ((height - 0.28) / Math.max(1, rows - 1));
        return (
          <group key={i} position={[0, y, 0]}>
            <mesh position={[0, 0, depth / 2 + 0.008]}>
              <boxGeometry args={[width * 0.72, 0.036, 0.012]} />
              <meshBasicMaterial color={i % 3 === 0 ? '#E0F9FF' : accent} transparent opacity={0.9} toneMapped={false} />
            </mesh>
            <mesh position={[width / 2 + 0.008, 0, 0]}>
              <boxGeometry args={[0.012, 0.036, depth * 0.72]} />
              <meshBasicMaterial color={accent} transparent opacity={0.7} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

