import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeScene, type Providers } from '../lib/orchestration/context';
import { orderedReferences } from '../lib/taste/presentation';
import type { Scene } from '../types/context';
const unexpected = async (): Promise<never> => { throw new Error('Unexpected investigation'); };
test('analysis retains every returned reference while limiting Qloo work and prioritizing the explicit question', async () => {
  let queried: string[] = [];
  const provider: Providers = {
    vision: { inspectScene: async () => Array.from({ length: 12 }, (_, index) => ({ label: `Reference ${index}`, category: 'brand', culturallyRelevant: true, confidence: index === 11 ? 0.3 : 0.9 })) },
    qloo: { resolveEntities: async (items) => { queried = items.map((item) => item.label); return items.map((item) => ({ detectedName: item.label, detectedCategory: item.category, qlooName: item.label, qlooId: item.label, visionConfidence: item.confidence, matchConfidence: 0.95, source: 'vision' })); }, analyzeConnections: async (items) => ({ entities: items, relationships: [], themes: [], facts: [], confidence: 0.5 }), analyzeTaste: unexpected, getLocationContext: unexpected, exploreReference: unexpected },
    llm: { nextTurn: async () => ({ kind: 'answer', result: { answer: 'Ignored prose.', confidence: 'low' } }) },
  };
  const result = await analyzeScene({ image: 'fixture', mode: 'scene', question: 'Explain Reference 9.' }, provider);
  assert.equal(queried.length, 8); assert.equal(queried[0], 'Reference 9');
  assert.equal(result.culturalEvidence.entities.length, 12);
  assert.equal(result.culturalEvidence.entities.find((entity) => entity.detectedName === 'Reference 11')?.resolutionPending, true);
  assert.match(result.warnings!.join(' '), /retained/);
  assert.equal(orderedReferences(result, undefined, 'balanced', 'Explain Reference 9.')[0].detectedName, 'Reference 9');
});
test('cultural evidence and confidence outrank taste without mutating the signed detections', () => {
  const entities = ['important', 'favorite', 'uncertain'].map((id) => ({ detectedName: id, detectedCategory: 'brand', qlooId: id, matchConfidence: 0.95, visionConfidence: id === 'uncertain' ? 0.6 : 0.95, source: 'vision' as const }));
  const scene: Scene = { id: 'fixture', createdAt: '2026-10-08T00:00:00.000Z', summary: 'Generic.', confidence: 'medium', culturalEvidence: { entities, confidence: 0.5, themes: [], relationships: [{ source: 'important', target: 'external', strength: 0.9, evidenceSource: 'qloo', description: 'Measured affinity.' }] } };
  const taste = { profileSignature: 'a'.repeat(64), referenceIds: entities.map((entity) => entity.qlooId), connections: [{ referenceId: 'favorite', interestId: 'profile', kind: 'affinity' as const, strength: 0.99, description: 'Affinity.', evidenceSource: 'qloo' as const }], warnings: [] };
  assert.equal(orderedReferences(scene, taste, 'familiar')[0].qlooId, 'important');
  assert.equal(orderedReferences(scene, taste, 'familiar', 'Explain favorite.')[0].qlooId, 'favorite');
  assert.strictEqual(scene.culturalEvidence.entities, entities); assert.equal(entities[0].qlooId, 'important');
});
