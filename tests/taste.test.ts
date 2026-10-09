import assert from 'node:assert/strict';
import test from 'node:test';
import { extractInterests } from '../lib/groq/interests';
import { GroqClient } from '../lib/groq/client';
import { groqConfig } from '../lib/server/config';
import { resolveTasteInterests, confirmTasteProfile } from '../lib/taste/profile';
import { investigateTaste, tasteReferences } from '../lib/taste/context';
import { interestConnection, orderedReferences, scenePresentation } from '../lib/taste/presentation';
import { QlooClient } from '../lib/qloo/client';
import { sealDocument, sealScene, verifyEvidence } from '../lib/server/evidence';
import { explore, type Providers } from '../lib/orchestration/context';
import { activeTasteRequest, assertCurrentSession, conversationForRequest, useContextStore } from '../stores/context';
import { POST as confirmRoute } from '../app/api/taste/confirm+api';
import { tasteProfileSchema } from '../schemas/taste';
import type { TasteContext, TasteDraft, TasteProfile } from '../types/taste';
import type { Scene } from '../types/context';
const profile: TasteProfile = { entities: [{ id: 'interest', name: 'Radiohead', type: 'urn:entity:artist' }], signature: 'a'.repeat(64) };
const context: TasteContext = { profileSignature: profile.signature!, referenceIds: ['film', 'brand'], connections: [{ referenceId: 'brand', interestId: 'interest', kind: 'affinity', strength: 0.8, sharedTags: ['Culture'], evidenceSource: 'qloo', description: 'Measured Qloo affinity.' }], warnings: [] };
const scene: Scene = { id: 'scene', createdAt: '2026-10-08T00:00:00.000Z', summary: 'Generic scene context.', confidence: 'medium', culturalEvidence: { entities: [
  { detectedName: 'Interstellar', detectedCategory: 'film', qlooId: 'film', qlooName: 'Interstellar', qlooType: 'urn:entity:movie', visionConfidence: 0.98, matchConfidence: 0.95, source: 'vision' },
  { detectedName: 'Nike', detectedCategory: 'brand', qlooId: 'brand', qlooName: 'Nike', qlooType: 'urn:entity:brand', visionConfidence: 0.99, matchConfidence: 0.95, source: 'vision' },
], facts: [], relationships: [], themes: [], confidence: 0.5 } };
const unexpected = async (): Promise<never> => { throw new Error('Unexpected investigation'); };
function providers(): Providers {
  return { vision: { inspectScene: unexpected }, qloo: { resolveEntities: unexpected, analyzeConnections: unexpected, exploreReference: unexpected, getLocationContext: unexpected, analyzeTaste: unexpected, getEntityFact: unexpected }, llm: { nextTurn: async () => ({ kind: 'answer', result: { answer: 'Available environmental context.', confidence: 'low' } }) } };
}
const draft: TasteDraft = { candidates: [
  { label: 'Radiohead', category: 'artist', status: 'matched', entity: profile.entities[0] },
  { label: 'Queen', category: 'artist', status: 'clarify', candidates: [{ id: 'queen', name: 'Queen', type: 'urn:entity:artist' }] },
  { label: 'Something obscure', category: 'unknown', status: 'no_match' },
] };

test('LLM interest extraction excludes invented and duplicate interests', async () => {
  const client = new GroqClient(groqConfig({ GROQ_API_KEY: 'fixture' }), async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ interests: [{ label: 'Radiohead', category: 'artist' }, { label: 'Radiohead', category: 'artist' }, { label: 'Interstellar', category: 'film' }, { label: 'Invented interest', category: 'brand' }] }) } }] }));
  assert.deepEqual((await extractInterests(client, 'I like Radiohead and Interstellar.')).map((item) => item.label), ['Radiohead', 'Interstellar']);
});

test('Qloo resolution creates three review states without creating profile entities', async () => {
  const services = providers(); services.qloo.resolveEntities = async () => [
    { detectedName: 'Radiohead', detectedCategory: 'artist', visionConfidence: 1, qlooId: 'interest', qlooName: 'Radiohead', qlooType: 'urn:entity:artist', matchConfidence: 0.95 },
    { detectedName: 'Queen', detectedCategory: 'artist', visionConfidence: 1, candidates: [{ id: 'queen', name: 'Queen', type: 'urn:entity:artist' }], matchConfidence: 0.4 },
    { detectedName: 'Something obscure', detectedCategory: 'unknown', visionConfidence: 1, candidates: [] },
  ];
  const result = await resolveTasteInterests(draft.candidates.map((candidate) => ({ label: candidate.label, category: candidate.category })), services.qloo);
  assert.deepEqual(result.candidates.map((candidate) => candidate.status), ['matched', 'clarify', 'no_match']);
  assert.equal('entities' in result, false);
  assert.deepEqual(confirmTasteProfile(result, ['interest']).entities, profile.entities);
  assert.throws(() => confirmTasteProfile(result, ['queen']), /Only matched/);
});

test('clarification confirms only a user-selected candidate from the signed Qloo draft', () => {
  const confirmed = confirmTasteProfile(draft, ['queen'], [{ label: 'Queen', entityId: 'queen' }]);
  assert.equal(confirmed.entities[0].name, 'Queen');
  assert.throws(() => confirmTasteProfile(draft, ['invented'], [{ label: 'Queen', entityId: 'invented' }]), /Qloo matches/);
  assert.throws(() => confirmTasteProfile(draft, ['queen']), /Only matched/);
});

test('personalized opening is a derived spoken view and disabling it restores the unchanged summary', () => {
  const original = JSON.stringify(scene);
  assert.match(scenePresentation(scene, profile, context, true, 'balanced', ''), /Nike and your interest in Radiohead share Culture/);
  assert.equal(scenePresentation(scene, profile, context, false, 'balanced', ''), scene.summary);
  assert.equal(scenePresentation(scene, profile, { ...context, connections: [] }, true, 'balanced', ''), scene.summary);
  assert.equal(JSON.stringify(scene), original);
});

test('profile confirmation rejects tampered drafts and permits leaving unresolved items out', async () => {
  const original = process.env.SESSION_SIGNING_KEY; process.env.SESSION_SIGNING_KEY = 'taste-fixture-key';
  try {
    const signed = await sealDocument(draft, 'taste-draft');
    const request = (body: unknown) => new Request('https://context.test/api/taste/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await confirmRoute(request({ draft: signed, includedIds: ['interest'] }));
    assert.equal(result.status, 200); const confirmed = tasteProfileSchema.parse(await result.json());
    await verifyEvidence({ profile: confirmed }); assert.equal(confirmed.entities.length, 1);
    assert.equal((await confirmRoute(request({ draft: { ...signed, candidates: [] }, includedIds: ['interest'] }))).status, 400);
  } finally { if (original === undefined) delete process.env.SESSION_SIGNING_KEY; else process.env.SESSION_SIGNING_KEY = original; }
});

test('personalization and strategy change only the reference view, never detections', () => {
  const original = JSON.stringify(scene);
  assert.deepEqual(orderedReferences(scene).map((item) => item.qlooId), ['film', 'brand']);
  assert.deepEqual(orderedReferences(scene, context, 'familiar').map((item) => item.qlooId), ['brand', 'film']);
  assert.deepEqual(orderedReferences(scene, context, 'discover').map((item) => item.qlooId), ['film', 'brand']);
  assert.deepEqual(orderedReferences(scene, context, 'familiar', 'Explain Interstellar.').map((item) => item.qlooId), ['film', 'brand']);
  assert.deepEqual(orderedReferences(scene, context, 'familiar', '', ['film']).map((item) => item.qlooId), ['film', 'brand']);
  assert.equal(JSON.stringify(scene), original);
});

test('weak taste evidence never highlights a reference or promotes an uncertain identification', () => {
  assert.equal(interestConnection('brand', { ...context, connections: [{ ...context.connections[0], strength: 0.2 }] }), undefined);
  const uncertain: Scene = { ...scene, culturalEvidence: { ...scene.culturalEvidence, entities: [scene.culturalEvidence.entities[0], { ...scene.culturalEvidence.entities[1], visionConfidence: 0.6 }] } };
  assert.equal(orderedReferences(uncertain, context, 'familiar')[0].qlooId, 'film');
});

test('deleting the profile preserves scene and generic history while excluding old taste', () => {
  const state = useContextStore.getState(); state.clearSession(); state.setScene(scene);
  useContextStore.getState().addMessage({ role: 'assistant', content: 'Generic context.' });
  useContextStore.getState().setProfile(profile);
  useContextStore.getState().addMessage({ role: 'assistant', content: 'Personalized context.' });
  useContextStore.getState().setTasteContext(context);
  const generation = useContextStore.getState().generation;
  useContextStore.getState().clearTaste();
  assert.strictEqual(useContextStore.getState().scene, scene); assert.equal(useContextStore.getState().messages.length, 1);
  assert.deepEqual(activeTasteRequest(), {}); assert.equal(useContextStore.getState().tasteContext, null);
  assert.deepEqual(conversationForRequest().map((message) => message.content), ['Generic context.']);
  assert.throws(() => assertCurrentSession(generation), /changed/);
  useContextStore.getState().clearSession();
});

test('taste evidence binds to the current profile and rejects substitution', async () => {
  const original = process.env.SESSION_SIGNING_KEY; process.env.SESSION_SIGNING_KEY = 'taste-fixture-key';
  try {
    const signedProfile = await sealDocument(profile, 'taste-profile');
    const signedContext = await sealDocument({ ...context, profileSignature: signedProfile.signature! }, 'taste-context');
    await verifyEvidence({ profile: signedProfile, tasteContext: signedContext });
    const changed = await sealDocument({ ...profile, entities: [{ ...profile.entities[0], name: 'Changed interest' }] }, 'taste-profile');
    await assert.rejects(verifyEvidence({ profile: changed, tasteContext: signedContext }), /interests changed/);
    await assert.rejects(verifyEvidence({ profile: signedProfile, tasteContext: { ...signedContext, connections: [] } }), /changed/);
  } finally { if (original === undefined) delete process.env.SESSION_SIGNING_KEY; else process.env.SESSION_SIGNING_KEY = original; }
});

test('Qloo taste checks use individual confirmed interests and only returned shortlist affinities', async () => {
  let requests = 0;
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (input) => {
    requests++; const url = new URL(String(input));
    if (url.pathname === '/entities') return Response.json({ results: url.searchParams.get('entity_ids')!.split(',').map((id) => ({ entity_id: id, name: id, types: [id === 'interest' ? 'urn:entity:artist' : id === 'film' ? 'urn:entity:movie' : 'urn:entity:brand'], tags: [{ tag_id: 'urn:tag:genre:test:shared', name: 'Culture' }] })) });
    assert.equal(url.searchParams.get('signal.interests.entities'), 'interest');
    const id = url.searchParams.get('filter.results.entities')!;
    return Response.json({ results: { entities: [{ entity_id: id, name: id, subtype: url.searchParams.get('filter.type'), query: { affinity: 0.8 } }, { entity_id: 'unrequested', name: 'Unrequested', query: { affinity: 0.99 } }] } });
  });
  const result = await client.analyzeTaste(profile.entities, tasteReferences(scene));
  assert.equal(requests, 3); assert.equal(result.connections.length, 2);
  assert.ok(result.connections.every((connection) => ['film', 'brand'].includes(connection.referenceId) && connection.interestId === 'interest' && connection.evidenceSource === 'qloo'));
});

test('taste query budget is bounded and exact profile references need no affinity call', async () => {
  let requests = 0;
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async () => { requests++; return Response.json({ results: { entities: [] } }); });
  const many = Array.from({ length: 10 }, (_, index) => ({ id: `interest-${index}`, name: `Interest ${index}`, type: 'urn:entity:artist' }));
  const result = await client.analyzeTaste(many, tasteReferences(scene)); assert.equal(requests, 1); assert.ok(result.warnings.length);
  const exact = await client.analyzeTaste(profile.entities, profile.entities); assert.equal(exact.connections[0].kind, 'exact'); assert.equal(requests, 1);
});

test('Qloo taste outage degrades to environmental context without inventing a bridge', async () => {
  const result = await investigateTaste(profile, tasteReferences(scene), providers().qloo);
  assert.deepEqual(result.connections, []); assert.match(result.warnings[0], /Environmental cultural context/);
  const services = providers();
  services.llm.nextTurn = async (input) => {
    assert.deepEqual(input.tasteContext?.connections, []);
    return { kind: 'answer', result: { answer: 'No supported interest connection is available. I can still explain the scene.', confidence: 'low' } };
  };
  const answer = await explore({ scene, profile, question: 'What connects to my interests?', mode: 'scene', messages: [] }, services);
  assert.ok(answer.warnings?.some((warning) => warning.includes('unavailable')));
});

test('skipped profiles do not trigger taste calls and cached evidence prevents redundant investigation', async () => {
  await explore({ scene, question: 'What is here?', mode: 'scene', messages: [] }, providers());
  await explore({ scene, profile, tasteContext: { ...context, referenceIds: ['brand', 'film'] }, strategy: 'familiar', question: 'Start with something familiar.', mode: 'guided', messages: [] }, providers());
});

test('taste references exclude unconfirmed detections and Qloo recommendations but include locality facts', () => {
  const input = { ...scene, culturalEvidence: { ...scene.culturalEvidence, entities: [...scene.culturalEvidence.entities, { ...scene.culturalEvidence.entities[0], qlooId: 'related', source: 'qloo' as const }, { ...scene.culturalEvidence.entities[0], qlooId: 'uncertain', visionConfidence: 0.6 }] } };
  assert.deepEqual(tasteReferences(input, { locality: { city: 'Area' }, confidence: 'medium', culturalThemes: [], relatedEntities: [], facts: [{ entityId: 'museum', name: 'Museum', category: 'urn:entity:place', source: 'qloo', tags: [] }] }).map((entity) => entity.id), ['film', 'brand', 'museum']);
});

test('changing area excludes previous locality taste targets while retaining scene detections', () => {
  const locationContext = { locality: { city: 'Previous area' }, confidence: 'medium' as const, culturalThemes: [], relatedEntities: [], facts: [{ entityId: 'museum', name: 'Museum', category: 'urn:entity:place', source: 'qloo' as const, tags: [] }] };
  const locatedScene = { ...scene, locationContext };
  assert.deepEqual(tasteReferences(locatedScene, undefined, { city: 'New area' }).map((entity) => entity.id), ['film', 'brand']);
  assert.deepEqual(tasteReferences(locatedScene, undefined, { city: 'Previous area' }).map((entity) => entity.id), ['film', 'brand', 'museum']);
  assert.equal(locatedScene.locationContext.facts[0].entityId, 'museum');
});

test('a familiar explanation must cite a real Qloo pair; invented or disabled-profile pairs are rejected', async () => {
  const services = providers();
  const request = { scene, profile, tasteContext: { ...context, referenceIds: ['brand', 'film'] }, mode: 'reference' as const, question: 'Explain Nike through something I know.', messages: [] };
  services.llm.nextTurn = async () => ({ kind: 'answer', result: { answer: 'Qloo links this reference to a stated interest.', confidence: 'medium', usedTasteConnections: [{ referenceId: 'brand', interestId: 'interest' }] } });
  assert.equal((await explore(request, services)).usedTasteConnections?.length, 1);
  services.llm.nextTurn = async () => ({ kind: 'answer', result: { answer: 'Invented comparison.', confidence: 'high', usedTasteConnections: [{ referenceId: 'film', interestId: 'invented' }] } });
  await assert.rejects(explore(request, services), /could not be verified/);
  await assert.rejects(explore({ ...request, profile: undefined, tasteContext: undefined }, services), /could not be verified/);
});
