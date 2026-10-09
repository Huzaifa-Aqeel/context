import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { writeFileSync } from 'node:fs';
import { analyzeScene } from '../lib/orchestration/context';
import { QlooClient } from '../lib/qloo/client';
import { scenePresentation } from '../lib/taste/presentation';
import type { VisionEntity } from '../types/context';
import type { TasteContext, TasteProfile } from '../types/taste';

// Vision, speech, and live Qloo are deliberately absent. Each fixture is a detected visual reference.
const cases: { label: string; vision: VisionEntity; qloo?: { id: string; name: string; type: string; description: string }; place?: boolean }[] = [
  { label: 'poster', vision: { label: 'Interstellar', category: 'movie', carrier: 'poster', visualDescription: 'an Interstellar poster', confidence: .97, culturallyRelevant: true }, qloo: { id: 'film', name: 'Interstellar', type: 'movie', description: 'A science-fiction film.' } },
  { label: 'clothing', vision: { label: 'Nike', category: 'brand', carrier: 'clothing', visualDescription: 'a black Nike jacket', confidence: .95, culturallyRelevant: true }, qloo: { id: 'nike', name: 'Nike', type: 'brand', description: 'A sportswear brand.' } },
  { label: 'brand', vision: { label: 'A24', category: 'brand', carrier: 'brand_mark', visualDescription: 'an A24 sticker', confidence: .95, culturallyRelevant: true }, qloo: { id: 'a24', name: 'A24', type: 'brand', description: 'An independent film company.' } },
  { label: 'book', vision: { label: 'Dune', category: 'book', carrier: 'book_cover', relatedName: 'Frank Herbert', relatedCategory: 'author', visualDescription: 'a Dune book', confidence: .95, culturallyRelevant: true }, qloo: { id: 'dune', name: 'Dune', type: 'book', description: 'A science-fiction novel.' } },
  { label: 'artwork', vision: { label: 'The Starry Night', category: 'artwork', carrier: 'artwork', relatedName: 'Vincent van Gogh', relatedCategory: 'artist', visualDescription: 'The Starry Night painting', confidence: .95, culturallyRelevant: true }, qloo: { id: 'vangogh', name: 'Vincent van Gogh', type: 'artist', description: 'A Dutch painter.' } },
  { label: 'product', vision: { label: 'iPhone', category: 'product', carrier: 'product', relatedName: 'Apple', relatedCategory: 'brand', visualDescription: 'an iPhone', confidence: .95, culturallyRelevant: true }, qloo: { id: 'apple', name: 'Apple', type: 'brand', description: 'A technology brand.' } },
  { label: 'logo', vision: { label: 'A24', category: 'brand', carrier: 'logo', visualDescription: 'an A24 logo', confidence: .95, culturallyRelevant: true }, qloo: { id: 'a24', name: 'A24', type: 'brand', description: 'An independent film company.' } },
  { label: 'venue', vision: { label: 'Blue Note Jazz Club', category: 'place', carrier: 'venue_sign', visualDescription: 'a Blue Note Jazz Club sign', confidence: .95, culturallyRelevant: true }, qloo: { id: 'blue-ny', name: 'Blue Note Jazz Club', type: 'place', description: 'A jazz venue.' }, place: true },
  { label: 'album', vision: { label: 'OK Computer', category: 'album', carrier: 'album_cover', relatedName: 'Radiohead', relatedCategory: 'artist', visualDescription: 'an OK Computer album cover', confidence: .95, culturallyRelevant: true }, qloo: { id: 'radiohead', name: 'Radiohead', type: 'artist', description: 'An English rock band.' } },
  { label: 'film reference', vision: { label: 'Interstellar', category: 'movie', carrier: 'film_reference', visualDescription: 'an Interstellar reference', confidence: .95, culturallyRelevant: true }, qloo: { id: 'film', name: 'Interstellar', type: 'movie', description: 'A science-fiction film.' } },
];
const results: { case: string; taste: boolean; location: boolean; answer: string; calls: string[]; grounded: boolean }[] = [];
after(() => writeFileSync('/tmp/context-semantic-results.json', JSON.stringify(results, null, 2)));

for (const fixture of cases) for (const taste of [false, true]) for (const location of [false, true]) {
  test(`${fixture.label}: taste ${taste ? 'on' : 'off'}, location ${location ? 'on' : 'off'}`, async () => {
    const calls: string[] = [];
    const qloo = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (input) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (url.pathname === '/search') {
        const current = fixture.qloo;
        if (!current) return Response.json({ results: [] });
        const query = url.searchParams.get('query');
        const records = fixture.place ? [
          { entity_id: 'blue-other', name: current.name, types: ['urn:entity:place'], properties: { geocode: { city: 'Poznan' } } },
          { entity_id: current.id, name: current.name, types: ['urn:entity:place'], properties: { geocode: { city: 'New York' }, short_description: current.description } },
        ] : [{ entity_id: current.id, name: current.name, types: [`urn:entity:${current.type}`], properties: { short_description: current.description } }];
        return Response.json({ results: query === current.name ? records : [] });
      }
      if (url.pathname === '/entities') return Response.json({ results: [{ entity_id: fixture.qloo!.id, name: fixture.qloo!.name, types: [`urn:entity:${fixture.qloo!.type}`], properties: { short_description: fixture.qloo!.description } }] });
      throw new Error(`Unexpected Qloo endpoint: ${url.pathname}`);
    });
    const providers = { vision: { inspectScene: async () => [fixture.vision] }, qloo, llm: { nextTurn: async (): Promise<never> => { throw new Error('The first answer should use retained evidence'); } } };
    const scene = await analyzeScene({ image: 'fixture', mode: 'scene', locality: location ? { city: 'New York' } : undefined }, providers);
    assert.ok(scene.summary.toLowerCase().includes(fixture.vision.label.toLowerCase()));
    assert.doesNotMatch(scene.summary, /Poznan|nearby|recommend/i);
    assert.equal(calls.filter((path) => path === '/v2/insights').length, 0);
    assert.equal(calls.filter((path) => path === '/search').length, 1);
    assert.equal(scene.culturalEvidence.entities[0].detectedName, fixture.vision.label);
    assert.equal(scene.culturalEvidence.entities[0].groundingBasis, ['artwork', 'product', 'album'].includes(fixture.label) ? 'related' : 'direct');
    if (fixture.place && !location) assert.match(scene.summary, /could not match/i);
    if (fixture.place && location) assert.equal(scene.culturalEvidence.entities[0].qlooId, 'blue-ny');
    const profile: TasteProfile = { entities: [{ id: 'radiohead', name: 'Radiohead', type: 'urn:entity:artist' }], signature: 'a'.repeat(64) };
    const tasteContext: TasteContext = { profileSignature: profile.signature!, referenceIds: [fixture.qloo!.id], connections: fixture.qloo!.id === 'radiohead' ? [{ referenceId: 'radiohead', interestId: 'radiohead', kind: 'exact', evidenceSource: 'qloo', description: 'Exact.' }] : [], warnings: [] };
    const spoken = scenePresentation(scene, taste ? profile : null, taste ? tasteContext : null, taste, 'balanced', '');
    results.push({ case: fixture.label, taste, location, answer: spoken, calls, grounded: Boolean(scene.culturalEvidence.entities[0].qlooId) });
    assert.ok(spoken.toLowerCase().includes(fixture.vision.label.toLowerCase()));
    assert.equal(spoken.includes('one of your interests'), taste && fixture.label === 'album');
  });
}
