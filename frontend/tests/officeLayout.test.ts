import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfficeFocusTarget } from '../src/components/office/officeCamera.ts';
import { layoutOffice } from '../src/components/office/officeLayout.ts';
import type { AgentMeta } from '../src/types/telemetry.ts';

const layout = {
  desks: { 'agent-1': [1, 0, 2] as [number, number, number] },
  stations: { short_term_memory: [-3, 0.28, -4] as [number, number, number] },
  center: [0, 0, 0] as [number, number, number],
  radius: 8,
  width: 16,
  depth: 12,
};

test('focus target resolves selected agent or module coordinates', () => {
  assert.deepEqual(getOfficeFocusTarget(layout, 'agent-1', null), [1, 0, 2]);
  assert.deepEqual(getOfficeFocusTarget(layout, null, 'short_term_memory'), [-3, 0.28, -4]);
});

test('focus target ignores stale selection IDs', () => {
  assert.equal(getOfficeFocusTarget(layout, 'deleted-agent', null), null);
  assert.equal(getOfficeFocusTarget(layout, null, 'removed-module'), null);
});

test('layoutOffice elevates campus zones and bounds all seven agents and five core modules', () => {
  const ids = [
    'agent_builder',
    'intent_detection',
    'requirement_understanding',
    'agent_card_manager',
    'code_generator',
    'attendance_manager',
    'checkin_agent',
  ];
  const agents: Record<string, AgentMeta> = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        role: id,
        parentId: id === 'agent_builder' ? null : 'agent_builder',
        systemPrompt: '',
        description: '',
        model: 'gemini-3.6-flash',
        state: 'idle',
        createdAt: 0,
        lastActiveAt: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        toolCallCount: 0,
      },
    ]),
  );
  const modules = ['guardrails', 'intent_detection', 'short_term_memory', 'long_term_memory', 'tool_orchestration'];
  const computed = layoutOffice(ids, agents, modules);

  assert.equal(Object.keys(computed.desks).length, 7);
  assert.equal(Object.keys(computed.stations).length, 5);
  // Builder desk sits on elevated command tier
  assert.ok(computed.desks.agent_builder[1] > computed.desks.attendance_manager[1]);
  // Memory & tool modules sit on elevated infrastructure platform tier
  assert.ok(computed.stations.short_term_memory[1] > 0);
  assert.ok(computed.stations.long_term_memory[1] > 0);
  assert.ok(computed.stations.tool_orchestration[1] > 0);
  // Distinct zone metadata exists for all 6 Neon AI Operations Campus islands
  assert.equal(computed.zones.length, 6);
  for (const zone of computed.zones) {
    assert.ok(zone.thickness >= 0.75, `expected visible platform thickness for ${zone.id}`);
  }

  // Verify every pair of elevated islands has real spatial separation (no overlapping footprints)
  for (let i = 0; i < computed.zones.length; i++) {
    for (let j = i + 1; j < computed.zones.length; j++) {
      const a = computed.zones[i];
      const b = computed.zones[j];
      const gapX = Math.abs(a.center[0] - b.center[0]) - (a.width + b.width) / 2;
      const gapZ = Math.abs(a.center[2] - b.center[2]) - (a.depth + b.depth) / 2;
      assert.ok(Math.max(gapX, gapZ) >= 1.5, `expected open spatial separation between ${a.id} and ${b.id}`);
    }
  }

  // Skybridges connect independent islands and satellite pads include the wireframe globe pad
  assert.ok(computed.bridges.length >= 6);
  assert.equal(computed.satellites.length, 3);
  assert.ok(computed.satellites.some((s) => s.feature === 'globe'));
  assert.ok(computed.builderDais && computed.builderDais.topY > computed.builderDais.baseY);
});

