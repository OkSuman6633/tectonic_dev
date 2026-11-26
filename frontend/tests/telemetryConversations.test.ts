import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTelemetrySnapshot, useTelemetryStore } from '../src/store/useTelemetryStore.ts';
import type { TelemetryEvent } from '../src/types/telemetry.ts';

describe('useTelemetryStore per-conversation 3D snapshots', () => {
  it('clears the 3D scene for a new conversation while keeping catalog metadata', () => {
    const store = useTelemetryStore.getState();
    store.clearForConversation();

    const events: TelemetryEvent[] = [
      {
        type: 'AGENT_CREATED',
        seq: 1,
        timestamp: 100,
        id: 'agent_builder',
        role: 'agent_builder',
        parent_id: null,
        system_prompt: 'Build agents',
        description: 'Root builder',
        model: 'gemini-3.6-flash',
      },
      {
        type: 'MODULE_REGISTERED',
        seq: 0,
        timestamp: 100,
        module: 'guardrails',
        label: 'Guardrails',
        description: 'Safety checks',
        category: 'safety',
        operations: [],
      },
      {
        type: 'AGENT_STATE_CHANGE',
        seq: 2,
        timestamp: 101,
        id: 'agent_builder',
        state: 'thinking',
      },
    ];

    store.ingest(events);
    let state = useTelemetryStore.getState();
    assert.deepEqual(state.agentOrder, ['agent_builder']);
    assert.deepEqual(state.moduleOrder, ['guardrails']);

    // Export snapshot for Conversation A
    const convASnapshot = state.exportSnapshot();
    assert.deepEqual(convASnapshot.agentOrder, ['agent_builder']);
    assert.deepEqual(convASnapshot.moduleOrder, ['guardrails']);

    // Start New Chat -> 3D module must become completely empty
    store.clearForConversation();
    state = useTelemetryStore.getState();
    assert.deepEqual(state.agentOrder, []);
    assert.deepEqual(state.moduleOrder, []);
    assert.deepEqual(Object.keys(state.agents), []);
    assert.deepEqual(Object.keys(state.modules), []);

    // When a new conversation runs, catalog metadata hydrates agents/modules without stubbing
    store.ingest([
      {
        type: 'AGENT_STATE_CHANGE',
        seq: 3,
        timestamp: 200,
        id: 'agent_builder',
        state: 'thinking',
      },
    ]);
    state = useTelemetryStore.getState();
    assert.deepEqual(state.agentOrder, ['agent_builder']);
    assert.equal(state.agents.agent_builder.description, 'Root builder');
    assert.equal(state.agents.agent_builder.stub, false);

    // Reload Conversation A -> restores its exact 3D view and normalizes transient states to idle
    store.restoreSnapshot(convASnapshot);
    state = useTelemetryStore.getState();
    assert.deepEqual(state.agentOrder, ['agent_builder']);
    assert.deepEqual(state.moduleOrder, ['guardrails']);
    assert.equal(state.agents.agent_builder.state, 'idle');

    // Empty snapshot restores clean empty 3D view
    store.restoreSnapshot(emptyTelemetrySnapshot());
    state = useTelemetryStore.getState();
    assert.deepEqual(state.agentOrder, []);
    assert.deepEqual(state.moduleOrder, []);
    store.disconnect();
  });
});
