import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeScene, type Providers } from '../lib/orchestration/context';
import { QlooClient, selectQlooMatch } from '../lib/qloo/client';
import { sceneSchema } from '../schemas/context';
import type { VisionEntity } from '../types/context';
import type { TasteProfile } from '../types/taste';
import { resolveTasteInterests } from '../lib/taste/profile';
import { bookClarification, bookClarificationPrompt, selectBookClarification } from '../lib/taste/clarification';
import { ChatVision } from '../lib/ai/vision';
import { ChatReasoning } from '../lib/ai/reasoning';
import { analyzeShelf, shelfSummary } from '../lib/orchestration/display';
import { displayCategories, displayKindForScene } from '../lib/display/categories';

const noCall = async (): Promise<never> => { throw Error('Unexpected provider call'); };
const profile: TasteProfile = { entities: [{ id: 'dune', name: 'Dune', type: 'urn:entity:book' }], signature: 'a'.repeat(64) };
const visible = (label: string, author?: string): VisionEntity => ({ label, category: 'book', confidence: 0.9,
  culturallyRelevant: true, ...(author ? { relatedName: author } : {}) });
const book = (id: string, name: string, author?: string) => ({ entity_id: id, name, types: ['urn:entity:book'],
  ...(author ? { disambiguation: `1937, ${author}` } : {}) });

test('display categories route Vision, Qloo, and brief fields through one registry', () => {
  assert.equal(displayKindForScene('book_shelf'), 'book');
  assert.equal(displayKindForScene('game_shelf'), 'game');
  assert.equal(displayKindForScene('general'), undefined);
  assert.equal(displayCategories.book.qlooType, 'urn:entity:book');
  assert.equal(displayCategories.game.qlooType, 'urn:entity:videogame');
  assert.ok(displayCategories.game.briefFields.includes('local_coop'));
});

test('initial display answer names every visible title with known category and genre, beyond the Qloo shortlist', () => {
  const summary = shelfSummary({ kind: 'book', rankingComplete: true, shortlistIds: ['a', 'b', 'c', 'd'], inventory: [
    { title: 'Dune', category: 'fiction', genre: 'science fiction', qlooId: 'a', resolution: 'matched', visualProvenance: 'VISIBLE' },
    { title: 'Foundation', category: 'fiction', genre: 'science fiction', qlooId: 'b', resolution: 'matched', visualProvenance: 'VISIBLE' },
    { title: 'Hyperion', qlooId: 'c', resolution: 'matched', visualProvenance: 'VISIBLE' },
    { title: 'Neuromancer', qlooId: 'd', resolution: 'matched', visualProvenance: 'VISIBLE' },
    { title: 'The Left Hand of Darkness', category: 'fiction', genre: 'science fiction', resolution: 'unmatched', visualProvenance: 'VISIBLE' },
  ] });
  assert.match(summary, /Dune, fiction, science fiction/);
  assert.match(summary, /Foundation, fiction, science fiction/);
  assert.match(summary, /Hyperion; Neuromancer; The Left Hand of Darkness, fiction, science fiction/);
});

test('game display names each recognized game and genre without a Qloo ranking', async () => {
  let briefs = 0;
  const scene = await analyzeShelf('game', [
    { label: 'Forza Horizon 5', category: 'videogame', confidence: 0.9, culturallyRelevant: true },
    { label: 'Minecraft', category: 'videogame', confidence: 0.9, culturallyRelevant: true },
    { label: 'Unknown Title', category: 'videogame', confidence: 0.9, culturallyRelevant: true },
  ], profile, { rankShelf: async () => { throw Error('Qloo unavailable'); },
    resolveEntities: noCall, analyzeConnections: noCall, exploreReference: noCall,
    getLocationContext: noCall, analyzeTaste: noCall, getEntityFact: noCall,
  }, { nextTurn: noCall, createShelfBrief: async ({ items, inventory }) => {
    briefs++;
    assert.deepEqual(items, []);
    assert.equal(inventory.length, 3);
    return { labels: [{ index: 0, genre: 'racing' }, { index: 1, genre: 'sandbox' }], items: [] };
  } });
  assert.equal(briefs, 1);
  assert.match(scene.summary, /Forza Horizon 5, racing; Minecraft, sandbox; Unknown Title/);
  assert.match(scene.summary, /genre of 1 title/);
  assert.equal(scene.shelf?.inventory[0].genreProvenance, 'MODEL');
  assert.equal(scene.shelf?.inventory[2].genre, undefined);
});

test('recognized shelf titles beyond the former inventory limit remain in the first answer', async () => {
  const titles = Array.from({ length: 121 }, (_, index) => visible(`Book ${index + 1}`));
  const scene = await analyzeShelf('book', titles, undefined, {
    resolveEntities: noCall, analyzeConnections: noCall, exploreReference: noCall,
    getLocationContext: noCall, analyzeTaste: noCall, getEntityFact: noCall,
  });
  assert.equal(scene.shelf?.inventory.length, 121);
  assert.match(scene.summary, /Book 121/);
  assert.equal(sceneSchema.parse(scene).shelf?.inventory.length, 121);
});

test('compact shelf Vision output is converted to visible titles without model confidence fields', async () => {
  const vision = new ChatVision({ model: 'fixture-vision', completion: async (body) => {
    assert.equal(body.max_completion_tokens, 7000);
    return { message: { content: JSON.stringify({ sceneType: 'book_shelf', items: [
      { title: 'The Hobbit', author: 'J.R.R. Tolkien' }, { title: 'Dune', author: 'Frank Herbert' },
    ] }) }, finish_reason: 'stop' };
  } });
  const result = await vision.inspectScene('data:image/jpeg;base64,YQ==');
  assert.equal(result.entities.length, 2);
  assert.equal(result.entities[0].relatedName, 'J.R.R. Tolkien');
  assert.equal(result.entities[0].category, 'book');
});

test('Qwen shelf brief is one structured model call and omits fields it does not know', async () => {
  let calls = 0;
  const llm = new ChatReasoning({ model: 'qwen3.8-max', completion: async (body) => {
    calls++;
    assert.equal(body.model, 'qwen3.8-max');
    assert.equal(body.response_format && typeof body.response_format, 'object');
    assert.match(JSON.stringify(body.messages), /\\"inventory\\"/);
    return { message: { content: JSON.stringify({ labels: [{ index: 0, category: 'fiction', genre: 'science fiction' }], items: [{ qlooId: 'dune', facts: [
      { field: 'genre', value: 'science fiction' }, { field: 'premise', value: 'a struggle over Arrakis' },
    ] }] }) }, finish_reason: 'stop' };
  } });
  const result = await llm.createShelfBrief({ kind: 'book', interests: profile.entities,
    inventory: [{ title: 'Dune', visibleAuthor: 'Frank Herbert', resolved: true }],
    items: [{ qlooId: 'dune', title: 'Dune', visibleAuthor: 'Frank Herbert', rank: 1, exactInterest: true, contributors: ['Dune'] }] });
  assert.equal(calls, 1);
  assert.deepEqual(result.labels, [{ index: 0, category: 'fiction', genre: 'science fiction' }]);
  assert.deepEqual(result.items[0].facts.map((fact) => fact.field), ['genre', 'premise']);
});

test('Qwen follow-up explicitly marks missing brief evidence for on-demand research', async () => {
  const llm = new ChatReasoning({ model: 'qwen3.8-max', completion: async () => ({
    message: { content: JSON.stringify({ answer: 'I need to check that.', confidence: 'low', needsResearch: true }) }, finish_reason: 'stop',
  }) });
  const result = await llm.answerShelfQuestion({ question: 'What inspired Dune?', messages: [],
    shelf: { kind: 'book', inventory: [{ title: 'Dune', resolution: 'matched', visualProvenance: 'VISIBLE' }],
      shortlistIds: [], rankingComplete: false }, interests: [] });
  assert.equal(result.needsResearch, true);
});

test('book title and visible author select Tolkien, while a title alone stays ambiguous', () => {
  const candidates = [book('dixon', 'The Hobbit', 'Chuck Dixon'), book('tolkien', 'The Hobbit, or There and Back Again', 'J.R.R. Tolkien')];
  assert.equal(selectQlooMatch(visible('The Hobbit', 'J.R.R. Tolkien'), candidates).qlooId, 'tolkien');
  const titleOnly = selectQlooMatch(visible('The Hobbit'), candidates);
  assert.equal(titleOnly.qlooId, undefined);
  assert.equal(titleOnly.candidates?.length, 2);
  assert.match(titleOnly.candidates?.[1].name ?? '', /Tolkien/);
});

test('same-title books by different visible authors remain separate shelf items', async () => {
  const scene = await analyzeShelf('book', [visible('The Hobbit', 'J.R.R. Tolkien'), visible('The Hobbit', 'Chuck Dixon')], profile, {
    rankShelf: async (_kind, candidates) => ({ resolved: candidates.map((candidate) => ({
      detectedName: candidate.label, detectedCategory: 'book', relatedName: candidate.relatedName,
      visionConfidence: 0.9, source: 'vision', resolutionPending: true,
    })), ranked: [], complete: false }),
    resolveEntities: noCall, analyzeConnections: noCall, exploreReference: noCall,
    getLocationContext: noCall, analyzeTaste: noCall, getEntityFact: noCall,
  });
  assert.deepEqual(scene.shelf?.inventory.map((item) => item.visibleAuthor), ['J.R.R. Tolkien', 'Chuck Dixon']);
  assert.match(scene.summary, /2 books/);
});

test('Personalization uses the same author-aware book matcher and never silently saves the wrong Hobbit', async () => {
  const qloo = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://taste-books.test' }, async (input) => {
    const url = new URL(String(input));
    return Response.json({ results: url.searchParams.get('types') === 'urn:entity:book'
      ? [book('dixon', 'The Hobbit', 'Chuck Dixon'), book('tolkien', 'The Hobbit, or There and Back Again', 'J.R.R. Tolkien')] : [] });
  });
  const ambiguous = await resolveTasteInterests([{ label: 'The Hobbit', category: 'book_or_podcast' }], qloo);
  assert.equal(ambiguous.candidates[0].status, 'clarify');
  const item = bookClarification(ambiguous)!;
  assert.match(bookClarificationPrompt(item), /Tolkien.*Chuck Dixon|Chuck Dixon.*Tolkien/);
  assert.deepEqual(selectBookClarification(item, 'J.R.R. Tolkien'), { skip: false, entityId: 'tolkien' });
  assert.deepEqual(selectBookClarification(item, 'skip'), { skip: true });
  const specified = await resolveTasteInterests([{ label: 'The Hobbit by J.R.R. Tolkien', category: 'book_or_podcast' }], qloo);
  assert.equal(specified.candidates[0].status, 'matched');
  if (specified.candidates[0].status === 'matched') assert.equal(specified.candidates[0].entity.id, 'tolkien');
});

test('serial Qloo Search retries a 429, uses one Insights call, and preserves omitted candidates', async () => {
  let active = 0, peak = 0, searches = 0, insights = 0;
  const qloo = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://shelf-rate-limit.test' }, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/search') {
      active++; peak = Math.max(peak, active); searches++;
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      if (searches === 1) return new Response('', { status: 429, headers: { 'Retry-After': '0' } });
      const name = url.searchParams.get('query')!;
      return Response.json({ results: [book(name.toLowerCase(), name)] });
    }
    assert.equal(url.pathname, '/v2/insights'); insights++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body['feature.explainability'], true);
    assert.equal(body['filter.type'], 'urn:entity:book');
    return Response.json({ success: true, results: { entities: [
      { ...book('foundation', 'Foundation'), query: { affinity: 0.8 } },
    ] } });
  });
  const ranking = await qloo.rankShelf!('book', [visible('Dune'), visible('Foundation'), visible('Hyperion')], profile.entities);
  assert.equal(peak, 1);
  assert.equal(searches, 4);
  assert.equal(insights, 1);
  assert.deepEqual(ranking.ranked.map((item) => item.entityId), ['dune', 'foundation']);
  assert.equal(ranking.complete, false);
  assert.equal(ranking.resolved.length, 3);
});

test('signed-device cache entries skip repeated Qloo Search for the same book identity', async () => {
  let searches = 0;
  const qloo = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://shelf-cache.test' }, async (input) => {
    if (new URL(String(input)).pathname === '/search') { searches++; return Response.json({ results: [book('dune', 'Dune', 'Frank Herbert')] }); }
    throw Error('Exact profile match needs no Insights request');
  });
  const entry = { kind: 'book' as const, title: 'Dune', author: 'Frank Herbert', qlooId: 'dune', qlooName: 'Dune', qlooType: 'urn:entity:book' };
  const result = await qloo.rankShelf!('book', [visible('Dune', 'Frank Herbert')], profile.entities, [entry]);
  assert.equal(searches, 0);
  assert.equal(result.resolved[0].qlooId, 'dune');
});

test('partial Qloo ranking still builds one model brief for returned visible shortlist, with no Tavily call', async () => {
  let briefs = 0;
  const providers: Providers = {
    vision: { inspectScene: async () => ({ sceneType: 'book_shelf', entities: [visible('Dune'), visible('Foundation'), visible('Unresolved')] }) },
    qloo: {
      rankShelf: async (_kind, items) => ({ resolved: items.map((item) => item.label === 'Unresolved'
        ? { detectedName: item.label, detectedCategory: 'book', visionConfidence: 0.9, source: 'vision', candidates: [{ id: 'maybe', name: 'Maybe', type: 'urn:entity:book' }] }
        : { detectedName: item.label, detectedCategory: 'book', visionConfidence: 0.9, qlooId: item.label.toLowerCase(), qlooName: item.label, qlooType: 'urn:entity:book', matchConfidence: 0.95, source: 'vision' }),
        ranked: [{ entityId: 'dune', contributingInterestIds: ['dune'] }, { entityId: 'foundation', affinity: 0.7, contributingInterestIds: ['dune'] }], complete: false }),
      resolveEntities: noCall, analyzeConnections: noCall, exploreReference: noCall, getLocationContext: noCall,
      analyzeTaste: noCall, getEntityFact: noCall,
    },
    research: { search: noCall },
    llm: { nextTurn: noCall, createShelfBrief: async ({ items, inventory }) => {
      briefs++;
      assert.deepEqual(items.map((item) => item.title), ['Dune', 'Foundation']);
      assert.deepEqual(inventory.map((item) => item.title), ['Dune', 'Foundation', 'Unresolved']);
      return { labels: [{ index: 0, category: 'fiction', genre: 'science fiction' },
        { index: 1, category: 'fiction', genre: 'science fiction' }],
      items: [{ qlooId: 'foundation', facts: [{ field: 'genre', value: 'science fiction' }] }] };
    } },
  };
  const scene = await analyzeScene({ image: 'fixture', mode: 'scene', profile }, providers);
  assert.equal(briefs, 1);
  assert.equal(scene.shelf?.inventory.length, 3);
  assert.deepEqual(scene.shelf?.shortlistIds, ['dune', 'foundation']);
  assert.equal(scene.shelf?.rankingComplete, false);
  assert.match(scene.summary, /Dune, fiction, science fiction; Foundation, fiction, science fiction; Unresolved/);
  assert.match(scene.summary, /Among the titles I could match, Foundation stands out/);
  assert.equal(scene.shelf?.briefItems?.[1].facts[0].provenance, 'MODEL');
  assert.equal(scene.shelf?.inventory[2].resolution, 'ambiguous');
  assert.equal(sceneSchema.parse(JSON.parse(JSON.stringify(scene))).shelf?.briefItems?.length, 2);
});
