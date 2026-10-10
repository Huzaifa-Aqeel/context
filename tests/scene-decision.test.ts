import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatSceneReasoning, sceneEvidence } from '../lib/ai/scene-decision';
import { sameCalendarEvent } from '../lib/actions/calendar-identity';
import { explore, type Providers } from '../lib/orchestration/context';
import { analyzeEvent } from '../lib/orchestration/event';
import { useContextStore } from '../stores/context';
import type { SceneReasoningInput } from '../lib/llm/scene-decision';
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
const providers = (plan: (input: SceneReasoningInput) => Promise<unknown>, answer: () => Promise<unknown>, overrides: Partial<Providers> = {}): Providers => ({
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

test('a printed start-time follow-up skips Qwen and Qloo', async () => {
  const scene = eventScene();
  const result = await explore(request('What time does it start?', scene), providers(noCall, noCall,
    { qloo: { ...qloo, rerankEvent: noCall } }));
  assert.match(result.answer, /October 10, 2026 at 8 PM ET/);
  assert.equal(result.scene?.event?.profileSignature, profile.signature);
});

test('a captured flyer remains explorable when Location is off', async () => {
  const result = await explore({ ...request('What time does it start?', eventScene()),
    locationEnabled: false, position: undefined }, providers(noCall, noCall));
  assert.match(result.answer, /October 10, 2026 at 8 PM ET/);
});

test('a performer decision stays in structured reasoning rather than the printed-list fast path', async () => {
  let plans = 0;
  const result = await explore(request('Which performer should I see?', eventScene()), providers(async () => {
    plans++;
    return { scope: 'event', next: 'answer', answer: 'Radiohead is already in your interests.', evidenceIds: ['qloo:radiohead'] };
  }, noCall));
  assert.equal(plans, 1);
  assert.match(result.answer, /Radiohead/);
});

test('a stale signed event is rejected before any planner or Qloo call', async () => {
  const scene = eventScene();
  scene.event!.profileSignature = 'b'.repeat(64);
  const result = await explore(request('Are tickets available?', scene), providers(noCall, noCall,
    { qloo: { ...qloo, rerankEvent: noCall } }));
  assert.match(result.answer, /Capture a new scene/);
  assert.equal(result.scene, undefined);
});

test('event Capture states the printed performer even when Qloo ranking is unavailable', async () => {
  const visual = eventScene().event!.visual;
  const result = await analyzeEvent(visual, [], profile, qloo);
  assert.match(result.summary, /Summer Sound/);
  assert.match(result.summary, /October 10, 2026/);
  assert.match(result.summary, /Radiohead/);
});

test('dining during an event uses the current device position, not the printed venue', async () => {
  const device = { latitude: 34, longitude: -118 };
  const venue = { latitude: 40.7, longitude: -73.9 };
  let qlooPosition: typeof venue | undefined;
  let placesOptions: unknown;
  const result = await explore(request('Find somewhere nearby I’d enjoy eating', eventScene(), device), providers(
    async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'device', evidenceIds: [] }), noCall,
    { qloo: { ...qloo, recommendDining: async (position) => { qlooPosition = position; return [{ qlooId: 'cafe', name: 'Cafe Roma', radiusMeters: 2000,
      affinity: 0.7, contributingInterestIds: ['radiohead'], cuisineTags: ['Italian'] }]; } },
      places: { findExact: async (_name, options) => { placesOptions = options; return { name: 'Blue Note', placeId: 'venue',
        address: '131 West 3rd Street, New York', checkedAt: new Date().toISOString(), ...venue }; } } }));
  assert.deepEqual(qlooPosition, device);
  assert.equal(placesOptions, undefined);
  assert.equal(result.scene?.event?.visual.title, 'Summer Sound');
  assert.equal(result.scene?.dining?.anchor?.kind, 'device');
  assert.doesNotMatch(result.answer, /Near Blue Note/);
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

test('event-relative dining phrasing cannot start a recommendation', async () => {
  const device = { latitude: 34, longitude: -118 };
  const result = await explore(request('Find dinner near the event', eventScene(), device), providers(
    async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'device', evidenceIds: [] }), noCall,
    { qloo: { ...qloo, recommendDining: async () => { throw Error('Qloo must not run'); } } }));
  assert.match(result.answer, /restaurants or bars near you/);
  assert.equal(result.scene?.dining, undefined);
});

test('explicit nearby dining changes anchor instead of silently reusing event venue', async () => {
  const position = { latitude: 34, longitude: -118 };
  let seen: typeof position | undefined;
  const result = await explore(request('Find somewhere nearby I’d enjoy eating', eventScene(), position), providers(
    async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'device', evidenceIds: [] }), noCall,
    { qloo: { ...qloo, recommendDining: async (point) => { seen = point; return [{ qlooId: 'diner', name: 'Diner',
      radiusMeters: 2000, affinity: 0.7, contributingInterestIds: [], cuisineTags: [] }]; } } }));
  assert.deepEqual(seen, position);
  assert.equal(result.scene?.event?.visual.title, 'Summer Sound');
  assert.equal(result.scene?.dining?.anchor?.kind, 'device');
});

test('dining comparison requests are declined without provider calls', async () => {
  const scene: Scene = { id: 'dining', origin: 'conversation', createdAt: new Date().toISOString(), summary: 'Two places.', confidence: 'medium',
    culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
    dining: { profileSignature: profile.signature, discoveredAt: new Date().toISOString(), anchor: { kind: 'device' },
      resolvedAnchor: { kind: 'device', name: null, latitude: 40.7, longitude: -73.9,
        source: 'foreground_location', confidence: null, timezone: 'America/New_York' },
      selectedIds: ['a', 'b'], places: [
        { qlooId: 'a', details: { name: 'Cafe A', placeId: 'ga', checkedAt: new Date().toISOString(),
          cuisine: 'Italian', categories: ['catering.restaurant'], openingHours: 'Mo-Fr 09:00-18:00',
          latitude: 40.701, longitude: -73.9 } },
        { qlooId: 'b', details: { name: 'Cafe B', placeId: 'gb', checkedAt: new Date().toISOString(),
          cuisine: 'Japanese', categories: ['catering.cafe'], openingHours: 'Mo-Fr 10:00-20:00',
          latitude: 40.703, longitude: -73.9 } }],
      candidates: [{ qlooId: 'a', name: 'Cafe A', radiusMeters: 2000, contributingInterestIds: ['radiohead'], cuisineTags: ['Italian'] },
        { qlooId: 'b', name: 'Cafe B', radiusMeters: 2000, contributingInterestIds: [], cuisineTags: ['Japanese'] }] } };
  const result = await explore(request('How do these two differ for me?', scene), providers(noCall, noCall));
  assert.match(result.answer, /do not compare dining recommendations/);
  const closer = await explore(request('Which is closer?', scene), providers(noCall, noCall));
  assert.match(closer.answer, /do not compare dining recommendations/);
  const hours = await explore(request('Compare their opening hours', scene), providers(noCall, noCall));
  assert.match(hours.answer, /do not compare dining recommendations/);
  for (const question of ['Which of these has the better rating?', 'Is Cafe A closer than Cafe B?', 'Which one would you pick?']) {
    const comparison = await explore(request(question, scene), providers(noCall, noCall));
    assert.match(comparison.answer, /do not compare dining recommendations/);
  }
});

test('a repeated researched event question reuses its grounded answer while evidence is fresh', async () => {
  let searches = 0; let syntheses = 0; let plans = 0;
  const research = { search: async () => { searches++; return [{ title: 'Summer Sound tickets',
    url: 'https://summersound.example/tickets', content: 'Summer Sound tickets are on sale now for October 10, 2026.',
    retrievedAt: new Date().toISOString() }]; } };
  const p = providers(async () => { plans++; return { scope: 'event', next: 'event_research', researchKind: 'tickets', evidenceIds: [] }; },
    async () => { syntheses++; return { answer: 'The official event ticket page says tickets are on sale.', evidenceIds: ['research:0'] }; }, { research });
  const first = await explore(request('Are tickets on sale?', eventScene()), p);
  assert.equal(searches, 1); assert.equal(syntheses, 1);
  const second = await explore(request('Are tickets on sale?', first.scene), p);
  assert.equal(searches, 1); assert.equal(syntheses, 1); assert.equal(plans, 1);
  assert.match(second.answer, /on sale/);
  assert.equal(second.scene?.event?.answerCache?.length, 1);
  const refreshed = await explore(request('Check again: are tickets on sale?', second.scene), p);
  assert.equal(searches, 2); assert.equal(syntheses, 2); assert.equal(plans, 2);
  assert.match(refreshed.answer, /on sale/);
});

test('a researched Event answer is not reused after its cited fact changes', async () => {
  let plans = 0; let answers = 0;
  const scene = eventScene();
  scene.event!.researchedFacts = [{ kind: 'tickets', value: 'tickets are on sale',
    sourceUrl: 'https://summersound.example/tickets', retrievedAt: new Date().toISOString(),
    supportingQuote: 'Tickets are on sale.' }];
  scene.event!.researchChecks = [{ kind: 'tickets', checkedAt: new Date().toISOString() }];
  const p = providers(async () => { plans++; return { scope: 'event', next: 'event_research', researchKind: 'tickets' }; },
    async () => { answers++; return { answer: 'Tickets are on sale.', evidenceIds: ['research:0'] }; },
    { research: { search: noCall } });
  const first = await explore(request('Are tickets on sale?', scene), p);
  assert.equal(first.scene?.event?.answerCache?.length, 1);
  const changed = structuredClone(first.scene!);
  changed.event!.researchedFacts[0].value = 'tickets are sold out';
  await explore(request('Are tickets on sale?', changed), p);
  assert.equal(plans, 2);
  assert.equal(answers, 2);
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
    interests: [{ id: 'radiohead', name: 'Radiohead' }], available: { research: false, places: false, qloo: true, calendar: true, devicePosition: false, locationEnabled: false } });
  assert.equal(result.next, 'answer');
  assert.equal(sceneEvidence({ question: '', messages: [], scene, interests: [],
    available: { research: false, places: false, qloo: true, calendar: false, devicePosition: false, locationEnabled: false } })['event:start'], '8 PM ET');
});

test('a bounded Qwen research-kind synonym is normalized before deterministic provider routing', async () => {
  const client = { model: 'qwen3.8-max', completion: async () => ({ message: {
    content: JSON.stringify({ scope: 'event', next: 'event_research', researchKind: 'ticket_availability' }) }, finish_reason: 'stop' }) };
  const plan = await new ChatSceneReasoning(client).plan({ question: 'Are tickets available?', messages: [], scene: eventScene(),
    interests: [], available: { research: true, places: false, qloo: true, calendar: true, devicePosition: false, locationEnabled: false } });
  assert.equal(plan.researchKind, 'tickets');
});

test('stale event-status evidence is unavailable to Qwen until refreshed', () => {
  const scene = eventScene();
  scene.event!.researchedFacts = [{ kind: 'status', value: 'scheduled', sourceUrl: 'https://summersound.example',
    retrievedAt: new Date(Date.now() - 60 * 60_000).toISOString(), supportingQuote: 'Summer Sound is scheduled.' }];
  const evidence = sceneEvidence({ question: 'Is it still happening?', messages: [], scene, interests: [],
    available: { research: true, places: false, qloo: true, calendar: false, devicePosition: false, locationEnabled: false } });
  assert.equal(evidence['research:0'], undefined);
});

test('turning Location off clears device-anchored dining but retains a named result', () => {
  const named = eventScene(); named.dining = { discoveredAt: new Date().toISOString(),
    resolvedAnchor: { latitude: 40.7, longitude: -73.9, kind: 'named', name: 'Union Square',
      timezone: 'America/New_York', source: 'geoapify_geocode', confidence: 1 }, candidates: [] };
  useContextStore.setState({ scene: named, locationEnabled: true });
  useContextStore.getState().setLocationEnabled(false);
  assert.equal(useContextStore.getState().scene?.event?.visual.title, 'Summer Sound');
  assert.equal(useContextStore.getState().scene?.dining?.resolvedAnchor?.kind, 'named');
  const device = { ...named, dining: { ...named.dining, resolvedAnchor: undefined, anchor: { kind: 'device' as const } } };
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
