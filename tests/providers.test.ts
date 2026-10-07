import assert from 'node:assert/strict';
import test from 'node:test';
import { GroqClient } from '../lib/groq/client';
import { GroqVision } from '../lib/groq/vision';
import { GroqReasoning } from '../lib/groq/reasoning';
import { groqTranscribe } from '../lib/groq/transcription';
import { groqSynthesize } from '../lib/groq/speech';
import { normalizeSpeechWav } from '../lib/groq/wav';
import { QlooClient, selectQlooMatch } from '../lib/qloo/client';
import { groqConfig, qlooConfig } from '../lib/server/config';
import { ProviderHttp } from '../lib/server/http';
import { sealAnswer, sealScene, verifyEvidence } from '../lib/server/evidence';
import { sceneSchema } from '../schemas/context';
import { SpeechSequence, splitSpeech, type SpeechState } from '../lib/audio/sequence';
import { directionPrefix } from '../lib/audio/options';
import { withRequestSignal } from '../lib/api/timeout';
import { POST as speakRoute } from '../app/api/audio/speak+api';

const config = groqConfig({ GROQ_API_KEY: 'test-secret', vision_model: 'fixture-vision', GROQ_TXT_SPEECH: 'canopylabs/orpheus-v1-english' });
const entity = (id: string, name: string, type = 'urn:entity:author') => ({ entity_id: id, name, types: [type],
  properties: { short_description: 'Public cultural description.' },
  tags: [{ tag_id: 'urn:tag:genre:book:mystery', name: 'Mystery' }, { tag_id: 'urn:tag:demographics:income:high', name: 'High income' }] });
const detection = { label: 'Agatha Christie', category: 'author', confidence: 0.95, culturallyRelevant: true };
const completion = (message: unknown, finish_reason = 'stop') => Response.json({ choices: [{ message, finish_reason }] });
const turn = (name: string, args: unknown) => completion({ tool_calls: [{ id: 'call', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, 'tool_calls');
const reasoningInput = { instructions: 'Fixture instructions', request: { question: 'Explain it.', mode: 'scene' as const, messages: [] }, evidence: { entities: [], relationships: [], themes: [], confidence: 0 }, completedActions: [], allowInvestigation: true };
function wav(streaming = true) {
  const bytes = new ArrayBuffer(76); const data = new Uint8Array(bytes); const view = new DataView(bytes);
  for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) data.set(new TextEncoder().encode(value), offset);
  view.setUint32(4, streaming ? 0xffffffff : 68, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  view.setUint32(40, streaming ? 0xffffffff : 32, true); return bytes;
}

test('server configuration supports supplied variable names and rejects unsafe origins', () => {
  assert.equal(config.visionModel, 'fixture-vision'); assert.equal(config.reasoningModel, 'fixture-vision');
  assert.equal(config.speechModel, 'canopylabs/orpheus-v1-english');
  assert.throws(() => groqConfig({}), /not configured/);
  assert.throws(() => qlooConfig({ QLOO_API_KEY: 'fixture', QLOO_BASE_URL: 'http://insecure.test' }), /not configured correctly/);
});

test('provider HTTP errors sanitize credentials, private text, quota and model permissions', async () => {
  for (const [status, code] of [[401, 'QLOO_AUTH'], [429, 'QLOO_RATE_LIMIT'], [500, 'QLOO_ERROR']] as const) {
    const http = new ProviderHttp('https://qloo.test', {}, 'QLOO', async () => Response.json({ private: 'do-not-expose' }, { status }));
    await assert.rejects(http.request('/search'), (error: unknown) => error instanceof Error && 'code' in error && error.code === code && !error.message.includes('do-not-expose'));
  }
  const blocked = new ProviderHttp('https://groq.test', {}, 'GROQ', async () => Response.json({ error: { code: 'model_permission_blocked_project', message: 'private' } }, { status: 403 }));
  await assert.rejects(blocked.request('/audio/speech'), /disabled/);
  const broken = new ProviderHttp('https://groq.test', {}, 'GROQ', async () => new Response('not json'));
  await assert.rejects(broken.request('/'), /unreadable/);
});

test('vision sends image privately and validates actual JSON-mode responses', async () => {
  const vision = new GroqVision(new GroqClient(config, async (url, init) => {
    assert.equal(String(url), `${config.baseUrl}/chat/completions`);
    const body = JSON.parse(String(init?.body)); assert.equal(body.response_format.type, 'json_object');
    assert.equal(body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,YQ==');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-secret');
    return completion({ content: JSON.stringify({ entities: [detection] }) });
  }));
  assert.deepEqual(await vision.inspectScene('data:image/jpeg;base64,YQ=='), [detection]);
  await assert.rejects(new GroqVision(new GroqClient(config, async () => completion({ content: '{bad' }))).inspectScene('fixture'), /could not be read/);
  await assert.rejects(new GroqVision(new GroqClient(config, async () => completion({ content: '{}' }, 'length'))).inspectScene('fixture'), /fully analyzed/);
});

test('reasoning validates native tool calls and forces completion at the investigation limit', async () => {
  const llm = new GroqReasoning(new GroqClient(config, async (_url, init) => {
    const body = JSON.parse(String(init?.body)); assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.tool_choice.function.name, 'finishResponse'); assert.equal(body.tools.length, 1);
    return turn('finishResponse', { evidenceSelections: [], confidence: 'low' });
  }));
  assert.equal((await llm.nextTurn({ ...reasoningInput, allowInvestigation: false })).kind, 'answer');
  const malformed = new GroqReasoning(new GroqClient(config, async () => turn('resolveEntity', { name: 'Unnamed' })));
  await assert.rejects(malformed.nextTurn(reasoningInput), /unreadable/);
  const unknown = new GroqReasoning(new GroqClient(config, async () => turn('inventTool', {})));
  await assert.rejects(unknown.nextTurn(reasoningInput), /unreadable/);
});

test('transcription sends multipart audio using the configured Whisper model', async () => {
  const client = new GroqClient(config, async (_url, init) => {
    const form = init?.body as FormData; assert.equal(form.get('model'), config.transcriptionModel);
    assert.ok(form.get('file') instanceof File); assert.equal(new Headers(init?.headers).has('Content-Type'), false);
    return Response.json({ text: '  What is this neighborhood?  ' });
  });
  assert.equal((await groqTranscribe(client, new File(['audio'], 'question.m4a', { type: 'audio/mp4' }))).text, 'What is this neighborhood?');
  await assert.rejects(groqTranscribe(new GroqClient(config, async () => Response.json({ text: ' ' })), new File(['audio'], 'voice.wav')), /did not hear/);
});

test('Qloo resolution confirms unique exact compatible names and keeps ambiguous candidates uncertain', () => {
  assert.equal(selectQlooMatch(detection, [entity('author-1', 'Agatha Christie')]).qlooId, 'author-1');
  assert.equal(selectQlooMatch(detection, [entity('author-1', 'Agatha Christie'), entity('author-2', 'Agatha Christie')]).qlooId, undefined);
  assert.equal(selectQlooMatch(detection, [entity('movie', 'Agatha Christie', 'urn:entity:movie')]).qlooId, undefined);
  assert.equal(selectQlooMatch(detection, [entity('author-1', 'Similar Name')]).qlooId, undefined);
  assert.equal(selectQlooMatch({ ...detection, label: 'AGATHA CHRISTIE' }, [entity('author-1', 'Agatha Christie')]).qlooId, 'author-1');
});

test('Qloo pairs use returned affinities, filter sensitive tags, and reuse request-scoped search', async () => {
  let searches = 0; let insights = 0;
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (input, init) => {
    const url = new URL(String(input)); assert.equal(new Headers(init?.headers).get('X-Api-Key'), 'fixture');
    if (url.pathname === '/search') {
      searches++; const book = url.searchParams.get('types') === 'urn:entity:book';
      return Response.json({ results: [entity(book ? 'book' : 'author', book ? 'Murder on the Orient Express' : detection.label, book ? 'urn:entity:book' : 'urn:entity:author')] });
    }
    assert.equal(url.pathname, '/v2/insights'); insights++;
    assert.equal(url.searchParams.get('signal.interests.entities'), 'author');
    assert.equal(url.searchParams.get('filter.results.entities'), 'book');
    return Response.json({ success: true, results: { entities: [{ ...entity('book', 'Murder on the Orient Express', 'urn:entity:book'), query: { affinity: 0.52 } }] } });
  });
  const detections = [detection, { ...detection, label: 'Murder on the Orient Express', category: 'book' }];
  const resolved = await client.resolveEntities(detections); await client.resolveEntities(detections);
  assert.equal(searches, 2);
  const evidence = await client.analyzeConnections(resolved); assert.equal(insights, 1);
  assert.deepEqual(evidence.themes, ['Mystery']); assert.equal(evidence.relationships.find((item) => item.kind === 'affinity')?.strength, 0.52);
  assert.equal(evidence.relationships.find((item) => item.kind === 'shared_tags')?.strength, undefined);
  assert.ok(!JSON.stringify(evidence).includes('High income'));
});

test('locality evidence never retains provider coordinates and handles unknown areas', async () => {
  const client = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async (input) => {
    const url = new URL(String(input)); assert.equal(url.searchParams.get('filter.location.query'), 'Lower East Side, New York');
    assert.ok(!url.searchParams.has('filter.location')); return Response.json({ success: true, query: { localities: { filter: [{ name: 'Lower East Side', location: { lat: 40.7, lon: -74 } }] } }, results: { entities: [{ ...entity('place', 'New Museum', 'urn:entity:place'), location: { lat: 40.7, lon: -74 } }] } });
  });
  const result = await client.getLocationContext({ neighborhood: 'Lower East Side', city: 'New York' });
  assert.equal(result.resolvedName, 'Lower East Side'); assert.ok(!JSON.stringify(result).includes('40.7'));
  const unknown = new QlooClient({ apiKey: 'fixture', baseUrl: 'https://qloo.test' }, async () => new Response('{}', { status: 404 }));
  const empty = await unknown.getLocationContext({ city: 'Unknown' }); assert.equal(empty.confidence, 'low'); assert.deepEqual(empty.facts, []);
});

test('signed evidence survives schema serialization, rejects tampering and authenticates locality-only context', async () => {
  const previous = process.env.SESSION_SIGNING_KEY; process.env.SESSION_SIGNING_KEY = 'fixture-signing-key';
  try {
    const scene = await sealScene({ id: 'fixture', createdAt: '2026-10-07T00:00:00.000Z', summary: 'A reference.', culturalEvidence: { entities: [], relationships: [], themes: [], confidence: 0 }, confidence: 'low' });
    await verifyEvidence({ scene: sceneSchema.parse(JSON.parse(JSON.stringify(scene))) });
    await assert.rejects(verifyEvidence({ scene: { ...scene, summary: 'Fabricated' } }), /changed/);
    await assert.rejects(verifyEvidence({ scene: { ...scene, signature: undefined } }), /expired/);
    const answer = await sealAnswer({ answer: 'Local evidence.', confidence: 'low', locationContext: { locality: { city: 'New York' }, culturalThemes: [], relatedEntities: [], confidence: 'low' } });
    await verifyEvidence(answer);
    await assert.rejects(verifyEvidence({ locationContext: { ...answer.locationContext!, culturalThemes: ['Invented'] } }), /changed/);
  } finally { if (previous === undefined) delete process.env.SESSION_SIGNING_KEY; else process.env.SESSION_SIGNING_KEY = previous; }
});

test('Orpheus requests include selected voice and direction, and normalize streaming WAV lengths', async () => {
  const result = await groqSynthesize(new GroqClient(config, async (_input, init) => {
    const body = JSON.parse(String(init?.body)); assert.equal(body.voice, 'hannah'); assert.equal(body.input, '[cheerful] Welcome to Context.'); assert.equal(body.response_format, 'wav');
    return new Response(wav(), { headers: { 'Content-Type': 'audio/wav' } });
  }), 'Welcome to Context.', { voice: 'hannah', style: 'cheerful' });
  assert.equal(new DataView(result).getUint32(4, true), result.byteLength - 8); assert.equal(new DataView(result).getUint32(40, true), 32);
  assert.throws(() => normalizeSpeechWav(new ArrayBuffer(76)), /could not be generated/);
  await assert.rejects(groqSynthesize(new GroqClient(config, async () => Response.json({ unexpected: true })), 'Welcome'), /could not be generated/);
});

test('speech route rejects oversized chunks and unsupported voice/style before invoking Groq', async () => {
  for (const body of [{ text: 'a'.repeat(201) }, { text: 'Welcome', voice: 'tara' }, { text: 'Welcome', style: 'unknown' }, { text: 'a'.repeat(195), style: 'dramatic' }]) {
    const result = await speakRoute(new Request('https://context.test/api/audio/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(result.status, 400); assert.equal(result.headers.get('cache-control'), 'no-store');
  }
});

test('speech chunking respects direction budgets, sentence boundaries, and Unicode', () => {
  const text = 'A cultural reference can connect stories across books, music, and places. '.repeat(8).trim();
  const chunks = splitSpeech(text, 200 - directionPrefix('slow').length);
  assert.equal(chunks.join(' '), text); assert.ok(chunks.every((chunk) => chunk.length + directionPrefix('slow').length <= 200));
  assert.ok(splitSpeech('😀'.repeat(110)).every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test('speech replay reuses audio and changing voice or style disposes previous assets', async () => {
  let generated = 0; let played = 0; let disposed = 0;
  const sequence = new SpeechSequence({ isActive: () => true, onState: () => {}, generate: async () => { generated++; return { uri: 'fixture.wav', dispose: () => { disposed++; } }; }, play: async () => { played++; } });
  await sequence.speak('Welcome'); await sequence.speak('Welcome'); assert.equal(generated, 1); assert.equal(played, 2);
  await sequence.speak('Welcome', { voice: 'hannah', style: 'cheerful' }); assert.equal(generated, 2); assert.equal(disposed, 1);
  sequence.clear(); assert.equal(disposed, 2);
});

test('stopping speech during generation discards late audio and never plays it', async () => {
  let finish!: () => void; let played = 0; let disposed = 0;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const states: SpeechState[] = [];
  const sequence = new SpeechSequence({ isActive: () => true, onState: (state) => states.push(state), generate: async () => { await pending; return { uri: 'late.wav', dispose: () => { disposed++; } }; }, play: async () => { played++; } });
  const speaking = sequence.speak('Welcome'); sequence.clear(); finish(); await speaking;
  assert.equal(played, 0); assert.equal(disposed, 1); assert.equal(states.at(-1)?.status, 'idle');
});

test('speech errors remain visible and backgrounded apps make no speech requests', async () => {
  let last: SpeechState | undefined;
  const sequence = new SpeechSequence({ isActive: () => true, onState: (state) => { last = state; }, generate: async () => { throw new Error('Service busy'); }, play: async () => {} });
  await sequence.speak('Welcome'); assert.equal(last?.error, 'Service busy');
  const inactive = new SpeechSequence({ isActive: () => false, onState: () => {}, generate: async () => { throw new Error('Unnecessary call'); }, play: async () => { throw new Error('Unnecessary playback'); } });
  await inactive.speak('Welcome');
});

test('portable request timeout composes parent cancellation without AbortSignal static methods', async () => {
  const parent = new AbortController(); let captured: AbortSignal | undefined;
  const result = withRequestSignal(async (signal) => { captured = signal; await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })); return 'cancelled'; }, 1000, parent.signal);
  parent.abort(); assert.equal(await result, 'cancelled'); assert.equal(captured?.aborted, true);
});
