import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeScene, explore, type Providers } from '../lib/orchestration/context';
import { exploreEvent } from '../lib/orchestration/event-ask';
import { analyzeEvent } from '../lib/orchestration/event';
import { exploreDining } from '../lib/orchestration/dining';
import { parseEventStart } from '../lib/orchestration/event-time';
import { GeoapifyClient } from '../lib/places/geoapify';
import { QlooClient } from '../lib/qloo/client';
import { answerSchema, sceneSchema } from '../schemas/context';
import type { AskRequest, Scene } from '../types/context';
import type { TasteProfile } from '../types/taste';

const noCall = async (): Promise<never> => { throw Error('Unexpected provider call'); };
const profile: TasteProfile = { entities: [{ id: 'radiohead', name: 'Radiohead', type: 'urn:entity:artist' }], signature: 'a'.repeat(64) };
const eventScene = (): Scene => ({ id: 'event', origin: 'image', createdAt: new Date().toISOString(), summary: 'Event flyer.', confidence: 'medium',
  culturalEvidence: { entities: [{ detectedName: 'Radiohead', detectedCategory: 'artist', visionConfidence: 0.9,
    qlooId: 'radiohead', qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' }], relationships: [], themes: [], confidence: 0 },
  event: { visual: { title: 'Summer Sound', dateText: 'October 10, 2026', timeText: '8 PM', timezoneText: 'ET',
    venueName: 'Blue Note', locationText: 'New York', performers: ['Radiohead'], schedule: [] },
    ranking: [{ entityId: 'radiohead', name: 'Radiohead', exactInterest: true, contributingInterestIds: ['radiohead'] }], researchedFacts: [] } });
const ask = (scene: Scene, question: string): AskRequest => ({ scene, question, profile, messages: [], mode: 'scene' });
const qloo = { resolveEntities: noCall, analyzeConnections: noCall, analyzeTaste: noCall, getEntityFact: noCall,
  exploreReference: noCall, getLocationContext: noCall };

test('event capture uses visible printed material and Qloo ranking without Tavily or Places', async () => {
  let ranked = 0;
  const providers: Providers = { vision: { inspectScene: async () => ({ sceneType: 'event_material',
    event: eventScene().event!.visual,
    entities: [{ label: 'Radiohead', category: 'artist', confidence: 0.9, culturallyRelevant: true }] }) },
  qloo: { ...qloo, rankEvent: async (visible, interests) => {
    ranked++; assert.equal(visible[0].label, 'Radiohead'); assert.equal(interests[0].id, 'radiohead');
    return { resolved: eventScene().culturalEvidence.entities, ranked: eventScene().event!.ranking };
  } }, llm: { nextTurn: noCall }, research: { search: noCall }, places: { findExact: noCall } };
  const scene = await analyzeScene({ image: 'data:image/jpeg;base64,YQ==', mode: 'scene', profile }, providers);
  assert.equal(ranked, 1);
  assert.match(scene.summary, /Summer Sound/);
  assert.match(scene.summary, /Performers: Radiohead\. Radiohead is already one of your interests/);
  assert.deepEqual(scene.event?.researchedFacts, []);
});

test('multi-performer flyer names the strongest printed performer, contributing interests, and a verified shared tag', async () => {
  const interests: TasteProfile = { entities: [
    { id: 'miles', name: 'Miles Davis', type: 'urn:entity:artist' },
    { id: 'coke', name: 'Coke Studio', type: 'urn:entity:brand' },
  ], signature: 'b'.repeat(64) };
  const visual = { materialType: 'flyer' as const, title: 'Lahore Jazz Night', dateText: '14 November', timeText: '8 PM', venueName: 'Arts Hall',
    performers: ['Ali Noor', 'Sara Khan'], schedule: ['Ali Noor: 9 PM'] };
  const detected = visual.performers.map((label) => ({ label, category: 'artist', confidence: 0.95, culturallyRelevant: true }));
  let tagCalls = 0;
  const result = await analyzeEvent(visual, detected, interests, { ...qloo,
    rankEvent: async () => ({ resolved: detected.map((item) => ({ detectedName: item.label, detectedCategory: item.category,
      visionConfidence: item.confidence, qlooId: item.label, qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' as const })),
    ranked: [{ entityId: 'Ali Noor', name: 'Ali Noor', affinity: 0.8, exactInterest: false, contributingInterestIds: ['miles', 'coke'] },
      { entityId: 'Sara Khan', name: 'Sara Khan', affinity: 0.3, exactInterest: false, contributingInterestIds: ['miles'] }] }),
    sharedEventTag: async (id, ids) => { tagCalls++; assert.equal(id, 'Ali Noor'); assert.deepEqual(ids, ['miles', 'coke']); return 'fusion'; },
  });
  assert.equal(tagCalls, 1);
  assert.equal(result.summary, 'This is the flyer for Lahore Jazz Night at Arts Hall on 14 November, starting at 8 PM. ' +
    'Performers: Ali Noor and Sara Khan. The printed schedule says: Ali Noor: 9 PM. ' +
    'Ali Noor ranks highest for you, with Miles Davis and Coke Studio among the interests contributing to the recommendation. ' +
    'Both are associated with fusion.');
  assert.equal(result.event?.ranking[0].sharedTag, 'fusion');
  assert.deepEqual(result.event?.visual.schedule, ['Ali Noor: 9 PM']);
  assert.match(result.summary, /Sara Khan/);
});

test('single performer flyer omits ranking language and unsupported tag while keeping printed time', async () => {
  const visual = { materialType: 'program' as const, title: 'Spring Chamber Series', dateText: 'May 2', timeText: '7 PM', performers: ['Anna Weber'], schedule: [] };
  const result = await analyzeEvent(visual, [{ label: 'Anna Weber', category: 'artist', confidence: 0.9, culturallyRelevant: true }],
    { entities: [{ id: 'yo-yo', name: 'Yo-Yo Ma', type: 'urn:entity:artist' }], signature: 'c'.repeat(64) }, { ...qloo,
      rankEvent: async () => ({ resolved: [{ detectedName: 'Anna Weber', detectedCategory: 'artist', visionConfidence: 0.9,
        qlooId: 'anna', qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' }],
      ranked: [{ entityId: 'anna', name: 'Anna Weber', affinity: 0.7, exactInterest: false, contributingInterestIds: ['yo-yo'] }] }),
      sharedEventTag: async () => undefined,
    });
  assert.equal(result.summary, 'This is the program for Spring Chamber Series on May 2, starting at 7 PM. ' +
    'Performers: Anna Weber. Anna Weber has a taste match for you, with Yo-Yo Ma among the interests contributing to the recommendation.');
  assert.doesNotMatch(result.summary, /ranks|Both are associated/);
});

test('first flyer answer keeps every readable performer and important printed practical detail', async () => {
  const visual = { materialType: 'flyer' as const, title: 'City Music Night', dateText: '20 November 2026',
    timeText: '7 PM', endTimeText: '11 PM', venueName: 'Arts Hall',
    performers: ['Amira', 'Bilal', 'Cleo', 'Danish'], schedule: ['Amira: 7:30 PM', 'Cleo: 9 PM'],
    printedDetails: ['Doors at 6 PM', 'Admission is free', 'Step-free entrance'] };
  const result = await analyzeEvent(visual, [], profile, { ...qloo, rankEvent: noCall });
  assert.match(result.summary, /starting at 7 PM, ending at 11 PM/);
  assert.match(result.summary, /Performers: Amira, Bilal, Cleo and Danish/);
  assert.match(result.summary, /Amira: 7:30 PM; Cleo: 9 PM/);
  assert.match(result.summary, /Doors at 6 PM; Admission is free; Step-free entrance/);
  assert.doesNotMatch(result.summary, /and others/);
});

test('event material beyond old performer and detail limits remains readable', async () => {
  const performers = Array.from({ length: 31 }, (_, index) => `Performer ${index + 1}`);
  const printedDetails = Array.from({ length: 13 }, (_, index) => `Printed detail ${index + 1}`);
  const scene = await analyzeEvent({ title: 'Festival Program', performers, schedule: [], printedDetails }, [], profile,
    { ...qloo, rankEvent: noCall });
  assert.match(scene.summary, /Performer 31/);
  assert.match(scene.summary, /Printed detail 13/);
  assert.equal(sceneSchema.parse(scene).event?.visual.performers.length, 31);
});

test('Qloo shared event tag requires the performer and every named interest to carry the same specific tag', async () => {
  let lookups = 0;
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, '/entities'); lookups++;
    const ids = parsed.searchParams.get('entity_ids')!.split(',');
    return Response.json({ results: ids.map((id) => ({ entity_id: id, name: id, types: ['urn:entity:artist'],
      tags: (id === 'performer' || id === 'interestA' ? ['Fusion', 'Music'] : ['Music']).map((name) =>
        ({ tag_id: `urn:tag:genre:music:${name.toLowerCase()}`, name })) })) });
  });
  assert.equal(await client.sharedEventTag('performer', ['interestA']), 'Fusion');
  assert.equal(await client.sharedEventTag('performer', ['interestA', 'interestB']), undefined);
  assert.equal(lookups, 2);
});

test('event Qloo contributors are ordered by their explainability scores before the first answer uses them', async () => {
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (url) => {
    assert.equal(new URL(String(url)).pathname, '/v2/insights');
    return Response.json({ success: true, results: { entities: [{ entity_id: 'performer', name: 'Ali Noor', types: ['urn:entity:artist'],
      query: { affinity: 0.8, explainability: { 'signal.interests.entities': [
        { entity_id: 'coke', score: 0.2 }, { entity_id: 'miles', score: 0.8 }, { entity_id: 'other', score: 0.05 },
      ] } } }] } });
  });
  const result = await client.rerankEvent([{ detectedName: 'Ali Noor', detectedCategory: 'artist', visionConfidence: 0.95,
    qlooId: 'performer', qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' }], [
    { id: 'coke', name: 'Coke Studio', type: 'urn:entity:brand' },
    { id: 'miles', name: 'Miles Davis', type: 'urn:entity:artist' },
    { id: 'other', name: 'Another Interest', type: 'urn:entity:artist' },
  ]);
  assert.deepEqual(result.ranked[0].contributingInterestIds, ['miles', 'coke']);
});

test('multi-performer answer omits an unsupported shared tag but keeps the printed-details template', async () => {
  const visual = { materialType: 'flyer' as const, title: 'Jazz Night', dateText: '14 November',
    performers: ['Ali Noor', 'Sara Khan'], schedule: [] };
  const result = await analyzeEvent(visual, visual.performers.map((label) =>
    ({ label, category: 'artist', confidence: 0.95, culturallyRelevant: true })), profile, { ...qloo,
    rankEvent: async () => ({ resolved: visual.performers.map((name) => ({ detectedName: name, detectedCategory: 'artist',
      visionConfidence: 0.95, qlooId: name, qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' as const })),
    ranked: [{ entityId: 'Ali Noor', name: 'Ali Noor', affinity: 0.7, exactInterest: false,
      contributingInterestIds: ['radiohead'] }] }), sharedEventTag: async () => undefined,
  });
  assert.equal(result.summary, 'This is the flyer for Jazz Night on 14 November. ' +
    'Performers: Ali Noor and Sara Khan. Ali Noor ranks highest for you, with Radiohead among the interests contributing to the recommendation.');
});

test('a readable flyer with no cultural candidates skips Qloo and still returns printed event details', async () => {
  const providers: Providers = { vision: { inspectScene: async () => ({ sceneType: 'event_material',
    event: { materialType: 'flyer', title: 'Neighborhood Concert', dateText: '14 November', timeText: '8 PM',
      venueName: 'Arts Hall', performers: ['Local Ensemble'], schedule: [] }, entities: [] }) },
  qloo: { ...qloo, rankEvent: noCall }, llm: { nextTurn: noCall } };
  const scene = await analyzeScene({ image: 'data:image/jpeg;base64,YQ==', mode: 'scene', profile }, providers);
  assert.equal(scene.summary, 'This is the flyer for Neighborhood Concert at Arts Hall on 14 November, starting at 8 PM. ' +
    'Performers: Local Ensemble.');
  assert.deepEqual(scene.event?.ranking, []);
  assert.equal(scene.event?.visual.performers[0], 'Local Ensemble');
});

test('Qloo failure or an opaque rank does not block flyer orientation or invent taste relevance', async () => {
  const visual = { materialType: 'flyer' as const, title: 'Jazz Night', dateText: '14 November',
    performers: ['Ali Noor', 'Sara Khan'], schedule: [] };
  const detected = visual.performers.map((label) => ({ label, category: 'artist', confidence: 0.95, culturallyRelevant: true }));
  const opaque = await analyzeEvent(visual, detected, profile, { ...qloo, rankEvent: async () => ({
    resolved: detected.map((item) => ({ detectedName: item.label, detectedCategory: item.category, visionConfidence: item.confidence,
      qlooId: item.label, qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' as const })),
    ranked: [{ entityId: 'Ali Noor', name: 'Ali Noor', affinity: 0.7, exactInterest: false, contributingInterestIds: [] }],
  }) });
  const unavailable = await analyzeEvent(visual, detected, profile, { ...qloo, rankEvent: async () => { throw Error('Qloo unavailable'); } });
  for (const scene of [opaque, unavailable]) {
    assert.equal(scene.summary, 'This is the flyer for Jazz Night on 14 November. Performers: Ali Noor and Sara Khan.');
    assert.deepEqual(scene.event?.visual.performers, ['Ali Noor', 'Sara Khan']);
    assert.doesNotMatch(scene.summary, /ranks highest|mainly through/);
  }
});

test('event summary never substitutes a ranked venue for a printed performer or claims an unprinted set time', async () => {
  const visual = { title: 'Jazz Night', timeText: '7 PM', venueName: 'Blue Note', performers: ['Ali Noor'],
    schedule: ['Doors at 7 PM'], };
  const result = await analyzeEvent(visual, [
    { label: 'Blue Note', category: 'place', confidence: 0.95, culturallyRelevant: true },
    { label: 'Ali Noor', category: 'artist', confidence: 0.95, culturallyRelevant: true },
  ], profile, { ...qloo, rankEvent: async () => ({ resolved: [
    { detectedName: 'Blue Note', detectedCategory: 'place', visionConfidence: 0.95, qlooId: 'venue',
      qlooType: 'urn:entity:place', matchConfidence: 0.95, source: 'vision' },
    { detectedName: 'Ali Noor', detectedCategory: 'artist', visionConfidence: 0.95, qlooId: 'performer',
      qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' },
  ], ranked: [
    { entityId: 'venue', name: 'Blue Note', affinity: 0.9, exactInterest: false, contributingInterestIds: ['radiohead'] },
    { entityId: 'performer', name: 'Ali Noor', affinity: 0.5, exactInterest: false, contributingInterestIds: ['radiohead'] },
  ] }) });
  assert.match(result.summary, /Performers: Ali Noor/);
  assert.doesNotMatch(result.summary, /Blue Note.*ranks|Ali Noor.*performs at 7 PM/);
  assert.match(result.summary, /^This is event material for Jazz Night at Blue Note, starting at 7 PM/);
});

test('event Ask reuses printed facts, then asks for end time before any Calendar action', async () => {
  const scene = eventScene();
  const time = await exploreEvent(ask(scene, 'What time does it start?'), qloo);
  assert.match(time.answer, /8 PM/); assert.equal(time.action, undefined);
  const performers = await exploreEvent(ask(scene, 'Who is performing?'), qloo);
  assert.match(performers.answer, /Radiohead/);
  scene.event!.visual.schedule = ['Doors 7 PM', 'Music 8 PM'];
  const schedule = await exploreEvent(ask(scene, 'What is the printed schedule?'), qloo);
  assert.match(schedule.answer, /Doors 7 PM/);
  const proposed = await exploreEvent(ask(scene, 'Add this to my calendar'), qloo);
  assert.equal(proposed.action, undefined);
  assert.ok(proposed.scene?.event?.pendingCalendar);
  const completed = await exploreEvent(ask(proposed.scene!, 'use one hour'), qloo);
  assert.equal(completed.action?.kind, 'calendar');
  assert.equal(answerSchema.parse(completed).action?.kind, 'calendar');
  assert.equal(completed.action?.endIsPlaceholder, true);
  assert.equal(new Date(completed.action!.end).getTime() - new Date(completed.action!.start).getTime(), 3_600_000);
  assert.equal(completed.scene?.event?.pendingCalendar, undefined);
  const printed = eventScene(); printed.event!.visual.endTimeText = '10 PM';
  const direct = await exploreEvent(ask(printed, 'Add this to Calendar'), qloo);
  assert.equal(direct.action?.kind, 'calendar'); assert.equal(direct.action?.endIsPlaceholder, false);
  assert.equal(direct.action?.timeZone, 'America/New_York');
  const reminded = await exploreEvent(ask(scene, 'Remind me two hours before'), qloo);
  const saved = await exploreEvent(ask(reminded.scene!, 'Use one hour'), qloo);
  assert.equal(saved.action?.reminderMinutes, 120);
});

test('Calendar requires explicit year and timezone, and missing start details remain a voice clarification', async () => {
  assert.equal(parseEventStart('Friday', '8 PM', undefined), undefined);
  const scene = eventScene(); scene.event!.visual.dateText = 'Friday'; scene.event!.visual.timezoneText = undefined;
  let searches = 0;
  const initial = await exploreEvent(ask(scene, 'Add this to Calendar'), qloo, { search: async () => { searches++; return []; } });
  assert.equal(searches, 1); assert.equal(initial.action, undefined);
  assert.ok(initial.scene?.event?.pendingCalendarDetails);
  const clarified = await exploreEvent(ask(initial.scene!, 'October 10, 2026 at 8 PM Eastern Time'), qloo);
  assert.equal(clarified.action, undefined);
  assert.ok(clarified.scene?.event?.pendingCalendar);
});

test('a changed taste profile discards stale event ranking and reranks retained IDs without Search', async () => {
  const scene = eventScene(); scene.event!.profileSignature = 'a'.repeat(64);
  const nextProfile = { ...profile, signature: 'b'.repeat(64) };
  let reranks = 0;
  const answer = await exploreEvent({ ...ask(scene, 'Which performer matches my interests?'), profile: nextProfile }, {
    ...qloo, rerankEvent: async (resolved, interests) => {
      reranks++; assert.equal(resolved[0].qlooId, 'radiohead'); assert.equal(interests[0].id, 'radiohead');
      return { resolved, ranked: [{ entityId: 'radiohead', name: 'Radiohead', exactInterest: true, contributingInterestIds: ['radiohead'] }] };
    },
  });
  assert.equal(reranks, 1); assert.equal(answer.scene?.event?.profileSignature, nextProfile.signature);
});

test('Tavily is used only for current event facts, which are cached without opening links', async () => {
  let searches = 0;
  const research = { search: async () => { searches++; return [{ title: 'Summer Sound tickets', url: 'https://summersound.example/tickets',
    content: 'Summer Sound tickets are on sale now for the October 10, 2026 event.', retrievedAt: new Date().toISOString() }]; } };
  const first = await exploreEvent(ask(eventScene(), 'Are tickets available?'), qloo, research);
  assert.equal(searches, 1); assert.match(first.answer, /on sale/);
  assert.equal(first.action, undefined);
  const second = await exploreEvent(ask(first.scene!, 'Open tickets'), qloo, research);
  assert.equal(searches, 1); assert.equal(second.action, undefined);
});

test('dining needs explicit location and Qloo interest ranking; Places is only called for practical details', async () => {
  let qlooCalls = 0; let placesCalls = 0;
  const ranking = { ...qloo, recommendDining: async () => { qlooCalls++; return [{ qlooId: 'cafe', name: 'Cafe Roma', radiusMeters: 2000 as const,
    affinity: 0.6, contributingInterestIds: ['radiohead'], cuisineTags: ['Italian'] }]; } };
  const places = { findExact: async () => { placesCalls++; return { name: 'Cafe Roma', placeId: 'g1', address: '10 Main Street, New York', checkedAt: new Date().toISOString() }; } };
  const noLocation = await exploreDining({ question: 'Find a restaurant near me', profile, messages: [], mode: 'scene', locationEnabled: false }, ranking, places);
  assert.match(noLocation.answer, /Turn on Location/); assert.equal(qlooCalls, 0);
  const discovered = await exploreDining({ question: 'Find a restaurant near me', profile, messages: [], mode: 'scene', locationEnabled: true,
    position: { latitude: 40.7, longitude: -73.9 } }, ranking, places);
  assert.equal(qlooCalls, 1); assert.equal(placesCalls, 0);
  assert.equal(discovered.scene?.dining?.candidates.length, 1);
  const address = await exploreDining(ask(discovered.scene!, 'What is the address of Cafe Roma?'), ranking, places);
  assert.match(address.answer, /10 Main Street/); assert.equal(placesCalls, 1);
  const repeated = await exploreDining(ask(address.scene!, 'What is the address of Cafe Roma?'), ranking, places);
  assert.equal(placesCalls, 1); assert.equal(repeated.action, undefined);
  const changed = await exploreDining({ ...ask(address.scene!, 'Why does it fit?'), profile: { ...profile, signature: 'b'.repeat(64) } }, ranking, places);
  assert.match(changed.answer, /interests changed/); assert.equal(qlooCalls, 1);
});

test('Geoapify requires an exact unique named anchor and keeps the key in the request', async () => {
  const client = new GeoapifyClient('fixture', async (url) => {
    assert.equal(new URL(String(url)).searchParams.get('apiKey'), 'fixture');
    return Response.json({ results: [
      { place_id: 'a', name: 'Cafe Roma', formatted: 'Cafe Roma, 10 Main Street', lat: 40.7, lon: -73.9 },
      { place_id: 'b', name: 'Cafe Roma', formatted: 'Cafe Roma, 20 Main Street', lat: 40.8, lon: -73.8 },
    ] });
  });
  assert.equal(await client.findExact('Cafe Roma'), undefined);
  assert.equal(await client.findExact('Different Cafe'), undefined);
});

test('Qloo dining discovery expands radius once and filters non-restaurant places', async () => {
  const radii: number[] = [];
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (_url, init) => {
    const body = JSON.parse(String(init?.body)); radii.push(body['filter.location.radius']);
    const restaurant = { entity_id: 'cafe', name: 'Cafe Roma', types: ['urn:entity:place'],
      subtype: 'restaurant', query: { affinity: 0.7 }, tags: [
        { name: 'Restaurant', tag_id: 'urn:tag:category:place:restaurant' },
        { name: 'Italian', tag_id: 'urn:tag:genre:restaurant:Italian' }] };
    return Response.json({ success: true, results: { entities: radii.length === 1
      ? [{ entity_id: 'museum', name: 'Museum', types: ['urn:entity:place'], query: { affinity: 0.9 } }] : [restaurant] } });
  });
  const found = await client.recommendDining({ latitude: 40.7, longitude: -73.9 }, profile.entities);
  assert.deepEqual(radii, [2000, 5000]);
  assert.equal(found[0].name, 'Cafe Roma'); assert.equal(found[0].radiusMeters, 5000);
});

test('dining preserves Qloo result order and explicitly requests affinity sorting', async () => {
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).sort_by, 'affinity');
    return Response.json({ success: true,
    results: { entities: [
      { entity_id: 'high', name: 'Higher Match', types: ['urn:entity:place'], query: { affinity: 0.8 }, tags: [{ name: 'Restaurant', tag_id: 'urn:tag:category:place:restaurant' }] },
      { entity_id: 'low', name: 'Lower Match', types: ['urn:entity:place'], query: { affinity: 0.3 }, tags: [{ name: 'Restaurant', tag_id: 'urn:tag:category:place:restaurant' }] },
    ] } });
  });
  const found = await client.recommendDining({ latitude: 40.7, longitude: -73.9 }, profile.entities);
  assert.deepEqual(found.map((item) => item.name), ['Higher Match', 'Lower Match']);
});
