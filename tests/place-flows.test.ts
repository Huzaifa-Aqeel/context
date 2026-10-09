import assert from 'node:assert/strict';
import test from 'node:test';
import { GeoapifyClient, type PlaceAnchor, type PlacesService } from '../lib/places/geoapify';
import { instantForWallTime, openingStatusAt } from '../lib/places/opening-hours';
import { discoverDining } from '../lib/orchestration/dining';
import { continueArea, discoverArea, discoverMall } from '../lib/orchestration/area';
import { explore, type Providers } from '../lib/orchestration/context';
import { needsDevicePosition } from '../lib/orchestration/intent';
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
      name: 'Cafe One', formatted: '1 Main St', categories: ['catering.cafe'], lat: 40.701, lon: -73.9 } }] });
  });
  const candidate = { name: 'Cafe One', position: { latitude: 40.701, longitude: -73.9 } };
  const first = await client.matchCandidate(candidate, ['catering']);
  assert.equal(first.status, 'confirmed');
  if (first.status === 'confirmed') assert.equal(first.details.address, '1 Main St');
  assert.equal((await client.matchCandidate(candidate, ['catering'])).status, 'confirmed');
  assert.equal(calls, 4);
});

test('simple venue-local weekly hours can be checked; complex or missing hours stay unknown', () => {
  const atTen = instantForWallTime({ year: 2026, month: 10, day: 9 }, 10, 0, 'America/New_York');
  assert.equal(atTen?.toISOString(), '2026-10-09T14:00:00.000Z');
  assert.equal(openingStatusAt('Mo-Fr 09:00-17:00; Sa 10:00-14:00', atTen!, 'America/New_York'), true);
  assert.equal(openingStatusAt('Mo-Fr 09:00-17:00', new Date('2026-10-09T23:00:00Z'), 'America/New_York'), false);
  assert.equal(openingStatusAt('24/7', atTen!, 'America/New_York'), true);
  assert.equal(openingStatusAt('Mo-Fr 09:00-17:00; PH off', atTen!, 'America/New_York'), undefined);
});

test('an active place conversation does not reread device location for a scene-relative request', () => {
  assert.equal(needsDevicePosition('What is worth checking out around here?', true), false);
  assert.equal(needsDevicePosition('Where is a restroom nearby?', true), false);
  assert.equal(needsDevicePosition('What is worth checking out near me?', true), true);
  assert.equal(needsDevicePosition('What is worth checking out around here?', false), true);
});

test('Dining skips contradictory Qloo places, keeps unverified matches, and never uses Geoapify as a taste feed', async () => {
  const ranked = [place('Wrong Identity'), place('Qloo Only'), place('Verified Place'), place('Never Checked')];
  let qlooCalls = 0; const checked: string[] = [];
  const qloo: QlooService = { ...qlooBase, recommendDining: async (_point, _interests, options) => {
    qlooCalls++; assert.equal(options?.device, true); return ranked;
  } };
  const places: PlacesService = { findExact: async () => undefined, matchCandidate: async (candidate) => {
    checked.push(candidate.name);
    return candidate.name === 'Wrong Identity' ? { status: 'ambiguous_or_contradictory' }
      : candidate.name === 'Qloo Only' ? { status: 'unverified' }
        : { status: 'confirmed', details: { name: candidate.name, placeId: 'verified',
          address: '3 Main St', checkedAt: new Date().toISOString(), latitude: 40.701, longitude: -73.9 } };
  } };
  const result = await discoverDining(request('Find dinner near me'), qloo,
    { position: point, source: { kind: 'device' }, resolved: anchor }, undefined, places);
  assert.equal(qlooCalls, 1);
  assert.deepEqual(checked, ['Wrong Identity', 'Qloo Only', 'Verified Place']);
  assert.deepEqual(result.scene?.dining?.selectedIds, ['Qloo Only', 'Verified Place']);
  assert.equal(result.scene?.dining?.candidates.length, 4);
  assert.doesNotMatch(result.answer, /Wrong Identity|Never Checked/);
  assert.match(result.answer, /Qloo Only is a Qloo match/);
  assert.match(result.answer, /could not confirm its address or hours/);
});

test('an explicit meal time uses confirmed weekly hours in the venue timezone', async () => {
  const qloo: QlooService = { ...qlooBase, recommendDining: async () => [place('Evening Cafe')] };
  const places: PlacesService = { findExact: async () => undefined, matchCandidate: async () => ({
    status: 'confirmed', details: { name: 'Evening Cafe', placeId: 'evening',
      checkedAt: new Date().toISOString(), openingHours: 'Mo-Su 17:00-22:00',
      latitude: 40.701, longitude: -73.9 } }) };
  const found = await discoverDining(request('Find dinner near me at 6:30 PM'), qloo,
    { position: point, source: { kind: 'device' }, resolved: anchor }, undefined, places);
  assert.equal(found.scene?.dining?.timeContext?.kind, 'requested');
  assert.match(found.answer, /listed as open at 6:30 PM/);
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

test('an Event-area request resolves the printed venue and does not substitute device coordinates or Tavily', async () => {
  const event: Scene = { id: 'flyer', origin: 'image', createdAt: new Date().toISOString(),
    summary: 'Flyer', confidence: 'medium', culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
    event: { visual: { title: 'Jazz Night', venueName: 'Blue Note', locationText: 'New York', performers: [], schedule: [] },
      ranking: [], researchedFacts: [] } };
  let qlooPoint: { latitude: number; longitude: number } | undefined;
  const venue = { latitude: 40.729, longitude: -74, kind: 'venue' as const, name: 'Blue Note',
    source: 'geoapify_geocode' as const, confidence: 1, timezone: 'America/New_York', placeId: 'venue' };
  const providers: Providers = { vision: { inspectScene: async () => { throw Error('Vision should not run'); } },
    llm: { nextTurn: async () => { throw Error('Generic agent should not run'); } },
    qloo: { ...qlooBase, discoverArea: async (position) => { qlooPoint = position; return [place('Cafe One')]; } },
    sceneReasoner: { plan: async () => ({ scope: 'area', next: 'area_discovery', anchor: 'device', evidenceIds: [] }),
      answer: async () => { throw Error('Second model call not needed'); } },
    research: { search: async () => { throw Error('Tavily must not run for Area'); } },
    places: { findExact: async () => undefined, resolveAnchor: async (name, locality) => {
      assert.equal(name, 'Blue Note'); assert.equal(locality, 'New York'); return venue;
    } } };
  const result = await explore({ ...request('What is worth checking out near the venue?'), scene: event,
    locationEnabled: false, position: undefined }, providers);
  assert.equal(qlooPoint?.latitude, venue.latitude);
  assert.equal(qlooPoint?.longitude, venue.longitude);
  assert.equal(result.scene?.area?.anchor.kind, 'venue');
});

test('mall ranking is restricted to mapped cultural businesses and makes one Qloo ranking request', async () => {
  let rankedIds: string[] = [];
  const qloo: QlooService = { ...qlooBase,
    resolvePlaceCandidates: async (items) => items.map((item, index) => ({ name: item.name,
      qlooId: `q${index}`, latitude: item.latitude, longitude: item.longitude })),
    rankBoundedPlaces: async (ids) => { rankedIds = ids; return ids.map((id) => place(id, 'bookstore')); } };
  const places: PlacesService = { findExact: async () => undefined,
    resolveAnchor: async () => ({ ...anchor, kind: 'named', name: 'City Mall', placeId: 'mall' }),
    buildingPlaces: async () => [{ name: 'Book One', placeId: 'one', position: point, categories: ['commercial.books'] },
      { name: 'Book Two', placeId: 'two', position: point, categories: ['commercial.books'] },
      { name: 'ATM', placeId: 'atm', position: point, categories: ['service.financial.atm'] }] };
  const result = await discoverMall(request('What is worth checking out inside City Mall?'), qloo, places, 'City Mall');
  assert.deepEqual(rankedIds, ['q0', 'q1']);
  assert.match(result.answer, /mapped inside City Mall/);
  assert.doesNotMatch(result.answer, /ATM/);
});
