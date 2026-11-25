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
  assert.deepEqual(path[0], { x: computed.deskStandPoints.attendance_manager[0], y: computed.deskStandPoints.attendance_manager[1] ?? 0, z: computed.deskStandPoints.attendance_manager[2] });
  assert.deepEqual(path[path.length - 1], { x: computed.stationStandPoints.long_term_memory[0], y: computed.stationStandPoints.long_term_memory[1] ?? 0, z: computed.stationStandPoints.long_term_memory[2] });

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

test('Tool Orchestration platform preserves elevated bridge connectivity, module IDs, and employee navigation', () => {
  const ids = ['agent_builder', 'checkin_agent'];
  const agents = makeTestAgents(ids);
  const modules = ['tool_orchestration', 'external_connectors'];
  const computed = layoutOffice(ids, agents, modules);

  const toolsZone = computed.externalZones.find((z) => z.id === 'tooling-zone');
  assert.ok(toolsZone, 'expected tooling-zone external platform');
  assert.ok(toolsZone.height > 0, 'expected sculpted elevated Tool Orchestration plinth');

  const toolsBridge = computed.bridges.find((b) => b.id === 'bridge-tools');
  assert.ok(toolsBridge, 'expected bridge-tools connecting central office to tooling-zone');
  assert.equal(toolsBridge.zoneId, 'tooling-zone');
  assert.equal(toolsBridge.from[1], 0);
  assert.equal(toolsBridge.to[1], toolsZone.height);
  assert.equal(toolsBridge.platformEntry[1], toolsZone.height);

  assert.equal(computed.stationZoneIds.tool_orchestration, 'tooling-zone');
  assert.equal(computed.stationZoneIds.external_connectors, 'tooling-zone');
  assert.equal(computed.stationStandPoints.tool_orchestration[1], toolsZone.height);

  // Employee path crosses bridge-tools and reaches the elevated Tool Orchestration stand point
  const grid = buildNavGrid(computed);
  const path = findOfficePath(grid, computed.deskStandPoints.checkin_agent, computed.stationStandPoints.tool_orchestration);
  assert.ok(path.some((wp) => wp.bridgeId === 'bridge-tools'), 'expected path to traverse bridge-tools');
  assert.equal(path[path.length - 1].y, toolsZone.height);
});

test('Shared Memory Infrastructure unifies STM and LTM sections with elevated bridge connectivity and navigation', () => {
  const ids = ['agent_builder', 'attendance_manager'];
  const agents = makeTestAgents(ids);
  const modules = ['long_term_memory', 'short_term_memory', 'vector_db', 'agentic_rag'];
  const computed = layoutOffice(ids, agents, modules);

  const memZone = computed.externalZones.find((z) => z.id === 'knowledge-zone');
  assert.ok(memZone, 'expected knowledge-zone external platform');
  assert.ok(memZone.height > 0, 'expected sculpted elevated Memory Infrastructure plinth');

  const memBridge = computed.bridges.find((b) => b.id === 'bridge-knowledge');
  assert.ok(memBridge, 'expected bridge-knowledge connecting central office to knowledge-zone');
  assert.equal(memBridge.zoneId, 'knowledge-zone');
  assert.equal(memBridge.from[1], 0);
  assert.equal(memBridge.to[1], memZone.height);
  assert.equal(memBridge.platformEntry[1], memZone.height);

  // STM always maps to left (-X) section and LTM always maps to right (+X) section regardless of order
  assert.equal(computed.stationZoneIds.short_term_memory, 'knowledge-zone');
  assert.equal(computed.stationZoneIds.long_term_memory, 'knowledge-zone');
  assert.equal(computed.stationZoneIds.vector_db, 'knowledge-zone');
  assert.equal(computed.stationZoneIds.agentic_rag, 'knowledge-zone');
  assert.ok(computed.stations.short_term_memory[0] < memZone.center[0], 'expected STM on left (-X) side');
  assert.ok(computed.stations.long_term_memory[0] > memZone.center[0], 'expected LTM on right (+X) side');
  assert.equal(computed.stationStandPoints.short_term_memory[1], memZone.height);
  assert.equal(computed.stationStandPoints.long_term_memory[1], memZone.height);

  // Employee path crosses bridge-knowledge and reaches both STM and LTM stand points cleanly
  const grid = buildNavGrid(computed);
  const stmPath = findOfficePath(grid, computed.deskStandPoints.attendance_manager, computed.stationStandPoints.short_term_memory);
  const ltmPath = findOfficePath(grid, computed.deskStandPoints.attendance_manager, computed.stationStandPoints.long_term_memory);
  assert.ok(stmPath.some((wp) => wp.bridgeId === 'bridge-knowledge'), 'expected STM path to traverse bridge-knowledge');
  assert.ok(ltmPath.some((wp) => wp.bridgeId === 'bridge-knowledge'), 'expected LTM path to traverse bridge-knowledge');
  assert.equal(stmPath[stmPath.length - 1].y, memZone.height);
  assert.equal(ltmPath[ltmPath.length - 1].y, memZone.height);
});

test('Process Studio preserves elevated bridge connectivity, auditability/finops module IDs, and employee navigation', () => {
  const ids = ['agent_builder', 'code_generator'];
  const agents = makeTestAgents(ids);
  const modules = ['auditability', 'finops'];
  const computed = layoutOffice(ids, agents, modules);

  const procZone = computed.externalZones.find((z) => z.id === 'process-zone');
  assert.ok(procZone, 'expected process-zone external platform');
  assert.ok(procZone.height > 0, 'expected sculpted elevated Process Studio plinth');

  const procBridge = computed.bridges.find((b) => b.id === 'bridge-process');
  assert.ok(procBridge, 'expected bridge-process connecting central office to process-zone');
  assert.equal(procBridge.zoneId, 'process-zone');
  assert.equal(procBridge.from[1], 0);
  assert.equal(procBridge.to[1], procZone.height);
  assert.equal(procBridge.platformEntry[1], procZone.height);

  assert.equal(computed.stationZoneIds.auditability, 'process-zone');
  assert.equal(computed.stationZoneIds.finops, 'process-zone');
  assert.equal(computed.stationStandPoints.auditability[1], procZone.height);
  assert.equal(computed.stationStandPoints.finops[1], procZone.height);

  const grid = buildNavGrid(computed);
  const path = findOfficePath(grid, computed.deskStandPoints.code_generator, computed.stationStandPoints.auditability);
  assert.ok(path.some((wp) => wp.bridgeId === 'bridge-process'), 'expected path to traverse bridge-process');
  assert.equal(path[path.length - 1].y, procZone.height);
});

test('Operations & Safety Center preserves elevated bridge connectivity, guardrails/intent_detection module IDs, and employee navigation', () => {
  const ids = ['agent_builder', 'code_generator'];
  const agents = makeTestAgents(ids);
  const modules = ['guardrails', 'intent_detection'];
  const computed = layoutOffice(ids, agents, modules);

  const opsZone = computed.externalZones.find((z) => z.id === 'operations-zone');
  assert.ok(opsZone, 'expected operations-zone external platform');
  assert.ok(opsZone.height > 0, 'expected sculpted elevated Operations & Safety plinth');

  const opsBridge = computed.bridges.find((b) => b.id === 'bridge-operations');
  assert.ok(opsBridge, 'expected bridge-operations connecting central office to operations-zone');
  assert.equal(opsBridge.zoneId, 'operations-zone');
  assert.equal(opsBridge.from[1], 0);
  assert.equal(opsBridge.to[1], opsZone.height);
  assert.equal(opsBridge.platformEntry[1], opsZone.height);

  assert.equal(computed.stationZoneIds.guardrails, 'operations-zone');
  assert.equal(computed.stationZoneIds.intent_detection, 'operations-zone');
  assert.equal(computed.stationStandPoints.guardrails[1], opsZone.height);
  assert.equal(computed.stationStandPoints.intent_detection[1], opsZone.height);

  const grid = buildNavGrid(computed);
  const guardPath = findOfficePath(grid, computed.deskStandPoints.agent_builder, computed.stationStandPoints.guardrails);
  const intentPath = findOfficePath(grid, computed.deskStandPoints.code_generator, computed.stationStandPoints.intent_detection);
  assert.ok(guardPath.some((wp) => wp.bridgeId === 'bridge-operations'), 'expected guardrails path to traverse bridge-operations');
  assert.ok(intentPath.some((wp) => wp.bridgeId === 'bridge-operations'), 'expected intent_detection path to traverse bridge-operations');
  assert.equal(guardPath[guardPath.length - 1].y, opsZone.height);
  assert.equal(intentPath[intentPath.length - 1].y, opsZone.height);
});

test('Content Studio - RCP preserves elevated bridge connectivity, promptops/image_generation module IDs, and employee navigation', () => {
  const ids = ['agent_builder', 'code_generator'];
  const agents = makeTestAgents(ids);
  const modules = ['promptops', 'image_generation'];
  const computed = layoutOffice(ids, agents, modules);

  const contentZone = computed.externalZones.find((z) => z.id === 'content-zone');
  assert.ok(contentZone, 'expected content-zone external platform');
  assert.ok(contentZone.height > 0, 'expected sculpted elevated Content Studio - RCP plinth');

  const contentBridge = computed.bridges.find((b) => b.id === 'bridge-content');
  assert.ok(contentBridge, 'expected bridge-content connecting central office to content-zone');
  assert.equal(contentBridge.zoneId, 'content-zone');
  assert.equal(contentBridge.from[1], 0);
  assert.equal(contentBridge.to[1], contentZone.height);
  assert.equal(contentBridge.platformEntry[1], contentZone.height);

  assert.equal(computed.stationZoneIds.promptops, 'content-zone');
  assert.equal(computed.stationZoneIds.image_generation, 'content-zone');
  assert.equal(computed.stationStandPoints.promptops[1], contentZone.height);
  assert.equal(computed.stationStandPoints.image_generation[1], contentZone.height);

  const grid = buildNavGrid(computed);
  const promptPath = findOfficePath(grid, computed.deskStandPoints.agent_builder, computed.stationStandPoints.promptops);
  const imgPath = findOfficePath(grid, computed.deskStandPoints.code_generator, computed.stationStandPoints.image_generation);
  assert.ok(promptPath.some((wp) => wp.bridgeId === 'bridge-content'), 'expected promptops path to traverse bridge-content');
  assert.ok(imgPath.some((wp) => wp.bridgeId === 'bridge-content'), 'expected image_generation path to traverse bridge-content');
  assert.equal(promptPath[promptPath.length - 1].y, contentZone.height);
  assert.equal(imgPath[imgPath.length - 1].y, contentZone.height);
});

