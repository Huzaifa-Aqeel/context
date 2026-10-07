import assert from 'node:assert/strict';
import test from 'node:test';
import { TaskScope } from '../lib/lifecycle/task';
import { useContextStore } from '../stores/context';
test('late media and locality work cannot apply after cancellation, replacement, backgrounding or session clear', () => {
  const scope = new TaskScope(); let generation = 1; let active = true;
  const first = scope.begin(generation, () => generation, () => active); assert.equal(first.current(), true);
  const replacement = scope.begin(generation, () => generation, () => active); assert.equal(first.current(), false);
  scope.cancel(); assert.equal(replacement.current(), false);
  const cleared = scope.begin(generation, () => generation, () => active); generation++; assert.equal(cleared.current(), false);
  const background = scope.begin(generation, () => generation, () => active); active = false; assert.equal(background.current(), false);
});
test('only the active microphone owner can release the recording lock', () => {
  const state = useContextStore.getState(); assert.equal(state.beginRecording('first'), true);
  assert.equal(useContextStore.getState().beginRecording('second'), false);
  useContextStore.getState().endRecording('second'); assert.equal(useContextStore.getState().recordingOwner, 'first');
  useContextStore.getState().endRecording('first'); assert.equal(useContextStore.getState().recordingOwner, null);
});
