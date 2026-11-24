import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import {
  CanvasTexture,
  DoubleSide,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import type { CampusZone, Vec3 } from './officeLayout';

/**
 * Enterprise-Grade 3D Hardware Architecture for Tool Orchestration:
 * Reconstructed with physical depth, high hardware density, and realistic materials
 * matching the visual reference:
 * - 9 varied industrial computing & server installations with individual rack units
 * - Sunken maintenance trench, cable trays, and yellow industrial safety railings
 * - Multi-tiered central golden processing installation with glass containment and orbital rings
 * - Dual-tank cryogenic liquid coolant system with analog gauges, valve handwheels, and chrome pipes
 * - Dual-deck operator workstation with 4 diagnostic monitors and overhead conduit routing
 * - Giant rear holographic monitoring wall with central gear icon, oscilloscopes, and telemetry
 * - Sub-chassis recessed cyan neon louvers and amber deck perimeter runners
 */

// =========================================================================================
// 1. PROCEDURAL HIGH-RESOLUTION TEXTURE GENERATORS
// =========================================================================================

function drawVectorGear(
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
  ctx.lineWidth = 2.8;
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

  // Central circular cutout
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Inner mechanical hub ring
  ctx.beginPath();
  ctx.arc(cx, cy, holeR + 5, 0, Math.PI * 2);
  ctx.stroke();

  // 6 radial hub spokes
  for (let s = 0; s < 6; s++) {
    const sa = (s * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(sa) * (holeR + 4), cy + Math.sin(sa) * (holeR + 4));
    ctx.lineTo(cx + Math.cos(sa) * (innerR - 2), cy + Math.sin(sa) * (innerR - 2));
    ctx.stroke();
  }

  ctx.restore();
}

/** Procedural widescreen HUD for the rear diagnostic display wall. */
function makeHoloWallTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep translucent midnight blue background
  ctx.fillStyle = 'rgba(4, 12, 32, 0.94)';
  ctx.fillRect(0, 0, 1024, 512);

  // High-tech glowing cyan outer frame with corner notches
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, 1000, 488);

  // Corner bracket accents
  ctx.lineWidth = 8;
  const bLen = 42;
  // Top-left
  ctx.beginPath(); ctx.moveTo(12, 12 + bLen); ctx.lineTo(12, 12); ctx.lineTo(12 + bLen, 12); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(1012 - bLen, 12); ctx.lineTo(1012, 12); ctx.lineTo(1012, 12 + bLen); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(12, 500 - bLen); ctx.lineTo(12, 500); ctx.lineTo(12 + bLen, 500); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(1012 - bLen, 500); ctx.lineTo(1012, 500); ctx.lineTo(1012, 500 - bLen); ctx.stroke();

  // Top header banner
  ctx.fillStyle = '#00E5FF';
  ctx.fillRect(12, 12, 420, 32);
  ctx.fillStyle = '#020817';
  ctx.font = 'bold 16px Inter, monospace';
  ctx.fillText('SYSTEM // TOOL ORCHESTRATION PIPELINE', 24, 34);

  // Left Section: Multi-Channel Telemetry & Metric Bars
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(36, 68, 280, 5);

  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#67E8F9';
  ctx.fillText('CLUSTER TELEMETRY // 16 NODES ONLINE', 36, 92);

  for (let i = 0; i < 14; i++) {
    const barH = 35 + ((i * 47) % 130);
    ctx.fillStyle = i % 3 === 0 ? '#00E5FF' : i % 2 === 0 ? '#38BDF8' : '#0284C7';
    ctx.fillRect(36 + i * 20, 360 - barH, 15, barH);
  }

  // Diagnostic code streams
  ctx.fillStyle = '#94A3B8';
  for (let y = 390; y <= 470; y += 16) {
    const w = 260 - (y % 40) * 4;
    ctx.fillRect(36, y, w, 4);
  }

  // Center Section: Prominent Mechanical Gear/Cog Icon
  const iconCx = 512;
  const iconCy = 256;
  drawVectorGear(ctx, iconCx, iconCy, 115, 86, 36, 10, '#00F0FF');

  // Radiating circuit bus traces
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(iconCx - 150, iconCy); ctx.lineTo(iconCx - 122, iconCy);
  ctx.moveTo(iconCx + 122, iconCy); ctx.lineTo(iconCx + 150, iconCy);
  ctx.moveTo(iconCx, iconCy - 150); ctx.lineTo(iconCx, iconCy - 122);
  ctx.moveTo(iconCx, iconCy + 122); ctx.lineTo(iconCx, iconCy + 150);
  ctx.stroke();

  // Right Section: Oscilloscope Waveforms & Buffer Gauges
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(700, 68, 280, 140);
  ctx.fillStyle = 'rgba(0, 229, 255, 0.06)';
  ctx.fillRect(700, 68, 280, 140);

  // Sine Waveform
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x < 280; x += 5) {
    const wy = 138 + Math.sin(x * 0.08) * 35 + Math.sin(x * 0.18) * 16;
    if (x === 0) ctx.moveTo(700 + x, wy);
    else ctx.lineTo(700 + x, wy);
  }
  ctx.stroke();

  // Memory buffer load bars
  for (let r = 0; r < 5; r++) {
    const by = 230 + r * 28;
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(700, by, 280, 18);
    ctx.fillStyle = r === 4 ? '#F59E0B' : '#00E5FF';
    ctx.fillRect(700, by, 90 + ((r * 45) % 170), 18);
  }

  // System status readout
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('CORE: OPTIMAL // 34.2°C', 700, 395);
  ctx.fillText('THROUGHPUT: 12.4 GB/S', 700, 420);
  ctx.fillText('SECURITY: ENCLAVE LOCKED', 700, 445);
  ctx.fillText('STATUS: FULLY SYNCHRONIZED', 700, 470);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural screen texture for workstation terminal displays. */
function makeWorkstationScreenTexture(mode: 'radar' | 'code' | 'topology'): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#03091E';
  ctx.fillRect(0, 0, 256, 144);
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 136);

  if (mode === 'radar') {
    const cx = 128;
    const cy = 72;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 56, cy); ctx.lineTo(cx + 56, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 56); ctx.lineTo(cx, cy + 56); ctx.stroke();
    // Blips
    ctx.fillStyle = '#00F0FF';
    ctx.beginPath(); ctx.arc(cx + 24, cy - 18, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 18, cy + 26, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath(); ctx.arc(cx + 36, cy + 14, 3.5, 0, Math.PI * 2); ctx.fill();
  } else if (mode === 'code') {
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(8, 8, 90, 10);
    ctx.fillStyle = '#67E8F9';
    for (let y = 26; y < 136; y += 10) {
      const w = 60 + ((y * 23) % 155);
      ctx.fillRect(12, y, w, 4);
    }
  } else {
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(16, 20, 52, 30);
    ctx.strokeRect(102, 56, 58, 34);
    ctx.strokeRect(186, 20, 52, 30);
    ctx.strokeRect(186, 92, 52, 30);
    ctx.beginPath();
    ctx.moveTo(68, 35); ctx.lineTo(102, 73);
    ctx.moveTo(160, 73); ctx.lineTo(186, 35);
    ctx.moveTo(160, 73); ctx.lineTo(186, 107);
    ctx.stroke();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Analog circular pressure gauge texture for cryogenic tanks. */
function makePressureGaugeTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Tick marks
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2;
  for (let a = 0; a < 12; a++) {
    const ang = (a * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(ang) * 46, 64 + Math.sin(ang) * 46);
    ctx.lineTo(64 + Math.cos(ang) * 54, 64 + Math.sin(ang) * 54);
    ctx.stroke();
  }

  // Red indicator needle pointing to 2 o'clock (~safe operating pressure)
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 64);
  ctx.lineTo(64 + Math.cos(-Math.PI / 4) * 42, 64 + Math.sin(-Math.PI / 4) * 42);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.beginPath(); ctx.arc(64, 64, 5, 0, Math.PI * 2); ctx.fill();

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// =========================================================================================
// 2. MODULAR SERVER RACKS & COMPUTING INSTALLATIONS (7–10 Varied Hardware Assemblies)
// =========================================================================================

/** Individual rack-mounted server chassis blade unit with handles and activity LEDs. */
const ServerUnitBlade = memo(function ServerUnitBlade({
  position,
  width,
  depth,
  height = 0.09,
  primaryColor = '#00E5FF',
  secondaryColor = '#38BDF8',
}: {
  position: Vec3;
  width: number;
  depth: number;
  height?: number;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  return (
    <group position={position}>
      {/* Dark anodized sheet metal drawer casing */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height * 0.92, depth]} />
        <meshStandardMaterial color="#0B1324" roughness={0.4} metalness={0.75} />
      </mesh>
      {/* Front Faceplate */}
      <mesh position={[0, height / 2, depth / 2 + 0.008]}>
        <boxGeometry args={[width * 0.94, height * 0.88, 0.016]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.85} />
      </mesh>
      {/* Dual Left Drive Bays */}
      <mesh position={[-width * 0.26, height / 2, depth / 2 + 0.018]}>
        <boxGeometry args={[width * 0.36, height * 0.65, 0.008]} />
        <meshStandardMaterial color="#0F172A" roughness={0.5} />
      </mesh>
      {/* Drive status LEDs */}
      <mesh position={[-width * 0.14, height / 2, depth / 2 + 0.024]}>
        <boxGeometry args={[0.025, 0.02, 0.005]} />
        <meshStandardMaterial color={primaryColor} emissive={primaryColor} emissiveIntensity={2.2} />
      </mesh>
      {/* Right Vent Grille with Secondary Indicator */}
      <mesh position={[width * 0.22, height / 2, depth / 2 + 0.018]}>
        <boxGeometry args={[width * 0.38, height * 0.55, 0.006]} />
        <meshStandardMaterial color="#0A0F1D" roughness={0.6} />
      </mesh>
      <mesh position={[width * 0.36, height / 2, depth / 2 + 0.024]}>
        <boxGeometry args={[0.022, 0.02, 0.005]} />
        <meshStandardMaterial color={secondaryColor} emissive={secondaryColor} emissiveIntensity={1.8} />
      </mesh>
      {/* Silver aluminum grab handles on rack ears */}
      <mesh position={[-width * 0.44, height / 2, depth / 2 + 0.022]}>
        <boxGeometry args={[0.015, height * 0.7, 0.025]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.15} />
      </mesh>
      <mesh position={[width * 0.44, height / 2, depth / 2 + 0.022]}>
        <boxGeometry args={[0.015, height * 0.7, 0.025]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.15} />
      </mesh>
    </group>
  );
});

/** 42U Enterprise Server Rack with structural frame, individual stacked units, and top cowl. */
const EnterpriseServerRack = memo(function EnterpriseServerRack({
  position,
  size = [1.0, 2.2, 0.9],
  primaryLed = '#00E5FF',
  secondaryLed = '#38BDF8',
  amberTrim = true,
}: {
  position: Vec3;
  size?: Vec3;
  primaryLed?: string;
  secondaryLed?: string;
  amberTrim?: boolean;
}) {
  const [w, h, d] = size;
  const unitCount = 9;
  const unitH = (h - 0.36) / unitCount;

  return (
    <group position={position}>
      {/* Outer Structural Metal Chassis with Beveled Corners */}
      <RoundedBox args={[w, h, d]} radius={0.04} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial color="#0B1222" roughness={0.34} metalness={0.8} />
      </RoundedBox>

      {/* Top Exhaust Cowl with Amber/Cyan Illuminated Edge */}
      <mesh position={[0, h + 0.025, 0]}>
        <boxGeometry args={[w * 0.88, 0.045, d * 0.88]} />
        <meshStandardMaterial color="#1E293B" metalness={0.88} roughness={0.2} />
      </mesh>
      {amberTrim && (
        <mesh position={[0, h + 0.042, 0]}>
          <boxGeometry args={[w * 0.76, 0.015, d * 0.76]} />
          <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={2.0} />
        </mesh>
      )}

      {/* Side Vent Louvers */}
      {[-w / 2 - 0.005, w / 2 + 0.005].map((sx, idx) => (
        <group key={idx} position={[sx, h * 0.55, 0]}>
          {Array.from({ length: 6 }).map((_, li) => (
            <mesh key={li} position={[0, (li - 2.5) * 0.18, 0]}>
              <boxGeometry args={[0.01, 0.035, d * 0.65]} />
              <meshStandardMaterial color="#050914" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Recessed Rack Mounting Bay */}
      <mesh position={[0, (h - 0.18) / 2 + 0.08, d / 2 - 0.035]}>
        <boxGeometry args={[w * 0.88, h - 0.28, 0.04]} />
        <meshStandardMaterial color="#050B18" roughness={0.7} />
      </mesh>

      {/* Stacked Individual Server Units */}
      {Array.from({ length: unitCount }).map((_, ui) => {
        const uy = 0.16 + ui * unitH;
        const col1 = ui % 2 === 0 ? primaryLed : secondaryLed;
        const col2 = ui % 3 === 0 ? '#FFFFFF' : primaryLed;
        return (
          <ServerUnitBlade
            key={ui}
            position={[0, uy, 0]}
            width={w * 0.84}
            depth={d}
            height={unitH}
            primaryColor={col1}
            secondaryColor={col2}
          />
        );
      })}
    </group>
  );
});

/** High-Density Storage Array with dense matrix of 2.5" drive caddies. */
const HighDensityStorageArray = memo(function HighDensityStorageArray({
  position,
  size = [1.05, 2.15, 0.95],
}: {
  position: Vec3;
  size?: Vec3;
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <RoundedBox args={[w, h, d]} radius={0.04} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial color="#0A1020" roughness={0.32} metalness={0.82} />
      </RoundedBox>

      {/* Top Controller Tray */}
      <mesh position={[0, h - 0.18, d / 2 + 0.01]}>
        <boxGeometry args={[w * 0.86, 0.16, 0.02]} />
        <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[-w * 0.25, h - 0.18, d / 2 + 0.025]}>
        <boxGeometry args={[0.08, 0.03, 0.01]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.2} />
      </mesh>
      <mesh position={[w * 0.25, h - 0.18, d / 2 + 0.025]}>
        <boxGeometry args={[0.08, 0.03, 0.01]} />
        <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={2.0} />
      </mesh>

      {/* Matrix of 24 Individual Hot-Swap Drive Caddies */}
      {Array.from({ length: 6 }).map((_, row) =>
        Array.from({ length: 4 }).map((_, col) => {
          const dx = (col - 1.5) * (w * 0.21);
          const dy = 0.22 + row * ((h - 0.48) / 6);
          const isFlicker = (row + col) % 3 === 0;
          return (
            <group key={`${row}-${col}`} position={[dx, dy, d / 2 + 0.015]}>
              {/* Drive sled face */}
              <mesh>
                <boxGeometry args={[w * 0.18, (h - 0.58) / 6, 0.018]} />
                <meshStandardMaterial color="#111B2E" roughness={0.4} metalness={0.8} />
              </mesh>
              {/* Silver latch handle */}
              <mesh position={[0, -0.04, 0.01]}>
                <boxGeometry args={[w * 0.14, 0.012, 0.008]} />
                <meshStandardMaterial color="#CBD5E1" metalness={0.9} roughness={0.15} />
              </mesh>
              {/* Activity indicator LED */}
              <mesh position={[w * 0.06, 0.04, 0.012]}>
                <boxGeometry args={[0.018, 0.018, 0.006]} />
                <meshStandardMaterial
                  color={isFlicker ? '#00E5FF' : '#38BDF8'}
                  emissive={isFlicker ? '#00E5FF' : '#38BDF8'}
                  emissiveIntensity={isFlicker ? 2.5 : 1.6}
                />
              </mesh>
            </group>
          );
        }),
      )}
    </group>
  );
});

/** Compact Industrial Hazard & Diagnostic Cabinet with Yellow Warning Triangle. */
const HazardDiagnosticCabinet = memo(function HazardDiagnosticCabinet({
  position,
  size = [0.65, 1.55, 0.65],
}: {
  position: Vec3;
  size?: Vec3;
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <RoundedBox args={[w, h, d]} radius={0.03} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial color="#1E293B" roughness={0.35} metalness={0.75} />
      </RoundedBox>

      {/* Recessed Door Frame */}
      <mesh position={[0, h / 2, d / 2 + 0.008]}>
        <boxGeometry args={[w * 0.88, h * 0.9, 0.015]} />
        <meshStandardMaterial color="#0F172A" roughness={0.5} />
      </mesh>

      {/* Embossed Yellow Hazard Triangle (⚠) */}
      <group position={[0, h * 0.72, d / 2 + 0.022]}>
        <mesh rotation={[0, 0, Math.PI]}>
          <cylinderGeometry args={[0.11, 0.11, 0.02, 3]} />
          <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.8} />
        </mesh>
        {/* Black Exclamation Mark on Triangle */}
        <mesh position={[0, 0.01, 0.012]}>
          <boxGeometry args={[0.018, 0.07, 0.005]} />
          <meshStandardMaterial color="#0A0F1D" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.04, 0.012]}>
          <boxGeometry args={[0.018, 0.018, 0.005]} />
          <meshStandardMaterial color="#0A0F1D" roughness={0.8} />
        </mesh>
      </group>

      {/* Lower Diagnostic LCD Touchscreen */}
      <mesh position={[0, h * 0.36, d / 2 + 0.022]}>
        <planeGeometry args={[w * 0.68, 0.34]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.8} />
      </mesh>

      {/* Keyhole Lock & Rotary Latch */}
      <mesh position={[w * 0.32, h * 0.52, d / 2 + 0.025]}>
        <cylinderGeometry args={[0.025, 0.025, 0.018, 12]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.15} />
      </mesh>
    </group>
  );
});

/** 3-Tier Industrial Stack Signal Light Beacon (Patlite: Red/Amber/Green). */
const StackSignalTower = memo(function StackSignalTower({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* Stainless Steel Mast */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.24, 12]} />
        <meshStandardMaterial color="#64748B" metalness={0.92} roughness={0.15} />
      </mesh>
      {/* Tier 1: Green Signal (Bottom) */}
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
        <meshStandardMaterial color="#10B981" emissive="#10B981" emissiveIntensity={2.2} />
      </mesh>
      {/* Tier 2: Amber Signal (Middle) */}
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
        <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={2.2} />
      </mesh>
      {/* Tier 3: Red Signal (Top) */}
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
        <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={2.2} />
      </mesh>
      {/* Top Metallic Cap */}
      <mesh position={[0, 0.54, 0]}>
        <cylinderGeometry args={[0.058, 0.058, 0.03, 16]} />
        <meshStandardMaterial color="#0F172A" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
});

// =========================================================================================
// 3. CRYOGENIC LIQUID COOLING SYSTEM & METALLIC PIPEWORK
// =========================================================================================

/** Cryogenic liquid coolant containment cylinder with analog gauge and valve wheel. */
const CoolantCryoTank = memo(function CoolantCryoTank({
  position,
  gaugeTex,
}: {
  position: Vec3;
  gaugeTex: CanvasTexture | null;
}) {
  return (
    <group position={position}>
      {/* Heavy-Duty Flanged Cast Metallic Base with 8 Radial Bolt Heads */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.46, 0.5, 0.16, 24]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.22} />
      </mesh>
      {Array.from({ length: 8 }).map((_, bi) => {
        const ba = (bi * Math.PI) / 4;
        return (
          <mesh key={bi} position={[Math.cos(ba) * 0.44, 0.17, Math.sin(ba) * 0.44]}>
            <cylinderGeometry args={[0.022, 0.022, 0.025, 6]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.95} roughness={0.1} />
          </mesh>
        );
      })}

      {/* Outer Transparent Borosilicate Glass Chamber */}
      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 1.35, 24]} />
        <meshPhysicalMaterial
          color="#38BDF8"
          transparent
          opacity={0.3}
          roughness={0.05}
          transmission={0.85}
          ior={1.46}
          depthWrite={false}
        />
      </mesh>

      {/* Inner Glowing Electric Cyan Cryogenic Fluid Core */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.33, 0.33, 1.25, 20]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.6} roughness={0.12} />
      </mesh>
      {/* Central Bubbler Agitation Rod */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.3, 16]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#E0F2FE" emissiveIntensity={1.8} />
      </mesh>

      {/* Top Chrome Dome Cap */}
      <mesh position={[0, 1.56, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.44, 0.16, 24]} />
        <meshStandardMaterial color="#E2E8F0" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[0, 1.68, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.1, 16]} />
        <meshStandardMaterial color="#64748B" metalness={0.88} roughness={0.2} />
      </mesh>

      {/* Analog Pressure Gauge with Dial Face */}
      <group position={[0.26, 1.62, 0.26]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.04, 16]} />
          <meshStandardMaterial color="#E2E8F0" metalness={0.9} roughness={0.15} />
        </mesh>
        <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.16, 0.16]} />
          {gaugeTex ? <meshBasicMaterial map={gaugeTex} /> : <meshBasicMaterial color="#FFFFFF" />}
        </mesh>
      </group>

      {/* Chrome Manual Valve Handwheel */}
      <group position={[0, 1.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.12, 0.022, 8, 18]} />
          <meshStandardMaterial color="#FBBF24" metalness={0.88} roughness={0.18} />
        </mesh>
        {/* Handwheel 4 spokes */}
        {[0, Math.PI / 2].map((ra, idx) => (
          <mesh key={idx} rotation={[0, 0, ra]}>
            <cylinderGeometry args={[0.012, 0.012, 0.22, 8]} />
            <meshStandardMaterial color="#E2E8F0" metalness={0.9} roughness={0.15} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

/** Industrial yellow / amber safety handrail with top rail, mid rail, and kickplate. */
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

// =========================================================================================
// 4. CENTRAL GOLDEN PROCESSING INSTALLATION (The Architectural Centerpiece)
// =========================================================================================

/** Multi-tiered mechanical foundation, glass containment enclosure, and glowing processor core. */
const ProcessingCore = memo(function ProcessingCore({
  activeRef,
}: {
  activeRef: React.RefObject<boolean>;
}) {
  const reducedMotion = useReducedMotion();
  const spinRing1Ref = useRef<Group>(null);
  const spinRing2Ref = useRef<Group>(null);
  const coreMeshRef = useRef<Mesh>(null);
  const pulseMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const active = Boolean(activeRef.current);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    if (spinRing1Ref.current && !reducedMotion) {
      spinRing1Ref.current.rotation.y += dt * (active ? 1.2 : 0.45);
    }
    if (spinRing2Ref.current && !reducedMotion) {
      spinRing2Ref.current.rotation.x -= dt * (active ? 0.9 : 0.35);
      spinRing2Ref.current.rotation.z += dt * (active ? 0.7 : 0.25);
    }
    if (coreMeshRef.current && !reducedMotion) {
      coreMeshRef.current.rotation.y -= dt * (active ? 0.8 : 0.3);
      coreMeshRef.current.position.y = 1.38 + Math.sin(t * 1.6) * 0.04;
    }
    if (pulseMatRef.current && !reducedMotion) {
      pulseMatRef.current.emissiveIntensity = active
        ? 3.4 + Math.sin(t * 5.5) * 0.9
        : 2.6 + Math.sin(t * 3.2) * 0.5;
    }
  });

  return (
    <group position={[0.1, 0, -0.15]}>
      {/* Tier 1 Foundation: Octagonal/Chamfered Dark Titanium Slab with Hex Bolts */}
      <RoundedBox args={[3.2, 0.28, 3.2]} radius={0.06} position={[0, 0.14, 0]} castShadow>
        <meshStandardMaterial color="#0E1626" roughness={0.32} metalness={0.82} />
      </RoundedBox>
      {/* Perimeter Mounting Bolt Hexes */}
      {[-1.4, 0, 1.4].map((bx, bxi) =>
        [-1.4, 1.4].map((bz, bzi) => (
          <mesh key={`${bxi}-${bzi}`} position={[bx, 0.29, bz]}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 6]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.15} />
          </mesh>
        )),
      )}

      {/* Tier 2: Stepped Brushed Titanium Pedestal with Recessed Louver Channels */}
      <RoundedBox args={[2.45, 0.24, 2.45]} radius={0.04} position={[0, 0.4, 0]} castShadow>
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.8} />
      </RoundedBox>

      {/* Tier 3: Radiant Golden Energy Tray with Inset Amber Neon Runner */}
      {[
        { pos: [0, 0.53, 1.22] as Vec3, size: [2.46, 0.028, 0.032] as Vec3 },
        { pos: [0, 0.53, -1.22] as Vec3, size: [2.46, 0.028, 0.032] as Vec3 },
        { pos: [1.22, 0.53, 0] as Vec3, size: [0.032, 0.028, 2.46] as Vec3 },
        { pos: [-1.22, 0.53, 0] as Vec3, size: [0.032, 0.028, 2.46] as Vec3 },
      ].map((trim, i) => (
        <mesh key={i} position={trim.pos}>
          <boxGeometry args={trim.size} />
          <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={2.8} />
        </mesh>
      ))}

      {/* Golden Brushed Base Pad */}
      <mesh position={[0, 0.528, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.35, 2.35]} />
        <meshStandardMaterial color="#B45309" metalness={0.88} roughness={0.18} />
      </mesh>

      {/* Transparent Multi-Layered Acrylic/Glass Containment Enclosure */}
      <RoundedBox args={[1.5, 1.5, 1.5]} radius={0.04} position={[0, 1.38, 0]} castShadow>
        <meshPhysicalMaterial
          color="#FEF08A"
          transparent
          opacity={0.32}
          roughness={0.04}
          metalness={0.1}
          transmission={0.88}
          ior={1.48}
          depthWrite={false}
        />
      </RoundedBox>

      {/* 4 Heavy Bronze Corner Stanchions with Glowing Magnetic Projector Needles */}
      {[
        [-0.73, -0.73],
        [0.73, -0.73],
        [-0.73, 0.73],
        [0.73, 0.73],
      ].map(([px, pz], idx) => (
        <group key={idx} position={[px, 1.38, pz]}>
          <mesh>
            <cylinderGeometry args={[0.032, 0.032, 1.5, 16]} />
            <meshStandardMaterial color="#D97706" metalness={0.88} roughness={0.2} />
          </mesh>
          {/* Emitter Tip Sphere */}
          <mesh position={[0, 0.78, 0]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial color="#FDE047" emissive="#F59E0B" emissiveIntensity={2.5} />
          </mesh>
        </group>
      ))}

      {/* Top Enclosure Ventilation Crown */}
      <mesh position={[0, 2.16, 0]}>
        <boxGeometry args={[1.42, 0.05, 1.42]} />
        <meshStandardMaterial color="#1E293B" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 2.19, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.02, 24]} />
        <meshStandardMaterial color="#0A0F1D" roughness={0.7} />
      </mesh>

      {/* INTERNAL ARTICULATED HIGH-DENSITY PROCESSOR */}
      <group position={[0, 0, 0]}>
        {/* Dark Silicon Substrate Die */}
        <mesh position={[0, 0.78, 0]} castShadow>
          <boxGeometry args={[0.82, 0.06, 0.82]} />
          <meshStandardMaterial color="#0B1324" roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Micro Circuit Etching Plane */}
        <mesh position={[0, 0.812, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.76, 0.76]} />
          <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.8} />
        </mesh>

        {/* Central Floating Radiant Golden Hypercube Core */}
        <mesh ref={coreMeshRef} position={[0, 1.38, 0]} castShadow>
          <boxGeometry args={[0.78, 0.78, 0.78]} />
          <meshStandardMaterial ref={pulseMatRef} color="#FEF08A" emissive="#F59E0B" emissiveIntensity={3.0} roughness={0.12} />
        </mesh>

        {/* Dynamic Warm Golden Point Light Illuminating Surrounding Platforms */}
        <pointLight position={[0, 1.38, 0]} color="#F59E0B" intensity={4.5} distance={7.5} decay={1.8} />

        {/* Concentric Rotating Gimbal Rings */}
        {/* Ring 1: Golden Orbital Ring */}
        <group ref={spinRing1Ref} position={[0, 1.38, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.05, 0.028, 12, 36]} />
            <meshStandardMaterial color="#FDE047" emissive="#F59E0B" emissiveIntensity={2.2} />
          </mesh>
        </group>

        {/* Ring 2: Angled Cyan Orbital Ring */}
        <group ref={spinRing2Ref} position={[0, 1.38, 0]}>
          <mesh rotation={[Math.PI / 3, 0.4, 0]}>
            <torusGeometry args={[0.86, 0.024, 10, 32]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.2} />
          </mesh>
        </group>
      </group>
    </group>
  );
});

// =========================================================================================
// 5. OPERATOR CONTROL CONSOLE & CYBER WORKSTATION
// =========================================================================================

const ControlConsole = memo(function ControlConsole({
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
      {/* Heavy-Duty Industrial Desk Chassis */}
      <RoundedBox args={[2.2, 0.85, 0.9]} radius={0.04} position={[0, 0.425, 0]} castShadow>
        <meshStandardMaterial color="#0B132B" roughness={0.38} metalness={0.7} />
      </RoundedBox>
      {/* Lower Foot Rail */}
      <mesh position={[0, 0.12, 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.028, 0.028, 2.05, 12]} />
        <meshStandardMaterial color="#64748B" metalness={0.92} roughness={0.15} />
      </mesh>
      {/* Front Skirt Cyan Neon Runner */}
      <mesh position={[0, 0.12, 0.46]}>
        <boxGeometry args={[2.1, 0.038, 0.02]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.0} />
      </mesh>

      {/* Illuminated Control Deck & Keyboard */}
      <mesh position={[0, 0.86, 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 0.36]} />
        <meshStandardMaterial color="#0284C7" emissive="#00E5FF" emissiveIntensity={1.6} roughness={0.2} />
      </mesh>

      {/* Dual Lower Desktop Widescreen Displays */}
      <group position={[-0.52, 1.06, -0.06]} rotation={[-0.32, 0.18, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.78, 0.44, 0.04]} />
          <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.74, 0.4]} />
          {radarTex ? <meshBasicMaterial map={radarTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>

      <group position={[0.52, 1.06, -0.06]} rotation={[-0.32, -0.18, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.78, 0.44, 0.04]} />
          <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.74, 0.4]} />
          {codeTex ? <meshBasicMaterial map={codeTex} /> : <meshBasicMaterial color="#00E5FF" />}
        </mesh>
      </group>

      {/* Heavy-Duty Gantry Support Posts for Overhead Monitors */}
      <mesh position={[-0.85, 1.45, -0.38]}>
        <cylinderGeometry args={[0.028, 0.028, 1.25, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
      </mesh>
      <mesh position={[0.85, 1.45, -0.38]}>
        <cylinderGeometry args={[0.028, 0.028, 1.25, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.88} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.82, -0.38]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.024, 0.024, 1.88, 12]} />
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

      {/* Overhead Brushed Chrome Cooling Pipes Arcing Over Desk */}
      <mesh position={[-0.92, 1.65, -0.25]}>
        <cylinderGeometry args={[0.052, 0.052, 1.35, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[-0.92, 2.32, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.052, 10, 16, Math.PI / 2]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[-0.92, 2.32, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.48, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      <mesh position={[-0.92, 1.58, 0.52]}>
        <cylinderGeometry args={[0.05, 0.05, 1.15, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>

      {/* Modular Power Storage Battery Modules on Left */}
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

// =========================================================================================
// 6. MAIN TOOL ORCHESTRATION HARDWARE ASSEMBLY (9 Varied Installations)
// =========================================================================================

export const ToolOrchestrationHardware = memo(function ToolOrchestrationHardware({
  zone,
  activeRef,
}: {
  zone: CampusZone;
  activeRef: React.RefObject<boolean>;
}) {
  const wallTex = useMemo(() => makeHoloWallTexture(), []);
  const radarTex = useMemo(() => makeWorkstationScreenTexture('radar'), []);
  const codeTex = useMemo(() => makeWorkstationScreenTexture('code'), []);
  const topoTex = useMemo(() => makeWorkstationScreenTexture('topology'), []);
  const gaugeTex = useMemo(() => makePressureGaugeTexture(), []);

  return (
    <group position={[0, 0, 0]}>
      {/* ================================================================================= */}
      {/* 1. PLATFORM TRENCHES, RECESSED CHANNELS & CABLE TRAYS */}
      {/* ================================================================================= */}
      {/* Sunken Catwalk Trench under Coolant Tanks (Right Foreground) */}
      <mesh position={[2.8, 0.04, 1.1]} receiveShadow>
        <boxGeometry args={[2.8, 0.025, 2.6]} />
        <meshStandardMaterial color="#060A14" roughness={0.8} />
      </mesh>
      {/* Yellow Safety Warning Stripes along trench border */}
      <mesh position={[1.4, 0.055, 1.1]}>
        <boxGeometry args={[0.08, 0.01, 2.6]} />
        <meshStandardMaterial color="#EAB308" emissive="#F59E0B" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[2.8, 0.055, -0.2]}>
        <boxGeometry args={[2.8, 0.01, 0.08]} />
        <meshStandardMaterial color="#EAB308" emissive="#F59E0B" emissiveIntensity={1.2} />
      </mesh>

      {/* Perforated Metal Cable Tray between Server Racks and Central Core */}
      <mesh position={[-0.35, 0.055, -0.45]}>
        <boxGeometry args={[0.35, 0.012, 1.8]} />
        <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0.7, 0.055, 0.35]}>
        <boxGeometry args={[1.6, 0.012, 0.35]} />
        <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* ================================================================================= */}
      {/* 2. CENTRAL GOLDEN PROCESSING CORE */}
      {/* ================================================================================= */}
      <ProcessingCore activeRef={activeRef} />

      {/* ================================================================================= */}
      {/* 3. REAR MONITORING DISPLAY WALL WITH BLUE DIAGNOSTIC INTERFACES (Back-Right) */}
      {/* ================================================================================= */}
      <group position={[2.0, 2.65, -2.45]} rotation={[-0.08, -0.16, 0]}>
        {/* Rear Heavy Industrial Steel Framing */}
        <mesh position={[0, 0, -0.025]} castShadow>
          <boxGeometry args={[3.6, 1.95, 0.04]} />
          <meshStandardMaterial color="#0B1322" metalness={0.88} roughness={0.25} />
        </mesh>
        {/* Holographic Diagnostic Display Face */}
        <mesh>
          <planeGeometry args={[3.55, 1.9]} />
          {wallTex ? (
            <meshBasicMaterial map={wallTex} transparent opacity={0.94} side={DoubleSide} />
          ) : (
            <meshBasicMaterial color="#00E5FF" transparent opacity={0.65} side={DoubleSide} />
          )}
        </mesh>
        {/* Heavy Structural Steel A-Frame Pylons */}
        <mesh position={[-1.45, -1.35, -0.04]}>
          <cylinderGeometry args={[0.048, 0.048, 2.7, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[1.45, -1.35, -0.04]}>
          <cylinderGeometry args={[0.048, 0.048, 2.7, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

      {/* ================================================================================= */}
      {/* 4. OPERATOR CONTROL CONSOLE & CYBER WORKSTATION (Left-Back) */}
      {/* ================================================================================= */}
      <ControlConsole
        position={[-2.7, 0, -1.8]}
        radarTex={radarTex}
        codeTex={codeTex}
        topoTex={topoTex}
      />

      {/* ================================================================================= */}
      {/* 5. 7–10 VARIED SERVER & INDUSTRIAL COMPUTING INSTALLATIONS */}
      {/* ================================================================================= */}

      {/* Rack 1: Front-Left Enterprise 42U Compute Rack */}
      <EnterpriseServerRack
        position={[-1.4, 0, 0.75]}
        size={[0.95, 2.05, 0.85]}
        primaryLed="#00E5FF"
        secondaryLed="#FFFFFF"
      />

      {/* Rack 2: Front-Center 48U High-Density Storage Array */}
      <HighDensityStorageArray
        position={[-0.35, 0, 0.95]}
        size={[0.98, 2.1, 0.88]}
      />

      {/* Rack 3: Front-Right Modular Blade Chassis Rack */}
      <EnterpriseServerRack
        position={[0.7, 0, 1.15]}
        size={[0.95, 2.05, 0.85]}
        primaryLed="#00E5FF"
        secondaryLed="#F59E0B"
      />

      {/* Rack 4: Compact Industrial Hazard & Diagnostic Cabinet */}
      <HazardDiagnosticCabinet
        position={[1.42, 0, 1.35]}
        size={[0.62, 1.62, 0.62]}
      />

      {/* Rack 5: Heavy Double-Bay Mainframe with 3-Tier Industrial Stack Signal Light Beacon */}
      <group position={[3.1, 0, -1.35]}>
        <RoundedBox args={[1.1, 2.4, 1.1]} radius={0.05} position={[0, 1.2, 0]} castShadow>
          <meshStandardMaterial color="#0B132B" roughness={0.32} metalness={0.82} />
        </RoundedBox>
        {/* Front Cyan LED blade arrays */}
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} position={[0, 0.45 + i * 0.32, 0.56]}>
            <boxGeometry args={[0.88, 0.08, 0.02]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2.0} />
          </mesh>
        ))}
        {/* 3-Tier Industrial Stack Signal Light Beacon on Top */}
        <StackSignalTower position={[0, 2.4, 0]} />
      </group>

      {/* Rack 6: Mid-Right Auxiliary Power Distribution & Pump Unit */}
      <group position={[2.3, 0, -1.4]}>
        <RoundedBox args={[0.75, 1.6, 0.75]} radius={0.03} position={[0, 0.8, 0]} castShadow>
          <meshStandardMaterial color="#1E293B" metalness={0.78} roughness={0.3} />
        </RoundedBox>
        {/* Dual Rotary Exhaust Fans on Side */}
        {[-0.2, 0.2].map((fy, fi) => (
          <mesh key={fi} position={[0.38, 0.8 + fy, 0]} rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.02, 16]} />
            <meshStandardMaterial color="#0F172A" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* Rack 7: Back-Left Primary Massive Enterprise Compute Tower */}
      <group position={[-2.6, 0, -3.1]}>
        <RoundedBox args={[1.05, 2.55, 0.95]} radius={0.05} position={[0, 1.275, 0]} castShadow>
          <meshStandardMaterial color="#0A0F1D" roughness={0.34} metalness={0.82} />
        </RoundedBox>
        {/* Vertical Amber Venting Louvers */}
        <mesh position={[0, 1.28, 0.49]}>
          <boxGeometry args={[0.78, 1.95, 0.02]} />
          <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.8} />
        </mesh>
      </group>

      {/* Rack 8: Back-Left Secondary Enterprise Compute Tower */}
      <group position={[-1.45, 0, -3.1]}>
        <RoundedBox args={[1.05, 2.55, 0.95]} radius={0.05} position={[0, 1.275, 0]} castShadow>
          <meshStandardMaterial color="#0A0F1D" roughness={0.34} metalness={0.82} />
        </RoundedBox>
        {/* Vertical Cyan Status Channel */}
        <mesh position={[0, 1.28, 0.49]}>
          <boxGeometry args={[0.78, 1.95, 0.02]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.8} />
        </mesh>
      </group>

      {/* ================================================================================= */}
      {/* 6. CRYOGENIC LIQUID COOLANT TANKS & METALLIC PIPING NETWORK */}
      {/* ================================================================================= */}
      <CoolantCryoTank position={[2.25, 0, 1.45]} gaugeTex={gaugeTex} />
      <CoolantCryoTank position={[3.35, 0, 0.25]} gaugeTex={gaugeTex} />

      {/* Polished Chrome Interconnect Cooling Pipework */}
      {/* Pipe from Tank 1 top cap curving towards Tank 2 */}
      <mesh position={[2.75, 1.76, 0.95]} rotation={[0, -Math.PI / 4, Math.PI / 2]}>
        <cylinderGeometry args={[0.048, 0.048, 1.45, 16]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.92} roughness={0.12} />
      </mesh>
      {/* Dual Horizontal Chrome Pipes entering Right Server Cabinet */}
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

      {/* ================================================================================= */}
      {/* 7. INDUSTRIAL SAFETY HANDRAILS (Yellow Kickplate Catwalk Barrier) */}
      {/* ================================================================================= */}
      <IndustrialSafetyRail start={[1.15, 0, 2.18]} length={1.8} />
      <IndustrialSafetyRail start={[2.95, 0, 2.18]} length={1.4} rotation={[0, -Math.PI / 2, 0]} />

      {/* ================================================================================= */}
      {/* 8. DECORATIVE CYBER FOLIAGE (High-Tech Humanized Detail) */}
      {/* ================================================================================= */}
      {/* Potted cyber plant on workstation ledge */}
      <group position={[-1.85, 0.85, -2.0]}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.12, 0.1, 0.2, 12]} />
          <meshStandardMaterial color="#0F172A" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.26, 0]}>
          <sphereGeometry args={[0.14, 10, 10]} />
          <meshStandardMaterial color="#10B981" roughness={0.6} />
        </mesh>
      </group>
      {/* Potted cyber plant beside Right Mainframe */}
      <group position={[3.85, 0, -1.0]}>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.16, 0.14, 0.28, 12]} />
          <meshStandardMaterial color="#0F172A" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.38, 0]}>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshStandardMaterial color="#10B981" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
});
