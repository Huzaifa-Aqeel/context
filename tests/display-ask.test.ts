import assert from 'node:assert/strict';
import test from 'node:test';
import { explore, type Providers } from '../lib/orchestration/context';
import { sceneSchema } from '../schemas/context';
import type { Scene } from '../types/context';

const noCall = async (): Promise<never> => { throw Error('Unexpected provider call'); };
const signed = 'a'.repeat(64);
const profile = { signature: signed, entities: [{ id: 'dune', name: 'Dune', type: 'urn:entity:book' }] };
const bookScene: Scene = sceneSchema.parse({ id: 'shelf-book', createdAt: '2026-10-09T00:00:00.000Z', origin: 'image',
  summary: 'I can identify two books.', confidence: 'medium', culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 },
  shelf: { kind: 'book', profileSignature: signed, rankingComplete: false, shortlistIds: ['dune', 'foundation'], inventory: [
    { title: 'Dune', qlooId: 'dune', qlooName: 'Dune', resolution: 'matched', exactInterest: true, visualProvenance: 'VISIBLE' },
    { title: 'Foundation', qlooId: 'foundation', qlooName: 'Foundation', resolution: 'matched', visualProvenance: 'VISIBLE' },
  ], briefItems: [
    { qlooId: 'dune', facts: [{ field: 'premise', value: 'a struggle over Arrakis', provenance: 'MODEL' }], unknownFields: [] },
    { qlooId: 'foundation', facts: [{ field: 'genre', value: 'science fiction', provenance: 'MODEL' }], unknownFields: [] },
  ] },
});
const gameScene: Scene = sceneSchema.parse({ ...bookScene, id: 'shelf-game', shelf: {
  kind: 'game', profileSignature: signed, rankingComplete: false, shortlistIds: ['minecraft', 'overcooked'], inventory: [
    { title: 'Minecraft', qlooId: 'minecraft', resolution: 'matched', visiblePlatform: 'Nintendo Switch', visualProvenance: 'VISIBLE' },
    { title: 'Overcooked', qlooId: 'overcooked', resolution: 'matched', visualProvenance: 'VISIBLE' },
  ], briefItems: [
    { qlooId: 'minecraft', facts: [], unknownFields: ['local_coop'] },
    { qlooId: 'overcooked', facts: [{ field: 'local_coop', value: 'Yes, local co-op', provenance: 'MODEL' }], unknownFields: [] },
  ] },
});
function providers(answerShelfQuestion: NonNullable<Providers['llm']['answerShelfQuestion']> = noCall): Providers {
  return { vision: { inspectScene: noCall }, qloo: { resolveEntities: noCall, analyzeConnections: noCall,
    exploreReference: noCall, getLocationContext: noCall, analyzeTaste: noCall, getEntityFact: noCall },
    research: { search: noCall }, llm: { nextTurn: noCall, answerShelfQuestion } };
}

test('exact saved-interest and inventory questions require no model or Qloo call', async () => {
  const services = providers();
  const interest = await explore({ scene: bookScene, profile, question: 'Is Dune one of my interests?', mode: 'scene', messages: [] }, services);
  assert.equal(interest.answer, 'Yes. Dune is one of your saved interests.');
  const inventory = await explore({ scene: bookScene, profile, question: 'Which books did you identify here?', mode: 'scene', messages: [] }, services);
  assert.match(inventory.answer, /Dune, Foundation/);
});

test('local co-op uses a known brief fact and an unknown can request research', async () => {
  const services = providers();
  const answer = await explore({ scene: gameScene, profile, question: 'Does Minecraft support local co-op?', mode: 'scene', messages: [] }, services);
  assert.equal(answer.answer, 'I cannot check that detail right now.');
  const pick = await explore({ scene: gameScene, profile, question: 'Which fits me best and has couch co-op?', mode: 'scene', messages: [] }, services);
  assert.match(pick.answer, /^Overcooked is the highest-ranked visible game/);
});

test('a missing display fact uses targeted Tavily evidence once and reuses the checked answer', async () => {
  let searches = 0, syntheses = 0, briefAnswers = 0;
  const services = providers(async () => { briefAnswers++; return { answer: 'I need to check that.', confidence: 'low', needsResearch: true }; });
  services.research = { search: async (query) => { searches++; assert.match(query, /Minecraft/); assert.match(query, /Nintendo Switch/); assert.match(query, /local co-op/);
    return [{ title: 'Minecraft multiplayer guide', url: 'https://example.org/minecraft-coop',
      content: 'Minecraft supports local co-op on the Nintendo Switch in split-screen mode.', retrievedAt: new Date().toISOString() }]; } };
  services.llm.answerDisplayResearchQuestion = async (input) => { syntheses++; assert.equal(input.sources.length, 1);
    return { answer: 'The source says Minecraft supports split-screen local co-op on Switch.', confidence: 'medium',
      usedSourceUrls: ['https://example.org/minecraft-coop'] }; };
  const first = await explore({ scene: gameScene, profile, question: 'Does Minecraft support local co-op?', mode: 'scene', messages: [] }, services);
  assert.match(first.answer, /split-screen local co-op/);
  const second = await explore({ scene: sceneSchema.parse(JSON.parse(JSON.stringify(first.scene))), profile,
    question: 'Does Minecraft support local co-op?', mode: 'scene', messages: [] }, services);
  assert.equal(second.answer, first.answer);
  assert.equal(searches, 1); assert.equal(syntheses, 1); assert.equal(briefAnswers, 0);
});

test('Qwen can mark an unprepared display question for one on-demand search', async () => {
  let briefAnswers = 0, searches = 0;
  const services = providers(async () => { briefAnswers++; return { answer: 'I need to check that.', confidence: 'low', needsResearch: true }; });
  services.research = { search: async () => { searches++; return [{ title: 'Dune by Frank Herbert', url: 'https://example.org/dune',
    content: 'Dune by Frank Herbert was shaped by the author’s interest in ecology.', retrievedAt: new Date().toISOString() }]; } };
  services.llm.answerDisplayResearchQuestion = async () => ({ answer: 'A source connects Dune to Frank Herbert’s interest in ecology.',
    confidence: 'medium', usedSourceUrls: ['https://example.org/dune'] });
  const result = await explore({ scene: bookScene, profile, question: 'What inspired Dune?', mode: 'scene', messages: [] }, services);
  assert.match(result.answer, /interest in ecology/);
  assert.equal(briefAnswers, 1); assert.equal(searches, 1);
});

test('a source that lacks the photographed platform cannot establish local co-op for that copy', async () => {
  const services = providers();
  services.research = { search: async () => [{ title: 'Minecraft co-op', url: 'https://example.org/minecraft',
    content: 'Minecraft has split-screen on a different platform.', retrievedAt: new Date().toISOString() }] };
  services.llm.answerDisplayResearchQuestion = async () => { throw Error('Platform-mismatched source reached the model'); };
  const result = await explore({ scene: gameScene, profile, question: 'Does Minecraft support local co-op?', mode: 'scene', messages: [] }, services);
  assert.match(result.answer, /could not verify/);
});

test('a clear stored brief answer skips Tavily; unrelated or uncited research cannot become an answer', async () => {
  const services = providers(async () => ({ answer: 'Dune is about a struggle over Arrakis.', confidence: 'medium' }));
  let searches = 0;
  services.research = { search: async () => { searches++; return [{ title: 'Unrelated book', url: 'https://example.org/other',
    content: 'Another title has a current price of $12.', retrievedAt: new Date().toISOString() }]; } };
  services.llm.answerDisplayResearchQuestion = async () => { throw Error('Unrelated source reached the model'); };
  const known = await explore({ scene: bookScene, profile, question: 'What is Dune about?', mode: 'scene', messages: [] }, services);
  assert.match(known.answer, /struggle over Arrakis/);
  assert.equal(searches, 0);
  const unknown = await explore({ scene: bookScene, profile, question: 'What is the current price of Dune?', mode: 'scene', messages: [] }, services);
  assert.match(unknown.answer, /could not verify/);
  assert.equal(searches, 1);
});

test('visible platform and top returned Qloo rank use scene memory', async () => {
  const services = providers();
  const platform = await explore({ scene: gameScene, profile, question: 'What platform does this Minecraft case show?', mode: 'scene', messages: [] }, services);
  assert.equal(platform.answer, 'Minecraft shows Nintendo Switch on this copy.');
  const top = await explore({ scene: bookScene, profile, question: 'Which book ranked first for my interests?', mode: 'scene', messages: [] }, services);
  assert.equal(top.answer, 'Dune ranks highest among the visible titles I could match to your interests.');
});

test('nontrivial shelf follow-up takes exactly one model call with retained brief', async () => {
  let calls = 0;
  const services = providers(async (input) => { calls++; assert.equal(input.shelf.briefItems?.length, 2);
    assert.equal(input.question, 'How are Dune and Foundation different?');
    return { answer: 'Dune centers on one desert world; Foundation spans a galactic civilization.', confidence: 'medium' }; });
  const result = await explore({ scene: bookScene, profile, question: 'How are Dune and Foundation different?', mode: 'scene', messages: [] }, services);
  assert.equal(calls, 1);
  assert.equal(result.answer, 'Dune centers on one desert world; Foundation spans a galactic civilization.');
  assert.equal(result.scene?.summary, bookScene.summary);
});

test('profile change reranks saved IDs and rebuilds brief without Search or Vision', async () => {
  const changed = { signature: 'b'.repeat(64), entities: [{ id: 'foundation', name: 'Foundation', type: 'urn:entity:book' }] };
  let reranks = 0, briefs = 0;
  const services = providers();
  services.qloo.rerankShelf = async (_kind, resolved) => { reranks++; return { resolved, ranked: [
    { entityId: 'foundation', contributingInterestIds: ['foundation'] }, { entityId: 'dune', affinity: 0.4, contributingInterestIds: ['foundation'] },
  ], complete: false }; };
  services.llm.createShelfBrief = async () => { briefs++; return { labels: [], items: [] }; };
  const first = await explore({ scene: bookScene, profile: changed, question: 'Which book ranked first for my interests?', mode: 'scene', messages: [] }, services);
  assert.match(first.answer, /^Foundation ranks highest/);
  assert.equal(reranks, 1); assert.equal(briefs, 1);
  const second = await explore({ scene: first.scene, profile: changed, question: 'Which book ranked first for my interests?', mode: 'scene', messages: [] }, services);
  assert.equal(second.answer, first.answer); assert.equal(reranks, 1); assert.equal(briefs, 1);
});
