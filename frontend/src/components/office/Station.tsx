import { memo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group, MeshBasicMaterial, MeshStandardMaterial, Sprite, SpriteMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import type { OfficePalette } from './Desk';
import { Halo } from './glow';
import type { Vec3 } from './officeLayout';

/** Module calls often finish in milliseconds; keep a station lit briefly so activity is perceptible. */
const SERVING_LINGER_S = 1.1;

function isServing(moduleId: string): boolean {
  const s = useTelemetryStore.getState();
  const mod = s.modules[moduleId];
  if (!mod) return false;
  if (mod.state === 'busy' || mod.state === 'booting') return true;
  const calls = s.moduleCalls[moduleId];
  const last = calls && calls.length ? calls[calls.length - 1].startedAt : 0;
  return Date.now() / 1000 - last < SERVING_LINGER_S;
}

type Accent = React.Ref<MeshStandardMaterial>;

function AccentMaterial({ accentRef, color }: { accentRef: Accent; color: string }) {
  return <meshStandardMaterial ref={accentRef} color="#0A0B0F" emissive={color} emissiveIntensity={0.5} toneMapped={false} />;
}

/** Distinct silhouettes so each department reads at a glance. */
function Fixture({ id, palette, accent, color, spin }: { id: string; palette: OfficePalette; accent: Accent; color: string; spin: React.Ref<Group> }) {
  switch (id) {
    case 'guardrails': // security gate
      return (
        <group>
          {[-0.95, 0.95].map((x) => (
            <mesh key={x} position={[x, 1.0, 0]} castShadow>
              <boxGeometry args={[0.26, 2.0, 0.34]} />
              <meshStandardMaterial color={palette.deskLeg} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 2.06, 0]} castShadow>
            <boxGeometry args={[2.16, 0.18, 0.34]} />
            <meshStandardMaterial color={palette.deskLeg} />
          </mesh>
          <mesh position={[0, 1.0, 0]}>
            <planeGeometry args={[1.62, 1.86]} />
            <meshStandardMaterial ref={accent} color="#000000" emissive={color} emissiveIntensity={0.4} transparent opacity={0.28} side={2} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'intent_detection': // reception counter with a holo screen
      return (
        <group>
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.3, 1.0, 0.7]} />
            <meshStandardMaterial color={palette.deskTop} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.62, 0.36]}>
            <boxGeometry args={[2.1, 0.06, 0.01]} />
            <AccentMaterial accentRef={accent} color={color} />
          </mesh>
          <mesh position={[0, 1.55, -0.1]}>
            <planeGeometry args={[1.3, 0.62]} />
            <meshBasicMaterial color={color} transparent opacity={0.22} side={2} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'short_term_memory': // whiteboard
      return (
        <group>
          {[-1.0, 1.0].map((x) => (
            <mesh key={x} position={[x, 0.85, 0]} castShadow>
              <boxGeometry args={[0.06, 1.7, 0.06]} />
              <meshStandardMaterial color={palette.deskLeg} />
            </mesh>
          ))}
          <mesh position={[0, 1.35, 0.02]} castShadow>
            <boxGeometry args={[2.1, 1.15, 0.05]} />
            <meshStandardMaterial color={palette.deskTop} roughness={0.3} />
          </mesh>
          {[[-0.55, 1.55], [0.1, 1.42], [0.6, 1.62], [-0.2, 1.12], [0.5, 1.15]].map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0.05]}>
              <planeGeometry args={[0.32, 0.22]} />
              {i === 0 ? <AccentMaterial accentRef={accent} color={color} /> : <meshBasicMaterial color={color} transparent opacity={0.35} toneMapped={false} />}
            </mesh>
          ))}
        </group>
      );
    case 'long_term_memory': // archive vault
      return (
        <group>
          <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.8, 0.8, 1.7, 40]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.9, 0.81]}>
            <torusGeometry args={[0.38, 0.045, 12, 40]} />
            <AccentMaterial accentRef={accent} color={color} />
          </mesh>
          <group ref={spin} position={[0, 0.9, 0.83]}>
            {[0, 1, 2].map((k) => (
              <mesh key={k} rotation={[0, 0, (k * Math.PI) / 3]}>
                <boxGeometry args={[0.6, 0.04, 0.02]} />
                <meshBasicMaterial color={color} toneMapped={false} />
              </mesh>
            ))}
          </group>
        </group>
      );
    case 'tool_orchestration': // workbench with a spinning gear
      return (
        <group>
          <mesh position={[0, 0.86, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.3, 0.1, 0.95]} />
            <meshStandardMaterial color={palette.deskTop} />
          </mesh>
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[sx * 1.05, 0.42, sz * 0.38]}>
              <boxGeometry args={[0.07, 0.84, 0.07]} />
              <meshStandardMaterial color={palette.deskLeg} />
            </mesh>
          )))}
          {[[-0.7, 0.18], [-0.35, 0.12], [0.75, 0.22]].map(([x, h], i) => (
            <mesh key={i} position={[x, 0.91 + h / 2, -0.1]} castShadow>
              <boxGeometry args={[0.24, h, 0.24]} />
              <meshStandardMaterial color={palette.deskLeg} />
            </mesh>
          ))}
          <group ref={spin} position={[0.15, 1.36, 0]}>
            <mesh>
              <torusGeometry args={[0.3, 0.07, 10, 8]} />
              <AccentMaterial accentRef={accent} color={color} />
            </mesh>
          </group>
        </group>
      );
    case 'agentic_rag': // library bookshelf with glowing volumes being pulled
      return (
        <group>
          <mesh position={[0, 1.0, -0.15]} castShadow>
            <boxGeometry args={[2.2, 2.0, 0.45]} />
            <meshStandardMaterial color={palette.deskLeg} roughness={0.6} />
          </mesh>
          {[0.45, 1.0, 1.55].map((y) => (
            <group key={y} position={[0, y, 0.1]}>
              {[-0.8, -0.5, -0.25, 0.05, 0.35, 0.65].map((x, i) => (
                <mesh key={x} position={[x, 0.17, 0]}>
                  <boxGeometry args={[0.18, 0.34 - (i % 3) * 0.04, 0.05]} />
                  {i === 2 && y === 1.0 ? <AccentMaterial accentRef={accent} color={color} /> : <meshBasicMaterial color={color} transparent opacity={0.18 + (i % 3) * 0.08} toneMapped={false} />}
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );
    case 'vector_db': // server rack with LED rows
      return (
        <group>
          {[-0.55, 0.55].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 1.0, 0]} castShadow>
                <boxGeometry args={[0.9, 2.0, 0.8]} />
                <meshStandardMaterial color="#0E1015" metalness={0.5} roughness={0.35} />
              </mesh>
              {[0.35, 0.6, 0.85, 1.1, 1.35, 1.6].map((y, i) => (
                <mesh key={y} position={[0, y, 0.41]}>
                  <planeGeometry args={[0.7, 0.05]} />
                  {i === 2 && x < 0 ? <AccentMaterial accentRef={accent} color={color} /> : <meshBasicMaterial color={color} transparent opacity={0.25 + (i % 2) * 0.2} toneMapped={false} />}
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );
    case 'finops': // ledger desk with coin stacks
      return (
        <group>
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.0, 1.0, 0.8]} />
            <meshStandardMaterial color={palette.deskTop} roughness={0.5} />
          </mesh>
          {[[-0.6, 3], [-0.25, 5], [0.1, 2], [0.5, 4]].map(([x, n]) => (
            <group key={x} position={[x, 1.0, 0]}>
              {Array.from({ length: n }, (_, k) => (
                <mesh key={k} position={[0, 0.03 + k * 0.06, 0]}>
                  <cylinderGeometry args={[0.12, 0.12, 0.05, 20]} />
                  {k === n - 1 && x === -0.25 ? <AccentMaterial accentRef={accent} color={color} /> : <meshStandardMaterial color="#C9A227" metalness={0.7} roughness={0.3} />}
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );
    case 'promptops': // podium with a teleprompter screen
      return (
        <group>
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.45, 1.1, 6]} />
            <meshStandardMaterial color={palette.deskLeg} />
          </mesh>
          <mesh position={[0, 1.55, -0.05]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[1.5, 0.85, 0.04]} />
            <meshStandardMaterial color="#07080B" />
          </mesh>
          <mesh position={[0, 1.55, -0.02]} rotation={[-0.25, 0, 0]}>
            <planeGeometry args={[1.38, 0.74]} />
            <AccentMaterial accentRef={accent} color={color} />
          </mesh>
        </group>
      );
    case 'auditability': // filing cabinet + hash-chain sculpture
      return (
        <group>
          <mesh position={[-0.45, 0.8, 0]} castShadow>
            <boxGeometry args={[0.9, 1.6, 0.8]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.3} roughness={0.5} />
          </mesh>
          {[0.35, 0.8, 1.25].map((y) => (
            <mesh key={y} position={[-0.45, y, 0.41]}>
              <boxGeometry args={[0.7, 0.32, 0.02]} />
              <meshStandardMaterial color={palette.deskTop} />
            </mesh>
          ))}
          <group ref={spin} position={[0.6, 1.1, 0]}>
            {[0, 1, 2].map((k) => (
              <mesh key={k} position={[0, (k - 1) * 0.32, 0]} rotation={[0, k % 2 ? Math.PI / 2 : 0, 0]}>
                <torusGeometry args={[0.16, 0.035, 10, 24]} />
                {k === 1 ? <AccentMaterial accentRef={accent} color={color} /> : <meshBasicMaterial color={color} transparent opacity={0.5} toneMapped={false} />}
              </mesh>
            ))}
          </group>
        </group>
      );
    default:
      return (
        <mesh position={[0, 0.8, 0]} castShadow>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <AccentMaterial accentRef={accent} color={color} />
        </mesh>
      );
  }
}

function StationImpl({ id, position, palette, showLabel }: { id: string; position: Vec3; palette: OfficePalette; showLabel: boolean }) {
  const mod = useTelemetryStore((s) => s.modules[id]);
  const selected = useTelemetryStore((s) => s.selectedModuleId === id);
  const selectModule = useTelemetryStore((s) => s.selectModule);
  const accent = useRef<MeshStandardMaterial>(null);
  const pad = useRef<MeshBasicMaterial>(null);
  const halo = useRef<Sprite>(null);
  const spin = useRef<Group>(null);
  const beam = useRef<MeshBasicMaterial>(null);
  // Name tags only while in action, hovered or selected (or when "Always" is on): the floor stays clean.
  const [hovered, setHovered] = useState(false);
  // A module in action shows its tag on its own (serving is computed per frame: re-render only on change).
  const [inAction, setInAction] = useState(false);
  const inActionRef = useRef(false);
  const hoveredRef = useRef(false);

  useFrame(({ clock }, delta) => {
    const live = useTelemetryStore.getState().modules[id];
    if (!live) return;
    const t = clock.elapsedTime;
    const serving = isServing(id);
    if (serving !== inActionRef.current) {
      inActionRef.current = serving;
      setInAction(serving);
    }
    const wave = 0.5 + 0.5 * Math.sin(t * 6 + position[0]);
    const offline = live.state === 'offline';
    if (accent.current) accent.current.emissiveIntensity = serving ? 1.6 + 1.4 * wave : offline ? 0.12 : 0.55;
    if (pad.current) pad.current.opacity = selected ? 0.75 : serving ? 0.4 + 0.3 * wave : hoveredRef.current ? 0.32 : offline ? 0.05 : 0.14;
    if (beam.current) beam.current.opacity = serving ? 0.06 + 0.06 * wave : 0; // a faint light column while it serves
    if (halo.current) {
      const size = serving ? 3.0 + 0.5 * wave : 1.6;
      halo.current.scale.set(size, size, 1);
      (halo.current.material as SpriteMaterial).opacity = serving ? 0.5 + 0.2 * wave : offline ? 0.0 : 0.1;
    }
    if (spin.current) spin.current.rotation.z += delta * (serving ? 4 : 0.25);
  });

  if (!mod) return null;
  // Violet is the module color; offline / spinning-up / error override it. Brightness carries activity.
  const color = MODULE_STATE_STYLES[mod.state === 'idle' ? 'busy' : mod.state].color;
  const stateStyle = MODULE_STATE_STYLES[mod.state];

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectModule(id, 'office');
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = on ? 'pointer' : '';
    hoveredRef.current = on;
    setHovered(on);
  };

  return (
    <group position={position} onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      <mesh position={[0, 2.6, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.3, 0.8, 5.2, 24, 1, true]} />
        <meshBasicMaterial ref={beam} color={color} transparent opacity={0} depthWrite={false} toneMapped={false} side={2} />
      </mesh>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[3.3, 0.06, 2.3]} />
        <meshStandardMaterial color={palette.wall} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, 0]}>
        <planeGeometry args={[3.5, 2.5]} />
        <meshBasicMaterial ref={pad} color={selected ? '#2DD4FF' : color} transparent opacity={0.12} toneMapped={false} />
      </mesh>
      <group position={[0, 0.06, 0]}>
        <Fixture id={id} palette={palette} accent={accent} color={color} spin={spin} />
      </group>
      <Halo ref={halo} color={color} position={[0, 1.4, 0.3]} opacity={0.1} />

      {(showLabel || inAction || hovered || selected) && (
        <Html position={[0, 2.75, 0]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex flex-col items-center whitespace-nowrap rounded-lg border px-2 py-1 backdrop-blur-md ${
              selected ? 'border-sky-400/70 bg-sky-950/70' : 'border-violet-300/25 bg-black/55'
            }`}
          >
            <span className="text-[11px] font-semibold text-white">{mod.label}</span>
            <span className={`flex items-center gap-1 font-mono text-[9.5px] ${stateStyle.text}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateStyle.color }} />
              {stateStyle.label} · {mod.totalCalls} calls
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

export const Station = memo(StationImpl);
