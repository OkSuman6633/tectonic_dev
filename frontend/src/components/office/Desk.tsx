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

function makeWorkScreenTexture(variant: 'code' | 'analytics', accent: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
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
      <RoundedBox args={[width, 0.42, 0.032]} radius={0.012} smoothness={2} castShadow>
        <meshStandardMaterial color="#1F2937" roughness={0.38} metalness={0.4} />
      </RoundedBox>
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
      <mesh position={[0, -0.26, -0.015]} castShadow>
        <boxGeometry args={[0.042, 0.16, 0.036]} />
        <meshStandardMaterial color="#4B5563" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.33, 0.01]} castShadow>
        <boxGeometry args={[0.18, 0.018, 0.13]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.38} />
      </mesh>
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
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  const role = agentRole(id);
  const isBuilder = role === 'builder';

  useFrame(({ clock }) => {
    const live = useTelemetryStore.getState().agents[id];
    if (!live) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const active = ACTIVE.has(live.state);
    if (ringMat.current) {
      ringMat.current.opacity = selected ? 0.72 : active ? 0.36 + 0.14 * Math.sin(t * 4) : hoveredRef.current ? 0.4 : 0;
    }
    if (screenMat.current) {
      screenMat.current.emissiveIntensity = active ? 0.52 + 0.1 * Math.sin(t * 6) : 0.3;
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
        <ringGeometry args={[isBuilder ? 1.24 : 1.05, isBuilder ? 1.32 : 1.12, 40]} />
        <meshBasicMaterial ref={ringMat} color={accentColor} transparent opacity={hovered || selected ? 0.5 : 0} depthWrite={false} />
      </mesh>

      {/* Warm Oak Desktop */}
      <RoundedBox args={[deskW, 0.068, deskD]} radius={0.02} smoothness={2} position={[0, 0.72, -0.05]} castShadow receiveShadow>
        <meshStandardMaterial color={isBuilder ? '#BD8F62' : palette.deskTop} roughness={0.56} />
      </RoundedBox>

      {/* Steel A-Frame Desk Legs */}
      {[-deskW / 2 + 0.12, deskW / 2 - 0.12].map((lx) => (
        <group key={lx} position={[lx, 0, -0.05]}>
          <mesh position={[0, 0.35, -deskD / 2 + 0.12]} castShadow>
            <boxGeometry args={[0.05, 0.7, 0.05]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.42} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.35, deskD / 2 - 0.12]} castShadow>
            <boxGeometry args={[0.05, 0.7, 0.05]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.42} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.055, 0.04, deskD - 0.2]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.42} roughness={0.45} />
          </mesh>
        </group>
      ))}

      {/* Under-desk drawer pedestal on the right */}
      <RoundedBox args={[0.38, 0.56, 0.58]} radius={0.02} position={[deskW / 2 - 0.32, 0.29, -0.04]} castShadow receiveShadow>
        <meshStandardMaterial color="#F1ECE4" roughness={0.68} />
      </RoundedBox>

      {/* Soft Felt Desk Mat, Mechanical Keyboard & Wireless Mouse */}
      <mesh position={[-0.08, 0.758, 0.12]} receiveShadow>
        <boxGeometry args={[0.78, 0.008, 0.32]} />
        <meshStandardMaterial color="#475569" roughness={0.92} />
      </mesh>
      <RoundedBox args={[0.42, 0.022, 0.14]} radius={0.006} position={[-0.14, 0.77, 0.14]} castShadow>
        <meshStandardMaterial color="#F8FAFC" roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[0.075, 0.024, 0.115]} radius={0.01} position={[0.2, 0.77, 0.14]} castShadow>
        <meshStandardMaterial color="#334155" roughness={0.45} />
      </RoundedBox>

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

      {/* Warm Minimalist Desk Lamp */}
      <group position={[-deskW / 2 + 0.2, 0.755, -0.24]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.075, 0.085, 0.024, 14]} />
          <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.19, 0]} rotation={[0.12, 0, -0.18]} castShadow>
          <cylinderGeometry args={[0.012, 0.014, 0.38, 8]} />
          <meshStandardMaterial color="#B48A5A" metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[0.07, 0.36, 0.05]} rotation={[0.45, 0, -0.35]} castShadow>
          <coneGeometry args={[0.085, 0.13, 14]} />
          <meshStandardMaterial color="#374151" roughness={0.45} />
        </mesh>
      </group>

      {/* Ceramic Coffee Mug & Mini Desk Plant */}
      <mesh position={[deskW / 2 - 0.22, 0.795, 0.16]} castShadow>
        <cylinderGeometry args={[0.042, 0.036, 0.085, 12]} />
        <meshStandardMaterial color={isBuilder ? '#2563EB' : '#D97757'} roughness={0.42} />
      </mesh>
      <group position={[deskW / 2 - 0.18, 0.755, -0.26]}>
        <mesh position={[0, 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.045, 0.08, 12]} />
          <meshStandardMaterial color="#EFE9DF" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.1, 0]} castShadow>
          <dodecahedronGeometry args={[0.055, 0]} />
          <meshStandardMaterial color="#4D8B63" roughness={0.75} />
        </mesh>
      </group>

      {/* Ergonomic Swivel Office Chair positioned in front of the desk */}
      <group position={[0, 0, 0.56]}>
        {[0, 1.25, 2.5, 3.75, 5.0].map((ang, i) => (
          <mesh key={i} position={[Math.cos(ang) * 0.16, 0.04, Math.sin(ang) * 0.16]} rotation={[0, -ang, 0]} castShadow>
            <boxGeometry args={[0.3, 0.028, 0.038]} />
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.38} />
          </mesh>
        ))}
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.034, 0.04, 0.36, 12]} />
          <meshStandardMaterial color="#1F2937" metalness={0.55} roughness={0.32} />
        </mesh>
        <RoundedBox args={[0.48, 0.075, 0.46]} radius={0.03} smoothness={2} position={[0, 0.42, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isBuilder ? '#3B556E' : palette.chair} roughness={0.82} />
        </RoundedBox>
        <RoundedBox args={[0.45, 0.5, 0.065]} radius={0.03} smoothness={2} position={[0, 0.72, 0.22]} castShadow>
          <meshStandardMaterial color={isBuilder ? '#3B556E' : palette.chair} roughness={0.82} />
        </RoundedBox>
        {[-0.25, 0.25].map((ax) => (
          <group key={ax} position={[ax, 0.53, 0.02]}>
            <mesh castShadow>
              <boxGeometry args={[0.035, 0.18, 0.035]} />
              <meshStandardMaterial color="#334155" metalness={0.45} roughness={0.4} />
            </mesh>
            <RoundedBox args={[0.055, 0.03, 0.26]} radius={0.01} position={[0, 0.095, -0.02]} castShadow>
              <meshStandardMaterial color="#1E293B" roughness={0.65} />
            </RoundedBox>
          </group>
        ))}
      </group>
    </group>
  );
}

export const Desk = memo(DeskImpl);
