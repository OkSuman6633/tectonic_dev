import { memo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { DoubleSide, type Group, type MeshBasicMaterial, type MeshStandardMaterial, type Sprite, type SpriteMaterial } from 'three';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { MODULE_STATE_STYLES } from '../command/ModuleNode';
import type { OfficePalette } from './Desk';
import { BeaconRing, Halo } from './glow';
import { moduleZoneKind, type Vec3 } from './officeLayout';

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
  return <meshStandardMaterial ref={accentRef} color="#071024" emissive={color} emissiveIntensity={0.75} toneMapped={false} />;
}

/**
 * Distinct futuristic geometric installations for each real Tectonic module:
 * - long_term_memory: Luminous Royal-Violet 5-Tier Stepped Pyramid Ziggurat + Golden Beacon Ring
 * - short_term_memory: Layered Translucent Glass Data Vault + Amber/Violet Cache Strata
 * - tool_orchestration: Dense Hot-Pink, Rose, Silver & Cyan Execution Tower Matrix + Pink Beacon Ring
 * - guardrails: Cybernetic Turquoise Hexagonal Shield Portal + Twin Scanner Pylons
 * - intent_detection: Crystalline Cyan Neural Prism Array + Translucent Glass Cubes
 */
function Fixture({ id, palette, accent, color, spin }: { id: string; palette: OfficePalette; accent: Accent; color: string; spin: React.Ref<Group> }) {
  switch (id) {
    case 'guardrails': // Cybernetic Turquoise Security Shield Portal & dual laser scanner pylons
      return (
        <group>
          {[-1.08, 1.08].map((x) => (
            <group key={x} position={[x, 1.15, 0]}>
              <RoundedBox args={[0.34, 2.3, 0.44]} radius={0.05} smoothness={2} castShadow>
                <meshStandardMaterial color={palette.deskLeg} metalness={0.68} roughness={0.28} />
              </RoundedBox>
              <mesh position={[0, 0, 0.23]}>
                <boxGeometry args={[0.065, 1.95, 0.02]} />
                <meshBasicMaterial color="#14B8A6" transparent opacity={0.85} toneMapped={false} />
              </mesh>
              <mesh position={[0, 0, -0.23]}>
                <boxGeometry args={[0.05, 1.95, 0.02]} />
                <meshBasicMaterial color="#2DD4FF" transparent opacity={0.65} toneMapped={false} />
              </mesh>
            </group>
          ))}
          <RoundedBox args={[2.52, 0.24, 0.5]} radius={0.05} smoothness={2} position={[0, 2.32, 0]} castShadow>
            <meshStandardMaterial color={palette.deskTop} metalness={0.7} roughness={0.26} />
          </RoundedBox>
          <mesh position={[0, 2.46, 0]}>
            <boxGeometry args={[2.2, 0.025, 0.08]} />
            <meshBasicMaterial color="#22D3EE" toneMapped={false} />
          </mesh>
          {/* Translucent hexagonal holographic shield barrier */}
          <mesh position={[0, 1.15, 0]}>
            <planeGeometry args={[1.76, 1.98]} />
            <meshStandardMaterial
              ref={accent}
              color="#041524"
              emissive={color}
              emissiveIntensity={0.6}
              transparent
              opacity={0.36}
              side={DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <group ref={spin} position={[0, 1.15, 0.06]}>
            <mesh>
              <ringGeometry args={[0.45, 0.54, 6]} />
              <meshBasicMaterial color="#22D3EE" transparent opacity={0.85} side={DoubleSide} toneMapped={false} />
            </mesh>
            <mesh>
              <ringGeometry args={[0.24, 0.29, 6]} />
              <meshBasicMaterial color="#E0F2FE" transparent opacity={0.85} side={DoubleSide} toneMapped={false} />
            </mesh>
          </group>
          <BeaconRing position={[0, 3.05, 0]} color="#22D3EE" radius={0.38} phase={0.5} />
        </group>
      );

    case 'intent_detection': // Crystalline Turquoise/Cyan Neural Prism Array & Translucent Data Cubes
      return (
        <group>
          <RoundedBox args={[2.5, 0.62, 1.05]} radius={0.05} smoothness={2} position={[0, 0.31, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={palette.deskTop} metalness={0.62} roughness={0.3} />
          </RoundedBox>
          <mesh position={[0, 0.42, 0.54]}>
            <boxGeometry args={[2.24, 0.06, 0.02]} />
            <AccentMaterial accentRef={accent} color={color} />
          </mesh>
          {/* Flanking translucent glass cubes */}
          {[-0.95, 0.95].map((cx, i) => (
            <RoundedBox key={cx} args={[0.46, 0.46, 0.46]} radius={0.04} smoothness={2} position={[cx, 0.86, 0.14]} castShadow>
              <meshPhysicalMaterial
                color={i === 0 ? '#06B6D4' : '#38BDF8'}
                emissive={i === 0 ? '#06B6D4' : '#38BDF8'}
                emissiveIntensity={0.32}
                metalness={0.3}
                roughness={0.16}
                transparent
                opacity={0.78}
              />
            </RoundedBox>
          ))}
          {/* Tiered neural classification translucent holographic screens */}
          {[-0.58, 0, 0.58].map((x, idx) => (
            <mesh key={x} position={[x, 1.38 + (idx === 1 ? 0.18 : 0), -0.14]} rotation={[0, idx === 0 ? 0.22 : idx === 2 ? -0.22 : 0, 0]}>
              <planeGeometry args={[0.72, 0.62]} />
              <meshBasicMaterial color={idx === 1 ? color : '#22D3EE'} transparent opacity={idx === 1 ? 0.42 : 0.26} side={DoubleSide} toneMapped={false} />
            </mesh>
          ))}
          <group ref={spin} position={[0, 1.48, 0.16]}>
            <mesh>
              <octahedronGeometry args={[0.25, 0]} />
              <meshBasicMaterial color="#2DD4FF" wireframe toneMapped={false} />
            </mesh>
            <mesh>
              <octahedronGeometry args={[0.14, 0]} />
              <meshBasicMaterial color="#E0F2FE" toneMapped={false} />
            </mesh>
          </group>
          <BeaconRing position={[0, 2.65, 0]} color="#38BDF8" radius={0.36} phase={1.8} />
        </group>
      );

    case 'short_term_memory': // Layered Translucent Volatile Memory Vault + Luminous Data Blocks
      return (
        <group>
          {/* Four corner obsidian structural conduits */}
          {[-0.98, 0.98].flatMap((x) =>
            [-0.48, 0.48].map((z) => (
              <mesh key={`${x}:${z}`} position={[x, 1.05, z]} castShadow>
                <boxGeometry args={[0.11, 2.1, 0.11]} />
                <meshStandardMaterial color="#181C30" metalness={0.74} roughness={0.26} />
              </mesh>
            )),
          )}
          {/* Layered floating luminous glass memory strata */}
          {[0.34, 0.72, 1.1, 1.48, 1.86].map((y, idx) => {
            const tierAccent = idx % 2 === 0 ? '#A855F7' : '#F59E0B';
            return (
              <group key={y} position={[0, y, 0]}>
                <RoundedBox args={[1.76, 0.17, 1.02]} radius={0.03} smoothness={2} castShadow>
                  <meshPhysicalMaterial
                    color={idx === 2 ? '#7C3AED' : '#241B42'}
                    emissive={tierAccent}
                    emissiveIntensity={idx === 2 ? 0.42 : 0.2}
                    metalness={0.4}
                    roughness={0.2}
                    transparent
                    opacity={0.86}
                  />
                </RoundedBox>
                <mesh position={[0, 0, 0.52]}>
                  <boxGeometry args={[1.56, 0.048, 0.02]} />
                  {idx === 2 ? (
                    <AccentMaterial accentRef={accent} color={color} />
                  ) : (
                    <meshBasicMaterial color={tierAccent} transparent opacity={0.82} toneMapped={false} />
                  )}
                </mesh>
                <mesh position={[0.89, 0, 0]}>
                  <boxGeometry args={[0.02, 0.042, 0.84]} />
                  <meshBasicMaterial color={tierAccent} transparent opacity={0.68} toneMapped={false} />
                </mesh>
              </group>
            );
          })}
          {/* Rotating holographic cache ring & data cube */}
          <group ref={spin} position={[0, 2.3, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.4, 0.028, 10, 32]} />
              <meshBasicMaterial color="#FBBF24" toneMapped={false} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.24, 0.24, 0.24]} />
              <meshBasicMaterial color="#C084FC" wireframe toneMapped={false} />
            </mesh>
          </group>
        </group>
      );

    case 'long_term_memory': // Iconic Luminous Royal-Violet 5-Tier Stepped Pyramid / Ziggurat + Warm Gold Beacon Halo
      return (
        <group>
          {/* 5 crisp concentric stepped luminous violet/amethyst pyramid terraces */}
          {[
            { size: 2.6, h: 0.36, y: 0.18, c: '#6D28D9', e: '#8B5CF6', edge: '#D8B4FE' },
            { size: 2.16, h: 0.36, y: 0.54, c: '#7C3AED', e: '#A855F7', edge: '#E9D5FF' },
            { size: 1.72, h: 0.36, y: 0.90, c: '#8B5CF6', e: '#C084FC', edge: '#F3E8FF' },
            { size: 1.28, h: 0.36, y: 1.26, c: '#A855F7', e: '#D946EF', edge: '#FDE68A' },
            { size: 0.86, h: 0.36, y: 1.62, c: '#C084FC', e: '#E879F9', edge: '#FEF3C7' },
          ].map((tier, idx) => (
            <group key={idx} position={[0, tier.y, 0]}>
              <RoundedBox args={[tier.size, tier.h, tier.size]} radius={0.04} smoothness={2} castShadow receiveShadow>
                <meshPhysicalMaterial
                  color={tier.c}
                  emissive={tier.e}
                  emissiveIntensity={0.42 + idx * 0.08}
                  metalness={0.32}
                  roughness={0.18}
                  transparent
                  opacity={0.92}
                />
              </RoundedBox>
              {/* Crisp glowing front & right step trim strips */}
              <mesh position={[0, tier.h / 2 - 0.02, tier.size / 2 + 0.01]}>
                <boxGeometry args={[tier.size - 0.08, 0.032, 0.018]} />
                {idx === 2 ? (
                  <AccentMaterial accentRef={accent} color={color} />
                ) : (
                  <meshBasicMaterial color={tier.edge} transparent opacity={0.85} toneMapped={false} />
                )}
              </mesh>
              <mesh position={[tier.size / 2 + 0.01, tier.h / 2 - 0.02, 0]}>
                <boxGeometry args={[0.018, 0.032, tier.size - 0.08]} />
                <meshBasicMaterial color={tier.edge} transparent opacity={0.78} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {/* Apex spinning crystalline memory prism */}
          <group ref={spin} position={[0, 2.08, 0]}>
            <mesh>
              <octahedronGeometry args={[0.26, 0]} />
              <meshBasicMaterial color="#E9D5FF" toneMapped={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.42, 0.02, 10, 32]} />
              <meshBasicMaterial color="#C084FC" transparent opacity={0.8} toneMapped={false} />
            </mesh>
          </group>
          {/* Iconic glowing Warm-Gold / White Beacon Halo hovering over the Violet Pyramid */}
          <BeaconRing position={[0, 2.85, 0]} color="#FBBF24" radius={0.54} phase={1.1} />
        </group>
      );

    case 'tool_orchestration': // Dense Futuristic Magenta/Pink/Silver & Cyan Geometric Execution Tower Matrix
      return (
        <group>
          {/* Heavy metallic execution foundation plinth */}
          <RoundedBox args={[3.35, 0.34, 2.55]} radius={0.05} smoothness={2} position={[0, 0.17, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#181228" metalness={0.68} roughness={0.3} />
          </RoundedBox>
          <mesh position={[0, 0.35, 1.28]}>
            <boxGeometry args={[3.1, 0.03, 0.025]} />
            <meshBasicMaterial color="#EC4899" toneMapped={false} />
          </mesh>

          {/* Dense miniature city-matrix of rose, hot-pink, silver & electric-cyan towers */}
          {[
            { x: -1.15, z: -0.68, w: 0.56, d: 0.56, h: 1.45, c: '#EC4899', glass: true },
            { x: -0.42, z: -0.78, w: 0.62, d: 0.62, h: 2.15, c: '#F472B6', glass: false },
            { x: 0.38, z: -0.72, w: 0.66, d: 0.66, h: 2.45, c: '#2DD4FF', glass: true },
            { x: 1.12, z: -0.64, w: 0.54, d: 0.54, h: 1.62, c: '#E2E8F0', glass: false },
            { x: -1.08, z: 0.14, w: 0.58, d: 0.58, h: 1.82, c: '#CBD5E1', glass: false },
            { x: -0.22, z: 0.12, w: 0.72, d: 0.72, h: 2.05, c: '#DB2777', glass: true },
            { x: 0.65, z: 0.18, w: 0.58, d: 0.58, h: 1.55, c: '#38BDF8', glass: true },
            { x: 1.24, z: 0.25, w: 0.44, d: 0.44, h: 1.1, c: '#F472B6', glass: false },
            { x: -0.92, z: 0.85, w: 0.52, d: 0.52, h: 0.92, c: '#F43F5E', glass: false },
            { x: -0.15, z: 0.88, w: 0.58, d: 0.48, h: 0.76, c: '#22D3EE', glass: true },
            { x: 0.62, z: 0.84, w: 0.54, d: 0.52, h: 1.05, c: '#EC4899', glass: false },
          ].map((tower, idx) => (
            <group key={idx} position={[tower.x, 0.34 + tower.h / 2, tower.z]}>
              <RoundedBox args={[tower.w, tower.h, tower.d]} radius={0.035} smoothness={2} castShadow>
                {tower.glass ? (
                  <meshPhysicalMaterial
                    color={tower.c}
                    emissive={tower.c}
                    emissiveIntensity={0.34}
                    metalness={0.28}
                    roughness={0.14}
                    transparent
                    opacity={0.78}
                  />
                ) : (
                  <meshStandardMaterial
                    color={tower.c}
                    emissive={tower.c}
                    emissiveIntensity={0.16}
                    metalness={0.58}
                    roughness={0.26}
                  />
                )}
              </RoundedBox>
              {/* Luminous horizontal telemetry bars on key towers */}
              {idx % 2 === 0 && (
                <mesh position={[0, tower.h * 0.22, tower.d / 2 + 0.01]}>
                  <boxGeometry args={[tower.w * 0.72, 0.055, 0.016]} />
                  {idx === 2 ? (
                    <AccentMaterial accentRef={accent} color="#2DD4FF" />
                  ) : (
                    <meshBasicMaterial color={idx % 4 === 0 ? '#2DD4FF' : '#FBCFE8'} transparent opacity={0.9} toneMapped={false} />
                  )}
                </mesh>
              )}
              {/* Glowing roof cap */}
              <mesh position={[0, tower.h / 2 + 0.012, 0]}>
                <boxGeometry args={[tower.w * 0.84, 0.022, tower.d * 0.84]} />
                <meshBasicMaterial color={tower.c} transparent opacity={0.85} toneMapped={false} />
              </mesh>
            </group>
          ))}

          {/* Overhead cyan optical execution bridge linking core towers */}
          <mesh position={[0.02, 2.25, -0.32]}>
            <boxGeometry args={[2.15, 0.06, 0.1]} />
            <meshBasicMaterial color="#2DD4FF" transparent opacity={0.82} toneMapped={false} />
          </mesh>

          {/* Orbiting cyan + magenta execution core */}
          <group ref={spin} position={[0.08, 2.85, -0.1]}>
            <mesh rotation={[Math.PI / 3, 0.3, 0]}>
              <torusGeometry args={[0.42, 0.032, 12, 28]} />
              <meshBasicMaterial color="#2DD4FF" toneMapped={false} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.26, 0.26, 0.26]} />
              <meshBasicMaterial color="#F472B6" wireframe toneMapped={false} />
            </mesh>
          </group>

          {/* Iconic Pink/White Halo Beacon hovering above Tool Orchestration */}
          <BeaconRing position={[0.08, 3.65, -0.1]} color="#EC4899" radius={0.58} phase={2.4} />
        </group>
      );

    case 'agentic_rag': // Holographic knowledge crystal archive
      return (
        <group>
          <RoundedBox args={[2.25, 2.05, 0.52]} radius={0.05} smoothness={2} position={[0, 1.02, -0.12]} castShadow>
            <meshStandardMaterial color={palette.deskLeg} metalness={0.62} roughness={0.3} />
          </RoundedBox>
          {[0.45, 1.02, 1.58].map((y) => (
            <group key={y} position={[0, y, 0.16]}>
              {[-0.8, -0.5, -0.22, 0.08, 0.38, 0.68].map((x, i) => (
                <mesh key={x} position={[x, 0.16, 0]}>
                  <boxGeometry args={[0.18, 0.34 - (i % 3) * 0.04, 0.06]} />
                  {i === 2 && y === 1.02 ? (
                    <AccentMaterial accentRef={accent} color={color} />
                  ) : (
                    <meshBasicMaterial color={i % 2 === 0 ? '#A855F7' : '#38BDF8'} transparent opacity={0.45 + (i % 3) * 0.12} toneMapped={false} />
                  )}
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );

    case 'vector_db': // Dual luminous glass vector monoliths
      return (
        <group>
          {[-0.58, 0.58].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <RoundedBox args={[0.92, 2.05, 0.82]} radius={0.04} smoothness={2} position={[0, 1.02, 0]} castShadow>
                <meshPhysicalMaterial color="#181734" emissive="#8B5CF6" emissiveIntensity={0.22} metalness={0.45} roughness={0.2} transparent opacity={0.86} />
              </RoundedBox>
              {[0.38, 0.68, 0.98, 1.28, 1.58].map((y, i) => (
                <mesh key={y} position={[0, y, 0.42]}>
                  <planeGeometry args={[0.72, 0.055]} />
                  {i === 2 && x < 0 ? (
                    <AccentMaterial accentRef={accent} color={color} />
                  ) : (
                    <meshBasicMaterial color={i % 2 === 0 ? '#C084FC' : '#FBBF24'} transparent opacity={0.62} toneMapped={false} />
                  )}
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );

    case 'finops': // Luminous golden metering stacks
      return (
        <group>
          <RoundedBox args={[2.1, 0.72, 0.9]} radius={0.04} smoothness={2} position={[0, 0.36, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={palette.deskTop} metalness={0.6} roughness={0.3} />
          </RoundedBox>
          {[
            [-0.64, 3],
            [-0.22, 5],
            [0.2, 4],
            [0.62, 6],
          ].map(([x, n]) => (
            <group key={x} position={[x, 0.74, 0]}>
              {Array.from({ length: n }, (_, k) => (
                <mesh key={k} position={[0, 0.04 + k * 0.09, 0]}>
                  <cylinderGeometry args={[0.14, 0.14, 0.065, 20]} />
                  {k === n - 1 && x === -0.22 ? (
                    <AccentMaterial accentRef={accent} color={color} />
                  ) : (
                    <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={0.25} metalness={0.75} roughness={0.22} />
                  )}
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );

    case 'promptops': // Holographic command lectern
      return (
        <group>
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.48, 1.1, 6]} />
            <meshStandardMaterial color={palette.deskLeg} metalness={0.65} roughness={0.28} />
          </mesh>
          <mesh position={[0, 1.55, -0.05]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[1.55, 0.88, 0.05]} />
            <meshStandardMaterial color="#0A1224" metalness={0.7} roughness={0.22} />
          </mesh>
          <mesh position={[0, 1.55, -0.01]} rotation={[-0.25, 0, 0]}>
            <planeGeometry args={[1.42, 0.76]} />
            <AccentMaterial accentRef={accent} color={color} />
          </mesh>
        </group>
      );

    case 'auditability': // Cryptographic hash-chain monolith
      return (
        <group>
          <RoundedBox args={[0.92, 1.65, 0.82]} radius={0.04} smoothness={2} position={[-0.45, 0.82, 0]} castShadow>
            <meshStandardMaterial color={palette.deskLeg} metalness={0.62} roughness={0.32} />
          </RoundedBox>
          {[0.38, 0.82, 1.26].map((y) => (
            <mesh key={y} position={[-0.45, y, 0.42]}>
              <boxGeometry args={[0.72, 0.05, 0.02]} />
              <meshBasicMaterial color="#22D3EE" transparent opacity={0.75} toneMapped={false} />
            </mesh>
          ))}
          <group ref={spin} position={[0.62, 1.12, 0]}>
            {[0, 1, 2].map((k) => (
              <mesh key={k} position={[0, (k - 1) * 0.34, 0]} rotation={[0, k % 2 ? Math.PI / 2 : 0, 0]}>
                <torusGeometry args={[0.18, 0.036, 10, 24]} />
                {k === 1 ? (
                  <AccentMaterial accentRef={accent} color={color} />
                ) : (
                  <meshBasicMaterial color="#22D3EE" transparent opacity={0.65} toneMapped={false} />
                )}
              </mesh>
            ))}
          </group>
        </group>
      );

    default:
      return (
        <RoundedBox args={[1.0, 1.0, 1.0]} radius={0.05} smoothness={2} position={[0, 0.85, 0]} castShadow>
          <AccentMaterial accentRef={accent} color={color} />
        </RoundedBox>
      );
  }
}

function StationImpl({ id, position, palette, showLabel }: { id: string; position: Vec3; palette: OfficePalette; showLabel: boolean }) {
  const reducedMotion = useReducedMotion();
  const mod = useTelemetryStore((s) => s.modules[id]);
  const selected = useTelemetryStore((s) => s.selectedModuleId === id);
  const selectModule = useTelemetryStore((s) => s.selectModule);
  const accent = useRef<MeshStandardMaterial>(null);
  const pad = useRef<MeshBasicMaterial>(null);
  const borderMat = useRef<MeshBasicMaterial>(null);
  const halo = useRef<Sprite>(null);
  const spin = useRef<Group>(null);
  const beam = useRef<MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const [inAction, setInAction] = useState(false);
  const inActionRef = useRef(false);
  const hoveredRef = useRef(false);

  const zoneKind = moduleZoneKind(id);
  const zoneAccent = zoneKind === 'tools' ? '#EC4899' : zoneKind === 'memory' ? '#A855F7' : '#22D3EE';
  const padW = id === 'tool_orchestration' ? 3.8 : 3.25;
  const padD = id === 'tool_orchestration' ? 2.95 : 2.55;

  useFrame(({ clock }, delta) => {
    const live = useTelemetryStore.getState().modules[id];
    if (!live) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const serving = isServing(id);
    if (serving !== inActionRef.current) {
      inActionRef.current = serving;
      setInAction(serving);
    }
    const wave = 0.5 + 0.5 * Math.sin(t * 6 + position[0]);
    const offline = live.state === 'offline';
    if (accent.current) accent.current.emissiveIntensity = serving ? 1.85 + 1.25 * wave : offline ? 0.22 : 0.72;
    if (pad.current) pad.current.opacity = selected ? 0.82 : serving ? 0.52 + 0.26 * wave : hoveredRef.current ? 0.42 : offline ? 0.1 : 0.22;
    if (borderMat.current) borderMat.current.opacity = selected ? 0.98 : serving ? 0.78 + 0.22 * wave : 0.56;
    if (beam.current) beam.current.opacity = serving ? 0.1 + 0.08 * wave : 0;
    if (halo.current) {
      const size = serving ? 3.6 + 0.55 * wave : 1.9;
      halo.current.scale.set(size, size, 1);
      (halo.current.material as SpriteMaterial).opacity = serving ? 0.6 + 0.22 * wave : offline ? 0.08 : 0.18;
    }
    if (spin.current && !reducedMotion) spin.current.rotation.y += delta * (serving ? 3.6 : 0.55);
  });

  if (!mod) return null;
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

  const labelY = id === 'tool_orchestration' ? 4.35 : id === 'long_term_memory' ? 3.55 : 3.25;

  return (
    <group position={position} onClick={onClick} onDoubleClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {/* Vertical energy telemetry column during active serving */}
      <mesh position={[0, 2.8, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.36, 0.96, 5.6, 24, 1, true]} />
        <meshBasicMaterial ref={beam} color={zoneAccent} transparent opacity={0} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      {/* Multi-layered elevated module foundation plinth */}
      <RoundedBox args={[padW, 0.14, padD]} radius={0.05} smoothness={2} position={[0, 0.072, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={palette.wall} metalness={0.62} roughness={0.34} />
      </RoundedBox>
      {/* Glowing perimeter aura frame */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[padW + 0.22, padD + 0.22]} />
        <meshBasicMaterial ref={pad} color={selected ? '#2DD4FF' : zoneAccent} transparent opacity={0.22} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.15, padD / 2 - 0.03]}>
        <boxGeometry args={[padW - 0.2, 0.028, 0.038]} />
        <meshBasicMaterial ref={borderMat} color={selected ? '#2DD4FF' : zoneAccent} transparent opacity={0.65} toneMapped={false} />
      </mesh>
      <mesh position={[padW / 2 - 0.03, 0.15, 0]}>
        <boxGeometry args={[0.038, 0.028, padD - 0.2]} />
        <meshBasicMaterial color={selected ? '#2DD4FF' : zoneAccent} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <group position={[0, 0.145, 0]}>
        <Fixture id={id} palette={palette} accent={accent} color={color} spin={spin} />
      </group>
      <Halo ref={halo} color={zoneAccent} position={[0, 1.55, 0.2]} opacity={0.18} />

      {(showLabel || inAction || hovered || selected) && (
        <Html position={[0, labelY, 0]} center distanceFactor={10.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`office-tag flex min-w-[148px] max-w-[215px] flex-col rounded-xl border px-2.5 py-1 shadow-2xl backdrop-blur-xl transition-all ${
              selected ? 'border-cyan-400/85 bg-slate-950/92' : 'border-cyan-300/25 bg-slate-950/82'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="typo-agent-name truncate text-[11.5px] font-semibold text-white">{mod.label}</span>
              <span className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-slate-300">
                {mod.category}
              </span>
            </div>
            <div className={`typo-status mt-0.5 flex items-center justify-between gap-2 text-[10.5px] ${stateStyle.text}`}>
              <span className="flex items-center gap-1 font-medium">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateStyle.color, boxShadow: `0 0 6px ${stateStyle.color}` }} />
                {stateStyle.label}
              </span>
              <span className="font-mono text-[9.5px] text-slate-300/85">
                {mod.totalCalls} calls{mod.activeCalls > 0 ? ` · ${mod.activeCalls} active` : ''}
              </span>
            </div>
            {mod.lastOperation && (
              <div className="mt-0.5 truncate border-t border-white/10 pt-0.5 font-mono text-[9.5px] text-violet-200/85">
                {mod.lastOperation}{mod.lastAgent ? ` ← ${mod.lastAgent}` : ''}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export const Station = memo(StationImpl);


