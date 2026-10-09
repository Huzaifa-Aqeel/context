import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatClient } from '../lib/ai/client';
import { extractInterestEdits, extractStructuredInterests } from '../lib/ai/interests';
import { chatConfig } from '../lib/server/config';
import { sealDocument, verifyDocument } from '../lib/server/evidence';
import { resolveTasteInterests, confirmTasteProfile } from '../lib/taste/profile';
import { interestsPrompt, ResponseSilence, TasteConversation, type ConversationState } from '../lib/taste/conversation';
import { interestGroups, structuredInterestsSchema, tasteDraftSchema } from '../schemas/taste';
import { activeTasteRequest, useContextStore } from '../stores/context';
import type { StructuredInterests } from '../types/taste';
import type { QlooService } from '../lib/qloo/service';
import { POST as resolveRoute } from '../app/api/taste/resolve+api';
import { POST as confirmRoute } from '../app/api/taste/confirm+api';
import { POST as editRoute } from '../app/api/taste/edit+api';
import { tasteProfileSchema } from '../schemas/taste';
import { SpeechSequence, splitSpeech } from '../lib/audio/sequence';
import { applyInterestEdits } from '../lib/taste/edit';

function emptyGroups(): StructuredInterests { return { movies_tv: [], music_artists: [], books_podcasts: [], dining_food: [], places_travel: [], brands: [], video_games: [], other: [] }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
function workflow() {
  const states: ConversationState[] = []; const calls: string[] = []; let active = true;
  const prompt = deferred<boolean>(); const recording = deferred<string>();
  const conversation = new TasteConversation<string>({
    isActive: () => active,
    prepare: async () => { calls.push('permission'); },
    speak: async (text) => { calls.push(text === interestsPrompt ? 'prompt' : 'completion'); return text === interestsPrompt ? prompt.promise : true; },
    record: async () => { calls.push('record'); },
    stopRecording: async () => { calls.push('stop'); return recording.promise; },
    discardRecording: async () => { calls.push('discard'); },
    save: async () => { calls.push('save'); return 'Your interests are saved.'; },
    onState: (state) => states.push(state),
  });
  return { conversation, states, calls, prompt, recording, background: () => { active = false; } };
}
async function enterListening(run: ReturnType<typeof workflow>) {
  const started = run.conversation.start();
  await Promise.resolve(); run.prompt.resolve(true); await started;
  assert.equal(run.states.at(-1)?.phase, 'listening');
}

test('voice interest recording requires an explicit start and waits for the complete spoken prompt', async () => {
  const run = workflow();
  assert.equal(run.calls.length, 0); assert.equal(run.states.length, 0);
  const started = run.conversation.start(); await Promise.resolve();
  assert.equal(run.states[0].orbVisible, true); assert.equal(run.states[0].phase, 'idle');
  assert.deepEqual(run.calls, ['permission', 'prompt']);
  await run.conversation.start(); assert.equal(run.calls.filter((call) => call === 'prompt').length, 1);
  run.prompt.resolve(true); await started;
  assert.equal(run.calls.at(-1), 'record'); assert.equal(run.states.at(-1)?.phase, 'listening');
  await run.conversation.cancel();
});

test('real speech sequencing reports success only after every prompt chunk finishes and failure on cancellation', async () => {
  const playing: ReturnType<typeof deferred<void>>[] = [];
  const sequence = new SpeechSequence({
    isActive: () => true, onState: () => {}, generate: async () => ({ uri: 'audio-fixture', dispose: () => {} }),
    play: async (_uri, signal) => { const chunk = deferred<void>(); playing.push(chunk); signal.addEventListener('abort', () => chunk.resolve(), { once: true }); return chunk.promise; },
  });
  let done = false;
  const spoken = sequence.speak(interestsPrompt).then((result) => { done = true; return result; });
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
  for (let index = 0; index < splitSpeech(interestsPrompt).length; index++) {
    await tick(); assert.equal(done, false); assert.equal(playing.length, index + 1); playing[index].resolve();
  }
  assert.equal(await spoken, true);
  const cancelled = sequence.speak('Another prompt.'); await tick(); sequence.stop();
  assert.equal(await cancelled, false);
  const failed = new SpeechSequence({ isActive: () => true, onState: () => {}, generate: async () => { throw new Error('Unavailable'); }, play: async () => {} });
  assert.equal(await failed.speak('A prompt.'), false);
});

test('End conversation immediately hides the orb and submits exactly one recorded response', async () => {
  const run = workflow(); await enterListening(run);
  const end = run.conversation.end();
  assert.equal(run.states.at(-1)?.orbVisible, false); assert.equal(run.states.at(-1)?.phase, 'processing');
  assert.equal(run.calls.includes('save'), false);
  run.recording.resolve('recorded response'); await end;
  assert.equal(run.calls.filter((call) => call === 'save').length, 1);
  assert.equal(run.calls.filter((call) => call === 'completion').length, 1);
  assert.equal(run.states.at(-1)?.orbVisible, false); assert.equal(run.states.at(-1)?.busy, false);
});

test('a natural end reacts through processing and speech before hiding the orb', async () => {
  const run = workflow(); await enterListening(run);
  const finish = run.conversation.finish(); const duplicate = run.conversation.finish();
  assert.equal(run.states.at(-1)?.phase, 'processing'); assert.equal(run.states.at(-1)?.orbVisible, true);
  run.recording.resolve('response'); await Promise.all([finish, duplicate]);
  assert.equal(run.calls.filter((call) => call === 'stop').length, 1);
  assert.ok(run.states.some((state) => state.phase === 'speaking' && state.message === 'Your interests are saved.' && state.orbVisible));
  assert.equal(run.states.at(-1)?.orbVisible, false);
});

test('ending during the prompt never starts a microphone even if speech finishes late', async () => {
  const run = workflow(); const started = run.conversation.start(); await Promise.resolve();
  await run.conversation.end(); run.prompt.resolve(true); await started;
  assert.equal(run.calls.includes('record'), false); assert.equal(run.calls.includes('save'), false);
  assert.equal(run.states.at(-1)?.orbVisible, false);
});

test('background cancellation during stop prevents transcription/save and a failed prompt never records', async () => {
  const run = workflow(); await enterListening(run);
  const finishing = run.conversation.finish(); run.background(); await run.conversation.cancel();
  run.recording.resolve('response'); await finishing;
  assert.equal(run.calls.includes('save'), false);
  const failed = workflow(); const starting = failed.conversation.start(); failed.prompt.resolve(false); await starting;
  assert.equal(failed.calls.includes('record'), false); assert.equal(failed.states.at(-1)?.orbVisible, false);
});

test('silence detection allows thinking pauses, rejects empty input and bounds unsupported web metering', () => {
  const detector = new ResponseSilence(); detector.reset(0);
  for (let time = 100; time <= 600; time += 100) assert.equal(detector.sample(time, -20), undefined);
  assert.equal(detector.hasSpeech(), true);
  assert.equal(detector.sample(5000, -60), undefined);
  assert.equal(detector.sample(6600, -60), 'finish');
  detector.reset(0); assert.equal(detector.sample(30_000, -60), 'empty'); assert.equal(detector.hasSpeech(), false);
  detector.reset(0); assert.equal(detector.sample(30_000), undefined); assert.equal(detector.sample(120_000), 'finish');
  detector.reset(0); detector.sample(100, -25); detector.sample(200, -25); assert.equal(detector.hasSpeech(), true);
});

test('one response extracts all eight groups, multiple names and more than ten interests without invented names', async () => {
  const groups = { ...emptyGroups(), movies_tv: ['Interstellar', 'Breaking Bad'], music_artists: ['Radiohead', 'The Weeknd', 'Radiohead', 'Invented Artist'], books_podcasts: ['Dune', 'Serial'], dining_food: ['Pizza', 'Sushi'], places_travel: ['Tokyo', 'Paris'], brands: ['Nike', 'Apple'], video_games: ['Portal', 'Minecraft'], other: ['Chess'] };
  const spoken = 'For movies and TV, Interstellar and Breaking Bad. Music, Radiohead and The Weeknd. Books and podcasts, Dune and Serial. Food, Pizza and Sushi. Travel, Tokyo and Paris. Brands, Nike and Apple. Games, Portal and Minecraft. Also Chess.';
  const client = new ChatClient(chatConfig('llm', { LLM_API_KEY: 'fixture', LLM_API_URL: 'https://analysis.test/v1', LLM_MODEL: 'future-model' }), async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'future-model'); assert.equal(request.messages[1].content, spoken);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(groups) } }] });
  });
  const result = await extractStructuredInterests(client, spoken);
  assert.deepEqual(Object.keys(result), [...interestGroups]); assert.equal(Object.values(result).flat().length, 15);
  assert.deepEqual(result.music_artists, ['Radiohead', 'The Weeknd']);
});

test('interest edits preserve untouched groups, tolerate one spoken typo, and require clarification for vague changes', () => {
  const original = { ...emptyGroups(), movies_tv: ['Interstellar', 'Breaking Bad'], music_artists: ['Radiohead'] };
  const transcript = 'Delete from movies and TV Intersteller and add Black Panther to movies and TV.';
  const changed = applyInterestEdits(original, transcript, [
    { action: 'remove', category: 'movies_tv', value: 'Interstellar' }, { action: 'add', category: 'movies_tv', value: 'Black Panther' },
  ]);
  assert.deepEqual(changed.interests?.movies_tv, ['Breaking Bad', 'Black Panther']);
  assert.deepEqual(changed.interests?.music_artists, ['Radiohead']);
  assert.deepEqual(original.movies_tv, ['Interstellar', 'Breaking Bad']);
  assert.equal(applyInterestEdits(original, 'Update the book.', [], 'What would you like to change in books or podcasts?').interests, undefined);
  assert.deepEqual(applyInterestEdits(original, 'Remove all my movies and TV interests.', [{ action: 'clear', category: 'movies_tv' }]).interests?.movies_tv, []);
  assert.equal(applyInterestEdits(original, 'Remove a movie.', [{ action: 'clear', category: 'movies_tv' }]).interests, undefined);
});

test('edit extraction asks for operations without rewriting the existing profile', async () => {
  const interests = { ...emptyGroups(), books_podcasts: ['Dune'] };
  const client = new ChatClient(chatConfig('llm', { LLM_API_KEY: 'fixture', LLM_API_URL: 'https://analysis.test/v1', LLM_MODEL: 'future-model' }), async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.match(body.messages[1].content, /Update the book/);
    assert.match(body.messages[1].content, /Dune/);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ operations: [], clarification: 'What would you like to change in books or podcasts?' }) } }] });
  });
  const result = await extractInterestEdits(client, 'Update the book.', interests);
  assert.deepEqual(result.operations, []); assert.match(result.clarification!, /books or podcasts/);
});

test('taste edit API applies only explicit operations and Qloo resolves additions without replacing existing matches', async () => {
  const names = ['LLM_API_KEY', 'LLM_API_URL', 'LLM_MODEL', 'QLOO_API_KEY', 'QLOO_BASE_URL', 'SESSION_SIGNING_KEY'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]])); const fetcher = globalThis.fetch;
  Object.assign(process.env, { LLM_API_KEY: 'fixture-analysis', LLM_API_URL: 'https://analysis.test/v1', LLM_MODEL: 'future-model', QLOO_API_KEY: 'fixture-qloo', QLOO_BASE_URL: 'https://culture.test', SESSION_SIGNING_KEY: 'fixture-signing' });
  const interests = { ...emptyGroups(), movies_tv: ['Interstellar', 'Breaking Bad'], music_artists: ['Radiohead'], brands: ['Porsche'] };
  const existing = await sealDocument(tasteProfileSchema.parse({ entities: [
    { id: 'interstellar', name: 'Interstellar', type: 'urn:entity:movie' }, { id: 'breaking', name: 'Breaking Bad', type: 'urn:entity:tv_show' },
    { id: 'radiohead', name: 'Radiohead', type: 'urn:entity:artist' }, { id: 'porsche', name: 'Porsche', type: 'urn:entity:brand' },
  ], bindings: [
    { category: 'movies_tv' as const, value: 'Interstellar', entityId: 'interstellar' }, { category: 'movies_tv' as const, value: 'Breaking Bad', entityId: 'breaking' },
    { category: 'music_artists' as const, value: 'Radiohead', entityId: 'radiohead' }, { category: 'brands' as const, value: 'Porsche', entityId: 'porsche' },
  ] }), 'taste-profile');
  const searched: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'analysis.test') return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ operations: [
      { action: 'remove', category: 'movies_tv', value: 'Interstellar' }, { action: 'add', category: 'movies_tv', value: 'Black Panther' },
      { action: 'remove', category: 'brands', value: 'Porsche' },
    ] }) } }] });
    assert.equal(url.hostname, 'culture.test'); searched.push(url.searchParams.get('query') ?? '');
    return Response.json({ results: [{ entity_id: 'black-panther', name: 'Black Panther', types: ['urn:entity:movie'] }] });
  };
  try {
    const request = new Request('https://context.test/api/taste/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Delete from movies and TV Interstellar, add Black Panther to movies and TV, and remove Porsche from brands.', interests, profile: existing }) });
    const response = await editRoute(request); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.applied, true);
    await verifyDocument(result.profile, 'taste-profile');
    assert.deepEqual(result.interests.movies_tv, ['Breaking Bad', 'Black Panther']);
    assert.deepEqual(result.interests.music_artists, ['Radiohead']); assert.deepEqual(result.interests.brands, []);
    assert.deepEqual(result.profile.entities.map((entity: { id: string }) => entity.id), ['breaking', 'radiohead', 'black-panther']);
    assert.deepEqual(searched, ['Black Panther']);
  } finally {
    globalThis.fetch = fetcher;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

test('larger Qloo profiles resolve in bounded batches and ambiguity remains unresolved', async () => {
  const inputs = Array.from({ length: 18 }, (_, index) => ({ label: `Interest ${index}`, category: 'unknown' }));
  const calls: number[] = [];
  const qloo = { resolveEntities: async (items) => {
    calls.push(items.length);
    return items.map((item) => item.label === 'Interest 0' ? { detectedName: item.label, detectedCategory: item.category, visionConfidence: 1, candidates: [{ id: 'ambiguous', name: item.label, type: 'urn:entity:movie' }] } : { detectedName: item.label, detectedCategory: item.category, visionConfidence: 1, qlooId: item.label, qlooName: item.label, qlooType: 'urn:entity:movie', matchConfidence: 1 });
  } } as QlooService;
  const draft = await resolveTasteInterests(inputs, qloo, true);
  assert.deepEqual(calls, [8, 8, 2]); assert.equal(draft.candidates.length, 18);
  const ids = draft.candidates.flatMap((candidate) => candidate.status === 'matched' ? [candidate.entity.id] : []);
  assert.equal(confirmTasteProfile(draft, ids).entities.length, 17);
  assert.throws(() => confirmTasteProfile(draft, ['ambiguous']), /Only matched/);
});

test('Qloo outage preserves stated interests without retrying every remaining batch or inventing matches', async () => {
  let calls = 0;
  const qloo = { resolveEntities: async () => { calls++; throw new Error('Unavailable'); } } as unknown as QlooService;
  const draft = await resolveTasteInterests(Array.from({ length: 17 }, (_, index) => ({ label: `Interest ${index}`, category: 'unknown' })), qloo, true);
  assert.equal(calls, 1); assert.equal(draft.candidates.length, 17); assert.ok(draft.candidates.every((candidate) => candidate.status === 'no_match'));
  assert.equal(draft.warnings?.length, 1);
});

test('categorized interests are locally saved without becoming unverified Qloo entities and can be cleared', async () => {
  const interests = { ...emptyGroups(), dining_food: ['Sushi', 'Pizza'], other: ['Chess'] };
  useContextStore.getState().clearSession();
  try {
    useContextStore.getState().saveInterests(structuredInterestsSchema.parse(interests), null);
    assert.deepEqual(useContextStore.getState().interests, interests);
    assert.equal(useContextStore.getState().profile, null); assert.deepEqual(activeTasteRequest(), {});
    useContextStore.getState().clearTaste(); assert.equal(useContextStore.getState().interests, null);
    useContextStore.getState().saveInterests(interests, null); useContextStore.getState().clearSession(); assert.equal(useContextStore.getState().interests, null);
  } finally { useContextStore.getState().clearSession(); }
  const original = process.env.SESSION_SIGNING_KEY; process.env.SESSION_SIGNING_KEY = 'fixture-signing-key';
  try {
    const draft = tasteDraftSchema.parse(await sealDocument({ signature: undefined, candidates: [], structuredInterests: interests }, 'taste-draft'));
    await verifyDocument(draft, 'taste-draft');
    const tampered = { ...draft, structuredInterests: { ...interests, other: ['Invented'] } };
    await assert.rejects(verifyDocument(tampered, 'taste-draft'), /changed/);
  } finally { if (original === undefined) delete process.env.SESSION_SIGNING_KEY; else process.env.SESSION_SIGNING_KEY = original; }
});

test('editing interests keeps a resolved profile active', () => {
  useContextStore.getState().clearSession();
  try {
    const profile = { entities: [{ id: 'film', name: 'Interstellar', type: 'urn:entity:movie' }] };
    useContextStore.getState().saveInterests({ ...emptyGroups(), movies_tv: ['Interstellar'] }, profile);
    useContextStore.getState().updateInterests({ ...emptyGroups(), movies_tv: ['Interstellar', 'Black Panther'] }, profile);
    assert.deepEqual(activeTasteRequest().profile?.entities, profile.entities);
    assert.deepEqual(useContextStore.getState().interests?.movies_tv, ['Interstellar', 'Black Panther']);
  } finally { useContextStore.getState().clearSession(); }
});

test('the categorized API preserves every spoken group and signs only uniquely matched entities for personalization', async () => {
  const names = ['LLM_API_KEY', 'LLM_API_URL', 'LLM_MODEL', 'QLOO_API_KEY', 'QLOO_BASE_URL', 'SESSION_SIGNING_KEY'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]])); const fetcher = globalThis.fetch;
  Object.assign(process.env, { LLM_API_KEY: 'fixture-analysis', LLM_API_URL: 'https://analysis.test/v1', LLM_MODEL: 'future-model', QLOO_API_KEY: 'fixture-qloo', QLOO_BASE_URL: 'https://culture.test', SESSION_SIGNING_KEY: 'fixture-signing' });
  const groups = { ...emptyGroups(), movies_tv: ['Interstellar'], dining_food: ['Pizza'] };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'analysis.test') return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(groups) } }] });
    assert.equal(url.hostname, 'culture.test'); assert.equal(url.pathname, '/search');
    return Response.json({ results: url.searchParams.get('query') === 'Interstellar' ? [{ entity_id: 'movie', name: 'Interstellar', types: ['urn:entity:movie'] }] : [] });
  };
  const request = (path: string, body: unknown) => new Request(`https://context.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const resolved = await resolveRoute(request('/api/taste/resolve', { text: 'I like Interstellar and Pizza.', format: 'categorized' }));
    assert.equal(resolved.status, 200); assert.equal(resolved.headers.get('cache-control'), 'no-store');
    const draft = tasteDraftSchema.parse(await resolved.json()); await verifyDocument(draft, 'taste-draft');
    assert.deepEqual(draft.structuredInterests, groups);
    const ids = draft.candidates.flatMap((candidate) => candidate.status === 'matched' ? [candidate.entity.id] : []);
    assert.deepEqual(ids, ['movie']);
    const confirmed = await confirmRoute(request('/api/taste/confirm', { draft, includedIds: ids }));
    assert.equal(confirmed.status, 200); const profile = tasteProfileSchema.parse(await confirmed.json());
    await verifyDocument(profile, 'taste-profile'); assert.deepEqual(profile.entities.map((entity) => entity.name), ['Interstellar']);
  } finally {
    globalThis.fetch = fetcher;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});
