import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatClient } from '../lib/ai/client';
import { ChatVision } from '../lib/ai/vision';
import { ChatReasoning } from '../lib/ai/reasoning';
import { extractInterests } from '../lib/ai/interests';
import { audioConfig, chatConfig, groqConfig, providerReadiness } from '../lib/server/config';
import { getProviders, transcribeAudio } from '../lib/providers';
import { sealDocument, verifyDocument } from '../lib/server/evidence';
import { GET as health } from '../app/api/health+api';
import { resolveApiUrl } from '../lib/api/origin';

const env = { LLM_API_KEY: 'analysis-secret', LLM_API_URL: 'https://provider.test/v1', LLM_MODEL: 'any-future-model', GROQ_API_KEY: 'speech-secret', QLOO_API_KEY: 'cultural-secret' };
const completion = (message: unknown) => Response.json({ choices: [{ message, finish_reason: 'stop' }] });
const keys = [...Object.keys(env), 'VISION_API_KEY', 'VISION_API_URL', 'VISION_MODEL', 'SHELF_API_KEY', 'SHELF_API_URL', 'SHELF_MODEL', 'DISPLAY_API_KEY', 'DISPLAY_API_URL', 'DISPLAY_MODEL', 'SESSION_SIGNING_KEY', 'TRANSCRIPTION_API_KEY', 'TRANSCRIPTION_API_URL', 'TRANSCRIPTION_MODEL', 'TTS_API_KEY', 'TTS_API_URL', 'TTS_MODEL'];

test('native development API requests use the Expo server and release builds require a public origin', () => {
  assert.equal(resolveApiUrl('/api/audio/speak', undefined, '192.168.1.8:8081', true, true), 'http://192.168.1.8:8081/api/audio/speak');
  assert.equal(resolveApiUrl('/api/audio/transcribe', undefined, 'http://10.0.2.2:8081', true, true), 'http://10.0.2.2:8081/api/audio/transcribe');
  assert.equal(resolveApiUrl('/api/audio/speak', undefined, undefined, false, true), '/api/audio/speak');
  assert.equal(resolveApiUrl('/api/audio/speak', 'https://context.example/', undefined, true, false), 'https://context.example/api/audio/speak');
  assert.throws(() => resolveApiUrl('/api/audio/speak', undefined, undefined, true, false), /EXPO_PUBLIC_API_URL/);
});
async function withEnvironment(values: Record<string, string>, run: () => Promise<void>) {
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => { if (values[key] !== undefined) process.env[key] = values[key]; else delete process.env[key]; });
  try { await run(); } finally { keys.forEach((key) => { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }); }
}

test('model/provider swaps use generic settings without a model allowlist or Groq credentials', () => {
  assert.equal(chatConfig('vision', env).model, 'any-future-model');
  const next = { LLM_API_KEY: 'next-secret', LLM_API_URL: 'https://next-provider.test/v2', LLM_MODEL: 'another-new-model' };
  for (const role of ['llm', 'vision'] as const) {
    const config = chatConfig(role, next);
    assert.equal(config.model, next.LLM_MODEL); assert.equal(config.apiKey, next.LLM_API_KEY); assert.equal(config.baseUrl, next.LLM_API_URL);
  }
  assert.equal(providerReadiness(next).llm, true); assert.equal(providerReadiness(next).groq, false);
  assert.equal(chatConfig('vision', { GROQ_API_KEY: 'legacy', vision_model: 'legacy-vision' }).model, 'legacy-vision');
  assert.throws(() => chatConfig('llm', { GROQ_API_KEY: 'legacy', LLM_MODEL: 'partial' }), /not configured/);
});

test('the shelf role uses Qwen Max on Alibaba independently of fast Vision and supports future model overrides', () => {
  const ali = { ...env, LLM_API_URL: 'https://workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1', LLM_MODEL: 'qwen3.8-flash' };
  assert.equal(chatConfig('vision', ali).model, 'qwen3.8-flash');
  assert.equal(chatConfig('vision', ali).requestOptions.enable_thinking, false);
  assert.equal(chatConfig('shelf', ali).model, 'qwen3.8-max');
  assert.equal(chatConfig('shelf', ali).briefThinking, true);
  assert.equal(chatConfig('shelf', ali).tokenParameter, 'max_completion_tokens');
  assert.equal(chatConfig('shelf', { ...ali, SHELF_MODEL: 'future-shelf-model' }).model, 'future-shelf-model');
  assert.equal(chatConfig('display', { ...ali, SHELF_MODEL: 'old-model', DISPLAY_MODEL: 'future-display-model' }).model, 'future-display-model');
  assert.equal(chatConfig('shelf', { ...ali, SHELF_MODEL: 'future-shelf-model' }).briefThinking, false);
  assert.equal(chatConfig('shelf', { ...ali, SHELF_BRIEF_THINKING: 'false' }).briefThinking, false);
  assert.throws(() => chatConfig('shelf', { ...ali, SHELF_BRIEF_THINKING: 'maybe' }), /not configured correctly/);
  assert.equal(chatConfig('shelf', ali).timeoutMs, 90_000);
});

test('Qwen Max shelf brief enables thinking while the Vision request remains non-thinking', async () => {
  const ali = { ...env, LLM_API_URL: 'https://workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1', LLM_MODEL: 'qwen3.8-flash' };
  const requests: Record<string, unknown>[] = [];
  const capture = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); requests.push(body);
    return completion({ content: body.messages[1].content instanceof Array
      ? '{"sceneType":"book_shelf","items":[]}'
      : body.max_completion_tokens === 8000 ? '{"items":[]}' : '{"answer":"Dune is a science-fiction novel.","confidence":"high"}' });
  };
  const vision = new ChatVision(new ChatClient(chatConfig('vision', ali), capture));
  const shelf = chatConfig('shelf', ali);
  const reasoning = new ChatReasoning(new ChatClient(shelf, capture), shelf.model, shelf.briefThinking);
  await vision.inspectScene('data:image/jpeg;base64,YQ==');
  await reasoning.createShelfBrief({ kind: 'book', interests: [], inventory: [], items: [] });
  assert.equal(requests[0].enable_thinking, false);
  assert.equal(requests[1].enable_thinking, true);
  assert.equal(requests[1].thinking_budget, 3000);
  assert.equal(requests[1].max_completion_tokens, 8000);
  assert.equal(requests[1].max_tokens, undefined);
});

test('vision overrides inherit only the same endpoint key; a different provider needs its own credentials', () => {
  assert.equal(chatConfig('vision', { ...env, VISION_MODEL: 'vision-only' }).model, 'vision-only');
  assert.equal(chatConfig('vision', env).timeoutMs, 60_000);
  assert.equal(chatConfig('vision', { ...env, VISION_TIMEOUT_MS: '75000' }).timeoutMs, 75_000);
  assert.equal(chatConfig('llm', env).timeoutMs, undefined);
  assert.throws(() => chatConfig('vision', { ...env, VISION_API_URL: 'https://vision.test/v1', VISION_MODEL: 'vision-only' }), /credentials/);
  const separated = { ...env, VISION_API_URL: 'https://vision.test/v1', VISION_API_KEY: 'vision-secret', VISION_MODEL: 'vision-only' };
  assert.equal(chatConfig('vision', separated).apiKey, 'vision-secret'); assert.equal(chatConfig('llm', separated).apiKey, 'analysis-secret');
  assert.equal(chatConfig('vision', separated).timeoutMs, 60_000);
  assert.equal(groqConfig(separated).apiKey, 'speech-secret');
  assert.equal(chatConfig('vision', { VISION_API_URL: 'https://vision.test/v1', VISION_API_KEY: 'vision-secret', VISION_MODEL: 'vision-only', LLM_MODEL: 'incomplete' }).model, 'vision-only');
  assert.equal(chatConfig('vision', { GROQ_API_KEY: 'legacy' }).timeoutMs, 60_000);
});

test('provider dialect options normalize token limits, JSON mode and thinking without changing tools', async () => {
  const config = chatConfig('llm', { ...env, LLM_API_URL: 'https://fixture.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1', LLM_JSON_MODE: 'false', LLM_TOKEN_PARAMETER: 'max_tokens', LLM_REQUEST_OPTIONS: '{"enable_thinking":false,"temperature":0.1}' });
  const client = new ChatClient(config, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'any-future-model'); assert.equal(body.max_tokens, 100); assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.response_format, undefined); assert.equal(body.enable_thinking, false); assert.equal(body.temperature, 0.1);
    assert.deepEqual(body.tools, [{ type: 'function' }]);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer analysis-secret');
    return completion({ content: '{}' });
  });
  await client.completion({ max_completion_tokens: 100, temperature: 0.2, tools: [{ type: 'function' }], response_format: { type: 'json_object' } });
  assert.throws(() => chatConfig('llm', { ...env, LLM_REQUEST_OPTIONS: '{"messages":[]}' }), /options/);
  assert.throws(() => chatConfig('llm', { ...env, LLM_REQUEST_OPTIONS: 'not-json-private-secret' }), (error: unknown) => error instanceof Error && !error.message.includes('private-secret'));
  assert.throws(() => chatConfig('llm', { ...env, LLM_TOKEN_PARAMETER: 'made_up' }), /token parameter/);
  assert.throws(() => chatConfig('llm', { ...env, LLM_API_URL: 'https://secret@provider.test/v1' }), /not configured correctly/);
});

test('the actual factory routes images and reasoning to independent configured endpoints', async () => {
  await withEnvironment({ ...env, VISION_API_KEY: 'vision-secret', VISION_API_URL: 'https://vision.test/v1', VISION_MODEL: 'camera-model' }, async () => {
    const original = globalThis.fetch; const seen: string[] = [];
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body)); seen.push(String(url));
      if (String(url).startsWith('https://vision.test/')) {
        assert.equal(body.model, 'camera-model'); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer vision-secret');
        assert.equal(body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,YQ==');
        return completion({ content: '{"entities":[]}' });
      }
      assert.equal(body.model, 'any-future-model'); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer analysis-secret');
      assert.equal(body.tool_choice.function.name, 'finishResponse');
      return completion({ tool_calls: [{ id: 'finish', type: 'function', function: { name: 'finishResponse', arguments: '{"confidence":"low","evidenceSelections":[]}' } }] });
    };
    try {
      const providers = getProviders(); await providers.vision.inspectScene('data:image/jpeg;base64,YQ==');
      assert.equal((await providers.llm.nextTurn({ request: { question: 'What is here?', mode: 'scene', messages: [] }, instructions: 'Fixture', evidence: { entities: [], relationships: [], themes: [], confidence: 0 }, completedActions: [], allowInvestigation: false })).kind, 'answer');
      assert.deepEqual(seen, ['https://vision.test/v1/chat/completions', 'https://provider.test/v1/chat/completions']);
    } finally { globalThis.fetch = original; }
  });
});

test('generic interest extraction and investigation preserve provenance and the validated tool workflow', async () => {
  const client = new ChatClient(chatConfig('llm', env), async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (!body.tools) return completion({ content: '{"interests":[{"label":"Radiohead","category":"artist"},{"label":"Invented","category":"brand"}]}' });
    return completion({ tool_calls: [{ id: 'resolve', type: 'function', function: { name: 'resolveEntity', arguments: '{"name":"Radiohead","category":"artist"}' } }] });
  });
  assert.deepEqual((await extractInterests(client, 'I like Radiohead')).map((item) => item.label), ['Radiohead']);
  const turn = await new ChatReasoning(client).nextTurn({ request: { question: 'Explain Radiohead.', mode: 'reference', messages: [] }, instructions: 'Fixture', evidence: { entities: [], relationships: [], themes: [], confidence: 0 }, completedActions: [], allowInvestigation: true });
  assert.equal(turn.kind, 'investigate');
  await assert.rejects(new ChatVision(new ChatClient(chatConfig('vision', env), async () => completion({ content: 'not-json' }))).inspectScene('fixture'), /could not be read/);
});

test('health and evidence signing work with analysis-only credentials and expose no secrets', async () => {
  await withEnvironment({ LLM_API_KEY: 'analysis-secret', LLM_API_URL: 'https://provider.test/v1', LLM_MODEL: 'future', QLOO_API_KEY: 'cultural-secret' }, async () => {
    const document = await sealDocument({ signature: undefined, value: 'public fixture' }, 'fixture'); await verifyDocument(document, 'fixture');
    const response = await health(); const body = await response.json();
    assert.equal(body.analysisConfigured, true); assert.equal(body.providers.groq, false);
    assert.equal(body.providers.llm, true); assert.equal(body.providers.vision, true);
    assert.ok(!JSON.stringify(body).includes('secret')); assert.ok(!JSON.stringify(body).includes('provider.test'));
  });
});

test('audio endpoints and models are independent of analysis and require the correct endpoint credentials', async () => {
  const audioEnv = { ...env, TRANSCRIPTION_API_URL: 'https://audio.test/v1', TRANSCRIPTION_API_KEY: 'audio-secret', TRANSCRIPTION_MODEL: 'future-transcriber', TTS_API_URL: 'https://speech.test/v1', TTS_API_KEY: 'tts-secret', TTS_MODEL: 'future-wav-model' };
  assert.equal(audioConfig('tts', audioEnv).model, 'future-wav-model');
  assert.equal(audioConfig('transcription', audioEnv).apiKey, 'audio-secret');
  assert.throws(() => audioConfig('tts', { ...env, TTS_API_URL: 'https://another.test/v1', TTS_MODEL: 'new-model' }), /credentials/);
  assert.equal(audioConfig('tts', env).model, 'canopylabs/orpheus-v1-english');
  await withEnvironment(audioEnv, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://audio.test/v1/audio/transcriptions');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer audio-secret');
      assert.equal((init?.body as FormData).get('model'), 'future-transcriber');
      return Response.json({ text: 'What is here?' });
    };
    try { assert.equal((await transcribeAudio(new File(['fixture'], 'fixture.wav', { type: 'audio/wav' }))).text, 'What is here?'); }
    finally { globalThis.fetch = original; }
  });
});

test('completed investigations disappear from the tool menu while other references remain explorable', async () => {
  const client = new ChatClient(chatConfig('llm', env), async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const names = body.tools.map((entry: { function: { name: string } }) => entry.function.name);
    assert.ok(!names.includes('analyzeConnections')); assert.ok(!names.includes('analyzeTaste')); assert.ok(!names.includes('getLocationContext'));
    const reference = body.tools.find((entry: { function: { name: string } }) => entry.function.name === 'exploreReference');
    assert.deepEqual(reference.function.parameters.properties.entityId.enum, ['second']);
    assert.ok(names.includes('resolveEntity')); assert.ok(names.includes('finishResponse'));
    assert.equal(body.messages[2].role, 'assistant'); assert.equal(body.messages[3].role, 'tool');
    assert.equal(body.messages[2].tool_calls[0].id, body.messages[3].tool_call_id);
    assert.equal(JSON.parse(body.messages[3].content).status, 'completed');
    return completion({ tool_calls: [{ id: 'finish', type: 'function', function: { name: 'finishResponse', arguments: '{"confidence":"low","evidenceSelections":[]}' } }] });
  });
  await new ChatReasoning(client).nextTurn({ request: { question: 'Explain it.', mode: 'reference', messages: [] }, instructions: 'Fixture', evidence: { entities: ['first', 'second'].map((id) => ({ detectedName: id, detectedCategory: 'film', visionConfidence: 0.9, qlooId: id, matchConfidence: 1 })), relationships: [], themes: [], confidence: 0 }, completedActions: ['{"tool":"exploreReference","entityId":"first"}', '{"tool":"analyzeConnections"}', '{"tool":"analyzeTaste"}', '{"tool":"getLocationContext"}'], allowInvestigation: true });
});
