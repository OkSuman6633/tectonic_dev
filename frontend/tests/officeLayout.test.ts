import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfficeFocusTarget } from '../src/components/office/officeCamera.ts';
import { layoutOffice } from '../src/components/office/officeLayout.ts';
import { buildNavGrid, computeAvoidanceOffset, findOfficePath } from '../src/components/office/officePathfinding.ts';
import { getEmployeeAppearance, resolveEmployeeDirective } from '../src/components/office/employeeWorkflow.ts';
import type { AgentMeta, ModuleCallRecord } from '../src/types/telemetry.ts';

const layout = {
  desks: { 'agent-1': [1, 0, 2] as [number, number, number] },
  stations: { short_term_memory: [-3, 0, -4] as [number, number, number] },
  center: [0, 0, 0] as [number, number, number],
  radius: 8,
  width: 16,
  depth: 12,
};

function makeTestAgents(ids: string[]): Record<string, AgentMeta> {
  return Object.fromEntries(
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
}

test('focus target resolves selected agent or module coordinates', () => {
  assert.deepEqual(getOfficeFocusTarget(layout, 'agent-1', null), [1, 0, 2]);
  assert.deepEqual(getOfficeFocusTarget(layout, null, 'short_term_memory'), [-3, 0, -4]);
});

test('focus target ignores stale selection IDs', () => {
  assert.equal(getOfficeFocusTarget(layout, 'deleted-agent', null), null);
  assert.equal(getOfficeFocusTarget(layout, null, 'removed-module'), null);
});

test('layoutOffice produces cohesive sunlit office zones, desks, stations, lounge, and navigable obstacles', () => {
  const ids = [
    'agent_builder',
    'intent_detection',
    'requirement_understanding',
    'agent_card_manager',
    'code_generator',
    'attendance_manager',
    'checkin_agent',
  ];
  const agents = makeTestAgents(ids);
  const modules = ['guardrails', 'intent_detection', 'short_term_memory', 'long_term_memory', 'tool_orchestration'];
  const computed = layoutOffice(ids, agents, modules);

  assert.equal(Object.keys(computed.desks).length, 7);
  assert.equal(Object.keys(computed.stations).length, 5);
  assert.equal(Object.keys(computed.deskStandPoints).length, 7);
  assert.equal(Object.keys(computed.stationStandPoints).length, 5);

  // Builder desk sits on subtle elevated executive step
  assert.ok(computed.desks.agent_builder[1] > computed.desks.attendance_manager[1]);
  assert.ok(computed.builderDais && computed.builderDais.topY > computed.builderDais.baseY);

  // Six functional zones plus living amenities (lounge, cafe, greenery) and conference seats
  assert.equal(computed.zones.length, 6);
  assert.ok(computed.satellites.some((s) => s.feature === 'lounge'));
  assert.ok(computed.satellites.some((s) => s.feature === 'cafe'));
  assert.ok(computed.meetingSeats.length >= 4);
  assert.ok(computed.obstacles.length > 0);
});

test('A* office pathfinding routes employees cleanly around desks and furniture to resource workstations', () => {
  const ids = ['agent_builder', 'code_generator', 'attendance_manager'];
  const agents = makeTestAgents(ids);
  const modules = ['guardrails', 'long_term_memory', 'tool_orchestration'];
  const computed = layoutOffice(ids, agents, modules);
  const grid = buildNavGrid(computed);

  const path = findOfficePath(grid, computed.deskStandPoints.attendance_manager, computed.stationStandPoints.long_term_memory);
  assert.ok(path.length >= 2, 'expected a valid multi-point path');
  assert.deepEqual(path[0], { x: computed.deskStandPoints.attendance_manager[0], z: computed.deskStandPoints.attendance_manager[2] });
  assert.deepEqual(path[path.length - 1], { x: computed.stationStandPoints.long_term_memory[0], z: computed.stationStandPoints.long_term_memory[2] });

  // Verify avoidance vector pushes overlapping walkers apart cleanly
  const avoid = computeAvoidanceOffset('a', { x: 0, z: 0 }, { a: { x: 0, z: 0 }, b: { x: 0.3, z: 0 } });
  assert.ok(avoid.x < 0, 'expected repulsion away from nearby employee');
});

test('employeeWorkflow maps live backend module calls and idle states truthfully without fake tasks', () => {
  const ids = ['agent_builder', 'research_worker'];
  const agents = makeTestAgents(ids);
  const modules = ['long_term_memory', 'tool_orchestration'];
  const computed = layoutOffice(ids, agents, modules);

  // Idle agent with no active backend calls gets null directive (stays naturally at desk)
  const idleDir = resolveEmployeeDirective('research_worker', agents.research_worker, computed, {}, {}, [], ids, Date.now());
  assert.equal(idleDir, null);

  // Active backend module call routes the assigned human employee to that physical workstation
  const nowMs = Date.now();
  const activeCall: ModuleCallRecord = {
    callId: 'c-1',
    module: 'long_term_memory',
    operation: 'recall',
    agentId: 'research_worker',
    payload: {},
    status: 'running',
    startedAt: nowMs / 1000,
  };
  const liveDir = resolveEmployeeDirective(
    'research_worker',
    { ...agents.research_worker, state: 'tool_execution' },
    computed,
    {},
    { long_term_memory: [activeCall] },
    [],
    ids,
    nowMs,
  );
  assert.ok(liveDir, 'expected active directive for running module call');
  assert.equal(liveDir.targetKind, 'station');
  assert.equal(liveDir.targetId, 'long_term_memory');
  assert.equal(liveDir.activity, 'research');

  // Distinct appearances per employee
  assert.notEqual(getEmployeeAppearance('agent_builder').displayFirstName, getEmployeeAppearance('research_worker').displayFirstName);
});

