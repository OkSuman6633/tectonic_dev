import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { CanvasTexture, SRGBColorSpace, type MeshStandardMaterial } from 'three';
import { useTelemetryStore } from '../../../store/useTelemetryStore';
import type { Vec3 } from '../officeLayout';
import {
  drawContentStudioMainWall,
  getContentFeatureWallTexture,
  type ContentStudioSnapshot,
} from './textures';

/**
 * Sample live Creative AI / PromptOps telemetry directly from `useTelemetryStore`.
 */
function sampleContentSnapshot(playhead: number): ContentStudioSnapshot {
  const s = useTelemetryStore.getState();
  const promptMod = s.modules.promptops;
  const imgMod = s.modules.image_generation;
  const promptCalls = promptMod?.totalCalls ?? 0;
  const imageCalls = imgMod?.totalCalls ?? 0;

  const pCalls = s.moduleCalls.promptops ?? [];
  const iCalls = s.moduleCalls.image_generation ?? [];
  const lastP = pCalls[pCalls.length - 1];
  const lastI = iCalls[iCalls.length - 1];
  const nowS = Date.now() / 1000;

  const pActive = promptMod?.state === 'busy' || Boolean(lastP && (lastP.status === 'running' || nowS - lastP.startedAt < 3.5));
  const iActive = imgMod?.state === 'busy' || Boolean(lastI && (lastI.status === 'running' || nowS - lastI.startedAt < 3.5));

  let activeStage: 'Create' | 'Edit' | 'Publish' = 'Edit';
  let lastSummary = '4K HDR Ready';
  if (pActive) {
    activeStage = 'Create';
    lastSummary = lastP?.summary ?? 'PromptOps Compiling';
  } else if (iActive) {
    activeStage = 'Edit';
    lastSummary = lastI?.summary ?? 'Rendering Media';
  } else if (s.activeRuns > 0) {
    activeStage = 'Publish';
    lastSummary = 'Publishing Workflow';
  }

  return {
    activeStage,
    isActive: pActive || iActive || s.activeRuns > 0,
    playhead,
    promptCalls,
    imageCalls,
    lastSummary,
  };
}

/**
 * Monumental Rear Content Studio – RCP Display Wall + Right Wing Vertical Feature Display Monolith:
 * - Main chamfered metallic housing with 3 warm amber crown light strips, continuous glowing electric-blue
 *   inner octagonal neon frame, glowing purple vertical seam, and live dynamic NLE Studio / Sunset Preview CanvasTexture
 * - Right wing tall vertical feature monolith with glowing electric-blue outer contour frame, glowing purple Play logo,
 *   and the 4 exact RCP capability items (AI-Powered Editing, Multi-Format Export, Real-Time Preview, Collaborative Workflows)
 */
export const ContentStudioWall = memo(function ContentStudioWall({
  position = [-0.25, 0, -2.75],
  onSelectImageGen,
}: {
  position?: Vec3;
  onSelectImageGen?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const crownAmberRef = useRef<MeshStandardMaterial>(null);
  const purpleSeamRef = useRef<MeshStandardMaterial>(null);
  const lastDrawRef = useRef(0);
  const playheadRef = useRef(0.38);

  const featureTex = useMemo(() => getContentFeatureWallTexture(), []);

  const { canvas, texture } = useMemo(() => {
    if (typeof document === 'undefined') return { canvas: null, texture: null };
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (ctx) {
      drawContentStudioMainWall(ctx, c.width, c.height, sampleContentSnapshot(0.38));
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return { canvas: c, texture: t };
  }, []);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  useFrame(({ clock }, delta) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const snap = sampleContentSnapshot(playheadRef.current);

    if (!reducedMotion) {
      playheadRef.current = (playheadRef.current + delta * (snap.isActive ? 0.14 : 0.025)) % 1;
    }

    // Smoothly redraw live main studio screen at ~4Hz when active or ~1.2Hz ambient playhead drift
    const interval = snap.isActive ? 0.25 : 0.85;
    if (canvas && texture && clock.elapsedTime - lastDrawRef.current > interval) {
      lastDrawRef.current = clock.elapsedTime;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawContentStudioMainWall(ctx, canvas.width, canvas.height, { ...snap, playhead: playheadRef.current });
        texture.needsUpdate = true;
      }
    }

    const pulse = 0.5 + 0.5 * Math.sin(t * 4.5);
    if (crownAmberRef.current) {
      crownAmberRef.current.emissiveIntensity = snap.isActive ? 2.6 + 0.7 * pulse : 2.15;
    }
    if (purpleSeamRef.current) {
      purpleSeamRef.current.emissiveIntensity = snap.isActive ? 3.0 + 0.8 * pulse : 2.35;
    }
  });

  const frameW = 7.25;
  const frameH = 3.45;
  const baseH = 0.65;
  const centerY = baseH + frameH / 2;

  return (
    <group position={position}>
      {/* ================================================================= */}
      {/* MAIN WIDE CHAMFERED "Content Studio – RCP" DISPLAY WALL           */}
      {/* ================================================================= */}
      <group
        onClick={(e) => {
          if (!onSelectImageGen) return;
          e.stopPropagation();
          onSelectImageGen();
        }}
      >
        {/* Heavy dark industrial base pedestal */}
        <RoundedBox args={[frameW - 0.18, baseH, 0.76]} radius={0.04} smoothness={2} position={[0, baseH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#151E30" roughness={0.34} metalness={0.86} />
        </RoundedBox>

        {/* Monumental Brushed-Titanium Outer Architectural Wall Housing */}
        <RoundedBox args={[frameW, frameH, 0.54]} radius={0.16} smoothness={2} position={[0, centerY, -0.06]} castShadow receiveShadow>
          <meshStandardMaterial color="#27344A" roughness={0.28} metalness={0.88} />
        </RoundedBox>

        {/* Recessed Dark Obsidian Inner Screen Surround */}
        <RoundedBox args={[frameW - 0.36, frameH - 0.34, 0.14]} radius={0.1} smoothness={2} position={[0, centerY, 0.18]}>
          <meshStandardMaterial color="#081020" roughness={0.3} metalness={0.82} />
        </RoundedBox>

        {/* Continuous Electric Cyan-Blue Inner Neon Screen Contour */}
        {[
          { pos: [0, centerY + (frameH - 0.44) / 2, 0.255] as Vec3, args: [frameW - 0.48, 0.046, 0.04] as Vec3 },
          { pos: [0, centerY - (frameH - 0.44) / 2, 0.255] as Vec3, args: [frameW - 0.48, 0.046, 0.04] as Vec3 },
          { pos: [-(frameW - 0.44) / 2, centerY, 0.255] as Vec3, args: [0.046, frameH - 0.46, 0.04] as Vec3 },
          { pos: [(frameW - 0.44) / 2, centerY, 0.255] as Vec3, args: [0.046, frameH - 0.46, 0.04] as Vec3 },
        ].map((seg, i) => (
          <mesh key={i} position={seg.pos}>
            <boxGeometry args={seg.args} />
            <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.45} roughness={0.12} />
          </mesh>
        ))}

        {/* 3 Warm Amber Crown Light Bars along the Top Frame (exact reference detail) */}
        {[-2.15, 0, 2.15].map((ax, i) => (
          <mesh key={i} position={[ax, baseH + frameH + 0.015, 0.08]}>
            <boxGeometry args={[1.45, 0.056, 0.1]} />
            <meshStandardMaterial
              ref={i === 0 ? crownAmberRef : undefined}
              color="#FDE68A"
              emissive="#F59E0B"
              emissiveIntensity={2.25}
              roughness={0.14}
            />
          </mesh>
        ))}

        {/* Glowing Purple-Violet Right Vertical Seam Accent linking Main Wall to Feature Wing */}
        <mesh position={[frameW / 2 + 0.01, centerY - 0.15, 0.16]}>
          <boxGeometry args={[0.045, frameH - 0.35, 0.06]} />
          <meshStandardMaterial ref={purpleSeamRef} color="#E9D5FF" emissive="#A855F7" emissiveIntensity={2.5} roughness={0.14} />
        </mesh>

        {/* Live Dynamic Content Studio – RCP Main Screen Surface */}
        <mesh position={[0, centerY, 0.264]}>
          <planeGeometry args={[frameW - 0.58, frameH - 0.56]} />
          {texture ? (
            <meshStandardMaterial
              map={texture}
              emissive="#FFFFFF"
              emissiveMap={texture}
              emissiveIntensity={0.96}
              roughness={0.18}
              metalness={0.16}
            />
          ) : (
            <meshStandardMaterial color="#07142C" emissive="#00B8FF" emissiveIntensity={0.8} />
          )}
        </mesh>
      </group>

      {/* ================================================================= */}
      {/* RIGHT WING VERTICAL FEATURE DISPLAY MONOLITH (exact reference)    */}
      {/* ================================================================= */}
      <group position={[frameW / 2 + 1.15, 0, 0.16]} rotation={[0, -0.08, 0]}>
        {/* Low Illuminated Base Plinth */}
        <RoundedBox args={[1.95, 0.32, 0.64]} radius={0.03} smoothness={2} position={[0, 0.16, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#151E30" roughness={0.34} metalness={0.86} />
        </RoundedBox>
        <mesh position={[0, 0.33, 0.31]}>
          <boxGeometry args={[1.62, 0.042, 0.04]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.45} />
        </mesh>

        {/* Tall Vertical Brushed-Titanium Frame */}
        <RoundedBox args={[2.08, 3.15, 0.44]} radius={0.12} smoothness={2} position={[0, 0.32 + 1.575, -0.04]} castShadow receiveShadow>
          <meshStandardMaterial color="#27344A" roughness={0.28} metalness={0.88} />
        </RoundedBox>

        {/* Continuous Electric-Blue Outer Glow Strip wrapping Top & Right Edge */}
        <mesh position={[0, 3.49, 0.12]}>
          <boxGeometry args={[1.92, 0.048, 0.05]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.5} />
        </mesh>
        <mesh position={[1.05, 1.9, 0.12]}>
          <boxGeometry args={[0.048, 3.12, 0.05]} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.5} />
        </mesh>

        {/* Crisp Feature List Display Panel */}
        <mesh position={[0, 1.9, 0.186]}>
          <planeGeometry args={[1.82, 2.82]} />
          {featureTex ? (
            <meshStandardMaterial
              map={featureTex}
              emissive="#FFFFFF"
              emissiveMap={featureTex}
              emissiveIntensity={0.95}
              roughness={0.18}
              metalness={0.18}
            />
          ) : (
            <meshStandardMaterial color="#07142C" emissive="#A855F7" emissiveIntensity={0.8} />
          )}
        </mesh>
      </group>
    </group>
  );
});
