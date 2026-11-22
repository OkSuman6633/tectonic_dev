import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentState, formatDuration } from '../src/components/command/agentStateStyles.ts';

test('maps runtime states to the enterprise status vocabulary', () => {
  assert.equal(normalizeAgentState('idle').label, 'Ready');
  assert.equal(normalizeAgentState('thinking').label, 'Thinking');
  assert.equal(normalizeAgentState('tool_execution').label, 'Running');
  assert.equal(normalizeAgentState('waiting').label, 'Waiting');
  assert.equal(normalizeAgentState('error').label, 'Failed');
  assert.equal(normalizeAgentState('disabled').label, 'Disabled');
  assert.equal(normalizeAgentState('offline').label, 'Offline');
});

test('formats execution durations consistently', () => {
  assert.equal(formatDuration(0), '0 ms');
  assert.equal(formatDuration(999), '999 ms');
  assert.equal(formatDuration(1000), '1.00 s');
  assert.equal(formatDuration(125500), '2m 5.50s');
});
