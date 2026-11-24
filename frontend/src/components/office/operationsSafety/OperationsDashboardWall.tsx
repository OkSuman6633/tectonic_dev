import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { CanvasTexture, SRGBColorSpace, type MeshStandardMaterial } from 'three';
import { useTelemetryStore } from '../../../store/useTelemetryStore';
import type { Vec3 } from '../officeLayout';
import { drawOpsDashboard, type OpsDashboardSnapshot } from './textures';

/**
 * Compute live Operations Status, Agent Health, Performance %, and Safety Overview
 * directly from real `useTelemetryStore` runtime telemetry.
 */
function sampleOperationsSnapshot(): OpsDashboardSnapshot {
  const s = useTelemetryStore.getState();
  const agents = Object.values(s.agents);
  const modules = Object.values(s.modules);
  const activeAgents = agents.length;
  const errAgents = agents.filter((a) => a.state === 'error').length;
  const errMods = modules.filter((m) => m.state === 'error').length;
  const totalCalls = modules.reduce((acc, m) => acc + m.totalCalls, 0);
  const totalErrors = modules.reduce((acc, m) => acc + m.errorCount, 0);

  const perf = totalCalls > 0 ? Math.max(0, 100 - (totalErrors / totalCalls) * 100) : 99.9;
  const perfStr = `${perf >= 99.95 ? '99.9' : perf.toFixed(1)}%`;

  const guardMod = s.modules.guardrails;
  const guardCalls = s.moduleCalls.guardrails ?? [];
  const lastGuard = guardCalls[guardCalls.length - 1];
  const nowS = Date.now() / 1000;
  const recentGuard = Boolean(lastGuard && (lastGuard.status === 'running' || nowS - lastGuard.startedAt < 4.0));
  const guardWarn =
    recentGuard &&
    Boolean(lastGuard?.summary && /redact|block|deny|warn|pii/i.test(lastGuard.summary));

  let safetyLevel: 'ok' | 'warn' | 'alert' = 'ok';
  let safetyLabel = 'No Alerts';
  if (errAgents > 0 || errMods > 0 || lastGuard?.status === 'error') {
    safetyLevel = 'alert';
    safetyLabel = `${errAgents + errMods || 1} System Alert`;
  } else if (guardWarn || guardMod?.state === 'busy') {
    safetyLevel = 'warn';
    safetyLabel = lastGuard?.summary ? lastGuard.summary.slice(0, 20) : 'Guardrail Check';
  }

  const statusLabel =
    safetyLevel === 'alert'
      ? 'Degraded · Check Logs'
      : s.activeRuns > 0
        ? 'Active Operations'
        : 'All Systems Online';

  // Derive 9 real-time telemetry bars from live store activity buckets (with clean baseline floor)
  const bars: number[] = [];
  const allSeries = Object.values(s.activity);
  for (let i = 0; i < 9; i++) {
    let sum = 0;
    for (const ser of allSeries) {
      const idx = ser.length - 9 + i;
      if (idx >= 0) sum += ser[idx] ?? 0;
    }
    bars.push(sum > 0 ? Math.min(152, 34 + sum * 14) : 44 + ((i * 29 + 17) % 86));
  }

  return {
    statusLabel,
    performancePct: perfStr,
    activeAgents,
    safetyLevel,
    safetyLabel,
    bars,
  };
}

/**
 * Large Rear Operations & Safety Dashboard Display Wall matching the reference centerpiece:
 * - Wide chamfered brushed-titanium & dark gunmetal architectural display frame
 * - Glowing warm amber accent light strips on top/upper bevels & bright cyan inner screen bezel
 * - Live dynamic CanvasTexture showing real-time Operations Status, Active Agents, Safety Overview,
 *   stylized glowing blue World Map, Telemetry Bar Chart, and Circular Health Gauge
 */
export const OperationsDashboardWall = memo(function OperationsDashboardWall({
  position = [0.05, 0, -2.75],
  alertLevelRef,
}: {
  position?: Vec3;
  alertLevelRef: React.MutableRefObject<'ok' | 'warn' | 'alert'>;
}) {
  const reducedMotion = useReducedMotion();
  const amberTrimRef = useRef<MeshStandardMaterial>(null);
  const lastDrawKeyRef = useRef('');
  const lastSampleTimeRef = useRef(0);

  const { canvas, texture } = useMemo(() => {
    if (typeof document === 'undefined') return { canvas: null, texture: null };
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (ctx) {
      drawOpsDashboard(ctx, c.width, c.height, sampleOperationsSnapshot());
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

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;

    // Throttle live CanvasTexture redraws to ~2Hz and only when metrics actually change
    if (canvas && texture && clock.elapsedTime - lastSampleTimeRef.current > 0.5) {
      lastSampleTimeRef.current = clock.elapsedTime;
      const snap = sampleOperationsSnapshot();
      alertLevelRef.current = snap.safetyLevel;
      const key = `${snap.statusLabel}|${snap.performancePct}|${snap.activeAgents}|${snap.safetyLevel}|${snap.safetyLabel}|${snap.bars.join(',')}`;
      if (key !== lastDrawKeyRef.current) {
        lastDrawKeyRef.current = key;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawOpsDashboard(ctx, canvas.width, canvas.height, snap);
          texture.needsUpdate = true;
        }
      }
    }

    if (amberTrimRef.current) {
      const lvl = alertLevelRef.current;
      const pulse = 0.5 + 0.5 * Math.sin(t * (lvl === 'alert' ? 9 : 4.2));
      amberTrimRef.current.emissive.set(lvl === 'alert' ? '#EF4444' : '#F59E0B');
      amberTrimRef.current.emissiveIntensity = lvl === 'ok' ? 2.15 : 2.6 + 1.2 * pulse;
    }
  });

  const frameW = 7.45;
  const frameH = 3.28;
  const baseH = 0.72;
  const centerY = baseH + frameH / 2;

  return (
    <group position={position}>
      {/* Grounded Industrial Base Console Wall Plinth */}
      <RoundedBox args={[frameW - 0.15, baseH, 0.78]} radius={0.04} smoothness={2} position={[0, baseH / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#182235" roughness={0.34} metalness={0.86} />
      </RoundedBox>
      {/* Segmented Base Front Grille Ribs */}
      {[-2.4, -1.2, 0, 1.2, 2.4].map((gx, i) => (
        <mesh key={i} position={[gx, baseH / 2, 0.4]}>
          <boxGeometry args={[0.92, 0.42, 0.025]} />
          <meshStandardMaterial color="#0A101E" roughness={0.65} metalness={0.7} />
        </mesh>
      ))}

      {/* Monumental Chamfered Brushed-Titanium Display Frame Backing */}
      <RoundedBox args={[frameW, frameH, 0.52]} radius={0.14} smoothness={2} position={[0, centerY, -0.06]} castShadow receiveShadow>
        <meshStandardMaterial color="#2D3A4F" roughness={0.28} metalness={0.88} />
      </RoundedBox>

      {/* Recessed Dark Obsidian Inner Bezel Surround */}
      <RoundedBox args={[frameW - 0.34, frameH - 0.32, 0.14]} radius={0.09} smoothness={2} position={[0, centerY, 0.17]}>
        <meshStandardMaterial color="#091224" roughness={0.32} metalness={0.82} />
      </RoundedBox>

      {/* Glowing Electric-Cyan Inner Screen Rim */}
      {[
        { pos: [0, centerY + (frameH - 0.42) / 2, 0.245] as Vec3, args: [frameW - 0.44, 0.045, 0.04] as Vec3 },
        { pos: [0, centerY - (frameH - 0.42) / 2, 0.245] as Vec3, args: [frameW - 0.44, 0.045, 0.04] as Vec3 },
        { pos: [-(frameW - 0.42) / 2, centerY, 0.245] as Vec3, args: [0.045, frameH - 0.44, 0.04] as Vec3 },
        { pos: [(frameW - 0.42) / 2, centerY, 0.245] as Vec3, args: [0.045, frameH - 0.44, 0.04] as Vec3 },
      ].map((seg, i) => (
        <mesh key={i} position={seg.pos}>
          <boxGeometry args={seg.args} />
          <meshStandardMaterial color="#7DD3FC" emissive="#00B8FF" emissiveIntensity={2.35} roughness={0.14} />
        </mesh>
      ))}

      {/* Signature Warm Amber Top Frame Accent Light Strips (matching reference crown lights) */}
      {[-2.25, 0, 2.25].map((ax, i) => (
        <mesh key={i} position={[ax, baseH + frameH + 0.015, 0.08]}>
          <boxGeometry args={[1.45, 0.055, 0.1]} />
          <meshStandardMaterial
            ref={i === 0 ? amberTrimRef : undefined}
            color="#FDE68A"
            emissive="#F59E0B"
            emissiveIntensity={2.25}
            roughness={0.14}
          />
        </mesh>
      ))}
      {/* Lower amber horizon strip along bottom screen sill */}
      <mesh position={[0, baseH + 0.06, 0.24]}>
        <boxGeometry args={[frameW - 0.65, 0.045, 0.05]} />
        <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={2.05} />
      </mesh>

      {/* Live Dynamic Operations & Safety Dashboard Display Surface */}
      <mesh position={[0, centerY, 0.252]}>
        <planeGeometry args={[frameW - 0.56, frameH - 0.54]} />
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
          <meshStandardMaterial color="#061530" emissive="#00B8FF" emissiveIntensity={0.8} />
        )}
      </mesh>
    </group>
  );
});
