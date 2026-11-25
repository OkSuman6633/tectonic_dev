import { memo, useCallback, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import type { CampusZone } from './officeLayout';
import { BrassSafetyRail, MemoryPlatformChassis } from './memoryInfrastructure/MemoryPlatformChassis';
import { CentralMemoryCore } from './memoryInfrastructure/CentralMemoryCore';
import { MemoryCryoCylinder, ShortTermMemorySection } from './memoryInfrastructure/ShortTermMemorySection';
import { LongTermMemorySection } from './memoryInfrastructure/LongTermMemorySection';
import { MemoryActivityVisualizer } from './memoryInfrastructure/MemoryActivityVisualizer';

export {
  BrassSafetyRail,
  MemoryPlatformChassis,
  CentralMemoryCore,
  MemoryCryoCylinder,
  ShortTermMemorySection,
  LongTermMemorySection,
  MemoryActivityVisualizer,
};

const FALLBACK_MEMORY_ZONE: CampusZone = {
  id: 'knowledge-zone',
  label: 'MEMORY INFRASTRUCTURE',
  subtitle: 'SHORT-TERM & LONG-TERM MEMORY',
  kind: 'memory',
  center: [0.0, 0.62, -21.1],
  width: 13.8,
  depth: 10.6,
  height: 0.62,
  thickness: 0.62,
  accent: '#A855F7',
  secondaryAccent: '#00E5FF',
  surfaceTint: '#101828',
  signPlacement: 'front',
};

/**
 * High-Fidelity 3D Shared Memory Infrastructure Platform:
 * ONE unified industrial platform featuring two distinct, interconnected hardware sections
 * surrounding a monumental transparent neural-processing core:
 *   1. Short-Term Memory (STM — Left / -X, Electric Cyan-Blue lighting):
 *      context-processing server racks with spinning cooling fans, 3-monitor operator console,
 *      rear cooling manifold with arched brass pipes, glowing cyan cryo buffer cylinder, & auxiliary units
 *   2. Long-Term Memory (LTM — Right / +X, Blue-Purple lighting):
 *      persistent storage arrays, vector database / embedding racks with violet edge illumination,
 *      top exhaust manifold & arched brass pipes, far-right purple cryo tank, foreground 3-rack retrieval
 *      bank, compact query terminal, & front electric-blue cryo tank
 *   3. Central Memory Core:
 *      layered circular metallic foundation pedestal, transparent glass cylindrical neural chamber,
 *      animated scanning rings, sculpted 3D glowing holographic neural brain, and physical brass/fiber
 *      connections into both sections
 *   4. Live Telemetry Visualization:
 *      driven directly by real `useTelemetryStore` shared-memory backend events (`short_term_memory`,
 *      `long_term_memory`, `vector_db`, `agentic_rag`) showing real-time writes, retrieval, sync & access
 */
export const MemoryInfrastructureHardware = memo(function MemoryInfrastructureHardware({
  zone = FALLBACK_MEMORY_ZONE,
  activeRef,
  isDark = true,
}: {
  zone?: CampusZone;
  activeRef: React.RefObject<boolean>;
  isDark?: boolean;
}) {
  const stmActiveRef = useRef(0);
  const ltmActiveRef = useRef(0);
  const syncActiveRef = useRef(0);

  const selectPreferredModule = useCallback((preferred: string[]) => {
    const store = useTelemetryStore.getState();
    const target = preferred.find((id) => Boolean(store.modules[id]));
    if (target) store.selectModule(target, 'office');
  }, []);

  const handleSelectStm = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      selectPreferredModule(['short_term_memory', 'long_term_memory', 'agentic_rag', 'vector_db']);
    },
    [selectPreferredModule],
  );

  const handleSelectLtm = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      selectPreferredModule(['long_term_memory', 'vector_db', 'agentic_rag', 'short_term_memory']);
    },
    [selectPreferredModule],
  );

  const handleSelectCore = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      selectPreferredModule(['agentic_rag', 'long_term_memory', 'short_term_memory', 'vector_db']);
    },
    [selectPreferredModule],
  );

  return (
    <group onClick={handleSelectCore}>
      {/* Live Backend Shared-Memory Telemetry Driver & Animated Fiber-Optic Data Conduits */}
      <MemoryActivityVisualizer
        stmActiveRef={stmActiveRef}
        ltmActiveRef={ltmActiveRef}
        syncActiveRef={syncActiveRef}
        platformActiveRef={activeRef}
      />

      {/* Multi-Tier Industrial Foundation Plinth, Cyan->Purple Rim, Beveled Front Sign & Brass Rails */}
      <MemoryPlatformChassis zone={zone} stmActiveRef={stmActiveRef} ltmActiveRef={ltmActiveRef} isDark={isDark} />

      {/* Central Transparent Neural-Processing Chamber, Sculpted 3D Holographic Brain & Brass Conduits */}
      <CentralMemoryCore
        position={[0, 0, -0.55]}
        stmActiveRef={stmActiveRef}
        ltmActiveRef={ltmActiveRef}
        syncActiveRef={syncActiveRef}
        isDark={isDark}
      />

      {/* Section 1: Short-Term Memory (STM — Left / -X Half, Cyan/Blue) */}
      <ShortTermMemorySection stmActiveRef={stmActiveRef} onSelectStm={handleSelectStm} isDark={isDark} />

      {/* Section 2: Long-Term Memory (LTM — Right / +X Half, Blue/Purple) */}
      <LongTermMemorySection ltmActiveRef={ltmActiveRef} onSelectLtm={handleSelectLtm} isDark={isDark} />
    </group>
  );
});
