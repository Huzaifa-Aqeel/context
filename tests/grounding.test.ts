import assert from 'node:assert/strict';
import test from 'node:test';
import { explore, type Providers } from '../lib/orchestration/context';
import { renderGroundedAnswer } from '../lib/orchestration/grounding';
import { reasoningTaste } from '../lib/taste/reasoning';
import type { Scene } from '../types/context';
import type { TasteContext, TasteProfile } from '../types/taste';
const entity = { detectedName: 'Nike', detectedCategory: 'brand', qlooId: 'brand', qlooName: 'Nike', qlooType: 'urn:entity:brand', visionConfidence: 0.9, matchConfidence: 0.95, source: 'vision' as const };
const scene: Scene = { id: 'test', createdAt: '2026-10-08T00:00:00.000Z', summary: 'Generic context.', confidence: 'medium', culturalEvidence: { entities: [entity], relationships: [], themes: [], confidence: 0.5, facts: [{ entityId: 'brand', name: 'Nike', category: 'urn:entity:brand', tags: ['Sportswear'], description: 'An athletic brand.', source: 'qloo' }] } };
const profile: TasteProfile = { entities: [{ id: 'artist', name: 'Radiohead', type: 'urn:entity:artist' }], signature: 'a'.repeat(64) };
const taste: TasteContext = { profileSignature: profile.signature!, referenceIds: ['brand'], connections: [{ referenceId: 'brand', interestId: 'artist', kind: 'affinity', strength: 0.4, description: 'Affinity only.', evidenceSource: 'qloo' }], warnings: [] };
const unexpected = async (): Promise<never> => { throw new Error('Unexpected query'); };
const services = (): Providers => ({ vision: { inspectScene: unexpected }, qloo: { resolveEntities: unexpected, analyzeConnections: unexpected, exploreReference: unexpected, getLocationContext: unexpected, analyzeTaste: unexpected }, llm: { nextTurn: async () => ({ kind: 'answer', result: { answer: 'Nike collaborated with Radiohead because of your personality.', confidence: 'high', usedTasteConnections: [] } }) } });
const request = { scene, profile, tasteContext: taste, question: 'Explain Nike.', mode: 'reference' as const, messages: [] };

test('empty citations cannot smuggle invented prose or personal traits into a spoken explanation', async () => {
  const result = await explore(request, services());
  assert.doesNotMatch(result.answer, /collaborated|personality|Radiohead/);
  assert.match(result.answer, /athletic brand/);
});

test('a weak affinity produces a qualified bridge and cannot become authorship or a stylistic analogy', () => {
  const result = renderGroundedAnswer(request, scene.culturalEvidence, undefined, taste, [{ kind: 'taste', referenceId: 'brand', interestId: 'artist' }]);
  assert.match(result.answer, /limited cultural affinity/); assert.match(result.answer, /does not establish a specific similarity/);
  assert.equal(result.limited, true); assert.equal(result.usedTasteConnections.length, 1);
  assert.throws(() => renderGroundedAnswer(request, scene.culturalEvidence, undefined, taste, [{ kind: 'taste', referenceId: 'invented', interestId: 'artist' }]), /verified/);
  assert.throws(() => renderGroundedAnswer(request, scene.culturalEvidence, undefined, taste, [{ kind: 'fact', entityId: 'invented' }]), /verified/);
});

test('changing an entity inside exploration invalidates the old taste pair before the next answer', async () => {
  const provider = services(); let turn = 0;
  provider.qloo.resolveEntities = async () => [{ ...entity, qlooId: 'new-brand' }];
  provider.qloo.analyzeConnections = async () => ({ entities: [], relationships: [], facts: [], themes: [], confidence: 0 });
  provider.llm.nextTurn = async (input) => {
    if (turn++ === 0) return { kind: 'investigate', action: { tool: 'resolveEntity', name: 'Nike', category: 'brand' } };
    assert.equal(input.tasteContext, undefined);
    return { kind: 'answer', result: { answer: 'Old connection.', confidence: 'high', usedTasteConnections: [{ referenceId: 'brand', interestId: 'artist' }] } };
  };
  await assert.rejects(explore(request, provider), /could not be verified/);
});

test('reasoning receives only supported anchors for explicitly requested references', () => {
  const many = { ...profile, entities: [...profile.entities, { id: 'other', name: 'Unrelated interest', type: 'urn:entity:movie' }] };
  const minimal = reasoningTaste({ instructions: '', request: { ...request, profile: many }, evidence: scene.culturalEvidence, tasteContext: taste, completedActions: [], allowInvestigation: false });
  assert.deepEqual(minimal.profile?.entities, profile.entities);
  assert.equal(reasoningTaste({ instructions: '', request: { ...request, profile: many }, evidence: scene.culturalEvidence, completedActions: [], allowInvestigation: false }).profile, undefined);
});

test('necessary observed information precedes taste without becoming navigation or an invented observation', () => {
  const observed = { ...scene, environmentalObservations: [{ label: 'Exit sign', confidence: 0.95, necessaryInformation: true }, { label: 'Chair', confidence: 0.6 }] };
  const result = renderGroundedAnswer({ ...request, scene: observed }, scene.culturalEvidence, undefined, taste, [{ kind: 'taste', referenceId: 'brand', interestId: 'artist' }]);
  assert.match(result.answer, /^The image appears to contain Exit sign/);
  assert.doesNotMatch(result.answer, /walk|navigate|safe route/);
  assert.match(renderGroundedAnswer({ ...request, scene: observed }, scene.culturalEvidence, undefined, undefined, [{ kind: 'observation', label: 'Chair' }]).answer, /identification is uncertain/);
  assert.throws(() => renderGroundedAnswer({ ...request, scene: observed }, scene.culturalEvidence, undefined, undefined, [{ kind: 'observation', label: 'Invented object' }]), /verified/);
});
