import assert from 'node:assert/strict';
import test from 'node:test';
import { GeoapifyClient, type PlaceAnchor, type PlacesService } from '../lib/places/geoapify';
import { instantForWallTime, openingStatusAt } from '../lib/places/opening-hours';
import { discoverDining, qlooDetailAnswer } from '../lib/orchestration/dining';
import { continueArea, discoverArea } from '../lib/orchestration/area';
import { explore, type Providers } from '../lib/orchestration/context';
import { asksForAreaDiscovery, asksForDiningDiscovery, asksForPracticalLookup, needsDevicePosition } from '../lib/orchestration/intent';
import type { QlooService, PlaceRecommendation } from '../lib/qloo/service';
import type { AskRequest, Scene } from '../types/context';
import type { TasteProfile } from '../types/taste';

const profile: TasteProfile = { entities: [{ id: 'music', name: 'Miles Davis', type: 'urn:entity:artist' }], signature: 'b'.repeat(64) };
const point = { latitude: 40.7, longitude: -73.9 };
const anchor: PlaceAnchor = { ...point, kind: 'device', name: null, source: 'foreground_location',
  timezone: 'America/New_York', confidence: null };
const request = (question: string): AskRequest => ({ question, profile, messages: [], mode: 'scene',
  locationEnabled: true, position: point, locale: 'en-US', deviceTimeZone: 'America/New_York' });
const place = (id: string, bucket: PlaceRecommendation['bucket'] = 'cafe', rank = 0.8): PlaceRecommendation => ({
  qlooId: id, name: id, radiusMeters: 800, affinity: rank, contributingInterestIds: ['music'], cuisineTags: [],
  latitude: 40.701, longitude: -73.9, bucket,
});
const qlooBase = { resolveEntities: async () => [], analyzeConnections: async () => ({ entities: [], relationships: [], themes: [], confidence: 0 }),
  analyzeTaste: async () => ({ connections: [], warnings: [] }), getEntityFact: async () => undefined,
  exploreReference: async () => ({ entities: [], relationships: [], themes: [], confidence: 0 }),
  getLocationContext: async () => { throw Error('No locality lookup expected'); } } as QlooService;

test('Geoapify confirms only a unique matching POI and refreshes provider data between requests', async () => {
  let calls = 0;
  const client = new GeoapifyClient('fixture', async (url) => {
    calls++;
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get('apiKey'), 'fixture');
    if (parsed.pathname === '/v2/places') return Response.json({ features: [{ type: 'Feature',
      properties: { place_id: 'cafe-one', name: 'Cafe One', categories: ['catering.cafe'],
        lat: 40.701, lon: -73.9, formatted: '1 Main St' }, geometry: { type: 'Point', coordinates: [-73.9, 40.701] } }] });
    return Response.json({ features: [{ type: 'Feature', properties: { feature_type: 'details', place_id: 'cafe-one',
      name: 'Cafe One', formatted: '1 Main St', categories: ['catering.cafe'], lat: 40.701, lon: -73.9,
      contact: { phone: '+1 212 555 0100' }, catering: { cuisine: 'Italian', reservation: 'recommended' },
      opening_hours: 'Mo-Fr 09:00-18:00' } }] });
  });
  const candidate = { name: 'Cafe One', position: { latitude: 40.701, longitude: -73.9 } };
  const first = await client.matchCandidate(candidate, ['catering']);
  assert.equal(first.status, 'confirmed');
  if (first.status === 'confirmed') {
    assert.equal(first.details.address, '1 Main St');
    assert.equal(first.details.cuisine, 'Italian');
    assert.equal(first.details.phone, '+1 212 555 0100');
    assert.equal(first.details.openingHours, 'Mo-Fr 09:00-18:00');
    assert.equal(first.details.reservation, 'recommended');
  }
  assert.equal((await client.matchCandidate(candidate, ['catering'])).status, 'confirmed');
  assert.equal(calls, 4);
});

test('Geoapify practical lookup sorts mapped places by distance and expands only when empty', async () => {
  const radii: string[] = [];
  const client = new GeoapifyClient('fixture', async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get('categories'), 'commercial.hobby.games,commercial.toy_and_game');
    radii.push(parsed.searchParams.get('filter') ?? '');
    const expanded = parsed.searchParams.get('filter')?.endsWith(',5000');
    return Response.json({ features: expanded ? [
      { type: 'Feature', properties: { place_id: 'far', name: 'Far Games', lat: 40.704, lon: -73.9 } },
      { type: 'Feature', properties: { place_id: 'near', name: 'Near Games', lat: 40.701, lon: -73.9 } },
    ] : [] });
  });
  const found = await client.practicalLookup(point, 'commercial.hobby.games,commercial.toy_and_game');
  assert.deepEqual(found.map((item) => item.name), ['Near Games', 'Far Games']);
  assert.deepEqual(radii.map((filter) => filter.slice(filter.lastIndexOf(',') + 1)), ['1000', '5000']);
});

test('simple venue-local weekly hours can be checked; complex or missing hours stay unknown', () => {
  const atTen = instantForWallTime({ year: 2026, month: 10, day: 9 }, 10, 0, 'America/New_York');
  assert.equal(atTen?.toISOString(), '2026-10-09T14:00:00.000Z');
  assert.equal(openingStatusAt('Mo-Fr 09:00-17:00; Sa 10:00-14:00', atTen!, 'America/New_York'), true);
  assert.equal(openingStatusAt('Mo-Fr 09:00-17:00', new Date('2026-10-09T23:00:00Z'), 'America/New_York'), false);
  assert.equal(openingStatusAt('24/7', atTen!, 'America/New_York'), true);
  assert.equal(openingStatusAt('Mo-Fr 09:00-17:00; PH off', atTen!, 'America/New_York'), undefined);
});

test('new place searches read device location even with an active scene; result follow-ups do not', () => {
  assert.equal(needsDevicePosition('What is worth checking out around here?', true), false);
  assert.equal(needsDevicePosition('Where is a restroom nearby?', true), true);
  assert.equal(needsDevicePosition('What is worth checking out near me?', true), false);
  assert.equal(needsDevicePosition('What is worth checking out around here?', false), false);
  assert.equal(needsDevicePosition('Food instead', true), false);
  assert.equal(needsDevicePosition('Tell me about the second one', true), false);
  assert.equal(needsDevicePosition('What is worth checking out around here?', true), false);
  assert.equal(asksForAreaDiscovery('What is worth checking out near Union Square?'), true);
  assert.equal(needsDevicePosition('What is worth checking out near Union Square?', false), false);
  assert.equal(needsDevicePosition('Find somewhere I’d enjoy eating near Union Square', false), false);
  assert.equal(needsDevicePosition('Find somewhere I’d enjoy eating near Union Square?', false), false);
  assert.equal(needsDevicePosition('Find somewhere nearby I’d enjoy eating', false), true);
  assert.equal(needsDevicePosition('Find a bookstore near me', false), true);
  assert.equal(needsDevicePosition('Find a record store near Union Square', false), false);
});

test('Dining speaks Qloo-ranked restaurants without Geoapify enrichment at discovery', async () => {
  const ranked = [place('Wrong Identity'), place('Qloo Only'), place('Verified Place'), place('Never Checked')];
  let qlooCalls = 0;
  const qloo: QlooService = { ...qlooBase, recommendDining: async (_point, _interests, options) => {
    qlooCalls++; assert.equal(options?.device, true); return ranked;
  } };
  const result = await discoverDining(request('Find somewhere nearby I’d enjoy eating'), qloo,
    { position: point, source: { kind: 'device' }, resolved: anchor });
  assert.equal(qlooCalls, 1);
  assert.deepEqual(result.scene?.dining?.selectedIds, ranked.map((item) => item.qlooId));
  assert.equal(result.scene?.dining?.candidates.length, 4);
  assert.match(result.answer, /Wrong Identity ranks highest/);
  assert.match(result.answer, /Never Checked/);
  assert.match(result.answer, /Miles Davis among the interests contributing/);
});

test('Dining keeps its existing requests and accepts named restaurant or bar categories', () => {
  assert.equal(asksForDiningDiscovery('Find somewhere nearby I’d enjoy eating'), true);
  assert.equal(asksForDiningDiscovery('Find somewhere I’d enjoy eating near Union Square'), true);
  assert.equal(asksForDiningDiscovery('Find dinner near the event'), false);
  assert.equal(asksForDiningDiscovery('Food instead'), false);
  assert.equal(asksForDiningDiscovery('Find dinner at 6:30 PM'), false);
  assert.equal(asksForDiningDiscovery('Find a restaurant near me'), true);
  assert.equal(asksForDiningDiscovery('Find a bar near Union Square'), true);
  assert.equal(asksForPracticalLookup('Find a bookstore near me'), true);
  assert.equal(asksForPracticalLookup('Find a record store near me'), true);
  assert.equal(asksForPracticalLookup('Find a game shop near me'), true);
});

test('the first Dining answer does not include opening status', async () => {
  const qloo: QlooService = { ...qlooBase, recommendDining: async () => [place('Evening Cafe')] };
  const found = await discoverDining(request('Find somewhere nearby I’d enjoy eating'), qloo,
    { position: point, source: { kind: 'device' }, resolved: anchor });
  assert.match(found.answer, /Evening Cafe/);
  assert.doesNotMatch(found.answer, /open|6:30|show/i);
  assert.deepEqual(found.scene?.dining?.places, []);
});

test('Dining gives a primary and up to five alternatives with Qloo cuisine, distance, rating, address and reasons', async () => {
  const ranked = Array.from({ length: 7 }, (_, index): PlaceRecommendation => ({ ...place(`Cafe ${index + 1}`),
    radiusMeters: 2000, cuisineTags: ['Italian'], restaurantCategory: 'restaurant',
    address: `${index + 1} Main Street`, businessRating: 4.2, distanceMeters: 200 + index * 100 }));
  const qloo: QlooService = { ...qlooBase, recommendDining: async () => ranked };
  const found = await discoverDining(request('Find somewhere nearby I’d enjoy eating'), qloo,
    { position: point, source: { kind: 'device' }, resolved: anchor });
  assert.equal(found.scene?.dining?.selectedIds?.length, 6);
  assert.match(found.answer, /Cafe 1 ranks highest/);
  assert.match(found.answer, /Italian restaurant/);
  assert.match(found.answer, /1 Main Street/);
  assert.match(found.answer, /4\.2 out of 5/);
  assert.match(found.answer, /Cafe 6/);
  assert.doesNotMatch(found.answer, /Cafe 7|opening hours/);
  assert.deepEqual(found.scene?.dining?.places, []);
});

test('a bar request uses the unchanged Qloo Dining path without Geoapify restaurant enrichment', async () => {
  let qlooCalls = 0;
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision must not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent must not run'); } },
    qloo: { ...qlooBase, recommendDining: async () => { qlooCalls++; return [{ ...place('Blue Bar'),
      restaurantCategory: 'Bar', cuisineTags: ['Cocktails'], businessRating: 4.2 }]; } },
    sceneReasoner: { plan: async () => ({ scope: 'area', next: 'area_discovery', evidenceIds: [] }),
      answer: async () => { throw Error('No answer model call'); } },
    places: { findExact: async () => { throw Error('Geoapify must not enrich restaurants'); },
      practicalLookup: async () => { throw Error('Geoapify practical lookup must not run'); } } };
  const result = await explore(request('Find a bar near me'), providers);
  assert.equal(qlooCalls, 1);
  assert.match(result.answer, /Blue Bar ranks highest/);
  assert.match(result.answer, /Cocktails bar/);
  assert.equal(result.scene?.dining?.selectedIds?.[0], 'Blue Bar');
});

test('a named bar request ranks around the named place, not the device', async () => {
  const namedPosition = { latitude: 40.75, longitude: -73.98 };
  let rankedAt: { latitude: number; longitude: number } | undefined;
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision must not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent must not run'); } },
    qloo: { ...qlooBase, recommendDining: async (position) => { rankedAt = position; return [place('Blue Bar')]; } },
    sceneReasoner: { plan: async () => ({ scope: 'general', next: 'clarify', answer: 'Wrong plan', evidenceIds: [] }),
      answer: async () => { throw Error('No answer model call'); } },
    places: { findExact: async () => { throw Error('Restaurant enrichment must not run'); },
      resolveAnchor: async (name) => { assert.equal(name, 'Union Square'); return { ...namedPosition,
        kind: 'named', name: 'Union Square', source: 'geoapify_geocode', timezone: 'America/New_York', confidence: 1 }; } } };
  const result = await explore(request('Find a bar near Union Square'), providers);
  assert.deepEqual(rankedAt, namedPosition);
  assert.equal(result.scene?.dining?.resolvedAnchor?.kind, 'named');
});

test('Qloo business ratings answer a restaurant follow-up without Geoapify', () => {
  const candidate: PlaceRecommendation = { ...place('Cafe Rated'), businessRating: 4.4 };
  assert.equal(qlooDetailAnswer(candidate, 'rating', anchor, 'en-US'),
    'Qloo lists a business rating of 4.4 out of 5 for Cafe Rated.');
});

test('Area uses one global Qloo ranking, one bounded category top-up, and cached what-else evidence', async () => {
  const calls: string[] = [];
  const qloo: QlooService = { ...qlooBase, discoverArea: async (_point, _interests, options) => {
    calls.push(options?.bucket ?? 'union');
    return options?.bucket === 'live_music' ? [place('Music Hall', 'live_music', 0.5)]
      : [place('Cafe One'), place('Cafe Two'), place('Bookstore One', 'bookstore', 0.6)];
  } };
  const result = await discoverArea(request('What around here is worth my attention?'), qloo, anchor);
  assert.deepEqual(calls, ['union', 'live_music']);
  assert.deepEqual(result.scene?.area?.presentedIds, ['Cafe One', 'Bookstore One', 'Music Hall']);
  assert.match(result.answer, /3 places stand out/);
  const next = await continueArea(request('What else?'), qloo, undefined, result.scene!);
  assert.match(next.answer, /Cafe Two/);
  assert.deepEqual(calls, ['union', 'live_music']);
});

test('Area what-else skips a contradictory identity rather than presenting it as a place', async () => {
  const qloo: QlooService = { ...qlooBase, discoverArea: async () => [place('One'), place('Wrong'),
    place('Two', 'bookstore'), place('Three', 'museum_gallery')] };
  const places: PlacesService = { findExact: async () => undefined, matchCandidate: async (candidate) =>
    candidate.name === 'Wrong' ? { status: 'ambiguous_or_contradictory' } : { status: 'unverified' } };
  const first = await discoverArea(request('What is nearby?'), qloo, anchor, places);
  const next = await continueArea(request('What else?'), qloo, places, first.scene!);
  assert.doesNotMatch(next.answer, /Wrong/);
  assert.equal(next.scene?.area?.matches.some((entry) => entry.qlooId === 'Wrong'
    && entry.status === 'ambiguous_or_contradictory'), true);
});

test('a broad nearby question during an Event asks for a category without a provider call', async () => {
  const event: Scene = { id: 'flyer', origin: 'image', createdAt: new Date().toISOString(),
    summary: 'Flyer', confidence: 'medium', culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
    event: { visual: { title: 'Jazz Night', venueName: 'Blue Note', locationText: 'New York', performers: [], schedule: [] },
      ranking: [], researchedFacts: [] } };
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision should not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent should not run'); } },
    qloo: { ...qlooBase, discoverArea: async () => { throw Error('Qloo Area must not run'); } },
    sceneReasoner: { plan: async () => { throw Error('Planner must not run'); },
      answer: async () => { throw Error('Second model call not needed'); } },
    research: { search: async () => { throw Error('Tavily must not run'); } },
    places: { findExact: async () => undefined, resolveAnchor: async () => { throw Error('Venue resolution must not run'); } } };
  const result = await explore({ ...request('What is worth checking out near the venue?'), scene: event,
    locationEnabled: true }, providers);
  assert.match(result.answer, /name a place category/);
  assert.equal(result.scene?.area, undefined);
});

test('with Location off, an event venue is not an implicit place-search anchor', async () => {
  const event: Scene = { id: 'flyer', origin: 'image', createdAt: new Date().toISOString(),
    summary: 'Flyer', confidence: 'medium', culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
    event: { visual: { title: 'Jazz Night', venueName: 'Blue Note', locationText: 'New York', performers: [], schedule: [] },
      ranking: [], researchedFacts: [] } };
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision should not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent should not run'); } }, qloo: qlooBase,
    sceneReasoner: { plan: async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'device',
      anchorName: 'Blue Note', evidenceIds: [] }), answer: async () => { throw Error('No synthesis expected'); } },
    places: { findExact: async () => { throw Error('Venue must not resolve'); },
      resolveAnchor: async () => { throw Error('Venue must not resolve'); } } };
  const result = await explore({ ...request('Find somewhere nearby I’d enjoy eating'), scene: event,
    locationEnabled: false, position: undefined }, providers);
  assert.match(result.answer, /Turn on Location in Personalization/);
  assert.equal(result.scene?.dining, undefined);
});

test('with Location off, a named place cannot start Home dining', async () => {
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision should not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent should not run'); } },
    qloo: { ...qlooBase, recommendDining: async () => { throw Error('Qloo must not run'); } },
    sceneReasoner: { plan: async () => { throw Error('Planner must not run'); },
      answer: async () => { throw Error('No synthesis expected'); } },
    places: { findExact: async () => { throw Error('Places must not run'); },
      resolveAnchor: async () => { throw Error('Places must not run'); } } };
  const result = await explore({ ...request('Find somewhere I’d enjoy eating near Union Square in New York'),
    locationEnabled: false, position: undefined }, providers);
  assert.match(result.answer, /Turn on Location in Personalization/);
  assert.equal(result.scene, undefined);
});

test('an explicitly named place is the discovery anchor even when the device is elsewhere', async () => {
  let rankedAt: { latitude: number; longitude: number } | undefined;
  const namedPosition = { latitude: 40.75, longitude: -73.98 };
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision should not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent should not run'); } },
    qloo: { ...qlooBase, recommendDining: async (position) => { rankedAt = position; return [place('Cafe One')]; } },
    sceneReasoner: { plan: async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'named',
      anchorName: 'Union Square', evidenceIds: [] }), answer: async () => { throw Error('No synthesis expected'); } },
    places: { findExact: async () => undefined, resolveAnchor: async () => ({ ...namedPosition,
      kind: 'named', name: 'Union Square', source: 'geoapify_geocode', timezone: 'America/New_York', confidence: 1 }) } };
  const result = await explore(request('Find somewhere I’d enjoy eating near Union Square'), providers);
  assert.deepEqual(rankedAt, namedPosition);
  assert.equal(result.scene?.dining?.resolvedAnchor?.kind, 'named');
});

test('a named practical category uses Geoapify at the phone position, not Qloo Area', async () => {
  let lookupAt: { latitude: number; longitude: number } | undefined;
  let lookedUpCategory: string | undefined;
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision must not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent must not run'); } },
    qloo: { ...qlooBase, discoverArea: async () => { throw Error('Qloo Area must not run'); } },
    sceneReasoner: { plan: async () => ({ scope: 'area', next: 'area_discovery', anchor: 'named',
      anchorName: 'somewhere else', evidenceIds: [] }), answer: async () => { throw Error('No answer model call'); } },
    places: { findExact: async () => undefined,
      resolveAnchor: async () => { throw Error('Near me must not be geocoded'); },
      practicalLookup: async (position, category) => { lookupAt = position; lookedUpCategory = category;
        return [{ name: 'Book One', placeId: 'book-one', checkedAt: new Date().toISOString(),
          address: '1 Main St', latitude: 40.701, longitude: -73.9 }]; },
      details: async () => ({ name: 'Book One', placeId: 'book-one', checkedAt: new Date().toISOString(),
        openingHours: '24/7', timezone: 'America/New_York' }) } };
  const result = await explore(request('Find a bookstore near me'), providers);
  assert.equal(lookupAt?.latitude, point.latitude);
  assert.equal(lookupAt?.longitude, point.longitude);
  assert.equal(lookedUpCategory, 'commercial.books');
  assert.match(result.answer, /Book One.*straight line from you.*1 Main St/);
  assert.match(result.answer, /listed as open right now/);
  assert.equal(result.scene?.area, undefined);
});

test('practical lookup honors a named anchor and leaves unavailable opening status unknown', async () => {
  const namedPosition = { latitude: 40.75, longitude: -73.98 };
  let lookupAt: { latitude: number; longitude: number } | undefined;
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision must not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent must not run'); } }, qloo: qlooBase,
    sceneReasoner: { plan: async () => ({ scope: 'general', next: 'clarify', answer: 'Wrong plan', evidenceIds: [] }),
      answer: async () => { throw Error('No answer model call'); } },
    places: { findExact: async () => undefined,
      resolveAnchor: async (name) => { assert.equal(name, 'Union Square'); return { ...namedPosition,
        kind: 'named', name: 'Union Square', source: 'geoapify_geocode', timezone: 'America/New_York', confidence: 1 }; },
      practicalLookup: async (position, category) => { lookupAt = position; assert.equal(category, 'healthcare.pharmacy');
        return [{ name: 'Pharmacy One', placeId: 'pharmacy-one', checkedAt: new Date().toISOString(),
          latitude: 40.751, longitude: -73.98 }]; } } };
  const result = await explore(request('Find a pharmacy near Union Square'), providers);
  assert.equal(lookupAt?.latitude, namedPosition.latitude);
  assert.equal(lookupAt?.longitude, namedPosition.longitude);
  assert.match(result.answer, /from Union Square/);
  assert.match(result.answer, /could not verify whether it is open now/);
});

test('a named place uses its geocoded position for Dining discovery', async () => {
  const namedPosition = { latitude: 40.75, longitude: -73.98 };
  let rankedAt: { latitude: number; longitude: number } | undefined;
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision must not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent must not run'); } },
    qloo: { ...qlooBase, recommendDining: async (position) => { rankedAt = position; return [place('Nearby Cafe')]; } },
    sceneReasoner: { plan: async () => ({ scope: 'dining', next: 'dining_discovery', anchor: 'device',
      anchorName: 'Union Square', evidenceIds: [] }), answer: async () => { throw Error('No answer model call'); } },
    places: { findExact: async () => undefined, resolveAnchor: async () => ({ ...namedPosition,
      kind: 'named', name: 'Union Square', source: 'geoapify_geocode', timezone: 'America/New_York', confidence: 1 }) } };
  const result = await explore(request('Find somewhere I’d enjoy eating near Union Square?'), providers);
  assert.deepEqual(rankedAt, namedPosition);
  assert.equal(result.scene?.dining?.resolvedAnchor?.kind, 'named');
});

test('Dining place-detail follow-ups use cached Geoapify facts without reranking', async () => {
  const named = { ...anchor, kind: 'named' as const, name: 'Union Square', source: 'geoapify_geocode' as const };
  const details = { name: 'Cafe One', placeId: 'cafe-one', checkedAt: new Date().toISOString(),
    address: '1 Main St', openingHours: 'Mo-Su 00:00-24:00', timezone: 'America/New_York',
    cuisine: 'Italian', categories: ['catering.restaurant'], latitude: 40.751, longitude: -73.98 };
  const scene: Scene = { id: 'dining', origin: 'conversation', createdAt: new Date().toISOString(),
    summary: 'Cafe One nearby.', confidence: 'medium',
    culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
    dining: { profileSignature: profile.signature, resolvedAnchor: named, position: named,
      discoveredAt: new Date().toISOString(), candidates: [place('Cafe One')],
      selectedIds: ['Cafe One'], places: [{ qlooId: 'Cafe One', details }] } };
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision must not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent must not run'); } },
    qloo: { ...qlooBase, recommendDining: async () => { throw Error('Qloo must not rerun'); } },
    sceneReasoner: { plan: async (input) => ({ scope: 'dining', next: 'dining_details',
      targetId: 'Cafe One', detail: input.question.includes('hours') ? 'opening'
        : input.question.includes('cuisine') ? 'cuisine' : 'distance', evidenceIds: [] }),
      answer: async () => { throw Error('Second Qwen call not needed'); } },
    places: { findExact: async () => { throw Error('Cached details should suffice'); } } };
  const hours = await explore({ ...request('What are Cafe One’s hours?'), scene }, providers);
  assert.match(hours.answer, /Mo-Su 00:00-24:00/);
  const distance = await explore({ ...request('How far is Cafe One?'), scene }, providers);
  assert.match(distance.answer, /from Union Square/);
  assert.doesNotMatch(distance.answer, /from you/);
  const cuisine = await explore({ ...request('What cuisine does Cafe One serve?'), scene }, providers);
  assert.match(cuisine.answer, /Italian restaurant/);
});
