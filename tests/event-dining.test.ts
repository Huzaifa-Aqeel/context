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

test('multi-performer flyer keeps the printed lineup and explains Qloo contribution without a tag lookup', async () => {
  const interests: TasteProfile = { entities: [
    { id: 'miles', name: 'Miles Davis', type: 'urn:entity:artist' },
    { id: 'coke', name: 'Coke Studio', type: 'urn:entity:brand' },
  ], signature: 'b'.repeat(64) };
  const visual = { materialType: 'flyer' as const, title: 'Lahore Jazz Night', dateText: '14 November', timeText: '8 PM', venueName: 'Arts Hall',
    performers: ['Ali Noor', 'Sara Khan'], schedule: ['Ali Noor: 9 PM'] };
  const detected = visual.performers.map((label) => ({ label, category: 'artist', confidence: 0.95, culturallyRelevant: true }));
  const result = await analyzeEvent(visual, detected, interests, { ...qloo,
    rankEvent: async () => ({ resolved: detected.map((item) => ({ detectedName: item.label, detectedCategory: item.category,
      visionConfidence: item.confidence, qlooId: item.label, qlooType: 'urn:entity:artist', matchConfidence: 0.95, source: 'vision' as const })),
    ranked: [{ entityId: 'Ali Noor', name: 'Ali Noor', affinity: 0.8, exactInterest: false, contributingInterestIds: ['miles', 'coke'] },
      { entityId: 'Sara Khan', name: 'Sara Khan', affinity: 0.3, exactInterest: false, contributingInterestIds: ['miles'] }] }),
  });
  assert.equal(result.summary, 'This is the flyer for Lahore Jazz Night at Arts Hall on 14 November, starting at 8 PM. ' +
    'Performers: Ali Noor and Sara Khan. The printed schedule says: Ali Noor: 9 PM. ' +
    'Ali Noor stands out among the artists I could match, with Miles Davis and Coke Studio among the interests contributing to the recommendation.');
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
  assert.match(result.summary, /Named participants: Amira, Bilal, Cleo and Danish/);
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
      contributingInterestIds: ['radiohead'] }] }),
  });
  assert.equal(result.summary, 'This is the flyer for Jazz Night on 14 November. ' +
    'Performers: Ali Noor and Sara Khan. Ali Noor has a taste match for you, with Radiohead among the interests contributing to the recommendation.');
});

test('a readable flyer with no cultural candidates skips Qloo and still returns printed event details', async () => {
  const providers: Providers = { vision: { inspectScene: async () => ({ sceneType: 'event_material',
    event: { materialType: 'flyer', title: 'Neighborhood Concert', dateText: '14 November', timeText: '8 PM',
      venueName: 'Arts Hall', performers: ['Local Ensemble'], schedule: [] }, entities: [] }) },
  qloo: { ...qloo, rankEvent: noCall }, llm: { nextTurn: noCall } };
  const scene = await analyzeScene({ image: 'data:image/jpeg;base64,YQ==', mode: 'scene', profile }, providers);
  assert.equal(scene.summary, 'This is the flyer for Neighborhood Concert at Arts Hall on 14 November, starting at 8 PM. ' +
    'Named participants: Local Ensemble.');
  assert.deepEqual(scene.event?.ranking, []);
  assert.equal(scene.event?.visual.performers[0], 'Local Ensemble');
});

test('a conference flyer evaluates named speakers but leaves its venue and sponsor out of Capture Qloo calls', async () => {
  const paths: string[] = [];
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (url, init) => {
    const parsed = new URL(String(url));
    const type = parsed.pathname === '/v2/insights'
      ? (JSON.parse(String(init?.body)) as { 'filter.type': string })['filter.type'] : parsed.searchParams.get('types');
    paths.push(`${parsed.pathname}:${type}`);
    if (parsed.pathname === '/search') {
      assert.equal(parsed.searchParams.get('types'), 'urn:entity:person');
      const name = parsed.searchParams.get('query')!;
      return Response.json({ results: [{ entity_id: name, name, types: ['urn:entity:person'] }] });
    }
    assert.equal(parsed.pathname, '/v2/insights');
    assert.equal(parsed.searchParams.get('filter.type'), 'urn:entity:person');
    return Response.json({ success: true, results: { entities: ['Jensen Huang', 'Fei-Fei Li'].map((name, index) => ({
      entity_id: name, name, types: ['urn:entity:person'], query: { affinity: 0.8 - index * 0.1,
        explainability: { 'signal.interests.entities': [{ entity_id: 'radiohead', score: 0.4 }] } },
    })) } });
  });
  const scene = await analyzeEvent({ materialType: 'flyer', kind: 'conference', title: 'Annual AI Summit',
    venueName: 'Moscone Center', performers: ['Jensen Huang', 'Fei-Fei Li'], schedule: [],
    primarySubject: { name: 'Moscone Center', entityIndex: 2 },
    printedDetails: ['NVIDIA sponsors the summit'] }, [
    { label: 'Jensen Huang', category: 'person', role: 'speaker', qlooPriority: 'secondary', confidence: 0.95, culturallyRelevant: true },
    { label: 'Fei-Fei Li', category: 'person', role: 'speaker', qlooPriority: 'secondary', confidence: 0.95, culturallyRelevant: true },
    { label: 'Moscone Center', category: 'place', role: 'primary_subject', qlooPriority: 'primary', confidence: 0.95, culturallyRelevant: true },
    { label: 'NVIDIA', category: 'brand', role: 'organizer', qlooPriority: 'context_only', confidence: 0.95, culturallyRelevant: true },
  ], profile, client);
  assert.deepEqual(paths, ['/search:urn:entity:person', '/search:urn:entity:person', '/v2/insights:urn:entity:person']);
  assert.match(scene.summary, /Speakers: Jensen Huang and Fei-Fei Li/);
  assert.match(scene.summary, /at Moscone Center/);
  assert.match(scene.summary, /NVIDIA sponsors the summit/);
  assert.doesNotMatch(scene.summary, /Performers:|Both are associated/);
  assert.equal(scene.culturalEvidence.entities.length, 4);
});

test('a brand promotion evaluates its brand and printed speaker, but not its venue', async () => {
  const visual = { materialType: 'flyer' as const, kind: 'mixed' as const, title: 'Nike running weekend',
    primarySubject: { name: 'Nike', entityIndex: 0 }, venueName: 'Westfield', performers: ['Guest Speaker'], schedule: [],
    printedDetails: ['20% off running shoes through Sunday'] };
  const detected = [
    { label: 'Nike', category: 'brand', role: 'primary_subject' as const, confidence: 0.95, culturallyRelevant: true },
    { label: 'Guest Speaker', category: 'person', role: 'speaker' as const, confidence: 0.95, culturallyRelevant: true },
    { label: 'Westfield', category: 'place', role: 'venue' as const, confidence: 0.95, culturallyRelevant: true },
  ];
  const result = await analyzeEvent(visual, detected, profile, { ...qloo, rankEvent: async (visible) => {
    assert.deepEqual(visible.map((item) => item.label), ['Nike', 'Guest Speaker']);
    return { resolved: visible.map((item) => ({ detectedName: item.label, detectedCategory: item.category,
      role: item.role, visionConfidence: item.confidence, qlooId: item.label, qlooName: item.label,
      qlooType: item.category === 'brand' ? 'urn:entity:brand' : 'urn:entity:person', matchConfidence: 0.95, source: 'vision' as const })),
    ranked: [{ entityId: 'Guest Speaker', name: 'Guest Speaker', affinity: 0.99, exactInterest: false, contributingInterestIds: ['radiohead'] }] };
  } });
  assert.match(result.summary, /20% off running shoes through Sunday/);
  assert.match(result.summary, /Nike running weekend/);
  assert.doesNotMatch(result.summary, /Nike has a taste match for you/);
  assert.match(result.summary, /Guest Speaker has a taste match/);
});

test('book flyer subjects remain printed facts without Capture Qloo requests', async () => {
  for (const [category, title] of [['book', 'The Hobbit launch']] as const) {
    const result = await analyzeEvent({ materialType: 'flyer', title, performers: [], schedule: [],
      primarySubject: { name: title, entityIndex: 0 }, printedDetails: ['Saturday at the library'] },
    [{ label: title, category, role: 'primary_subject', confidence: 0.95, culturallyRelevant: true }],
    profile, { ...qloo, rankEvent: noCall });
    assert.match(result.summary, new RegExp(title));
    assert.match(result.summary, /Saturday at the library/);
    assert.deepEqual(result.event?.ranking, []);
  }
});

test('brand and game flyer subjects use typed Qloo Search and Insights', async () => {
  for (const [category, name, type] of [
    ['brand', 'Nike', 'urn:entity:brand'], ['videogame', 'Minecraft', 'urn:entity:videogame'],
  ] as const) {
    const searches: string[] = []; const insights: string[] = [];
    const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (url, init) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/search') {
        searches.push(parsed.searchParams.get('types')!);
        return Response.json({ results: [{ entity_id: name, name, types: [type] }] });
      }
      insights.push((JSON.parse(String(init?.body)) as { 'filter.type': string })['filter.type']);
      return Response.json({ success: true, results: { entities: [{ entity_id: name, name, types: [type],
        query: { affinity: 0.7, explainability: { 'signal.interests.entities': [{ entity_id: 'radiohead', score: 0.3 }] } } }] } });
    });
    const result = await analyzeEvent({ materialType: 'flyer', kind: category === 'brand' ? 'brand_promotion' : 'game',
      title: `${name} weekend`, primarySubject: { name, entityIndex: 0 }, performers: [], schedule: [] },
    [{ label: name, category, role: 'primary_subject', confidence: 0.95, culturallyRelevant: true }], profile, client);
    assert.deepEqual(searches, [type]);
    assert.deepEqual(insights, [type]);
    assert.equal(result.culturalEvidence.entities[0].qlooId, name);
    assert.match(result.summary, new RegExp(`${name} has a taste match`));
  }
});

test('a background sponsor does not enter flyer Qloo evaluation', async () => {
  const result = await analyzeEvent({ materialType: 'flyer', kind: 'concert', title: 'Jazz Night',
    performers: [], schedule: [], printedDetails: ['Sponsored by Nike'] },
  [{ label: 'Nike', category: 'brand', role: 'organizer', confidence: 0.95, culturallyRelevant: true }],
  profile, { ...qloo, rankEvent: noCall });
  assert.match(result.summary, /Sponsored by Nike/);
  assert.deepEqual(result.event?.ranking, []);
});

test('a venue promotion evaluates its place subject while a speaker flyer venue stays context only', async () => {
  const result = await analyzeEvent({ materialType: 'flyer', kind: 'venue_promotion', title: 'Blue Note reopening',
    venueName: 'Blue Note', performers: [], schedule: [], primarySubject: { name: 'Blue Note', entityIndex: 0 } },
  [{ label: 'Blue Note', category: 'place', role: 'venue', confidence: 0.95, culturallyRelevant: true }], profile,
  { ...qloo, rankEvent: async (visible) => {
    assert.deepEqual(visible.map((item) => [item.label, item.category, item.role]), [['Blue Note', 'place', 'primary_subject']]);
    return { resolved: [], ranked: [] };
  } });
  assert.match(result.summary, /Blue Note reopening at Blue Note/);
});

test('a venue promotion uses its printed city to disambiguate Qloo place records without device location', async () => {
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/search') return Response.json({ results: [
      { entity_id: 'blue-note-new-york', name: 'Blue Note', types: ['urn:entity:place'], properties: { geocode: { city: 'New York' } } },
      { entity_id: 'blue-note-tokyo', name: 'Blue Note', types: ['urn:entity:place'], properties: { geocode: { city: 'Tokyo' } } },
    ] });
    return Response.json({ success: true, results: { entities: [{ entity_id: 'blue-note-new-york', name: 'Blue Note',
      types: ['urn:entity:place'], query: { affinity: 0.6, explainability: {
        'signal.interests.entities': [{ entity_id: 'radiohead', score: 0.3 }] } } }] } });
  });
  const result = await analyzeEvent({ materialType: 'flyer', kind: 'venue_promotion', title: 'Blue Note reopening',
    venueName: 'Blue Note', locationText: 'New York, NY', primarySubject: { name: 'Blue Note', entityIndex: 0 },
    performers: [], schedule: [] },
  [{ label: 'Blue Note', category: 'place', role: 'primary_subject', confidence: 0.95, culturallyRelevant: true }], profile, client);
  assert.equal(result.culturalEvidence.entities[0].qlooId, 'blue-note-new-york');
  assert.match(result.summary, /Radiohead among the interests contributing/);
});

test('a mixed movie-and-speaker flyer makes only subject and speaker Qloo requests, without a cross-type winner', async () => {
  const searches: string[] = []; const insights: string[] = [];
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/search') {
      const type = parsed.searchParams.get('types')!;
      searches.push(type);
      const name = parsed.searchParams.get('query')!;
      return Response.json({ results: [{ entity_id: name, name, types: [type] }] });
    }
    const type = (JSON.parse(String(init?.body)) as { 'filter.type': string })['filter.type'];
    insights.push(type);
    const movie = type === 'urn:entity:movie';
    return Response.json({ success: true, results: { entities: [{ entity_id: movie ? 'Dune: Part Two' : 'Guest Speaker',
      name: movie ? 'Dune: Part Two' : 'Guest Speaker', types: [type], query: { affinity: movie ? 0.2 : 0.99,
        explainability: { 'signal.interests.entities': [{ entity_id: 'radiohead', score: 0.3 }] } } }] } });
  });
  const result = await analyzeEvent({ materialType: 'flyer', kind: 'movie', title: 'Dune: Part Two screening',
    primarySubject: { name: 'Dune: Part Two', entityIndex: 0 }, venueName: 'Cinema One',
    performers: ['Guest Speaker'], schedule: [] }, [
    { label: 'Dune: Part Two', category: 'movie', role: 'primary_subject', confidence: 0.95, culturallyRelevant: true },
    { label: 'Guest Speaker', category: 'person', role: 'speaker', confidence: 0.95, culturallyRelevant: true },
    { label: 'Cinema One', category: 'place', role: 'venue', confidence: 0.95, culturallyRelevant: true },
  ], profile, client);
  assert.deepEqual(searches, ['urn:entity:movie', 'urn:entity:person']);
  assert.deepEqual(insights, ['urn:entity:movie', 'urn:entity:person']);
  assert.match(result.summary, /Dune: Part Two has a taste match/);
  assert.doesNotMatch(result.summary, /Guest Speaker has a taste match/);
  assert.match(result.summary, /at Cinema One/);
});

test('a previously resolved flyer movie uses the signed resolution cache on another Capture', async () => {
  let searches = 0; let insights = 0;
  const fetcher = async (url: RequestInfo | URL) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/search') {
      searches++;
      return Response.json({ results: [{ entity_id: 'dune-id', name: 'Dune: Part Two', types: ['urn:entity:movie'] }] });
    }
    insights++;
    return Response.json({ success: true, results: { entities: [{ entity_id: 'dune-id', name: 'Dune: Part Two', types: ['urn:entity:movie'],
      query: { affinity: 0.7, explainability: { 'signal.interests.entities': [{ entity_id: 'radiohead', score: 0.3 }] } } }] } });
  };
  const visual = { kind: 'movie' as const, title: 'Dune: Part Two screening', primarySubject: { name: 'Dune: Part Two', entityIndex: 0 },
    performers: [], schedule: [], printedDetails: ['Screening this weekend'] };
  const detected = [{ label: 'Dune: Part Two', category: 'movie', role: 'primary_subject' as const, confidence: 0.95, culturallyRelevant: true }];
  const first = await analyzeEvent(visual, detected, profile, new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, fetcher));
  assert.equal(first.resolutionCache?.entries.length, 1);
  const second = await analyzeEvent(visual, detected, profile, new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, fetcher), first.resolutionCache?.entries);
  assert.equal(searches, 1);
  assert.equal(insights, 2);
  assert.match(second.summary, /Dune: Part Two has a taste match/);
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

test('a changed taste profile requires a new capture instead of reranking the old event', async () => {
  const scene = eventScene(); scene.event!.profileSignature = 'a'.repeat(64);
  const nextProfile = { ...profile, signature: 'b'.repeat(64) };
  const answer = await explore({ ...ask(scene, 'Which performer matches my interests?'), profile: nextProfile }, {
    vision: { inspectScene: noCall }, qloo: { ...qloo, rerankEvent: noCall }, llm: { nextTurn: noCall },
  });
  assert.match(answer.answer, /Capture a new scene/);
  assert.equal(answer.scene, undefined);
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
  const noLocation = await exploreDining({ question: "Find somewhere nearby I'd enjoy eating", profile, messages: [], mode: 'scene', locationEnabled: false }, ranking, places);
  assert.match(noLocation.answer, /Turn on Location/); assert.equal(qlooCalls, 0);
  const discovered = await exploreDining({ question: "Find somewhere nearby I'd enjoy eating", profile, messages: [], mode: 'scene', locationEnabled: true,
    position: { latitude: 40.7, longitude: -73.9 } }, ranking, places);
  assert.equal(qlooCalls, 1); assert.equal(placesCalls, 0);
  assert.equal(discovered.scene?.dining?.candidates.length, 1);
  const address = await exploreDining(ask(discovered.scene!, 'What is the address of Cafe Roma?'), ranking, places);
  assert.match(address.answer, /10 Main Street/); assert.equal(placesCalls, 1);
  const repeated = await exploreDining(ask(address.scene!, 'What is the address of Cafe Roma?'), ranking, places);
  assert.equal(placesCalls, 1); assert.equal(repeated.action, undefined);
  const changed = await explore({ ...ask(address.scene!, 'Why does it fit?'), profile: { ...profile, signature: 'b'.repeat(64) } },
    { vision: { inspectScene: noCall }, qloo: ranking, llm: { nextTurn: noCall }, places });
  assert.match(changed.answer, /Capture a new scene/); assert.equal(changed.scene, undefined); assert.equal(qlooCalls, 1);
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
