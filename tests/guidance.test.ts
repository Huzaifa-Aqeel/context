import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityAnswer, isCapabilityQuestion, isGuidanceText, sceneGuidanceKind, sceneGuidance } from '../lib/guidance/scene-guidance';
import type { Scene } from '../types/context';

test('each prioritized capture flow has one distinct Ask Context capability answer', () => {
  const book = { shelf: { kind: 'book' } } as Scene;
  const game = { shelf: { kind: 'game' } } as Scene;
  const event = { event: {} } as Scene;
  assert.equal(sceneGuidanceKind(book), 'book_shelf');
  assert.equal(sceneGuidanceKind(game), 'game_shelf');
  assert.equal(sceneGuidanceKind(event), 'event_material');
  assert.equal(capabilityAnswer(book), sceneGuidance.book_shelf);
  assert.equal(capabilityAnswer(game), sceneGuidance.game_shelf);
  assert.equal(capabilityAnswer(event), sceneGuidance.event_material);
  assert.equal(new Set(Object.values(sceneGuidance)).size, 3);
  assert.equal(isGuidanceText(capabilityAnswer(book)), true);
  assert.equal(isGuidanceText(capabilityAnswer({} as Scene)), true);
  assert.equal(isCapabilityQuestion('What can I ask?'), true);
  assert.equal(isCapabilityQuestion('What can you do with this?'), true);
  assert.equal(isCapabilityQuestion('What is this book about?'), false);
});
