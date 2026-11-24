import { memo, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, DoubleSide, RepeatWrapping, SRGBColorSpace } from 'three';
import type { OfficeLayout, SatellitePad, Vec3 } from './officeLayout';

/** Procedural warm oak hardwood plank texture for a cozy, realistic modern office floor. */
function makeOakFloorTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#D8BA92';
  ctx.fillRect(0, 0, 512, 512);

  const plankH = 32;
  const tones = ['#D7B88E', '#CEAE83', '#DEC29B', '#D3B389', '#C8A77C'];
  for (let row = 0; row < 512 / plankH; row++) {
    const y = row * plankH;
    const offset = (row % 3) * 140;
    for (let col = -1; col < 3; col++) {
      const x = col * 256 + offset;
      ctx.fillStyle = tones[(row * 3 + col + 9) % tones.length];
      ctx.fillRect(x, y, 256, plankH);

      // Soft wood grain streaks
      ctx.strokeStyle = 'rgba(120, 82, 42, 0.08)';
      ctx.lineWidth = 1;
      for (let g = 4; g < plankH; g += 6) {
        ctx.beginPath();
        ctx.moveTo(x, y + g);
        ctx.bezierCurveTo(x + 80, y + g + 2, x + 170, y + g - 2, x + 256, y + g);
        ctx.stroke();
      }
      // Subtle plank bevel seam
      ctx.strokeStyle = 'rgba(98, 66, 36, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.5, y + 0.5, 255, plankH - 1);
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(10, 8);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural presentation slide canvas for the meeting room wall display. */
function makePresentationTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, 512, 42);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('TECTONIC · AGENT ROADMAP & TELEMETRY', 20, 27);

  // Clean bar chart
  const bars = [120, 165, 140, 190, 210, 175];
  const colors = ['#3B82F6', '#0D9488', '#8B5CF6', '#F59E0B', '#10B981', '#2563EB'];
  bars.forEach((h, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(36 + i * 44, 245 - h * 0.72, 26, h * 0.72);
  });

  // Right-side KPI cards
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(320, 68, 164, 48);
  ctx.fillRect(320, 128, 164, 48);
  ctx.fillRect(320, 188, 164, 56);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('Active Workflows', 332, 90);
  ctx.fillText('Latency · 98ms', 332, 150);
  ctx.fillText('Accuracy · 99.2%', 332, 212);
  ctx.fillStyle = '#10B981';
  ctx.fillRect(332, 100, 110, 6);
  ctx.fillStyle = '#3B82F6';
  ctx.fillRect(332, 160, 128, 6);
  ctx.fillStyle = '#8B5CF6';
  ctx.fillRect(332, 224, 138, 6);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural minimalist botanical wall art print. */
function makeWallArtTexture(bg: string, leafA: string, leafB: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 320);

  // Warm sun circle
  ctx.fillStyle = leafB;
  ctx.globalAlpha = 0.32;
  ctx.beginPath();
  ctx.arc(150, 115, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Stylized botanical arch & leaves
  ctx.strokeStyle = leafA;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(118, 280);
  ctx.quadraticCurveTo(105, 175, 136, 75);
  ctx.stroke();

  ctx.fillStyle = leafA;
  [
    [104, 210, -0.55],
    [136, 185, 0.5],
    [108, 145, -0.5],
    [142, 125, 0.45],
  ].forEach(([cx, cy, ang]) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural warm wood/slate architectural wall plaque for office rooms. */
function makeWallSignTexture(title: string, subtitle: string, accent: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FDFBF7';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 18, 128);
  ctx.strokeStyle = '#D6CBB8';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 122);

  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 34px Inter, sans-serif';
  ctx.fillText(title, 36, 58);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 22px Inter, sans-serif';
  ctx.fillText(subtitle, 36, 98);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural glass whiteboard with colorful project sticky notes. */
function makeWhiteboardTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 384, 224);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 368, 208);

  // Subtle flow arrows
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(96, 72);
  ctx.lineTo(156, 72);
  ctx.moveTo(228, 72);
  ctx.lineTo(278, 72);
  ctx.stroke();

  // Colorful sticky notes
  const notes = [
    { x: 32, y: 40, c: '#FDE68A' },
    { x: 32, y: 118, c: '#BFDBFE' },
    { x: 158, y: 40, c: '#BBF7D0' },
    { x: 158, y: 118, c: '#FECACA' },
    { x: 282, y: 40, c: '#DDD6FE' },
    { x: 282, y: 118, c: '#FDE68A' },
  ];
  for (const n of notes) {
    ctx.fillStyle = n.c;
    ctx.fillRect(n.x, n.y, 64, 56);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.28)';
    ctx.fillRect(n.x + 8, n.y + 14, 42, 6);
    ctx.fillRect(n.x + 8, n.y + 28, 32, 5);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const WallSign = memo(function WallSign({
  position,
  rotationY = 0,
  title,
  subtitle,
  accent,
}: {
  position: Vec3;
  rotationY?: number;
  title: string;
  subtitle: string;
  accent: string;
}) {
  const tex = useMemo(() => makeWallSignTexture(title, subtitle, accent), [title, subtitle, accent]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[2.15, 0.54, 0.04]} />
        <meshStandardMaterial color="#B99368" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0, 0.024]}>
        <planeGeometry args={[2.06, 0.46]} />
        {tex ? <meshStandardMaterial map={tex} roughness={0.6} /> : <meshStandardMaterial color="#FDFBF7" />}
      </mesh>
    </group>
  );
});

/** Lush potted indoor tree (fiddle-leaf fig / ficus) in ceramic or terracotta planter. */
export const IndoorTree = memo(function IndoorTree({
  position,
  scale = 1,
  potColor = '#C27452',
}: {
  position: Vec3;
  scale?: number;
  potColor?: string;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Ceramic/terracotta pot */}
      <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.27, 0.21, 0.48, 18]} />
        <meshStandardMaterial color={potColor} roughness={0.76} />
      </mesh>
      {/* Pot rim */}
      <mesh position={[0, 0.47, 0]} castShadow>
        <cylinderGeometry args={[0.29, 0.28, 0.05, 18]} />
        <meshStandardMaterial color={potColor} roughness={0.72} />
      </mesh>
      {/* Rich soil */}
      <mesh position={[0, 0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 16]} />
        <meshStandardMaterial color="#4A3525" roughness={0.95} />
      </mesh>
      {/* Woody trunk & fork */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.06, 0.84, 10]} />
        <meshStandardMaterial color="#7C5A3C" roughness={0.9} />
      </mesh>
      <mesh position={[0.09, 1.15, 0.04]} rotation={[0.18, 0, -0.42]} castShadow>
        <cylinderGeometry args={[0.026, 0.038, 0.42, 8]} />
        <meshStandardMaterial color="#7C5A3C" roughness={0.9} />
      </mesh>
      <mesh position={[-0.08, 1.12, -0.05]} rotation={[-0.2, 0, 0.38]} castShadow>
        <cylinderGeometry args={[0.025, 0.036, 0.38, 8]} />
        <meshStandardMaterial color="#7C5A3C" roughness={0.9} />
      </mesh>
      {/* Layered lush green foliage canopy */}
      {[
        { pos: [0, 1.48, 0] as Vec3, r: 0.34, c: '#3B7A57' },
        { pos: [0.22, 1.34, 0.14] as Vec3, r: 0.26, c: '#4C8F66' },
        { pos: [-0.22, 1.36, -0.1] as Vec3, r: 0.28, c: '#2F6849' },
        { pos: [0.06, 1.66, -0.12] as Vec3, r: 0.25, c: '#549B6E' },
        { pos: [-0.14, 1.24, 0.2] as Vec3, r: 0.22, c: '#43845D' },
        { pos: [0.16, 1.54, -0.16] as Vec3, r: 0.21, c: '#3B7A57' },
      ].map((leaf, i) => (
        <mesh key={i} position={leaf.pos} castShadow receiveShadow>
          <dodecahedronGeometry args={[leaf.r, 1]} />
          <meshStandardMaterial color={leaf.c} roughness={0.78} />
        </mesh>
      ))}
    </group>
  );
});

/** Decorative bushy monstera / snake plant in a modern ceramic pot. */
export const PottedPlant = memo(function PottedPlant({
  position,
  scale = 1,
  potColor = '#F1ECE4',
}: {
  position: Vec3;
  scale?: number;
  potColor?: string;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.19, 0.15, 0.34, 16]} />
        <meshStandardMaterial color={potColor} roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.34, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.17, 14]} />
        <meshStandardMaterial color="#4A3525" roughness={0.95} />
      </mesh>
      {[0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4].map((ang, i) => (
        <group key={i} rotation={[0, ang, 0]}>
          <mesh
            position={[0.1 + (i % 2) * 0.04, 0.44 + (i % 3) * 0.09, 0]}
            rotation={[0, 0, -0.35 - (i % 3) * 0.16]}
            castShadow
          >
            <boxGeometry args={[0.04, 0.38 + (i % 2) * 0.12, 0.12]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#3E825B' : '#529A6D'} roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/** Wooden bookshelf stocked with colorful office books, binders, and small trailing plant. */
const Bookshelf = memo(function Bookshelf({ position, rotationY = 0 }: { position: Vec3; rotationY?: number }) {
  const bookColors = ['#2B5B84', '#C25B4A', '#D99B38', '#3F7D63', '#6A5B8E', '#E2DDD5', '#3B6E8C', '#B86E42'];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Outer wood frame */}
      <RoundedBox args={[1.45, 1.95, 0.42]} radius={0.025} smoothness={2} position={[0, 0.98, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#B98E63" roughness={0.72} />
      </RoundedBox>
      {/* Inner recessed back */}
      <mesh position={[0, 0.98, 0.02]}>
        <boxGeometry args={[1.33, 1.82, 0.34]} />
        <meshStandardMaterial color="#F4EFE6" roughness={0.85} />
      </mesh>
      {/* 4 Shelf boards + books */}
      {[0.28, 0.72, 1.16, 1.6].map((sy, row) => (
        <group key={row} position={[0, sy, 0.05]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.34, 0.045, 0.36]} />
            <meshStandardMaterial color="#A97C50" roughness={0.7} />
          </mesh>
          {row < 3 &&
            [-0.48, -0.36, -0.24, -0.1, 0.08, 0.2, 0.34, 0.46].map((bx, idx) => {
              const bh = 0.24 + ((row * 3 + idx) % 3) * 0.045;
              return (
                <mesh key={idx} position={[bx, 0.025 + bh / 2, 0.02]} castShadow>
                  <boxGeometry args={[0.085, bh, 0.22]} />
                  <meshStandardMaterial color={bookColors[(row * 5 + idx) % bookColors.length]} roughness={0.68} />
                </mesh>
              );
            })}
          {row === 3 && (
            <>
              <RoundedBox args={[0.38, 0.22, 0.26]} radius={0.02} position={[-0.36, 0.13, 0.02]} castShadow>
                <meshStandardMaterial color="#E5DEC9" roughness={0.8} />
              </RoundedBox>
              <PottedPlant position={[0.36, 0.02, 0.02]} scale={0.55} potColor="#C87553" />
            </>
          )}
        </group>
      ))}
    </group>
  );
});

/** Storage credenza / filing cabinet with wood top & brushed metal pulls. */
const StorageCabinet = memo(function StorageCabinet({ position, rotationY = 0 }: { position: Vec3; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[1.55, 0.82, 0.54]} radius={0.03} smoothness={2} position={[0, 0.41, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#F2EFE9" roughness={0.65} />
      </RoundedBox>
      <RoundedBox args={[1.6, 0.055, 0.58]} radius={0.015} smoothness={2} position={[0, 0.835, 0]} castShadow>
        <meshStandardMaterial color="#C69B6D" roughness={0.62} />
      </RoundedBox>
      {[-0.4, 0.4].map((dx) => (
        <group key={dx}>
          <mesh position={[dx, 0.41, 0.275]}>
            <boxGeometry args={[0.7, 0.68, 0.012]} />
            <meshStandardMaterial color="#E6E1D8" roughness={0.68} />
          </mesh>
          <mesh position={[dx, 0.48, 0.29]}>
            <boxGeometry args={[0.14, 0.022, 0.022]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/** Glass office partition wall with clean aluminum framing. */
const GlassPartition = memo(function GlassPartition({
  position,
  length,
  rotationY = 0,
  height = 2.45,
}: {
  position: Vec3;
  length: number;
  rotationY?: number;
  height?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Bottom & top aluminum tracks */}
      <mesh position={[0, 0.04, 0]} castShadow>
        <boxGeometry args={[length, 0.08, 0.08]} />
        <meshStandardMaterial color="#4B5563" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, height - 0.04, 0]} castShadow>
        <boxGeometry args={[length, 0.08, 0.08]} />
        <meshStandardMaterial color="#4B5563" metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Vertical mullions */}
      {[-length / 2, 0, length / 2].map((mx, i) => (
        <mesh key={i} position={[mx, height / 2, 0]} castShadow>
          <boxGeometry args={[0.065, height, 0.075]} />
          <meshStandardMaterial color="#4B5563" metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      {/* Frosted/clear architectural glass pane */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[length - 0.08, height - 0.16, 0.025]} />
        <meshPhysicalMaterial
          color="#DFF2FA"
          transparent
          opacity={0.26}
          roughness={0.12}
          metalness={0.05}
          depthWrite={false}
        />
      </mesh>
      {/* Frosted privacy stripe across middle */}
      <mesh position={[0, height * 0.5, 0.015]}>
        <planeGeometry args={[length - 0.12, 0.42]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.16} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
});

/** Meeting & Strategy Room: warm oak conference table, 6 chairs, wall display, and glass whiteboard. */
const MeetingRoomFurniture = memo(function MeetingRoomFurniture({
  tableCenter,
  zoneCenter,
}: {
  tableCenter: Vec3;
  zoneCenter: Vec3;
}) {
  const presentationTex = useMemo(() => makePresentationTexture(), []);

  return (
    <group>
      {/* Warm woven conference rug */}
      <mesh position={[tableCenter[0], 0.012, tableCenter[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5.4, 4.1]} />
        <meshStandardMaterial color="#DDD2C2" roughness={0.95} />
      </mesh>

      {/* Conference Table */}
      <group position={tableCenter}>
        <RoundedBox args={[2.9, 0.085, 1.56]} radius={0.04} smoothness={3} position={[0, 0.74, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#C89B6E" roughness={0.54} />
        </RoundedBox>
        {[
          [-1.12, -0.52],
          [1.12, -0.52],
          [-1.12, 0.52],
          [1.12, 0.52],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.36, lz]} castShadow>
            <cylinderGeometry args={[0.042, 0.032, 0.72, 10]} />
            <meshStandardMaterial color="#3F4854" metalness={0.4} roughness={0.45} />
          </mesh>
        ))}
        {/* Tabletop notebooks, laptop & ceramic centerpiece */}
        <mesh position={[-0.7, 0.79, 0.25]} rotation={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.32, 0.018, 0.24]} />
          <meshStandardMaterial color="#2563EB" roughness={0.7} />
        </mesh>
        <mesh position={[0.65, 0.79, -0.22]} rotation={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.3, 0.018, 0.22]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.8} />
        </mesh>
        {/* Centerpiece mini plant */}
        <PottedPlant position={[0, 0.78, 0]} scale={0.45} potColor="#E8DFD1" />
        {/* Meeting Chairs tucked neatly around table */}
        {[
          [-0.85, 1.02, Math.PI],
          [0.85, 1.02, Math.PI],
          [-0.85, -1.02, 0],
          [0.85, -1.02, 0],
        ].map(([cx, cz, ry], idx) => (
          <group key={idx} position={[cx, 0, cz]} rotation={[0, ry, 0]}>
            <RoundedBox args={[0.48, 0.065, 0.46]} radius={0.025} position={[0, 0.44, 0]} castShadow>
              <meshStandardMaterial color="#475569" roughness={0.82} />
            </RoundedBox>
            <RoundedBox args={[0.46, 0.42, 0.06]} radius={0.025} position={[0, 0.68, -0.2]} castShadow>
              <meshStandardMaterial color="#475569" roughness={0.82} />
            </RoundedBox>
            <mesh position={[0, 0.22, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.44, 10]} />
              <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 0.03, 14]} />
              <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.35} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Wall-mounted presentation TV screen on back wall (clear of north-east bridge doorway) */}
      <group position={[zoneCenter[0] - 1.35, 2.02, zoneCenter[2] - 3.05]}>
        <RoundedBox args={[2.35, 1.34, 0.07]} radius={0.025} castShadow>
          <meshStandardMaterial color="#1E293B" roughness={0.38} metalness={0.45} />
        </RoundedBox>
        <mesh position={[0, 0, 0.042]}>
          <planeGeometry args={[2.2, 1.2]} />
          {presentationTex ? (
            <meshStandardMaterial map={presentationTex} emissive="#FFFFFF" emissiveMap={presentationTex} emissiveIntensity={0.28} roughness={0.3} />
          ) : (
            <meshStandardMaterial color="#E2E8F0" />
          )}
        </mesh>
      </group>

      {/* Glass partition framing the Meeting Room's left edge (leaving wide doorway open) */}
      <GlassPartition position={[zoneCenter[0] - 2.65, 0, zoneCenter[2] - 0.5]} length={2.6} rotationY={Math.PI / 2} />
    </group>
  );
});

/** Cozy Break Lounge + Espresso Coffee Bar & Water Dispenser. */
const LoungeAndCafeArea = memo(function LoungeAndCafeArea({
  lounge,
  cafe,
}: {
  lounge: SatellitePad;
  cafe: SatellitePad;
}) {
  return (
    <group>
      {/* Cozy Lounge Rug & Plush Sofa */}
      <group position={lounge.center}>
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[4.8, 3.6]} />
          <meshStandardMaterial color="#E3D5C3" roughness={0.96} />
        </mesh>
        {/* Modern 3-seater fabric sofa facing into the room */}
        <group position={[-0.5, 0, 0.35]} rotation={[0, Math.PI, 0]}>
          {/* Sofa base */}
          <RoundedBox args={[2.35, 0.36, 0.92]} radius={0.07} smoothness={3} position={[0, 0.26, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#587066" roughness={0.9} />
          </RoundedBox>
          {/* Backrest */}
          <RoundedBox args={[2.35, 0.56, 0.24]} radius={0.07} smoothness={3} position={[0, 0.58, -0.34]} castShadow>
            <meshStandardMaterial color="#50675E" roughness={0.9} />
          </RoundedBox>
          {/* Armrests */}
          {[-1.08, 1.08].map((ax) => (
            <RoundedBox key={ax} args={[0.2, 0.44, 0.9]} radius={0.06} position={[ax, 0.44, 0]} castShadow>
              <meshStandardMaterial color="#50675E" roughness={0.9} />
            </RoundedBox>
          ))}
          {/* Warm accent throw pillows */}
          <RoundedBox args={[0.36, 0.32, 0.14]} radius={0.05} position={[-0.72, 0.56, -0.15]} rotation={[0.15, 0.2, 0.12]} castShadow>
            <meshStandardMaterial color="#D98254" roughness={0.92} />
          </RoundedBox>
          <RoundedBox args={[0.36, 0.32, 0.14]} radius={0.05} position={[0.72, 0.56, -0.15]} rotation={[0.15, -0.22, -0.1]} castShadow>
            <meshStandardMaterial color="#E5B769" roughness={0.92} />
          </RoundedBox>
          {/* Wooden legs */}
          {[
            [-1.0, -0.34],
            [1.0, -0.34],
            [-1.0, 0.34],
            [1.0, 0.34],
          ].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.06, lz]} castShadow>
              <cylinderGeometry args={[0.03, 0.022, 0.14, 8]} />
              <meshStandardMaterial color="#7C5A3C" roughness={0.75} />
            </mesh>
          ))}
        </group>

        {/* Round oak coffee table + magazine + mug */}
        <group position={[-0.1, 0, -1.1]}>
          <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.56, 0.56, 0.055, 24]} />
            <meshStandardMaterial color="#C89D71" roughness={0.55} />
          </mesh>
          {[0, 2.1, 4.2].map((ang, i) => (
            <mesh key={i} position={[Math.cos(ang) * 0.34, 0.2, Math.sin(ang) * 0.34]} castShadow>
              <cylinderGeometry args={[0.026, 0.02, 0.4, 8]} />
              <meshStandardMaterial color="#7C5A3C" roughness={0.72} />
            </mesh>
          ))}
          <mesh position={[-0.12, 0.44, 0.06]} rotation={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.28, 0.02, 0.22]} />
            <meshStandardMaterial color="#F8FAFC" roughness={0.8} />
          </mesh>
          <mesh position={[0.18, 0.47, -0.08]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.09, 12]} />
            <meshStandardMaterial color="#D97706" roughness={0.4} />
          </mesh>
        </group>

        {/* Warm brass standing floor lamp */}
        <group position={[1.45, 0, 0.65]}>
          <mesh position={[0, 0.025, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.22, 0.05, 16]} />
            <meshStandardMaterial color="#B48A5A" metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 1.65, 10]} />
            <meshStandardMaterial color="#B48A5A" metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, 1.72, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.26, 0.34, 18]} />
            <meshStandardMaterial color="#FFF7E6" emissive="#FDE68A" emissiveIntensity={0.55} roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* Espresso Coffee Bar & Cold/Hot Water Dispenser */}
      <group position={cafe.center}>
        {/* Wood & quartz coffee counter */}
        <RoundedBox args={[2.5, 0.88, 0.72]} radius={0.03} position={[-0.35, 0.44, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#B7895C" roughness={0.68} />
        </RoundedBox>
        <RoundedBox args={[2.58, 0.065, 0.78]} radius={0.02} position={[-0.35, 0.9, 0]} castShadow>
          <meshStandardMaterial color="#F7F4EF" roughness={0.35} />
        </RoundedBox>

        {/* Espresso / Coffee Machine */}
        <group position={[-0.85, 0.94, -0.02]}>
          <RoundedBox args={[0.52, 0.44, 0.38]} radius={0.03} position={[0, 0.22, 0]} castShadow>
            <meshStandardMaterial color="#27272A" metalness={0.55} roughness={0.32} />
          </RoundedBox>
          <mesh position={[0, 0.28, 0.2]}>
            <boxGeometry args={[0.42, 0.14, 0.04]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.75} roughness={0.22} />
          </mesh>
          {/* Coffee mugs ready on counter */}
          {[0.46, 0.62, 0.78].map((mx, i) => (
            <mesh key={i} position={[mx, 0.055, 0.08]} castShadow>
              <cylinderGeometry args={[0.048, 0.042, 0.11, 12]} />
              <meshStandardMaterial color={i === 0 ? '#FFFFFF' : i === 1 ? '#D97757' : '#588157'} roughness={0.45} />
            </mesh>
          ))}
        </group>

        {/* Standing Water Dispenser with Blue Water Jug */}
        <group position={[1.38, 0, 0]}>
          <RoundedBox args={[0.46, 1.04, 0.46]} radius={0.03} position={[0, 0.52, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#F4F4F5" roughness={0.42} />
          </RoundedBox>
          {/* Recessed tap bay */}
          <mesh position={[0, 0.72, -0.22]}>
            <boxGeometry args={[0.32, 0.24, 0.04]} />
            <meshStandardMaterial color="#D4D4D8" roughness={0.5} />
          </mesh>
          {/* Hot/Cold taps */}
          <mesh position={[-0.07, 0.78, -0.24]}>
            <boxGeometry args={[0.04, 0.05, 0.04]} />
            <meshStandardMaterial color="#EF4444" roughness={0.4} />
          </mesh>
          <mesh position={[0.07, 0.78, -0.24]}>
            <boxGeometry args={[0.04, 0.05, 0.04]} />
            <meshStandardMaterial color="#3B82F6" roughness={0.4} />
          </mesh>
          {/* Translucent blue 5-gallon water jug */}
          <mesh position={[0, 1.32, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.46, 18]} />
            <meshPhysicalMaterial color="#60A5FA" transparent opacity={0.62} roughness={0.14} metalness={0.05} />
          </mesh>
        </group>
      </group>
    </group>
  );
});

/**
 * Preserved Sunlit Modern 3D Human Office Interior (Image 1 visual identity):
 * - Warm oak plank floor with thick architectural cutaway slab
 * - Cream plaster back & left walls with panoramic sunlit windows AND open bridge portal doorways
 *   where the futuristic skybridges physically connect to external AI infrastructure
 * - Meeting Room, Break Lounge, Coffee & Water Bar, Bookshelves, Storage Cabinets, Framed Wall Art,
 *   Whiteboard, Glass Partitions, Pendant Lights, and Lush Indoor Greenery
 * - ZERO backend servers or AI infrastructure machinery inside the office
 */
function OfficeEnvironmentImpl({ layout }: { layout: OfficeLayout }) {
  const oakTex = useMemo(() => makeOakFloorTexture(), []);
  const artA = useMemo(() => makeWallArtTexture('#F7F1E5', '#3B7A57', '#E59866'), []);
  const artB = useMemo(() => makeWallArtTexture('#EFECE6', '#2B5B84', '#D4A373'), []);
  const whiteboardTex = useMemo(() => makeWhiteboardTexture(), []);

  const { minX, maxX, minZ, maxZ } = layout.floorBounds;
  const floorW = maxX - minX;
  const floorD = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const wallH = 3.55;
  const wallT = 0.34;

  const lounge = layout.satellites.find((s) => s.feature === 'lounge');
  const cafe = layout.satellites.find((s) => s.feature === 'cafe');

  // Back wall (-Z) spans between the 3 open bridge doorways at x = -9.2, 0.0, +9.2
  // Each doorway is ~2.6 wide so employees walk cleanly through into the illuminated skybridges.
  const northWallSegments: { x0: number; x1: number; hasWindow?: boolean }[] = [
    { x0: minX, x1: -10.5 },
    { x0: -7.9, x1: -1.35, hasWindow: true },
    { x0: 1.35, x1: 7.9, hasWindow: true },
    { x0: 10.5, x1: maxX },
  ];

  // Left wall (-X) spans around the West bridge doorway at z = 1.8 (doorway z = 0.5..3.1)
  const westWallSegments: { z0: number; z1: number; hasWindow?: boolean }[] = [
    { z0: minZ, z1: 0.5, hasWindow: true },
    { z0: 3.1, z1: maxZ, hasWindow: false },
  ];

  return (
    <group>
      {/* Low-Profile Architectural Office Floor Base Trim resting directly on the ground */}
      <RoundedBox
        args={[floorW + 0.28, 0.02, floorD + 0.28]}
        radius={0.01}
        smoothness={2}
        position={[centerX, 0.005, centerZ]}
        receiveShadow
      >
        <meshStandardMaterial color="#D4C7B6" roughness={0.85} />
      </RoundedBox>

      {/* Warm Oak Hardwood Main Office Floor */}
      <mesh position={[centerX, 0.012, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorW, floorD]} />
        {oakTex ? (
          <meshStandardMaterial map={oakTex} roughness={0.68} metalness={0.04} />
        ) : (
          <meshStandardMaterial color="#D5B58B" roughness={0.7} />
        )}
      </mesh>

      {/* Subtle warm workspace carpet under the Engineering desk area */}
      <mesh position={[-3.8, 0.008, -0.55]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12.2, 9.6]} />
        <meshStandardMaterial color="#EAE0D1" roughness={0.94} transparent opacity={0.46} />
      </mesh>

      {/* Warm sunlit daylight patches streaming across the oak floor from the windows */}
      {[-4.6, 4.6].map((sx, i) => (
        <mesh key={i} position={[sx, 0.011, -5.2]} rotation={[-Math.PI / 2, 0, 0.12]} raycast={() => null}>
          <planeGeometry args={[4.4, 3.4]} />
          <meshBasicMaterial color="#FFF6DA" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ))}

      {/* Clean human workplace wall signage + sticky-note sprint whiteboard */}
      <WallSign position={[-4.6, 3.28, minZ + 0.05]} title="ENGINEERING FLOOR" subtitle="Human AI Workspace" accent="#2563EB" />
      <WallSign position={[4.6, 3.28, minZ + 0.05]} title="MEETING & STRATEGY" subtitle="Team Collaboration" accent="#C2410C" />
      <group position={[minX + 0.05, 1.98, -1.8]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.56, 0.96, 0.045]} />
          <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.028]}>
          <planeGeometry args={[1.46, 0.86]} />
          {whiteboardTex ? <meshStandardMaterial map={whiteboardTex} roughness={0.35} /> : <meshStandardMaterial color="#F8FAFC" />}
        </mesh>
      </group>

      {/* Subtle Elevated Executive Oak Rug / Step for Architect Corner (`agent_builder`) */}
      {layout.builderDais && (
        <group position={[layout.builderDais.center[0], layout.builderDais.baseY, layout.builderDais.center[2]]}>
          <RoundedBox args={[3.2, layout.builderDais.topY, 2.75]} radius={0.04} smoothness={2} position={[0, layout.builderDais.topY / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#C89E72" roughness={0.62} />
          </RoundedBox>
        </group>
      )}

      {/* Back Wall (-Z) with Panoramic Sunlit Windows & Open Portal Doorways to External Bridges */}
      <group position={[0, 0, minZ - wallT / 2]}>
        {/* Continuous upper lintel beam spanning cleanly over windows & bridge portals */}
        <mesh position={[centerX, wallH - 0.24, 0]} castShadow receiveShadow>
          <boxGeometry args={[floorW + wallT * 2, 0.48, wallT]} />
          <meshStandardMaterial color="#F4EFE7" roughness={0.88} />
        </mesh>
        {northWallSegments.map((seg, idx) => {
          const segW = seg.x1 - seg.x0;
          const segCx = (seg.x0 + seg.x1) / 2;
          if (!seg.hasWindow) {
            return (
              <group key={idx} position={[segCx, 0, 0]}>
                <mesh position={[0, (wallH - 0.48) / 2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[segW, wallH - 0.48, wallT]} />
                  <meshStandardMaterial color="#F4EFE7" roughness={0.88} />
                </mesh>
                <mesh position={[0, 0.09, wallT / 2 + 0.012]}>
                  <boxGeometry args={[segW, 0.18, 0.03]} />
                  <meshStandardMaterial color="#A97F55" roughness={0.72} />
                </mesh>
              </group>
            );
          }
          const winW = Math.max(1.4, segW - 0.72);
          return (
            <group key={idx} position={[segCx, 0, 0]}>
              {/* Lower plaster wall */}
              <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
                <boxGeometry args={[segW, 1.04, wallT]} />
                <meshStandardMaterial color="#F4EFE7" roughness={0.88} />
              </mesh>
              {/* Side window pillars */}
              {[-segW / 2 + 0.18, segW / 2 - 0.18].map((px, pi) => (
                <mesh key={pi} position={[px, wallH / 2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[0.36, wallH, wallT]} />
                  <meshStandardMaterial color="#F4EFE7" roughness={0.88} />
                </mesh>
              ))}
              {/* Oak baseboard */}
              <mesh position={[0, 0.09, wallT / 2 + 0.012]}>
                <boxGeometry args={[segW, 0.18, 0.03]} />
                <meshStandardMaterial color="#A97F55" roughness={0.72} />
              </mesh>
              {/* Panoramic Window looking out onto the External Futuristic Campus */}
              <group position={[0, 2.06, 0]}>
                <mesh position={[0, 0, 0.02]}>
                  <boxGeometry args={[winW, 2.04, 0.03]} />
                  <meshPhysicalMaterial color="#CBE8FA" transparent opacity={0.28} roughness={0.08} />
                </mesh>
                <mesh position={[0, 1.02, 0.04]}>
                  <boxGeometry args={[winW + 0.06, 0.06, 0.1]} />
                  <meshStandardMaterial color="#374151" metalness={0.45} roughness={0.4} />
                </mesh>
                <mesh position={[0, -1.02, 0.04]}>
                  <boxGeometry args={[winW + 0.06, 0.08, 0.16]} />
                  <meshStandardMaterial color="#B88E63" roughness={0.62} />
                </mesh>
                <mesh position={[0, 0, 0.04]}>
                  <boxGeometry args={[0.05, 2.04, 0.08]} />
                  <meshStandardMaterial color="#374151" metalness={0.45} roughness={0.4} />
                </mesh>
              </group>
            </group>
          );
        })}
      </group>

      {/* Left Wall (-X) with Window, Framed Botanical Art & Open Portal Doorway to West Bridge */}
      <group position={[minX - wallT / 2, 0, 0]}>
        <mesh position={[0, wallH - 0.24, centerZ]} castShadow receiveShadow>
          <boxGeometry args={[wallT, 0.48, floorD]} />
          <meshStandardMaterial color="#EFE9DF" roughness={0.88} />
        </mesh>
        {westWallSegments.map((seg, idx) => {
          const segD = seg.z1 - seg.z0;
          const segCz = (seg.z0 + seg.z1) / 2;
          if (!seg.hasWindow) {
            return (
              <group key={idx} position={[0, 0, segCz]}>
                <mesh position={[0, (wallH - 0.48) / 2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[wallT, wallH - 0.48, segD]} />
                  <meshStandardMaterial color="#EFE9DF" roughness={0.88} />
                </mesh>
                <mesh position={[wallT / 2 + 0.012, 0.09, 0]}>
                  <boxGeometry args={[0.03, 0.18, segD]} />
                  <meshStandardMaterial color="#A97F55" roughness={0.72} />
                </mesh>
              </group>
            );
          }
          const winD = 3.2;
          return (
            <group key={idx} position={[0, 0, segCz]}>
              <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
                <boxGeometry args={[wallT, 1.04, segD]} />
                <meshStandardMaterial color="#EFE9DF" roughness={0.88} />
              </mesh>
              {/* Solid pillars on either side of the window (back section holds whiteboard) */}
              <mesh position={[0, wallH / 2, -segD / 2 + 0.6]} castShadow receiveShadow>
                <boxGeometry args={[wallT, wallH, 1.2]} />
                <meshStandardMaterial color="#EFE9DF" roughness={0.88} />
              </mesh>
              <mesh position={[0, wallH / 2, segD / 2 - 1.25]} castShadow receiveShadow>
                <boxGeometry args={[wallT, wallH, 2.5]} />
                <meshStandardMaterial color="#EFE9DF" roughness={0.88} />
              </mesh>
              <mesh position={[wallT / 2 + 0.012, 0.09, 0]}>
                <boxGeometry args={[0.03, 0.18, segD]} />
                <meshStandardMaterial color="#A97F55" roughness={0.72} />
              </mesh>
              {/* Side panoramic window */}
              <group position={[0, 2.06, -0.65]} rotation={[0, Math.PI / 2, 0]}>
                <mesh position={[0, 0, 0.02]}>
                  <boxGeometry args={[winD, 2.04, 0.03]} />
                  <meshPhysicalMaterial color="#CBE8FA" transparent opacity={0.28} roughness={0.08} />
                </mesh>
                <mesh position={[0, -1.02, 0.05]}>
                  <boxGeometry args={[winD + 0.06, 0.08, 0.16]} />
                  <meshStandardMaterial color="#B88E63" roughness={0.62} />
                </mesh>
                <mesh position={[0, 0, 0.04]}>
                  <boxGeometry args={[0.05, 2.04, 0.08]} />
                  <meshStandardMaterial color="#374151" metalness={0.45} roughness={0.4} />
                </mesh>
              </group>
            </group>
          );
        })}

        {/* Framed botanical wall art prints near the Break Lounge */}
        {[
          { z: 4.0, tex: artA },
          { z: 5.35, tex: artB },
        ].map((frame, i) => (
          <group key={i} position={[wallT / 2 + 0.03, 2.02, frame.z]} rotation={[0, Math.PI / 2, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.96, 1.2, 0.04]} />
              <meshStandardMaterial color="#8F6743" roughness={0.68} />
            </mesh>
            <mesh position={[0, 0, 0.024]}>
              <planeGeometry args={[0.84, 1.08]} />
              {frame.tex ? <meshStandardMaterial map={frame.tex} roughness={0.8} /> : <meshStandardMaterial color="#F8FAFC" />}
            </mesh>
          </group>
        ))}
      </group>

      {/* Glass Partition Accent Separating Meeting Room from Central Aisle */}
      <GlassPartition position={[4.2, 0, -4.8]} length={3.4} rotationY={Math.PI / 2} />

      {/* Meeting Room Conference Table, Chairs & Presentation Display */}
      <MeetingRoomFurniture tableCenter={layout.meetingTableCenter} zoneCenter={layout.meetingTableCenter} />

      {/* Break Lounge Sofa, Coffee Table, Espresso Bar & Water Dispenser */}
      {lounge && cafe && <LoungeAndCafeArea lounge={lounge} cafe={cafe} />}

      {/* Warm Office Bookshelves & Storage Cabinets (normal workplace furniture only) */}
      <Bookshelf position={[-4.6, 0, minZ + 0.34]} />
      <StorageCabinet position={[minX + 0.6, 0, -5.8]} rotationY={Math.PI / 2} />
      <StorageCabinet position={[maxX - 0.55, 0, -1.8]} rotationY={-Math.PI / 2} />
      <StorageCabinet position={[maxX - 0.55, 0, 6.2]} rotationY={-Math.PI / 2} />

      {/* Architectural Ceiling Lighting Track & Suspension System (Full Physical Structural Support) */}
      <group>
        {/* Main Architectural Matte-Black Steel Track Rail spanning across the room at wall height */}
        <mesh position={[centerX, 3.50, -4.6]} castShadow>
          <boxGeometry args={[floorW - 0.8, 0.06, 0.08]} />
          <meshStandardMaterial color="#1E293B" roughness={0.5} metalness={0.7} />
        </mesh>

        {/* Structural Cross-Tie Girders connecting back wall upper lintel beam to the track rail */}
        {[-5.4, 0.0, 5.8].map((gx, i) => {
          const tieZ = (minZ + -4.6) / 2;
          const tieLen = Math.abs(-4.6 - minZ);
          return (
            <mesh key={`tie-${i}`} position={[gx, 3.50, tieZ]} castShadow>
              <boxGeometry args={[0.06, 0.06, tieLen]} />
              <meshStandardMaterial color="#1E293B" roughness={0.5} metalness={0.7} />
            </mesh>
          );
        })}

        {/* Left Wall Anchor Bracket for Track Rail */}
        <mesh position={[minX + 0.04, 3.50, -4.6]} castShadow>
          <boxGeometry args={[0.08, 0.16, 0.16]} />
          <meshStandardMaterial color="#0F172A" roughness={0.4} metalness={0.8} />
        </mesh>

        {/* Warm Ceiling Pendant Lamps suspended cleanly with full support drop rods */}
        {[-5.4, 0.0, 5.8].map((lx, i) => {
          const lampY = 2.65;
          const trackY = 3.50;
          const dropHeight = trackY - lampY;
          return (
            <group key={i} position={[lx, lampY, -4.6]}>
              {/* Ceiling Mounting Canopy attached to track rail */}
              <mesh position={[0, dropHeight, 0]}>
                <cylinderGeometry args={[0.045, 0.045, 0.03, 16]} />
                <meshStandardMaterial color="#0F172A" roughness={0.4} metalness={0.8} />
              </mesh>
              {/* Continuous Steel Suspension Drop Rod connecting canopy to lamp */}
              <mesh position={[0, dropHeight / 2, 0]}>
                <cylinderGeometry args={[0.008, 0.008, dropHeight, 8]} />
                <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
              </mesh>
              {/* Upper shade collar socket */}
              <mesh position={[0, 0.11, 0]} castShadow>
                <cylinderGeometry args={[0.035, 0.045, 0.06, 16]} />
                <meshStandardMaterial color="#0F172A" roughness={0.4} metalness={0.8} />
              </mesh>
              {/* Matte-Black Spun Aluminum Lamp Shade */}
              <mesh castShadow>
                <cylinderGeometry args={[0.16, 0.38, 0.16, 24]} />
                <meshStandardMaterial color="#1E293B" roughness={0.38} metalness={0.65} />
              </mesh>
              {/* Warm Glowing Bulb inside shade */}
              <mesh position={[0, -0.05, 0]}>
                <sphereGeometry args={[0.09, 14, 14]} />
                <meshStandardMaterial color="#FFFBEB" emissive="#FDE68A" emissiveIntensity={1.6} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Lush Indoor Trees & Potted Greenery throughout the central human office */}
      <IndoorTree position={[minX + 0.95, 0, minZ + 0.95]} scale={1.15} potColor="#C67855" />
      <IndoorTree position={[maxX - 0.95, 0, minZ + 0.95]} scale={1.15} potColor="#E5DDD0" />
      <IndoorTree position={[minX + 0.95, 0, maxZ - 0.95]} scale={1.1} potColor="#B86C4B" />
      <IndoorTree position={[maxX - 0.95, 0, maxZ - 0.95]} scale={1.15} potColor="#E2D9CB" />
      <IndoorTree position={[-6.8, 0, -7.5]} scale={0.95} potColor="#C87D58" />
      <IndoorTree position={[3.2, 0, -7.5]} scale={0.95} potColor="#E5DDD0" />
      <PottedPlant position={[-3.8, 0, 5.8]} scale={1.05} potColor="#F0E9DE" />
      <PottedPlant position={[4.8, 0, 5.4]} scale={1.0} potColor="#C67855" />
      <PottedPlant position={[8.5, 0, maxZ - 1.1]} scale={1.1} potColor="#5B7065" />
      <PottedPlant position={[minX + 0.6, 0, -2.6]} scale={0.95} potColor="#E6DFD3" />
    </group>
  );
}

export const OfficeEnvironment = memo(OfficeEnvironmentImpl);
