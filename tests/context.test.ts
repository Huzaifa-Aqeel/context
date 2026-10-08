import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { POST as analyzeRoute } from '../app/api/scene/analyze+api';
import { POST as askRoute } from '../app/api/scene/ask+api';
import { POST as locationRoute } from '../app/api/location/context+api';
import { POST as transcribeRoute } from '../app/api/audio/transcribe+api';
import { deriveLocality } from '../lib/location/locality';
import { jsonRoute } from '../lib/api/server';
import { MAX_SCENE_REQUEST_LENGTH } from '../lib/image-limits';
import { analyzeScene, explore, type Providers } from '../lib/orchestration/context';
import type { AgentTurn } from '../lib/llm/service';
import { analyzeRequestSchema, askRequestSchema, localitySchema } from '../schemas/context';
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
    qloo: { analyzeTaste: unexpected, resolveEntities: unexpected, analyzeConnections: unexpected, exploreReference: unexpected, getLocationContext: unexpected },
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

test('conversation accepts scene, area, or standalone reference questions', () => {
  assert.equal(askRequestSchema.safeParse({ scene, question: 'Explain that reference.' }).success, true);
  assert.equal(askRequestSchema.safeParse({ locality: { city: 'Test city' }, question: 'What is culturally significant here?' }).success, true);
  assert.equal(askRequestSchema.safeParse({ question: 'Explain Agatha Christie.' }).success, true);
});

test('malformed API requests fail before reaching providers and never become cached', async () => {
  const response = await analyzeRoute(jsonRequest('/api/scene/analyze', { image: 'not-an-image' }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  const malformed = await askRoute(new Request('https://context.test/api/scene/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }));
  assert.equal(malformed.status, 400);
});

test('full-resolution scene payloads above the former 8 MB cap reach image validation', async () => {
  const image = `data:image/jpeg;base64,${'A'.repeat(8_200_000)}`;
  const request = () => jsonRequest('/api/scene/analyze', { image });
  const accepted = jsonRoute(analyzeRequestSchema, z.object({ accepted: z.boolean() }), async () => ({ accepted: true }), MAX_SCENE_REQUEST_LENGTH);
  assert.equal((await accepted(request())).status, 200);
  const defaultLimit = jsonRoute(analyzeRequestSchema, z.object({ accepted: z.boolean() }), async () => ({ accepted: true }));
  assert.equal((await defaultLimit(request())).status, 413);
});

test('valid requests report unavailable providers instead of fabricated analysis', async () => {
  const originalGroq = process.env.GROQ_API_KEY;
  const originalQloo = process.env.QLOO_API_KEY;
  delete process.env.GROQ_API_KEY; delete process.env.QLOO_API_KEY;
  try {
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
  } finally { if (originalGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalGroq; if (originalQloo === undefined) delete process.env.QLOO_API_KEY; else process.env.QLOO_API_KEY = originalQloo; }
});

test('audio route rejects non-audio input and reports missing transcription honestly', async () => {
  const bad = new FormData(); bad.append('audio', new Blob(['private text'], { type: 'text/plain' }), 'text.txt');
  assert.equal((await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: bad }))).status, 400);
  const empty = new FormData(); empty.append('audio', new Blob([], { type: 'audio/mp4' }), 'question.m4a');
  const emptyResponse = await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: empty }));
  assert.equal(emptyResponse.status, 400);
  assert.equal((await emptyResponse.json()).error.code, 'EMPTY_AUDIO');
  const originalGroq = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  try {
  const good = new FormData(); good.append('audio', new Blob(['recording'], { type: 'audio/mp4' }), 'question.m4a');
  assert.equal((await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: good }))).status, 503);
  const web = new FormData(); web.append('audio', new Blob(['recording'], { type: 'audio/webm;codecs=opus' }), 'question.webm');
  assert.equal((await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: web }))).status, 503);
  const native = new FormData(); native.append('audio', new Blob([Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, 77, 52, 65, 32])], { type: 'application/octet-stream' }), 'question.m4a');
  assert.equal((await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: native }))).status, 503);
  const generic = new FormData(); generic.append('audio', new Blob([Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69])]), 'blob');
  assert.equal((await transcribeRoute(new Request('https://context.test/api/audio/transcribe', { method: 'POST', body: generic }))).status, 503);
  } finally { if (originalGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalGroq; }
});

test('existing evidence supports a direct answer without extra investigation', async () => {
  const result = await explore({ question: 'What do we know?', scene, messages: [], mode: 'scene' }, providers([answerTurn]));
  assert.match(result.answer, /not have enough Qloo facts/);
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
  // A single confirmed reference still supplies cultural metadata.
  service.qloo.analyzeConnections = async (entities) => { assert.equal(entities.length, 1); return evidence; };
  const result = await analyzeScene({ image: 'test-image', mode: 'scene' }, service);
  assert.equal(result.culturalEvidence.entities.length, 2);
  assert.equal(result.environmentalObservations?.[0].label, 'Chair');
  assert.deepEqual(result.culturalEvidence.relationships, []);
  assert.match(result.summary, /not have enough Qloo facts/);
});

test('reference investigation retains scene evidence and separates related references from visible ones', async () => {
  const service = providers([{ kind: 'investigate', action: { tool: 'exploreReference', entityId: 'confirmed-reference' } }, answerTurn]);
  service.qloo.exploreReference = async () => ({
    ...evidence, entities: [{ ...evidence.entities[0], source: 'qloo', visionConfidence: 0 }, { detectedName: 'Related film', detectedCategory: 'film', qlooId: 'related', visionConfidence: 0, source: 'qloo', matchConfidence: 1 }],
    facts: [{ entityId: 'confirmed-reference', name: 'Test poster', category: 'film', tags: ['Drama'], source: 'qloo' }],
    relationships: [{ source: 'confirmed-reference', target: 'related', description: 'A related reference, not necessarily visible.', strength: 0.6, evidenceSource: 'qloo', kind: 'affinity' }],
  });
  const result = await explore({ question: 'Explore it.', scene, messages: [], mode: 'reference' }, service);
  assert.equal(result.scene?.culturalEvidence.entities[0].visionConfidence, 0.95);
  assert.equal(result.scene?.culturalEvidence.entities.find((item) => item.qlooId === 'related')?.source, 'qloo');
  assert.equal(result.scene?.culturalEvidence.facts?.length, 1);
});

test('location-only conversations retrieve evidence once, then reuse it for follow-ups', async () => {
  const service = providers([answerTurn]); let lookups = 0;
  service.qloo.getLocationContext = async (locality) => { lookups++; return { locality, culturalThemes: ['Art'], relatedEntities: ['Museum'], confidence: 'medium', facts: [{ entityId: 'museum', name: 'Museum', category: 'place', tags: ['Art'], source: 'qloo' }] }; };
  const first = await explore({ question: 'What is culturally significant here?', locality: { city: 'Test city' }, mode: 'location', messages: [] }, service);
  assert.equal(lookups, 1); assert.equal(first.locationContext?.facts?.length, 1); assert.equal(first.scene, undefined);
  await explore({ question: 'What do we know about the area?', locality: { city: 'Test city' }, locationContext: first.locationContext, mode: 'location', messages: [] }, providers([answerTurn]));
});

test('an explicitly named reference can be clarified and investigated; invented names cannot', async () => {
  const action: AgentTurn = { kind: 'investigate', action: { tool: 'resolveEntity', name: 'Agatha Christie', category: 'author' } };
  const service = providers([action, answerTurn]);
  service.qloo.resolveEntities = async () => [{ detectedName: 'Agatha Christie', detectedCategory: 'author', visionConfidence: 1, qlooId: 'author', matchConfidence: 0.95, source: 'vision' }];
  service.qloo.analyzeConnections = async (entities) => ({ entities, facts: [{ entityId: 'author', name: 'Agatha Christie', category: 'author', tags: ['Mystery'], source: 'qloo' }], relationships: [], themes: ['Mystery'], confidence: 0.5 });
  const result = await explore({ question: 'The author is Agatha Christie. Can you explain?', scene, mode: 'reference', messages: [] }, service);
  assert.equal(result.scene?.culturalEvidence.entities.find((item) => item.qlooId === 'author')?.source, 'user');
  await assert.rejects(explore({ question: 'Explain the unnamed poster.', scene, mode: 'reference', messages: [] }, providers([action])), /Name the reference/);
});

test('a changed locality discards old local evidence and a generic scene returns an honest fallback', async () => {
  const service = providers([answerTurn]);
  service.qloo.getLocationContext = async (locality) => { assert.equal(locality.city, 'New area'); return { locality, culturalThemes: [], relatedEntities: [], confidence: 'low' }; };
  const result = await explore({ question: 'What kind of area is this?', locality: { city: 'New area' }, locationContext: { locality: { city: 'Old area' }, culturalThemes: ['Old theme'], relatedEntities: [], confidence: 'medium' }, mode: 'location', messages: [] }, service);
  assert.equal(result.locationContext?.locality.city, 'New area');
  const generic = providers([]); generic.vision.inspectScene = async () => [{ label: 'Chair', category: 'furniture', culturallyRelevant: false, confidence: 1 }];
  const empty = await analyzeScene({ image: 'fixture', mode: 'scene' }, generic);
  assert.equal(empty.confidence, 'low'); assert.match(empty.summary, /could not identify/);
});
