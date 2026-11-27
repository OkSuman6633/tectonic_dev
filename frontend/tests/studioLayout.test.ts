import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePanelDimensions,
  selectStudioPreset,
  toggleStudioMaximize,
} from '../src/components/studio/studioLayout.ts';

test('Chat option opens 65% / 35% when selected (minimized) and expands full left Chat on Maximize', () => {
  const chatMin = selectStudioPreset('chat');
  assert.equal(chatMin.preset, 'chat');
  assert.equal(chatMin.splitRatio, 65);
  assert.equal(chatMin.isMaximized, false);

  const minDims = computePanelDimensions(chatMin);
  assert.equal(minDims.chatWidth, '65%');
  assert.equal(minDims.officeWidth, '35%');
  assert.equal(minDims.showChat, true);
  assert.equal(minDims.showOffice, true);

  const chatMax = toggleStudioMaximize(chatMin);
  assert.equal(chatMax.preset, 'chat');
  assert.equal(chatMax.isMaximized, true);

  const maxDims = computePanelDimensions(chatMax);
  assert.equal(maxDims.chatWidth, '100%');
  assert.equal(maxDims.officeWidth, '0%');
  assert.equal(maxDims.showChat, true);
  assert.equal(maxDims.showOffice, false);

  // Clicking minimize restores back to 65% / 35%
  const restored = toggleStudioMaximize(chatMax);
  assert.equal(restored.isMaximized, false);
  assert.equal(computePanelDimensions(restored).chatWidth, '65%');
  assert.equal(computePanelDimensions(restored).officeWidth, '35%');
});

test('Split option stays strictly 50% / 50% regardless of maximize or minimize clicks', () => {
  const split = selectStudioPreset('split');
  assert.equal(split.preset, 'split');
  assert.equal(split.splitRatio, 50);
  assert.equal(split.isMaximized, false);

  const dims = computePanelDimensions(split);
  assert.equal(dims.chatWidth, '50%');
  assert.equal(dims.officeWidth, '50%');

  const afterToggle = toggleStudioMaximize(split);
  assert.equal(afterToggle.preset, 'split');
  assert.equal(afterToggle.splitRatio, 50);
  assert.equal(afterToggle.isMaximized, false);
  assert.equal(computePanelDimensions(afterToggle).chatWidth, '50%');
  assert.equal(computePanelDimensions(afterToggle).officeWidth, '50%');
});

test('3D Office option opens 35% / 65% when selected (minimized) and expands full right 3D Office on Maximize', () => {
  const officeMin = selectStudioPreset('office');
  assert.equal(officeMin.preset, 'office');
  assert.equal(officeMin.splitRatio, 35);
  assert.equal(officeMin.isMaximized, false);

  const minDims = computePanelDimensions(officeMin);
  assert.equal(minDims.chatWidth, '35%');
  assert.equal(minDims.officeWidth, '65%');
  assert.equal(minDims.showChat, true);
  assert.equal(minDims.showOffice, true);

  const officeMax = toggleStudioMaximize(officeMin);
  assert.equal(officeMax.preset, 'office');
  assert.equal(officeMax.isMaximized, true);

  const maxDims = computePanelDimensions(officeMax);
  assert.equal(maxDims.chatWidth, '0%');
  assert.equal(maxDims.officeWidth, '100%');
  assert.equal(maxDims.showChat, false);
  assert.equal(maxDims.showOffice, true);

  // Clicking minimize restores back to 35% / 65%
  const restored = toggleStudioMaximize(officeMax);
  assert.equal(restored.isMaximized, false);
  assert.equal(computePanelDimensions(restored).chatWidth, '35%');
  assert.equal(computePanelDimensions(restored).officeWidth, '65%');
});
