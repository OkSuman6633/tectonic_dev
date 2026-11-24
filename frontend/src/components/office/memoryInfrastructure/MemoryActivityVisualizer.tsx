import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import { AdditiveBlending, CatmullRomCurve3, Vector3, type Mesh, type MeshStandardMaterial } from 'three';
import { useTelemetryStore } from '../../../store/useTelemetryStore';
import type { ModuleCallRecord } from '../../../types/telemetry';
import type { Vec3 } from '../officeLayout';

const LINGER_S = 2.4;

type MemoryOpKind = 'stm_write' | 'stm_read' | 'ltm_write' | 'ltm_read' | 'sync';

function classifyMemoryOperation(moduleId: string, operation?: string): MemoryOpKind {
  const op = (operation ?? '').toLowerCase();
  if (op.includes('share') || op.includes('sync') || op.includes('consolidat')) return 'sync';
  if (moduleId === 'short_term_memory') {
    if (op.includes('get') || op.includes('read') || op.includes('fetch') || op.includes('context')) return 'stm_read';
    return 'stm_write';
  }
  if (op.includes('recall') || op.includes('query') || op.includes('search') || op.includes('retriev') || op.includes('stats')) {
    return 'ltm_read';
  }
  return 'ltm_write';
}

function getLatestRecentCall(calls: ModuleCallRecord[] | undefined, nowS: number): ModuleCallRecord | null {
  if (!calls || calls.length === 0) return null;
  const last = calls[calls.length - 1];
  if (last.status === 'running') return last;
  return nowS - last.startedAt < LINGER_S ? last : null;
}

/**
 * Real-Time Shared-Memory Backend Event Visualizer:
 * Connects directly to `useTelemetryStore` runtime events for:
 *   - `short_term_memory` (append, get_context, clear, summarize)
 *   - `long_term_memory` (remember, recall, share, forget, stats)
 *   - `vector_db` & `agentic_rag` (embedding/indexing & retrieval)
 * Drives smooth section intensity refs (`stmActiveRef`, `ltmActiveRef`, `syncActiveRef`) AND
 * renders recessed illuminated floor data conduits + live traveling energy packets showing:
 *   - STM writes (cyan packets racing STM Console/Racks -> Central Core)
 *   - STM reads (cyan packets flowing Core -> Console -> North Bridge)
 *   - LTM writes/indexing (purple packets racing Central Core -> LTM Persistent Storage Arrays)
 *   - LTM retrieval/recall (blue-purple packets surging LTM Arrays -> Core -> North Bridge)
 *   - Cross-memory synchronization/sharing (bidirectional cyan <-> purple harmonic packets across STM <-> Core <-> LTM)
 */
export const MemoryActivityVisualizer = memo(function MemoryActivityVisualizer({
  stmActiveRef,
  ltmActiveRef,
  syncActiveRef,
  platformActiveRef,
}: {
  stmActiveRef: React.MutableRefObject<number>;
  ltmActiveRef: React.MutableRefObject<number>;
  syncActiveRef: React.MutableRefObject<number>;
  platformActiveRef: React.RefObject<boolean>;
}) {
  const reducedMotion = useReducedMotion();

  // Floor conduit curves linking STM <-> Core <-> LTM <-> North Bridge
  const { stmCurve, ltmCurve, bridgeCurve, syncCurve } = useMemo(() => {
    const mk = (pts: Vec3[]) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)));
    return {
      stmCurve: mk([
        [-4.1, 0.045, -0.55],
        [-2.75, 0.045, -0.55],
        [-1.85, 0.045, -0.55],
        [0.0, 0.14, -0.55],
      ]),
      ltmCurve: mk([
        [0.0, 0.14, -0.55],
        [1.85, 0.045, -0.55],
        [2.95, 0.045, -1.65],
        [3.45, 0.045, -2.95],
      ]),
      bridgeCurve: mk([
        [0.0, 0.045, 5.15],
        [0.0, 0.045, 3.15],
        [0.0, 0.045, 1.55],
        [0.0, 0.12, -0.55],
      ]),
      syncCurve: mk([
        [-4.25, 0.08, -0.55],
        [-1.95, 0.42, -0.55],
        [0.0, 1.35, -0.55],
        [2.05, 0.42, -0.75],
        [3.85, 0.08, -2.55],
      ]),
    };
  }, []);

  // Packet pulse meshes (3 STM, 3 LTM, 2 Bridge Access, 3 Sync)
  const stmPulses = useRef<(Mesh | null)[]>([]);
  const ltmPulses = useRef<(Mesh | null)[]>([]);
  const bridgePulses = useRef<(Mesh | null)[]>([]);
  const syncPulses = useRef<(Mesh | null)[]>([]);
  const stmTrackMat = useRef<MeshStandardMaterial>(null);
  const ltmTrackMat = useRef<MeshStandardMaterial>(null);
  const bridgeTrackMat = useRef<MeshStandardMaterial>(null);

  const tmpPos = useMemo(() => new Vector3(), []);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = reducedMotion ? 0 : clock.elapsedTime;
    const nowS = Date.now() / 1000;
    const store = useTelemetryStore.getState();

    // Inspect real backend module states & live calls
    const stmMod = store.modules.short_term_memory;
    const ltmMod = store.modules.long_term_memory;
    const vecMod = store.modules.vector_db;
    const ragMod = store.modules.agentic_rag;

    const stmCall = getLatestRecentCall(store.moduleCalls.short_term_memory, nowS);
    const ltmCall = getLatestRecentCall(store.moduleCalls.long_term_memory, nowS);
    const vecCall = getLatestRecentCall(store.moduleCalls.vector_db, nowS);
    const ragCall = getLatestRecentCall(store.moduleCalls.agentic_rag, nowS);

    const stmBusy = Boolean(stmCall) || stmMod?.state === 'busy' || stmMod?.state === 'booting';
    const ltmBusy =
      Boolean(ltmCall || vecCall || ragCall) ||
      ltmMod?.state === 'busy' ||
      ltmMod?.state === 'booting' ||
      vecMod?.state === 'busy' ||
      ragMod?.state === 'busy';

    const stmKind = stmCall ? classifyMemoryOperation('short_term_memory', stmCall.operation) : null;
    const ltmPrimaryCall = ltmCall ?? vecCall ?? ragCall;
    const ltmKind = ltmPrimaryCall ? classifyMemoryOperation(ltmPrimaryCall.module, ltmPrimaryCall.operation) : null;

    // Cross-memory sync triggers on explicit share/sync/consolidate OR concurrent STM+LTM operations
    const isSync = stmKind === 'sync' || ltmKind === 'sync' || (stmBusy && ltmBusy);
    const anyAccess = stmBusy || ltmBusy || Boolean(platformActiveRef.current);

    // Smoothly damp intensities for natural enterprise hardware light response
    const lerpRate = 1 - Math.exp(-6.5 * dt);
    stmActiveRef.current += ((stmBusy || isSync ? 1 : 0) - stmActiveRef.current) * lerpRate;
    ltmActiveRef.current += ((ltmBusy || isSync ? 1 : 0) - ltmActiveRef.current) * lerpRate;
    syncActiveRef.current += ((isSync ? 1 : 0) - syncActiveRef.current) * lerpRate;

    const stmVal = stmActiveRef.current;
    const ltmVal = ltmActiveRef.current;
    const syncVal = syncActiveRef.current;

    if (stmTrackMat.current) {
      stmTrackMat.current.emissiveIntensity = 1.15 + stmVal * 2.1;
    }
    if (ltmTrackMat.current) {
      ltmTrackMat.current.emissiveIntensity = 1.15 + ltmVal * 2.1;
    }
    if (bridgeTrackMat.current) {
      bridgeTrackMat.current.emissiveIntensity = 0.95 + (anyAccess ? 1.8 : 0);
    }

    // Animate STM pulses (forward STM->Core on write, reverse Core->STM on read)
    const stmReverse = stmKind === 'stm_read';
    stmPulses.current.forEach((m, i) => {
      if (!m) return;
      const show = !reducedMotion && stmVal > 0.08;
      m.visible = show;
      if (!show) return;
      const rawU = (t * 0.95 + i / 3) % 1;
      const u = stmReverse ? 1 - rawU : rawU;
      stmCurve.getPointAt(u, tmpPos);
      m.position.copy(tmpPos);
      m.scale.setScalar(0.8 + stmVal * 0.5);
    });

    // Animate LTM pulses (forward Core->LTM on remember/index, reverse LTM->Core on recall/query)
    const ltmReverse = ltmKind === 'ltm_read';
    ltmPulses.current.forEach((m, i) => {
      if (!m) return;
      const show = !reducedMotion && ltmVal > 0.08;
      m.visible = show;
      if (!show) return;
      const rawU = (t * 0.85 + i / 3) % 1;
      const u = ltmReverse ? 1 - rawU : rawU;
      ltmCurve.getPointAt(u, tmpPos);
      m.position.copy(tmpPos);
      m.scale.setScalar(0.8 + ltmVal * 0.5);
    });

    // Animate Agent Access pulses along the North Bridge <-> Central Core spine
    const accessInbound = stmKind === 'stm_write' || ltmKind === 'ltm_write' || isSync;
    bridgePulses.current.forEach((m, i) => {
      if (!m) return;
      const show = !reducedMotion && (stmVal > 0.08 || ltmVal > 0.08);
      m.visible = show;
      if (!show) return;
      const rawU = (t * 0.8 + i / 2) % 1;
      const u = accessInbound ? rawU : 1 - rawU;
      bridgeCurve.getPointAt(u, tmpPos);
      m.position.copy(tmpPos);
    });

    // Animate Bidirectional Synchronization Wave across STM <-> Central Core <-> LTM
    syncPulses.current.forEach((m, i) => {
      if (!m) return;
      const show = !reducedMotion && syncVal > 0.08;
      m.visible = show;
      if (!show) return;
      const rawU = (t * 0.72 + i / 3) % 1;
      const u = i % 2 === 0 ? rawU : 1 - rawU;
      syncCurve.getPointAt(u, tmpPos);
      m.position.copy(tmpPos);
      m.scale.setScalar(0.95 + syncVal * 0.45);
    });
  });

  return (
    <group>
      {/* Recessed Floor Fiber-Optic Data Channels connecting Core <-> STM, Core <-> LTM, and Core <-> Bridge */}
      {/* STM Channel (Cyan) */}
      <mesh position={[-2.9, 0.008, -0.55]}>
        <boxGeometry args={[2.45, 0.012, 0.09]} />
        <meshStandardMaterial ref={stmTrackMat} color="#7DD3FC" emissive="#00E5FF" emissiveIntensity={1.3} roughness={0.2} />
      </mesh>
      {/* LTM Channel (Purple) */}
      <mesh position={[2.75, 0.008, -1.65]} rotation={[0, -0.68, 0]}>
        <boxGeometry args={[2.85, 0.012, 0.09]} />
        <meshStandardMaterial ref={ltmTrackMat} color="#E9D5FF" emissive="#A855F7" emissiveIntensity={1.3} roughness={0.2} />
      </mesh>
      {/* Front Bridge Agent-Access Spine Channel */}
      <mesh position={[0, 0.008, 3.28]}>
        <boxGeometry args={[0.1, 0.012, 3.55]} />
        <meshStandardMaterial ref={bridgeTrackMat} color="#93C5FD" emissive="#38BDF8" emissiveIntensity={1.05} roughness={0.2} />
      </mesh>

      {/* Live STM Write / Read Glowing Cyan Data Pulses */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={`stm-p-${i}`}
          ref={(el) => {
            stmPulses.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.11, 12, 10]} />
          <meshBasicMaterial color="#38E8FF" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}

      {/* Live LTM Write / Recall Glowing Violet-Purple Data Pulses */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={`ltm-p-${i}`}
          ref={(el) => {
            ltmPulses.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.11, 12, 10]} />
          <meshBasicMaterial color="#C084FC" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}

      {/* Live Agent Access Data Pulses along the North Bridge Entry Spine */}
      {[0, 1].map((i) => (
        <mesh
          key={`br-p-${i}`}
          ref={(el) => {
            bridgePulses.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.1, 10, 10]} />
          <meshBasicMaterial color="#E0F2FE" transparent opacity={0.92} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}

      {/* Live STM <-> LTM Synchronization Harmonic Pulses arching through the Neural Core */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={`sync-p-${i}`}
          ref={(el) => {
            syncPulses.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.13, 12, 10]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? '#E879F9' : '#38E8FF'}
            transparent
            opacity={0.95}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
});
