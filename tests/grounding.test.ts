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
const services = (): Providers => ({ vision: { inspectScene: unexpected }, qloo: { resolveEntities: unexpected, analyzeConnections: unexpected, exploreReference: unexpected, getLocationContext: unexpected, analyzeTaste: unexpected, getEntityFact: unexpected }, llm: { nextTurn: async () => ({ kind: 'answer', result: { answer: 'Nike collaborated with Radiohead because of your personality.', confidence: 'high', usedTasteConnections: [] } }) } });
const request = { scene, profile, tasteContext: taste, question: 'Explain Nike.', mode: 'reference' as const, messages: [] };

test('empty citations cannot smuggle invented prose or personal traits into a spoken explanation', async () => {
  const result = await explore(request, services());
  assert.doesNotMatch(result.answer, /collaborated|personality|Radiohead/);
  assert.match(result.answer, /athletic brand/);
});

test('a weak affinity produces a qualified bridge and cannot become authorship or a stylistic analogy', () => {
  const result = renderGroundedAnswer(request, scene.culturalEvidence, undefined, taste, [{ kind: 'taste', referenceId: 'brand', interestId: 'artist' }]);
  assert.match(result.answer, /do not have a specific supported connection/);
  assert.equal(result.limited, true); assert.equal(result.usedTasteConnections.length, 0);
  assert.doesNotMatch(renderGroundedAnswer(request, scene.culturalEvidence, undefined, taste, [{ kind: 'taste', referenceId: 'invented', interestId: 'artist' }]).answer, /invented/);
  assert.doesNotMatch(renderGroundedAnswer(request, scene.culturalEvidence, undefined, taste, [{ kind: 'fact', entityId: 'invented' }]).answer, /invented/);
});

test('a requested familiar comparison uses the stated interest record and shared Qloo tags', async () => {
  const provider = services(); let lookups = 0;
  provider.qloo.getEntityFact = async (id) => {
    lookups++;
    assert.equal(id, 'artist');
    return { entityId: 'artist', name: 'Radiohead', category: 'urn:entity:artist', tags: ['Alternative'], description: 'An alternative rock band.', source: 'qloo' };
  };
  const relatedScene = { ...scene, culturalEvidence: { ...scene.culturalEvidence, facts: [{ ...scene.culturalEvidence.facts![0], tags: ['Alternative', 'Sportswear'] }] } };
  const strongTaste: TasteContext = { ...taste, connections: [{ ...taste.connections[0], strength: 0.8 }] };
  provider.llm.nextTurn = async () => ({ kind: 'answer', result: { answer: 'An invented analogy.', confidence: 'medium', evidenceSelections: [{ kind: 'taste', referenceId: 'brand', interestId: 'artist' }] } });
  const result = await explore({ ...request, scene: relatedScene, tasteContext: strongTaste, question: 'Explain Nike through an interest I know.' }, provider);
  assert.equal(lookups, 1);
  assert.match(result.answer, /Nike and your interest in Radiohead share/);
  assert.match(result.answer, /Alternative/);
  assert.doesNotMatch(result.answer, /invented analogy|similar style/);
});

test('an ordinary question and failed anchor lookup do not block the scene answer', async () => {
  const provider = services(); let lookups = 0;
  provider.qloo.getEntityFact = async () => { lookups++; throw new Error('Qloo unavailable'); };
  provider.llm.nextTurn = async () => ({ kind: 'answer', result: { answer: 'Provider prose.', confidence: 'medium', evidenceSelections: [{ kind: 'taste', referenceId: 'brand', interestId: 'artist' }] } });
  const strongTaste: TasteContext = { ...taste, connections: [{ ...taste.connections[0], strength: 0.8 }] };
  await explore({ ...request, tasteContext: strongTaste }, provider);
  assert.equal(lookups, 0);
  const result = await explore({ ...request, tasteContext: strongTaste, question: 'Explain Nike through an interest I know.' }, provider);
  assert.equal(lookups, 1);
  assert.match(result.answer, /do not have a specific supported connection/);
});

test('changing an entity inside exploration invalidates the old taste pair before the next answer', async () => {
  const provider = services(); let turn = 0;
  provider.qloo.resolveEntities = async () => [{ ...entity, detectedName: 'New brand', qlooId: 'new-brand' }];
  provider.qloo.analyzeConnections = async () => ({ entities: [], relationships: [], facts: [], themes: [], confidence: 0 });
  provider.llm.nextTurn = async (input) => {
    if (turn++ === 0) return { kind: 'investigate', action: { tool: 'resolveEntity', name: 'New brand', category: 'brand' } };
    assert.equal(input.tasteContext, undefined);
    return { kind: 'answer', result: { answer: 'Old connection.', confidence: 'high', usedTasteConnections: [{ referenceId: 'brand', interestId: 'artist' }] } };
  };
  await assert.rejects(explore({ ...request, question: 'How does New brand connect to my interests?' }, provider), /could not be verified/);
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
