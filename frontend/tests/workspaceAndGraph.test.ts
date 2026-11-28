import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutAgents,
  layoutModuleLane,
  NODE_WIDTH,
  NODE_HEIGHT,
  MODULE_NODE_WIDTH,
} from '../src/components/command/graphLayout.ts';
import { getOfficeFocusTarget } from '../src/components/office/officeCamera.ts';
import { useWorkspaceStore, PRESETS, ALL_WINDOWS } from '../src/workspace/useWorkspaceStore.ts';
import type { AgentMeta } from '../src/types/telemetry.ts';

test('layoutAgents positions parent above children without overlap', () => {
  const agents: Record<string, AgentMeta> = {
    agent_builder: {
      id: 'agent_builder',
      role: 'agent_builder',
      parentId: null,
      state: 'idle',
    },
    code_gen: {
      id: 'code_gen',
      role: 'code_generator',
      parentId: 'agent_builder',
      state: 'idle',
    },
    critic: {
      id: 'critic',
      role: 'design_critic',
      parentId: 'agent_builder',
      state: 'idle',
    },
  };
  const pos = layoutAgents(['agent_builder', 'code_gen', 'critic'], agents);
  assert.ok(pos.agent_builder && pos.code_gen && pos.critic);
  assert.ok(pos.code_gen.y >= pos.agent_builder.y + NODE_HEIGHT);
  assert.ok(Math.abs(pos.code_gen.x - pos.critic.x) >= NODE_WIDTH);
});

test('layoutModuleLane wraps module cards below agent tree', () => {
  const agentPos = { root: { x: 100, y: 20 } };
  const mods = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
  const lane = layoutModuleLane(mods, agentPos);
  assert.equal(Object.keys(lane).length, 6);
  // Row 1 (m1..m5) sits below agent tree, Row 2 (m6) sits below Row 1
  assert.ok(lane.m1.y > agentPos.root.y + NODE_HEIGHT);
  assert.ok(lane.m6.y > lane.m1.y);
  assert.ok(lane.m2.x - lane.m1.x >= MODULE_NODE_WIDTH);
});

test('getOfficeFocusTarget handles null selections and resolves desk/station targets', () => {
  const layout = {
    desks: { a1: [1, 2, 3] as [number, number, number] },
    stations: { mod1: [4, 5, 6] as [number, number, number] },
  };
  assert.deepEqual(getOfficeFocusTarget(layout, 'a1', 'mod1'), [1, 2, 3]);
  assert.deepEqual(getOfficeFocusTarget(layout, null, 'mod1'), [4, 5, 6]);
  assert.equal(getOfficeFocusTarget(layout, 'missing', null), null);
});

test('useWorkspaceStore manages presets, maximize, minimize, close, and non-overlapping restore', () => {
  const store = useWorkspaceStore;
  store.getState().applyPreset('build');
  assert.equal(store.getState().preset, 'build');
  for (const id of Object.keys(PRESETS.build.layout)) {
    assert.ok(!store.getState().closed.includes(id as (typeof ALL_WINDOWS)[number]));
  }

  store.getState().minimize('command');
  assert.ok(store.getState().minimized.includes('command'));

  store.getState().toggleMaximize('chat');
  assert.equal(store.getState().maximized, 'chat');
  store.getState().exitMaximize();
  assert.equal(store.getState().maximized, null);

  store.getState().close('roster');
  assert.ok(store.getState().closed.includes('roster'));

  // Restoring a window places it into a non-overlapping cell
  store.getState().restore('finops');
  assert.ok(!store.getState().closed.includes('finops'));
  assert.equal(store.getState().focused, 'finops');

  // Spotlight opens the window maximized
  store.getState().spotlight('audit');
  assert.equal(store.getState().maximized, 'audit');
  assert.ok(!store.getState().closed.includes('audit'));
});
