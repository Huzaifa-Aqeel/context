import assert from 'node:assert/strict';
import test from 'node:test';
import { POST as analyzeRoute } from '../app/api/scene/analyze+api';
import { POST as askRoute } from '../app/api/scene/ask+api';
import { POST as locationRoute } from '../app/api/location/context+api';
import { POST as transcribeRoute } from '../app/api/audio/transcribe+api';
import { deriveLocality } from '../lib/location/locality';
import { analyzeScene, explore, type Providers } from '../lib/orchestration/context';
import type { AgentTurn } from '../lib/llm/service';
import { askRequestSchema, localitySchema } from '../schemas/context';
import type { CulturalEvidence, Scene } from '../types/context';

const evidence: CulturalEvidence = {
  entities: [{ detectedName: 'Test poster', detectedCategory: 'film', visionConfidence: 0.95,
    qlooId: 'confirmed-reference', matchConfidence: 0.9 }],
  relationships: [], themes: [], confidence: 0.5,
};
const scene: Scene = {
  id: 'test-scene', createdAt: '2026-10-07T00:00:00.000Z', summary: 'A test scene.',
  culturalEvidence: evidence, confidence: 'low',
};
const answerTurn: AgentTurn = { kind: 'answer', result: { answer: 'There is insufficient evidence for a cultural connection.', confidence: 'low' } };
const unexpected = async (): Promise<never> => { throw new Error('Unnecessary provider call'); };
function providers(turns: AgentTurn[]): Providers {
  let next = 0;
  return {
    vision: { inspectScene: unexpected },
    qloo: { resolveEntities: unexpected, analyzeConnections: unexpected, exploreReference: unexpected, getLocationContext: unexpected },
    llm: { nextTurn: async () => { assert.ok(next < turns.length); return turns[next++]; } },
  };
}
function jsonRequest(path: string, body: unknown) {
  return new Request(`https://context.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('locality extraction discards precise coordinates and exact addresses', () => {
  const locality = deriveLocality({ district: 'Test district', city: 'Test city', region: null, country: 'Test country' });
  assert.deepEqual(locality, { neighborhood: 'Test district', city: 'Test city', country: 'Test country', region: undefined });
  assert.deepEqual(localitySchema.parse({ city: 'Test city', latitude: 24.123, longitude: 67.456, street: 'Private street' }), { city: 'Test city' });
});

test('follow-ups work without location but require some scene or locality context', () => {
  assert.equal(askRequestSchema.safeParse({ scene, question: 'Explain that reference.' }).success, true);
  assert.equal(askRequestSchema.safeParse({ locality: { city: 'Test city' }, question: 'What is culturally significant here?' }).success, true);
  assert.equal(askRequestSchema.safeParse({ question: 'What is here?' }).success, false);
});

test('malformed API requests fail before reaching providers and never become cached', async () => {
  const response = await analyzeRoute(jsonRequest('/api/scene/analyze', { image: 'not-an-image' }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  const malformed = await askRoute(new Request('https://context.test/api/scene/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }));
  assert.equal(malformed.status, 400);
});

test('valid requests report unavailable providers instead of fabricated analysis', async () => {
  const results = await Promise.all([
    analyzeRoute(jsonRequest('/api/scene/analyze', { image: 'data:image/jpeg;base64,YQ==' })),
    askRoute(jsonRequest('/api/scene/ask', { scene, question: 'Tell me more.' })),
    locationRoute(jsonRequest('/api/location/context', { locality: { city: 'Test city' }, question: 'What is this area?' })),
  ]);
  for (const response of results) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).error.code, 'PROVIDERS_NOT_CONFIGURED');
  }
});

test('audio route rejects non-audio input and reports missing transcription honestly', async () => {
  const bad = new FormData(); bad.append('audio', new Blob(['private text'], { type: 'text/plain' }), 'text.txt');
  assert.equal((await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: bad }))).status, 400);
  const good = new FormData(); good.append('audio', new Blob(['recording'], { type: 'audio/mp4' }), 'question.m4a');
  assert.equal((await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: good }))).status, 503);
});

test('existing evidence supports a direct answer without extra investigation', async () => {
  const result = await explore({ question: 'What do we know?', scene, messages: [], mode: 'scene' }, providers([answerTurn]));
  assert.equal(result.answer, answerTurn.result.answer);
  assert.deepEqual(result.scene?.culturalEvidence, evidence);
});

test('follow-up exploration can investigate a reference then its connections', async () => {
  const service = providers([
    { kind: 'investigate', action: { tool: 'exploreReference', entityId: 'confirmed-reference' } },
    { kind: 'investigate', action: { tool: 'analyzeConnections' } },
    answerTurn,
  ]);
  const actions: string[] = [];
  service.qloo.exploreReference = async (id) => { actions.push(id); return evidence; };
  service.qloo.analyzeConnections = async () => { actions.push('connections'); return evidence; };
  await explore({ question: 'How does that reference connect?', scene, messages: [], mode: 'connection' }, service);
  assert.deepEqual(actions, ['confirmed-reference', 'connections']);
});

test('repeated investigation and unconfirmed references are rejected', async () => {
  const repeated: AgentTurn = { kind: 'investigate', action: { tool: 'analyzeConnections' } };
  const service = providers([repeated, repeated]);
  service.qloo.analyzeConnections = async () => evidence;
  await assert.rejects(explore({ question: 'Find connections.', scene, messages: [], mode: 'connection' }, service), /enough additional evidence/);
  await assert.rejects(explore({ question: 'Explore this.', scene, messages: [], mode: 'reference' }, providers([
    { kind: 'investigate', action: { tool: 'exploreReference', entityId: 'unconfirmed-reference' } },
  ])), /not been confidently identified/);
});

test('scene analysis filters generic objects and excludes uncertain matches from relationships', async () => {
  const service = providers([answerTurn]);
  service.vision.inspectScene = async () => [
    { label: 'Test poster', category: 'film', confidence: 0.95, culturallyRelevant: true },
    { label: 'Uncertain logo', category: 'brand', confidence: 0.65, culturallyRelevant: true },
    { label: 'Chair', category: 'furniture', confidence: 0.99, culturallyRelevant: false },
  ];
  service.qloo.resolveEntities = async (entities) => {
    assert.deepEqual(entities.map((entity) => entity.label), ['Test poster', 'Uncertain logo']);
    return [...evidence.entities, { detectedName: 'Uncertain logo', detectedCategory: 'brand', visionConfidence: 0.65, qlooId: 'uncertain', matchConfidence: 0.4 }];
  };
  // With only one confirmed entity, relationship analysis must not be invoked.
  const result = await analyzeScene({ image: 'test-image', mode: 'scene' }, service);
  assert.equal(result.culturalEvidence.entities.length, 2);
  assert.deepEqual(result.culturalEvidence.relationships, []);
  assert.equal(result.summary, answerTurn.result.answer);
});
