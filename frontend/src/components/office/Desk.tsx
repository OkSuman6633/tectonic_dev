import { memo, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { CanvasTexture, SRGBColorSpace, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { STATE_STYLES, agentRole } from '../command/agentStateStyles';
import type { Vec3 } from './officeLayout';

export interface OfficePalette {
  floor: string;
  deskTop: string;
  deskLeg: string;
  chair: string;
  wall: string;
  monitor: string;
}

export const LIGHT_PALETTE: OfficePalette = {
  floor: '#D8BA92',
  deskTop: '#C99E72',
  deskLeg: '#374151',
  chair: '#475569',
  wall: '#F4EFE7',
  monitor: '#1E293B',
};

export const DARK_PALETTE: OfficePalette = LIGHT_PALETTE;

const ACTIVE = new Set(['thinking', 'tool_execution', 'running', 'waiting']);

const workScreenCache = new Map<string, CanvasTexture>();

function makeWorkScreenTexture(variant: 'code' | 'analytics', accent: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${variant}|${accent}`;
  const cached = workScreenCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (variant === 'code') {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, 44, 160);
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 256, 20);
    const lineColors = ['#38BDF8', '#A78BFA', '#34D399', '#FBBF24', '#E2E8F0'];
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = lineColors[i % lineColors.length];
      const indent = (i % 3) * 14;
      const w = 64 + ((i * 37) % 110);
      ctx.fillRect(54 + indent, 30 + i * 13, w, 6);
    }
  } else {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 256, 22);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(14, 34, 108, 48);
    ctx.fillRect(132, 34, 110, 48);
    ctx.fillStyle = '#3B82F6';
    [32, 48, 38, 54, 46].forEach((h, i) => {
      ctx.fillRect(22 + i * 18, 146 - h, 12, h);
    });
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(136, 134);
    ctx.lineTo(162, 116);
    ctx.lineTo(192, 124);
    ctx.lineTo(222, 98);
    ctx.lineTo(240, 104);
    ctx.stroke();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  workScreenCache.set(key, tex);
  return tex;
}

function OfficeMonitor({
  x,
  z = -0.24,
  rotY = 0,
  width,
  variant,
  accent,
  screenMatRef,
}: {
  x: number;
  z?: number;
  rotY?: number;
  width: number;
  variant: 'code' | 'analytics';
  accent: string;
  screenMatRef?: React.Ref<MeshStandardMaterial>;
}) {
  const tex = useMemo(() => makeWorkScreenTexture(variant, accent), [variant, accent]);
  return (
    <group position={[x, 1.04, z]} rotation={[0, rotY, 0]}>
      <mesh>
        <boxGeometry args={[width, 0.42, 0.032]} />
        <meshStandardMaterial color="#1F2937" roughness={0.38} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.019]}>
        <planeGeometry args={[width - 0.04, 0.36]} />
        {tex ? (
          <meshStandardMaterial
            ref={screenMatRef}
            map={tex}
            emissive="#FFFFFF"
            emissiveMap={tex}
            emissiveIntensity={0.35}
            roughness={0.25}
          />
        ) : (
          <meshStandardMaterial ref={screenMatRef} color="#E2E8F0" emissive={accent} emissiveIntensity={0.25} />
        )}
      </mesh>
      <mesh position={[0, -0.26, -0.015]}>
        <boxGeometry args={[0.042, 0.16, 0.036]} />
        <meshStandardMaterial color="#4B5563" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.33, 0.01]}>
        <boxGeometry args={[0.18, 0.018, 0.13]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.38} />
      </mesh>
    </group>
  );
}

export type DeskEquipment = 'laptop' | 'monitor' | 'hybrid';

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic distribution of workplace computing equipment per agent desk. */
export function getDeskEquipment(agentId: string): DeskEquipment {
  if (agentId === 'agent_builder') return 'hybrid';
  const mod = hashString(agentId) % 4;
  if (mod === 0 || mod === 2) return 'laptop';
  if (mod === 1) return 'monitor';
  return 'hybrid';
}

const laptopScreenCache = new Map<string, CanvasTexture>();

function makeLaptopScreenTexture(variant: 'code' | 'terminal' | 'analytics', accent: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${variant}|${accent}`;
  const cached = laptopScreenCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Modern dark IDE / terminal background
  ctx.fillStyle = '#080E1E';
  ctx.fillRect(0, 0, 256, 160);

  // Top window titlebar with macOS-style window dots
  ctx.fillStyle = '#111C33';
  ctx.fillRect(0, 0, 256, 18);
  ctx.fillStyle = '#EF4444';
  ctx.beginPath(); ctx.arc(10, 9, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath(); ctx.arc(20, 9, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#10B981';
  ctx.beginPath(); ctx.arc(30, 9, 3.5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 8px monospace';
  ctx.fillText('zsh — worker@tectonic-node', 42, 12);

  if (variant === 'terminal') {
    ctx.fillStyle = '#38BDF8';
    ctx.font = '8px monospace';
    ctx.fillText('~/tectonic $ node worker.js --live', 10, 32);
    ctx.fillStyle = '#10B981';
    ctx.fillText('[OK] connected to cluster pipeline', 10, 46);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText('> token stream: 3,420 tok/sec', 10, 60);
    ctx.fillText('> AST generation: IN PROGRESS', 10, 74);
    ctx.fillStyle = '#F59E0B';
    ctx.fillText('> memory buffer: 94% sync', 10, 88);
    ctx.fillStyle = '#00F0FF';
    ctx.fillText('> worker task: ACTIVE SIMULATION', 10, 102);

    // Mini activity bars at bottom
    ctx.fillStyle = '#111C33';
    ctx.fillRect(10, 116, 236, 32);
    for (let i = 0; i < 18; i++) {
      const bh = 8 + ((i * 17) % 22);
      ctx.fillStyle = i % 2 === 0 ? accent : '#00E5FF';
      ctx.fillRect(14 + i * 12, 144 - bh, 8, bh);
    }
  } else if (variant === 'code') {
    // Line numbers gutter
    ctx.fillStyle = '#060B18';
    ctx.fillRect(0, 18, 28, 142);
    ctx.fillStyle = '#475569';
    ctx.font = '8px monospace';
    for (let l = 1; l <= 9; l++) {
      ctx.fillText(String(l), 8, 20 + l * 14);
    }
    // Syntax highlighted code lines
    const colors = ['#F472B6', '#38BDF8', '#34D399', '#FBBF24', '#A78BFA', '#E2E8F0'];
    for (let i = 0; i < 9; i++) {
      const y = 30 + i * 14;
      const indent = (i % 3) * 12;
      const col = colors[i % colors.length];
      ctx.fillStyle = col;
      ctx.fillRect(36 + indent, y - 6, 45 + ((i * 31) % 95), 5);
      if (i % 2 === 0) {
        ctx.fillStyle = colors[(i + 2) % colors.length];
        ctx.fillRect(36 + indent + 55 + ((i * 31) % 95), y - 6, 28, 5);
      }
    }
  } else {
    // Analytics dashboard
    ctx.fillStyle = '#111C33';
    ctx.fillRect(10, 26, 110, 48);
    ctx.fillRect(134, 26, 110, 48);
    ctx.fillStyle = accent;
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('THROUGHPUT', 16, 40);
    ctx.fillText('LATENCY', 140, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('99.4%', 16, 62);
    ctx.fillText('18 ms', 140, 62);

    // Waveform chart
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < 230; x += 6) {
      const cy = 118 + Math.sin(x * 0.12) * 16 + Math.cos(x * 0.05) * 8;
      if (x === 0) ctx.moveTo(12 + x, cy);
      else ctx.lineTo(12 + x, cy);
    }
    ctx.stroke();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  laptopScreenCache.set(key, tex);
  return tex;
}

/** Realistic stylized 3D open laptop with aluminum chassis, keyboard deck, trackpad & glowing active screen. */
function OfficeLaptop({
  position,
  rotation = [0, 0, 0],
  variant = 'code',
  accent = '#38BDF8',
  screenMatRef,
}: {
  position: Vec3;
  rotation?: [number, number, number];
  variant?: 'code' | 'terminal' | 'analytics';
  accent?: string;
  screenMatRef?: React.Ref<MeshStandardMaterial>;
}) {
  const screenTex = useMemo(() => makeLaptopScreenTexture(variant, accent), [variant, accent]);

  return (
    <group position={position} rotation={rotation}>
      {/* Lower Base Chassis */}
      <mesh position={[0, 0.007, 0]}>
        <boxGeometry args={[0.38, 0.014, 0.25]} />
        <meshStandardMaterial color="#1E293B" metalness={0.72} roughness={0.3} />
      </mesh>

      {/* Recessed Keyboard Deck */}
      <mesh position={[0, 0.0148, -0.035]}>
        <boxGeometry args={[0.33, 0.002, 0.13]} />
        <meshStandardMaterial color="#0B132B" roughness={0.65} />
      </mesh>

      {/* Glass-Smooth Trackpad */}
      <mesh position={[0, 0.0148, 0.065]}>
        <boxGeometry args={[0.12, 0.0015, 0.075]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.25} />
      </mesh>

      {/* Open Angled Display Lid (Tilted back ~110 degrees, facing seated employee) */}
      <group position={[0, 0.015, -0.124]} rotation={[0.32, 0, 0]}>
        {/* Aluminum Outer Lid Backing */}
        <mesh position={[0, 0.122, 0]}>
          <boxGeometry args={[0.38, 0.245, 0.008]} />
          <meshStandardMaterial color="#1E293B" metalness={0.75} roughness={0.28} />
        </mesh>

        {/* Display Surface Face */}
        <mesh position={[0, 0.122, 0.005]}>
          <planeGeometry args={[0.355, 0.222]} />
          {screenTex ? (
            <meshStandardMaterial
              ref={screenMatRef}
              map={screenTex}
              emissive="#FFFFFF"
              emissiveMap={screenTex}
              emissiveIntensity={0.65}
              roughness={0.15}
            />
          ) : (
            <meshStandardMaterial ref={screenMatRef} color="#00E5FF" emissive={accent} emissiveIntensity={0.55} />
          )}
        </mesh>
      </group>
    </group>
  );
}

/**
 * Modern ergonomic employee desk with warm oak top, dual realistic monitors, keyboard, mouse,
 * warm brass desk lamp, ceramic coffee mug, and ergonomic swivel chair.
 * The human employee who owns this desk is rendered and animated by the unified EmployeeWorkforce
 * so they can seamlessly sit at this desk, stand up, walk to resources, and sit back down.
 */
function DeskImpl({ id, position, palette }: { id: string; position: Vec3; palette: OfficePalette; showLabel: boolean }) {
  const reducedMotion = useReducedMotion();
  const agent = useTelemetryStore((s) => s.agents[id]);
  const selected = useTelemetryStore((s) => s.selectedAgentId === id);
  const selectAgent = useTelemetryStore((s) => s.selectAgent);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const screenMat = useRef<MeshStandardMaterial>(null);
  const laptopScreenMat = useRef<MeshStandardMaterial>(null);
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  const role = agentRole(id);
  const isBuilder = role === 'builder';
  const equipment = useMemo(() => getDeskEquipment(id), [id]);

  useFrame(({ clock }) => {
    const store = useTelemetryStore.getState();
    const live = store.agents[id];
    if (!live) return;
    const isSimulating = store.isSimulating;
    const active = isSimulating || ACTIVE.has(live.state);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    if (ringMat.current) {
      ringMat.current.opacity = selected ? 0.72 : active ? 0.38 + 0.14 * Math.sin(t * 4) : hoveredRef.current ? 0.4 : 0;
    }
    if (screenMat.current) {
      screenMat.current.emissiveIntensity = active ? 0.75 + 0.15 * Math.sin(t * 6) : 0.32;
    }
    if (laptopScreenMat.current) {
      laptopScreenMat.current.emissiveIntensity = active ? 0.95 + 0.2 * Math.sin(t * 7) : 0.45;
    }
  });

  if (!agent) return null;
  const style = STATE_STYLES[agent.state];
  const accentColor = selected ? '#2563EB' : style.color;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectAgent(id, 'office');
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = on ? 'pointer' : '';
    hoveredRef.current = on;
    setHovered(on);
  };

  const deskW = isBuilder ? 2.02 : 1.72;
  const deskD = isBuilder ? 1.02 : 0.92;

  return (
    <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Subtle floor highlight ring only when selected, hovered, or actively executing */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0.14]}>
        <ringGeometry args={[isBuilder ? 1.24 : 1.05, isBuilder ? 1.32 : 1.12, 24]} />
        <meshBasicMaterial ref={ringMat} color={accentColor} transparent opacity={hovered || selected ? 0.5 : 0} depthWrite={false} />
      </mesh>

      {/* Warm Oak Desktop */}
      <RoundedBox args={[deskW, 0.068, deskD]} radius={0.02} smoothness={1} position={[0, 0.72, -0.05]} castShadow receiveShadow>
        <meshStandardMaterial color={isBuilder ? '#BD8F62' : palette.deskTop} roughness={0.56} />
      </RoundedBox>

      {/* Steel A-Frame Desk Legs */}
      {[-deskW / 2 + 0.12, deskW / 2 - 0.12].map((lx) => (
        <group key={lx} position={[lx, 0, -0.05]}>
          <mesh position={[0, 0.35, -deskD / 2 + 0.12]}>
            <boxGeometry args={[0.05, 0.7, 0.05]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.42} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.35, deskD / 2 - 0.12]}>
            <boxGeometry args={[0.05, 0.7, 0.05]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.42} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.055, 0.04, deskD - 0.2]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.42} roughness={0.45} />
          </mesh>
        </group>
      ))}

      {/* Under-desk drawer pedestal on the right */}
      <mesh position={[deskW / 2 - 0.32, 0.29, -0.04]} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.56, 0.58]} />
        <meshStandardMaterial color="#F1ECE4" roughness={0.68} />
      </mesh>

      {/* ================================================================================= */}
      {/* COMPUTING EQUIPMENT HARDWARE (Laptop Workstation vs Desktop Monitor vs Hybrid) */}
      {/* ================================================================================= */}
      {equipment === 'laptop' && (
        <group>
          {/* Centered Soft Felt Desk Mat */}
          <mesh position={[0, 0.758, 0.1]} receiveShadow>
            <boxGeometry args={[0.82, 0.008, 0.36]} />
            <meshStandardMaterial color="#475569" roughness={0.92} />
          </mesh>

          {/* Sleek Aluminum Laptop Open in Center of Mat directly in front of employee */}
          <OfficeLaptop
            position={[0, 0.762, 0.08]}
            variant={hashString(id) % 2 === 0 ? 'terminal' : 'code'}
            accent={accentColor}
            screenMatRef={laptopScreenMat}
          />

          {/* Wireless Mouse on the right */}
          <mesh position={[0.26, 0.77, 0.12]}>
            <boxGeometry args={[0.075, 0.024, 0.115]} />
            <meshStandardMaterial color="#334155" roughness={0.45} />
          </mesh>

          {/* Lined Technical Notebook & Pen on the left */}
          <group position={[-0.44, 0.762, 0.08]}>
            <mesh>
              <boxGeometry args={[0.18, 0.014, 0.24]} />
              <meshStandardMaterial color="#F8FAFC" roughness={0.8} />
            </mesh>
            {/* Pen */}
            <mesh position={[0.11, 0.012, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.004, 0.004, 0.16, 6]} />
              <meshStandardMaterial color="#2563EB" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        </group>
      )}

      {equipment === 'monitor' && (
        <group>
          {/* Soft Felt Desk Mat, Mechanical Keyboard & Wireless Mouse */}
          <mesh position={[-0.08, 0.758, 0.12]} receiveShadow>
            <boxGeometry args={[0.78, 0.008, 0.32]} />
            <meshStandardMaterial color="#475569" roughness={0.92} />
          </mesh>
          <mesh position={[-0.14, 0.77, 0.14]}>
            <boxGeometry args={[0.42, 0.022, 0.14]} />
            <meshStandardMaterial color="#F8FAFC" roughness={0.5} />
          </mesh>
          <mesh position={[0.2, 0.77, 0.14]}>
            <boxGeometry args={[0.075, 0.024, 0.115]} />
            <meshStandardMaterial color="#334155" roughness={0.45} />
          </mesh>

          {/* Dual Office Monitors */}
          <OfficeMonitor
            x={isBuilder ? -0.44 : -0.36}
            z={-0.25}
            rotY={0.16}
            width={isBuilder ? 0.7 : 0.62}
            variant="code"
            accent={accentColor}
            screenMatRef={screenMat}
          />
          <OfficeMonitor
            x={isBuilder ? 0.44 : 0.36}
            z={-0.25}
            rotY={-0.16}
            width={isBuilder ? 0.7 : 0.62}
            variant="analytics"
            accent={accentColor}
          />
        </group>
      )}

      {equipment === 'hybrid' && (
        <group>
          {/* Desk Mat */}
          <mesh position={[0.08, 0.758, 0.12]} receiveShadow>
            <boxGeometry args={[0.82, 0.008, 0.32]} />
            <meshStandardMaterial color="#475569" roughness={0.92} />
          </mesh>
          <mesh position={[0.05, 0.77, 0.14]}>
            <boxGeometry args={[0.42, 0.022, 0.14]} />
            <meshStandardMaterial color="#F8FAFC" roughness={0.5} />
          </mesh>
          <mesh position={[0.36, 0.77, 0.14]}>
            <boxGeometry args={[0.075, 0.024, 0.115]} />
            <meshStandardMaterial color="#334155" roughness={0.45} />
          </mesh>

          {/* Main Large Desktop Monitor */}
          <OfficeMonitor
            x={0.22}
            z={-0.25}
            rotY={-0.08}
            width={0.76}
            variant="analytics"
            accent={accentColor}
            screenMatRef={screenMat}
          />

          {/* Docked Open Laptop on Raised Ergonomic Aluminum Stand on the left */}
          <group position={[-0.46, 0.758, -0.06]} rotation={[0, 0.28, 0]}>
            {/* Aluminum Laptop Stand */}
            <mesh position={[0, 0.025, 0]}>
              <boxGeometry args={[0.26, 0.05, 0.2]} />
              <meshStandardMaterial color="#64748B" metalness={0.8} roughness={0.25} />
            </mesh>
            <OfficeLaptop
              position={[0, 0.05, 0]}
              variant="terminal"
              accent={accentColor}
              screenMatRef={laptopScreenMat}
            />
          </group>
        </group>
      )}

      {/* Warm Minimalist Desk Lamp */}
      <group position={[-deskW / 2 + 0.2, 0.755, -0.24]}>
        <mesh>
          <cylinderGeometry args={[0.075, 0.085, 0.024, 10]} />
          <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.19, 0]} rotation={[0.12, 0, -0.18]}>
          <cylinderGeometry args={[0.012, 0.014, 0.38, 6]} />
          <meshStandardMaterial color="#B48A5A" metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[0.07, 0.36, 0.05]} rotation={[0.45, 0, -0.35]}>
          <coneGeometry args={[0.085, 0.13, 10]} />
          <meshStandardMaterial color="#374151" roughness={0.45} />
        </mesh>
      </group>

      {/* Ceramic Coffee Mug & Mini Desk Plant */}
      <mesh position={[deskW / 2 - 0.22, 0.795, 0.16]}>
        <cylinderGeometry args={[0.042, 0.036, 0.085, 10]} />
        <meshStandardMaterial color={isBuilder ? '#2563EB' : '#D97757'} roughness={0.42} />
      </mesh>
      <group position={[deskW / 2 - 0.18, 0.755, -0.26]}>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.055, 0.045, 0.08, 10]} />
          <meshStandardMaterial color="#EFE9DF" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <dodecahedronGeometry args={[0.055, 0]} />
          <meshStandardMaterial color="#4D8B63" roughness={0.75} />
        </mesh>
      </group>

      {/* Ergonomic Swivel Office Chair positioned in front of the desk */}
      <group position={[0, 0, 0.56]}>
        {[0, 1.25, 2.5, 3.75, 5.0].map((ang, i) => (
          <mesh key={i} position={[Math.cos(ang) * 0.16, 0.04, Math.sin(ang) * 0.16]} rotation={[0, -ang, 0]}>
            <boxGeometry args={[0.3, 0.028, 0.038]} />
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.38} />
          </mesh>
        ))}
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.034, 0.04, 0.36, 8]} />
          <meshStandardMaterial color="#1F2937" metalness={0.55} roughness={0.32} />
        </mesh>
        <RoundedBox args={[0.48, 0.075, 0.46]} radius={0.03} smoothness={1} position={[0, 0.42, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isBuilder ? '#3B556E' : palette.chair} roughness={0.82} />
        </RoundedBox>
        <RoundedBox args={[0.45, 0.5, 0.065]} radius={0.03} smoothness={1} position={[0, 0.72, 0.22]} castShadow>
          <meshStandardMaterial color={isBuilder ? '#3B556E' : palette.chair} roughness={0.82} />
        </RoundedBox>
        {[-0.25, 0.25].map((ax) => (
          <group key={ax} position={[ax, 0.53, 0.02]}>
            <mesh>
              <boxGeometry args={[0.035, 0.18, 0.035]} />
              <meshStandardMaterial color="#334155" metalness={0.45} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.095, -0.02]}>
              <boxGeometry args={[0.055, 0.03, 0.26]} />
              <meshStandardMaterial color="#1E293B" roughness={0.65} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

export const Desk = memo(DeskImpl);
