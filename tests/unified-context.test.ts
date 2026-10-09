import assert from 'node:assert/strict';
import test from 'node:test';
import { readForegroundLocality, type LocationAdapter } from '../lib/location/foreground';
import { refreshLocationForRequest } from '../lib/location/session';
import { renderGroundedAnswer } from '../lib/orchestration/grounding';
import { analyzeScene, explore, type Providers } from '../lib/orchestration/context';
import { conversationForRequest, includeLocality, useContextStore } from '../stores/context';
import type { AgentTurn } from '../lib/llm/service';
import type { CulturalEvidence, Scene } from '../types/context';
import type { TasteContext, TasteProfile } from '../types/taste';

const unavailable = async (): Promise<never> => { throw new Error('Unexpected provider call'); };
const evidence: CulturalEvidence = {
  entities: [
    { detectedName: 'Film poster', detectedCategory: 'film', qlooId: 'film', qlooName: 'Film poster', visionConfidence: 0.95, matchConfidence: 1, source: 'vision' },
    { detectedName: 'Music poster', detectedCategory: 'music', qlooId: 'music', qlooName: 'Music poster', visionConfidence: 0.95, matchConfidence: 1, source: 'vision' },
  ],
  facts: [
    { entityId: 'film', name: 'Film poster', category: 'film', tags: ['Independent', 'Drama'], source: 'qloo' },
    { entityId: 'music', name: 'Music poster', category: 'music', tags: ['Independent'], source: 'qloo' },
  ],
  relationships: [], themes: ['Independent'], confidence: 0.8,
};
const scene: Scene = { id: 'unified-scene', createdAt: '2026-10-08T00:00:00.000Z', summary: 'Recognized cultural references.', confidence: 'medium', culturalEvidence: evidence };
const finish: AgentTurn = { kind: 'answer', result: { answer: 'Ignored free prose.', confidence: 'medium', evidenceSelections: [{ kind: 'fact', entityId: 'film' }] } };
function services(turns: AgentTurn[]): Providers {
  let next = 0;
  return { vision: { inspectScene: unavailable }, qloo: { resolveEntities: unavailable, analyzeConnections: unavailable, exploreReference: unavailable, getLocationContext: unavailable, analyzeTaste: unavailable, getEntityFact: unavailable }, llm: { nextTurn: async () => { assert.ok(next < turns.length); return turns[next++]; } } };
}
function locationAdapter(granted: boolean, calls: string[]): LocationAdapter {
  return {
    getPermission: async () => { calls.push('check'); return { granted }; },
    requestPermission: async () => { calls.push('prompt'); return { granted: true }; },
    getPosition: async () => { calls.push('position'); return { coords: { latitude: 24.1, longitude: 67.2 } }; },
    reverseGeocode: async () => { calls.push('geocode'); return [{ district: 'Arts quarter', city: 'Test city', street: 'Private street' }]; },
  };
}

test('automatic locality refresh never opens a permission dialog or reads denied coordinates', async () => {
  const calls: string[] = [];
  const result = await readForegroundLocality(locationAdapter(false, calls), () => true);
  assert.deepEqual(calls, ['check']); assert.equal(result.denied, true);
  assert.match(result.warning!, /still explore/);
});

test('explicit location opt-in derives only locality and cancelled work cannot geocode', async () => {
  const calls: string[] = [];
  const result = await readForegroundLocality(locationAdapter(false, calls), () => true, true);
  assert.deepEqual(calls, ['check', 'prompt', 'position', 'geocode']);
  assert.deepEqual(result.locality, { neighborhood: 'Arts quarter', city: 'Test city', region: undefined, country: undefined });
  assert.doesNotMatch(JSON.stringify(result), /latitude|longitude|street|24\.1/);
  let active = true; const adapter = locationAdapter(true, []);
  adapter.getPosition = async () => { active = false; return { coords: { latitude: 1, longitude: 2 } }; };
  adapter.reverseGeocode = unavailable;
  await assert.rejects(readForegroundLocality(adapter, () => active), /cancelled/);
});

test('location is optional; disabling it retains references and visible history but excludes stale area answers', async () => {
  useContextStore.getState().clearSession();
  try {
    useContextStore.getState().setScene(scene);
    useContextStore.getState().setLocationEnabled(true);
    useContextStore.getState().setLocality({ city: 'Old city' });
    useContextStore.getState().addMessage({ role: 'user', content: 'Tell me about this area.' });
    useContextStore.getState().addMessage({ role: 'assistant', content: 'Old city evidence.' });
    useContextStore.getState().setLocationEnabled(false);
    const state = useContextStore.getState();
    assert.equal(includeLocality(state), false); assert.equal(state.locality, null);
    assert.deepEqual(state.scene?.culturalEvidence.entities, evidence.entities);
    assert.equal(state.messages.length, 2);
    assert.deepEqual(conversationForRequest(), [{ role: 'user', content: 'Tell me about this area.' }]);
    await refreshLocationForRequest(unavailable, () => true);
    assert.equal(includeLocality(useContextStore.getState()), false);
  } finally { useContextStore.getState().clearSession(); }
});

test('an enabled request refreshes its area and permission revocation falls back to scene context', async () => {
  useContextStore.getState().clearSession();
  try {
    useContextStore.getState().setScene(scene); useContextStore.getState().setLocationEnabled(true);
    useContextStore.getState().setLocality({ city: 'Old city' });
    useContextStore.getState().addMessage({ role: 'assistant', content: 'Old city evidence.' });
    const refreshed = await refreshLocationForRequest(async () => ({ locality: { city: 'New city' } }), () => true);
    assert.equal(refreshed.generation, useContextStore.getState().generation);
    assert.equal(useContextStore.getState().locality?.city, 'New city');
    assert.equal(useContextStore.getState().messages.length, 1); assert.equal(conversationForRequest().length, 0);
    const denied = await refreshLocationForRequest(async () => ({ denied: true, warning: 'Permission revoked.' }), () => true);
    assert.equal(denied.warning, 'Permission revoked.'); assert.equal(useContextStore.getState().locationEnabled, false);
    assert.deepEqual(useContextStore.getState().scene, scene);
  } finally { useContextStore.getState().clearSession(); }
});

test('a named reference can begin a conversation without being claimed as visually detected', async () => {
  const service = services([{ kind: 'investigate', action: { tool: 'resolveEntity', name: 'Agatha Christie', category: 'author' } }, { kind: 'answer', result: { answer: 'Ignored', confidence: 'medium', evidenceSelections: [{ kind: 'fact', entityId: 'author' }] } }]);
  service.qloo.resolveEntities = async () => [{ detectedName: 'Agatha Christie', detectedCategory: 'author', qlooId: 'author', visionConfidence: 1, matchConfidence: 1 }];
  service.qloo.analyzeConnections = async (entities) => ({ entities, relationships: [], themes: ['Mystery'], confidence: 0.8, facts: [{ entityId: 'author', name: 'Agatha Christie', category: 'author', tags: ['Mystery'], source: 'qloo' }] });
  const result = await explore({ question: 'Explain Agatha Christie.', mode: 'scene', messages: [] }, service);
  assert.equal(result.scene?.origin, 'conversation');
  assert.equal(result.scene?.culturalEvidence.entities[0].source, 'user');
  assert.match(result.answer, /Agatha Christie/); assert.doesNotMatch(result.answer, /visible|image contains/);
});

test('default scene skips locality lookup; an area follow-up degrades if Qloo fails', async () => {
  const service = services([finish]);
  service.vision.inspectScene = async () => [{ label: 'Film poster', category: 'film', confidence: 0.95, culturallyRelevant: true }];
  service.qloo.resolveEntities = async () => [evidence.entities[0]];
  service.qloo.analyzeConnections = async () => evidence;
  service.qloo.getLocationContext = async () => { throw new Error('Provider unavailable'); };
  const result = await analyzeScene({ image: 'fixture', mode: 'scene', locality: { city: 'Test city' } }, service);
  assert.match(result.summary, /Film poster/); assert.doesNotMatch(result.warnings?.join(' ') ?? '', /unavailable/);
  assert.equal(result.culturalEvidence.entities.length, 1);
  const area = await explore({ scene: result, locality: { city: 'Test city' }, question: 'What kind of area am I in?', mode: 'scene', messages: [] }, service);
  assert.match(area.warnings?.join(' ') ?? '', /unavailable/);
});

test('an available area does not force an irrelevant locality call or lose a named reference', async () => {
  const service = services([{ kind: 'investigate', action: { tool: 'resolveEntity', name: 'Film poster', category: 'film' } }, finish]);
  service.qloo.resolveEntities = async () => [evidence.entities[0]];
  service.qloo.analyzeConnections = async (entities) => ({ ...evidence, entities });
  const result = await explore({ locality: { city: 'Test city' }, question: 'Explain Film poster.', mode: 'scene', messages: [] }, service);
  assert.equal(result.locationContext, undefined);
  assert.equal(result.scene?.origin, 'conversation');
  assert.equal(result.scene?.culturalEvidence.entities[0].source, 'user');
});

test('disabled location removes cached nested locality from subsequent reasoning', async () => {
  const service = services([finish]);
  service.llm.nextTurn = async (input) => { assert.equal(input.locationContext, undefined); assert.equal(input.request.scene?.locationContext, undefined); return finish; };
  const result = await explore({ scene: { ...scene, locationContext: { locality: { city: 'Old city' }, culturalThemes: ['Old theme'], relatedEntities: [], confidence: 'medium' } }, useLocality: false, question: 'Explain Film poster.', mode: 'scene', messages: [] }, service);
  assert.equal(result.locationContext, undefined); assert.equal(result.scene?.locationContext, undefined);
  assert.deepEqual(result.scene?.culturalEvidence, evidence);
});

test('guided questions lead with a supported shared theme and invite the next reference without a profile', () => {
  const result = renderGroundedAnswer({ scene, question: 'Guide me through this scene.', mode: 'scene', messages: [] }, evidence, undefined, undefined, [{ kind: 'fact', entityId: 'film' }]);
  assert.match(result.answer, /^The strongest shared cultural signal.*Independent/);
  assert.match(result.answer, /Would you like to explore Film poster or Music poster next\?/);
  const noTheme = renderGroundedAnswer({ scene, question: 'Guide me through this scene.', mode: 'scene', messages: [] }, { ...evidence, facts: [], themes: ['Unsupported theme'] }, undefined, undefined);
  assert.match(noTheme.answer, /not enough supported evidence for a dominant/);
  assert.doesNotMatch(noTheme.answer, /Unsupported theme/);
});

test('guided exploration offers a familiar/new choice only with valid, strong profile evidence', () => {
  const profile: TasteProfile = { entities: [{ id: 'anchor', name: 'My film interest', type: 'film' }], signature: 'a'.repeat(64) };
  const taste: TasteContext = { profileSignature: profile.signature!, referenceIds: ['film', 'music'], warnings: [], connections: [{ referenceId: 'film', interestId: 'anchor', kind: 'affinity', strength: 0.8, sharedTags: ['Independent'], evidenceSource: 'qloo', description: 'Supported affinity.' }] };
  const request = { scene, profile, question: 'Guide me through this scene.', mode: 'scene' as const, messages: [] };
  const result = renderGroundedAnswer(request, evidence, undefined, taste, [{ kind: 'fact', entityId: 'film' }]);
  assert.match(result.answer, /start with something familiar or discover something new/);
  assert.deepEqual(result.usedTasteConnections, [{ referenceId: 'film', interestId: 'anchor' }]);
  const weak = renderGroundedAnswer(request, evidence, undefined, { ...taste, connections: [{ ...taste.connections[0], strength: 0.3 }] });
  assert.doesNotMatch(weak.answer, /start with something familiar/);
  const disabled = renderGroundedAnswer({ ...request, profile: undefined }, evidence, undefined, taste);
  assert.doesNotMatch(disabled.answer, /interests you shared/);
});

test('scene-area explanations qualify shared record evidence and never invent neighborhood claims', () => {
  const area = { locality: { city: 'Test city' }, confidence: 'medium' as const, culturalThemes: ['Independent'], relatedEntities: ['Venue'], facts: [{ entityId: 'venue', name: 'Venue', category: 'place', tags: ['Independent'], source: 'qloo' as const }] };
  const request = { scene, question: "How does what I'm seeing relate to this area?", mode: 'scene' as const, messages: [] };
  const result = renderGroundedAnswer(request, evidence, area, undefined);
  assert.match(result.answer, /Film poster and the sampled area place Venue share cultural tags: Independent/);
  assert.match(result.answer, /not evidence about the neighborhood as a whole/);
  const unrelated = renderGroundedAnswer(request, evidence, { ...area, facts: [{ ...area.facts[0], tags: ['Unrelated'] }] }, undefined);
  assert.match(unrelated.answer, /do not have supported evidence connecting/);
});
