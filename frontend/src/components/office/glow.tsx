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

/** Soft radial falloff, generated once and shared by every halo. */
function getGlowTexture(): Texture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new CanvasTexture(canvas);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
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

/**
 * Signature floating luminous ring beacon (hot white-core torus + colored outer halo + subtle radial bloom),
 * echoing the bright floating energy rings above focal landmarks in the reference campus.
 */
export const BeaconRing = memo(function BeaconRing({
  position,
  color,
  radius = 0.42,
  phase = 0,
  tetherHeight = 0,
}: {
  position: [number, number, number];
  color: string;
  radius?: number;
  phase?: number;
  tetherHeight?: number;
}) {
  const reducedMotion = useReducedMotion();
  const groupRef = useRef<Group>(null);
  const haloRef = useRef<Sprite>(null);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(t * 1.8 + phase) * 0.08;
    }
    if (haloRef.current) {
      const s = radius * (4.1 + 0.45 * Math.sin(t * 2.2 + phase));
      haloRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group>
      {tetherHeight > 0 && (
        <mesh position={[position[0], position[1] - tetherHeight / 2, position[2]]} raycast={() => null}>
          <cylinderGeometry args={[0.012, 0.012, tetherHeight, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.38} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <group ref={groupRef} position={position} raycast={() => null}>
        {/* Hot white-core inner halo ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, radius * 0.13, 14, 48]} />
          <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
        </mesh>
        {/* Colored luminous outer aura ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 1.04, radius * 0.25, 14, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.48}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <Halo ref={haloRef} color={color} size={radius * 4.3} opacity={0.44} position={[0, 0, 0]} />
      </group>
    </group>
  );
});

/**
 * Pure-WebGL 3D floating holographic zone banner rendered via CanvasTexture,
 * mounted on thin luminous stalks above each independent campus island.
 */
export const HoloBanner = memo(function HoloBanner({
  title,
  subtitle,
  accent,
  position,
  rotationY = 0,
  width = 3.6,
  stalkHeight = 1.15,
  light = false,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  stalkHeight?: number;
  light?: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 144;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 144);

    // Translucent chamfered holographic card backdrop
    const pad = 12;
    const w = 512 - pad * 2;
    const h = 144 - pad * 2;
    const cut = 18;
    ctx.beginPath();
    ctx.moveTo(pad + cut, pad);
    ctx.lineTo(pad + w, pad);
    ctx.lineTo(pad + w, pad + h - cut);
    ctx.lineTo(pad + w - cut, pad + h);
    ctx.lineTo(pad, pad + h);
    ctx.lineTo(pad, pad + cut);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad, 512, pad + h);
    if (light) {
      grad.addColorStop(0, 'rgba(15, 23, 42, 0.84)');
      grad.addColorStop(1, 'rgba(30, 41, 59, 0.78)');
    } else {
      grad.addColorStop(0, 'rgba(5, 16, 40, 0.82)');
      grad.addColorStop(1, 'rgba(9, 25, 58, 0.68)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp luminous accent border
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Accent corner bar
    ctx.fillStyle = accent;
    ctx.fillRect(pad + 18, pad + 26, 7, h - 52);

    // Title
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 36px "Geist", "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, pad + 40, subtitle ? pad + 44 : pad + h / 2);

    // Subtitle
    if (subtitle) {
      ctx.fillStyle = accent;
      ctx.font = '600 20px "Geist Mono", ui-monospace, monospace';
      ctx.fillText(subtitle, pad + 40, pad + 84);
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [title, subtitle, accent, light]);

  useEffect(() => () => texture.dispose(), [texture]);

  const height = width * (144 / 512);

  return (
    <group position={position} rotation={[0, rotationY, 0]} raycast={() => null}>
      {/* Twin thin luminous support stalks */}
      {[-width * 0.34, width * 0.34].map((sx) => (
        <group key={sx}>
          <mesh position={[sx, stalkHeight / 2, 0]}>
            <cylinderGeometry args={[0.015, 0.015, stalkHeight, 8]} />
            <meshBasicMaterial color={accent} transparent opacity={0.55} toneMapped={false} />
          </mesh>
          <mesh position={[sx, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.04, 0.085, 16]} />
            <meshBasicMaterial color={accent} transparent opacity={0.7} toneMapped={false} side={DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* Main holographic plaque */}
      <mesh position={[0, stalkHeight + height / 2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={texture}
          transparent
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

