import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeScene, explore, type Providers } from '../lib/orchestration/context';
import { selectQlooMatch } from '../lib/qloo/client';
import { scenePresentation } from '../lib/taste/presentation';
import { includeLocality, useContextStore } from '../stores/context';
import type { Scene } from '../types/context';
import type { TasteContext, TasteProfile } from '../types/taste';

const unavailable = async (): Promise<never> => { throw new Error('Unnecessary provider call'); };
const a24 = { detectedName: 'A24', detectedCategory: 'brand', qlooId: 'a24', qlooName: 'A24', qlooType: 'urn:entity:brand', visionConfidence: 0.96, matchConfidence: 0.95, source: 'vision' as const };
const a24Fact = { entityId: 'a24', name: 'A24', category: 'urn:entity:brand', description: 'An independent film and television company.', tags: ['Independent Film'], source: 'qloo' as const };
const scene: Scene = { id: 'audit-scene', createdAt: '2026-10-08T00:00:00.000Z', origin: 'image', summary: 'A24 is visible.', confidence: 'medium', culturalEvidence: { entities: [a24], facts: [a24Fact], relationships: [], themes: [], confidence: 0.7 } };
const profile: TasteProfile = { entities: [{ id: 'a24', name: 'A24', type: 'urn:entity:brand' }], signature: 'a'.repeat(64) };
const exactTaste: TasteContext = { profileSignature: profile.signature!, referenceIds: ['a24'], connections: [{ referenceId: 'a24', interestId: 'a24', kind: 'exact', description: 'Exact.', evidenceSource: 'qloo' }], warnings: [] };
const providers = (): Providers => ({ vision: { inspectScene: unavailable }, qloo: { resolveEntities: unavailable, analyzeConnections: unavailable, exploreReference: unavailable, getLocationContext: unavailable, analyzeTaste: unavailable, getEntityFact: unavailable }, llm: { nextTurn: unavailable } });

test('Qloo resolution does not force albums into an Insights entity type; direct names and unique venue locality still work', () => {
  const album = selectQlooMatch({ label: 'OK Computer', category: 'album', confidence: 0.96, culturallyRelevant: true }, [
    { entity_id: 'album', name: 'OK Computer', types: ['urn:entity:album'] },
    { entity_id: 'show', name: 'OK Computer', types: ['urn:entity:tv_show'] },
  ]);
  assert.equal(album.qlooId, undefined);
  const ferrari = selectQlooMatch({ label: 'Ferrari', category: 'brand', confidence: 0.96, culturallyRelevant: true }, [
    { entity_id: 'ferrari', name: 'Ferrari', types: ['urn:entity:brand'] },
    { entity_id: 'other', name: 'Ferrari Trento', types: ['urn:entity:brand'], properties: { akas: [{ value: 'Ferrari' }] } },
  ]);
  assert.equal(ferrari.qlooId, 'ferrari');
  const venues = [
    { entity_id: 'poland', name: 'Blue Note Jazz Club', types: ['urn:entity:place'], properties: { geocode: { city: 'Poznan', country: 'Poland' } } },
    { entity_id: 'illinois', name: 'Blue Note Jazz Club', types: ['urn:entity:place'], properties: { geocode: { city: 'Broadview', country: 'United States' } } },
  ];
  const detected = { label: 'Blue Note Jazz Club', category: 'venue', confidence: 0.96, culturallyRelevant: true };
  assert.equal(selectQlooMatch(detected, venues).qlooId, undefined);
  assert.equal(selectQlooMatch(detected, venues, { city: 'Broadview' }).qlooId, 'illinois');
  assert.equal(selectQlooMatch(detected, venues, { city: 'Brooklyn' }).qlooId, undefined);
  assert.equal(selectQlooMatch({ label: 'iPhone', category: 'product', confidence: 0.96, culturallyRelevant: true }, []).detectedName, 'iPhone');
});

test('capture names unresolved visual subjects and never fetches nearby places by default', async () => {
  const service = providers(); let locations = 0;
  service.vision.inspectScene = async () => [{ label: 'The Starry Night', category: 'artwork', confidence: 0.96, culturallyRelevant: true }];
  service.qloo.resolveEntities = async () => [{ detectedName: 'The Starry Night', detectedCategory: 'artwork', visionConfidence: 0.96, matchConfidence: 0.4, source: 'vision' }];
  service.qloo.getLocationContext = async () => { locations++; throw new Error('Should not query locality'); };
  const result = await analyzeScene({ image: 'assumed-detection', mode: 'scene', locality: { city: 'Brooklyn' } }, service);
  assert.match(result.summary, /The Starry Night/);
  assert.match(result.summary, /could not match that reference uniquely/);
  assert.equal(locations, 0);
  const followup = await explore({ scene: result, locality: { city: 'Brooklyn' }, question: 'What here connects to my interests?', mode: 'scene', messages: [] }, service);
  assert.match(followup.answer, /The Starry Night/);
  assert.equal(locations, 0);
});

test('specific reference and exact-interest questions answer from retained evidence without Qloo or LLM', async () => {
  const service = providers();
  const definition = await explore({ scene, question: 'What is A24?', mode: 'scene', messages: [] }, service);
  assert.match(definition.answer, /independent film and television company/);
  assert.doesNotMatch(definition.answer, /MUBI|related reference|Auteur Cinema/);
  assert.ok(definition.answer.length < 180);
  const interest = await explore({ scene, profile, tasteContext: exactTaste, question: 'Is A24 relevant to my interests?', mode: 'scene', messages: [] }, service);
  assert.equal(interest.answer, 'Yes. A24 is one of the interests in your profile.');
  const connection = await explore({ scene, question: 'How do these connect?', mode: 'scene', messages: [] }, service);
  assert.match(connection.answer, /only one confirmed scene reference/);
});

test('scene taste uses explainable links only and chosen photos do not inherit the device area', () => {
  const affinity: TasteContext = { ...exactTaste, connections: [{ referenceId: 'a24', interestId: 'film', kind: 'affinity', strength: 0.9, description: 'Opaque score.', evidenceSource: 'qloo' }] };
  const filmProfile: TasteProfile = { ...profile, entities: [{ id: 'film', name: 'Interstellar', type: 'urn:entity:movie' }] };
  assert.equal(scenePresentation(scene, filmProfile, affinity, true, 'balanced', ''), scene.summary);
  assert.match(scenePresentation(scene, filmProfile, { ...affinity, connections: [{ ...affinity.connections[0], sharedTags: ['Independent Film'] }] }, true, 'balanced', ''), /share Independent Film/);
  useContextStore.getState().clearSession();
  try {
    useContextStore.getState().setLocationEnabled(true);
    useContextStore.getState().setImage('chosen-photo', 'library');
    assert.equal(includeLocality(useContextStore.getState()), false);
    useContextStore.getState().setImage('new-capture', 'camera');
    assert.equal(includeLocality(useContextStore.getState()), true);
  } finally { useContextStore.getState().clearSession(); }
});

test('an explicit A24–Interstellar question investigates only the named pair once', async () => {
  const service = providers(); let turns = 0; const pairCalls: string[][] = [];
  service.llm.nextTurn = async () => turns++ === 0 ? { kind: 'investigate', action: { tool: 'resolveEntity', name: 'Interstellar', category: 'film' } } : { kind: 'answer', result: { answer: 'Ignored.', confidence: 'medium', evidenceSelections: [{ kind: 'relationship', source: 'a24', target: 'film', relationshipKind: 'shared_tags' }] } };
  service.qloo.resolveEntities = async () => [{ detectedName: 'Interstellar', detectedCategory: 'film', qlooId: 'film', qlooName: 'Interstellar', qlooType: 'urn:entity:movie', visionConfidence: 1, matchConfidence: 0.95, source: 'user' }];
  service.qloo.analyzeConnections = async (entities) => { pairCalls.push(entities.map((item) => item.qlooId!)); return { entities, facts: [a24Fact, { entityId: 'film', name: 'Interstellar', category: 'urn:entity:movie', tags: ['Independent Film'], source: 'qloo' }], relationships: [{ source: 'a24', target: 'film', kind: 'shared_tags', description: 'Shared tag.', evidenceSource: 'qloo' }], themes: ['Independent Film'], confidence: 0.8 }; };
  const answer = await explore({ scene, question: 'How does A24 connect to Interstellar?', mode: 'scene', messages: [] }, service);
  assert.deepEqual(pairCalls, [['a24', 'film']]);
  assert.match(answer.answer, /A24 and Interstellar shared cultural tags/);
});

test('a related Qloo artist does not replace the visible album in a specific follow-up', async () => {
  const service = providers();
  const album: Scene = { ...scene, id: 'album-scene', culturalEvidence: { ...scene.culturalEvidence,
    entities: [{ detectedName: 'OK Computer', detectedCategory: 'album', carrier: 'album_cover', visualDescription: 'an OK Computer album cover', relatedName: 'Radiohead', groundingBasis: 'related', qlooId: 'radiohead', qlooName: 'Radiohead', qlooType: 'urn:entity:artist', visionConfidence: .96, matchConfidence: .95, source: 'vision' }],
    facts: [{ entityId: 'radiohead', name: 'Radiohead', category: 'urn:entity:artist', description: 'An English rock band.', tags: [], source: 'qloo' }] } };
  const answer = await explore({ scene: album, question: 'What is OK Computer?', mode: 'scene', messages: [] }, service);
  assert.match(answer.answer, /^I can see an OK Computer album cover by Radiohead\./);
  assert.match(answer.answer, /Radiohead is an English rock band/);
});
