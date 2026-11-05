import { forwardRef, useMemo } from 'react';
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, type Sprite, type Texture } from 'three';

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
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
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

/** Additive billboard glow: our dependency-free stand-in for selective bloom. */
export const Halo = forwardRef<Sprite, HaloProps>(function Halo({ color, size = 1.6, opacity = 0.5, position }, ref) {
  const map = useMemo(getGlowTexture, []);
  return (
    <sprite ref={ref} position={position} scale={[size, size, 1]} renderOrder={10}>
      <spriteMaterial map={map} color={color} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </sprite>
  );
});
