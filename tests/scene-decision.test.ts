import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatSceneReasoning, sceneEvidence } from '../lib/ai/scene-decision';
import { sameCalendarEvent } from '../lib/actions/calendar-identity';
import { explore, type Providers } from '../lib/orchestration/context';
import { analyzeEvent } from '../lib/orchestration/event';
import { useContextStore } from '../stores/context';
import type { AskRequest, Scene } from '../types/context';
import type { TasteProfile } from '../types/taste';

const noCall = async (): Promise<never> => { throw new Error('Unexpected provider call'); };
const profile: TasteProfile = { entities: [{ id: 'radiohead', name: 'Radiohead', type: 'urn:entity:artist' }], signature: 'a'.repeat(64) };
const eventScene = (): Scene => ({ id: 'event', origin: 'image', createdAt: new Date().toISOString(), summary: 'Summer Sound at Blue Note.', confidence: 'medium',
  culturalEvidence: { entities: [{ detectedName: 'Radiohead', detectedCategory: 'artist', visionConfidence: 0.9,
    qlooId: 'radiohead', qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' }], relationships: [], themes: [], confidence: 0 },
  event: { visual: { title: 'Summer Sound', dateText: 'October 10, 2026', timeText: '8 PM', timezoneText: 'ET',
    venueName: 'Blue Note', locationText: 'New York', performers: ['Radiohead'], schedule: [] },
    profileSignature: profile.signature, ranking: [{ entityId: 'radiohead', name: 'Radiohead', exactInterest: true,
      contributingInterestIds: ['radiohead'] }], researchedFacts: [] } });
const request = (question: string, scene?: Scene, position?: { latitude: number; longitude: number }): AskRequest =>
  ({ question, scene, profile, messages: [], mode: 'scene', locationEnabled: true, position });
const qloo = { resolveEntities: noCall, analyzeConnections: noCall, analyzeTaste: noCall, getEntityFact: noCall,
  exploreReference: noCall, getLocationContext: noCall };
const providers = (plan: () => Promise<unknown>, answer: () => Promise<unknown>, overrides: Partial<Providers> = {}): Providers => ({
  vision: { inspectScene: noCall }, qloo, llm: { nextTurn: noCall },
  sceneReasoner: { plan: plan as NonNullable<Providers['sceneReasoner']>['plan'], answer: answer as NonNullable<Providers['sceneReasoner']>['answer'] },
  ...overrides,
});

test('structured event reasoning answers a specific personal-fit question from scene evidence without provider calls', async () => {
  let planned = 0;
  const result = await explore(request('Which performer connects to my interests?', eventScene()), providers(async () => {
    planned++;
    return { scope: 'event', next: 'answer', answer: 'Radiohead is already one of your saved interests.', evidenceIds: ['qloo:radiohead'] };
  }, noCall));
  assert.equal(planned, 1);
  assert.equal(result.answer, 'Radiohead is already one of your saved interests.');
  assert.equal(result.scene?.event?.visual.title, 'Summer Sound');
});

test('event Capture states the printed performer even when Qloo ranking is unavailable', async () => {
  const visual = eventScene().event!.visual;
  const result = await analyzeEvent(visual, [], profile, qloo);
  assert.match(result.summary, /Summer Sound/);
  assert.match(result.summary, /October 10, 2026/);
  assert.match(result.summary, /Radiohead/);
});

test('event-anchored dining uses the verified venue position and never substitutes device location', async () => {
  const device = { latitude: 34, longitude: -118 };
  const venue = { latitude: 40.7, longitude: -73.9 };
  let qlooPosition: typeof venue | undefined;
  let placesOptions: unknown;
  const result = await explore(request('Find dinner around the event', eventScene(), device), providers(
    async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'event_venue', evidenceIds: [] }), noCall,
    { qloo: { ...qloo, recommendDining: async (position) => { qlooPosition = position; return [{ qlooId: 'cafe', name: 'Cafe Roma', radiusMeters: 2000,
      affinity: 0.7, contributingInterestIds: ['radiohead'], cuisineTags: ['Italian'] }]; } },
      places: { findExact: async (_name, options) => { placesOptions = options; return { name: 'Blue Note', placeId: 'venue',
        address: '131 West 3rd Street, New York', checkedAt: new Date().toISOString(), ...venue }; } } }));
  assert.deepEqual(qlooPosition, venue);
  assert.deepEqual(placesOptions, { locality: 'New York' });
  assert.equal(result.scene?.event?.visual.title, 'Summer Sound');
  assert.equal(result.scene?.dining?.anchor?.kind, 'event_venue');
  assert.match(result.answer, /Near Blue Note/);
});

test('event venue lookup never uses device position to choose a same-named venue', async () => {
  const scene = eventScene();
  scene.event!.visual.locationText = undefined;
  let placesOptions: unknown;
  const result = await explore(request('How far is this venue from me?', scene, { latitude: 34, longitude: -118 }), providers(
    async () => ({ scope: 'event', next: 'venue_details', detail: 'distance', evidenceIds: [] }), noCall,
    { places: { findExact: async (_name, options) => { placesOptions = options; return { name: 'Blue Note', placeId: 'venue',
      address: '131 West 3rd Street, New York', checkedAt: new Date().toISOString(), latitude: 40.7, longitude: -73.9 }; } } }));
  assert.deepEqual(placesOptions, { locality: undefined });
  assert.match(result.answer, /straight line/);
});

test('event dining cannot fall back to device coordinates when Places is unavailable', async () => {
  const result = await explore(request('Find dinner near the event', eventScene(), { latitude: 34, longitude: -118 }), providers(
    async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'event_venue', evidenceIds: [] }), noCall));
  assert.match(result.answer, /will not substitute your current location/);
  assert.equal(result.scene?.dining, undefined);
});

test('explicit near-me dining changes anchor instead of silently reusing event venue', async () => {
  const position = { latitude: 34, longitude: -118 };
  let seen: typeof position | undefined;
  const result = await explore(request('Find dinner near me', eventScene(), position), providers(
    async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'device', evidenceIds: [] }), noCall,
    { qloo: { ...qloo, recommendDining: async (point) => { seen = point; return [{ qlooId: 'diner', name: 'Diner',
      radiusMeters: 2000, affinity: 0.7, contributingInterestIds: [], cuisineTags: [] }]; } } }));
  assert.deepEqual(seen, position);
  assert.equal(result.scene?.event?.visual.title, 'Summer Sound');
  assert.equal(result.scene?.dining?.anchor?.kind, 'device');
});

test('dining comparison uses retained Qloo candidates without another Qloo or Places request', async () => {
  const scene: Scene = { id: 'dining', origin: 'conversation', createdAt: new Date().toISOString(), summary: 'Two places.', confidence: 'medium',
    culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
    dining: { profileSignature: profile.signature, discoveredAt: new Date().toISOString(), anchor: { kind: 'device' },
      candidates: [{ qlooId: 'a', name: 'Cafe A', radiusMeters: 2000, contributingInterestIds: ['radiohead'], cuisineTags: ['Italian'] },
        { qlooId: 'b', name: 'Cafe B', radiusMeters: 2000, contributingInterestIds: [], cuisineTags: ['Japanese'] }] } };
  const result = await explore(request('How do these two differ for me?', scene), providers(async () => ({ scope: 'dining', next: 'answer',
    answer: 'Cafe A has an Italian dining tag and Radiohead contributed to its Qloo ranking; Cafe B has a Japanese dining tag.',
    evidenceIds: ['dining:a', 'dining:b'] }), noCall));
  assert.match(result.answer, /Cafe A/);
});

test('event research is on demand and the second Qwen answer reuses cached facts', async () => {
  let searches = 0; let syntheses = 0;
  const research = { search: async () => { searches++; return [{ title: 'Summer Sound tickets',
    url: 'https://summersound.example/tickets', content: 'Summer Sound tickets are on sale now for October 10, 2026.',
    retrievedAt: new Date().toISOString() }]; } };
  const p = providers(async () => ({ scope: 'event', next: 'event_research', researchKind: 'tickets', evidenceIds: [] }),
    async () => { syntheses++; return { answer: 'The official event ticket page says tickets are on sale.', evidenceIds: ['research:0'] }; }, { research });
  const first = await explore(request('Are tickets on sale?', eventScene()), p);
  assert.equal(searches, 1); assert.equal(syntheses, 1);
  const second = await explore(request('Are tickets on sale?', first.scene), p);
  assert.equal(searches, 1); assert.equal(syntheses, 2);
  assert.match(second.answer, /on sale/);
});

test('invalid model evidence and invented dining targets cannot become spoken facts or Places calls', async () => {
  const scene = eventScene();
  const invalid = await explore(request('Which performer?', scene), providers(async () => ({ scope: 'event', next: 'answer',
    answer: 'An invented performer is here.', evidenceIds: ['qloo:invented'] }), noCall));
  assert.match(invalid.answer, /could not support/);
  const dining = { ...scene, dining: { profileSignature: profile.signature, discoveredAt: new Date().toISOString(),
    candidates: [{ qlooId: 'real', name: 'Real Cafe', radiusMeters: 2000 as const, contributingInterestIds: [], cuisineTags: [] }] } };
  const fabricated = await explore(request('What is that place’s address?', dining), providers(async () => ({ scope: 'dining', next: 'dining_details',
    targetId: 'invented', detail: 'address', evidenceIds: [] }), noCall, { places: { findExact: noCall } }));
  assert.match(fabricated.answer, /Which recommended dining place/);
});

test('scene reasoning sends evidence without precise device coordinates and returns validated JSON', async () => {
  const scene = eventScene(); scene.dining = { profileSignature: profile.signature, discoveredAt: new Date().toISOString(),
    position: { latitude: 40.7123123, longitude: -73.9012312 }, candidates: [] };
  const client = { model: 'qwen3.8-max', completion: async (body: Record<string, unknown>) => {
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /40\.7123123|-73\.9012312/);
    return { message: { content: JSON.stringify({ scope: 'event', next: 'answer', answer: 'Summer Sound starts at 8 PM.', evidenceIds: ['event:start'] }) }, finish_reason: 'stop' };
  } };
  const result = await new ChatSceneReasoning(client).plan({ question: 'When does it start?', messages: [], scene,
    interests: [{ id: 'radiohead', name: 'Radiohead' }], available: { research: false, places: false, qloo: true, calendar: true, devicePosition: false } });
  assert.equal(result.next, 'answer');
  assert.equal(sceneEvidence({ question: '', messages: [], scene, interests: [],
    available: { research: false, places: false, qloo: true, calendar: false, devicePosition: false } })['event:start'], '8 PM ET');
});

test('a bounded Qwen research-kind synonym is normalized before deterministic provider routing', async () => {
  const client = { model: 'qwen3.8-max', completion: async () => ({ message: {
    content: JSON.stringify({ scope: 'event', next: 'event_research', researchKind: 'ticket_availability' }) }, finish_reason: 'stop' }) };
  const plan = await new ChatSceneReasoning(client).plan({ question: 'Are tickets available?', messages: [], scene: eventScene(),
    interests: [], available: { research: true, places: false, qloo: true, calendar: true, devicePosition: false } });
  assert.equal(plan.researchKind, 'tickets');
});

test('stale event-status evidence is unavailable to Qwen until refreshed', () => {
  const scene = eventScene();
  scene.event!.researchedFacts = [{ kind: 'status', value: 'scheduled', sourceUrl: 'https://summersound.example',
    retrievedAt: new Date(Date.now() - 60 * 60_000).toISOString(), supportingQuote: 'Summer Sound is scheduled.' }];
  const evidence = sceneEvidence({ question: 'Is it still happening?', messages: [], scene, interests: [],
    available: { research: true, places: false, qloo: true, calendar: false, devicePosition: false } });
  assert.equal(evidence['research:0'], undefined);
});

test('turning Location off retains event-venue dining but clears device-anchored dining', () => {
  const venue = eventScene(); venue.dining = { discoveredAt: new Date().toISOString(), anchor: { kind: 'event_venue', name: 'Blue Note', placeId: 'v' }, candidates: [] };
  useContextStore.setState({ scene: venue, locationEnabled: true });
  useContextStore.getState().setLocationEnabled(false);
  assert.equal(useContextStore.getState().scene?.event?.visual.title, 'Summer Sound');
  assert.equal(useContextStore.getState().scene?.dining?.anchor?.kind, 'event_venue');
  const device = { ...venue, dining: { ...venue.dining, anchor: { kind: 'device' as const } } };
  useContextStore.setState({ scene: device, locationEnabled: true });
  useContextStore.getState().setLocationEnabled(false);
  assert.equal(useContextStore.getState().scene?.event?.visual.title, 'Summer Sound');
  assert.equal(useContextStore.getState().scene?.dining, undefined);
});

test('Calendar duplicate identity requires the same normalized title and start time', () => {
  const start = new Date('2026-10-10T20:00:00-04:00');
  assert.equal(sameCalendarEvent({ title: ' Summer  Sound ', startDate: '2026-10-11T00:00:30.000Z' }, 'summer sound', start), true);
  assert.equal(sameCalendarEvent({ title: 'Summer Sound', startDate: '2026-10-11T02:00:00.000Z' }, 'Summer Sound', start), false);
  assert.equal(sameCalendarEvent({ title: 'Other Event', startDate: start }, 'Summer Sound', start), false);
});
