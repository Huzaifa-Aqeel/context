import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePreferences, preferencesFromState } from '../lib/local/preferences';
import { hasRequiredTasteProfile } from '../lib/taste/required';
import { defaultSpeechPreferences } from '../lib/audio/options';
import { useContextStore } from '../stores/context';
import type { Scene } from '../types/context';

const profile = {
  entities: [{ id: 'qloo-interstellar', name: 'Interstellar', type: 'urn:entity:movie' }],
  signature: 'a'.repeat(64),
};
const interests = {
  movies_tv: ['Interstellar'], music_artists: [], books_podcasts: [], dining_food: [],
  places_travel: [], brands: [], video_games: [], other: [],
};

test('only a signed, resolved profile unlocks Capture and Ask Context', () => {
  assert.equal(hasRequiredTasteProfile(null), false);
  assert.equal(hasRequiredTasteProfile({ entities: profile.entities }), false);
  assert.equal(hasRequiredTasteProfile(profile), true);
});

test('local preferences round-trip without scene, messages, images, or precise location', () => {
  const saved = preferencesFromState({ profile, interests, locationEnabled: true,
    speechPreferences: defaultSpeechPreferences });
  assert.deepEqual(decodePreferences(JSON.stringify(saved)), saved);
  assert.equal(JSON.stringify(saved).includes('latitude'), false);
  assert.equal(decodePreferences('{broken'), null);
  assert.equal(decodePreferences(JSON.stringify({ ...saved, profile: { entities: profile.entities } })), null);
  assert.deepEqual(decodePreferences(JSON.stringify({ ...saved, autoSpeakScene: true,
    seenSceneTips: { book_shelf: true }, sceneTipOfferCounts: { book_shelf: 3 } })), saved);
  assert.equal(decodePreferences(JSON.stringify({ ...saved, homeAskTipSeen: undefined }))?.homeAskTipSeen, false);
});

test('the Home Ask Context first-open tip is remembered without scene data', () => {
  useContextStore.getState().clearSession();
  try {
    useContextStore.getState().markHomeAskTipSeen();
    useContextStore.getState().setImage('data:image/jpeg;base64,YQ==');
    assert.equal(useContextStore.getState().homeAskTipSeen, true);
    const saved = preferencesFromState(useContextStore.getState());
    assert.equal(decodePreferences(JSON.stringify(saved))?.homeAskTipSeen, true);
  } finally { useContextStore.getState().clearSession(); }
});

test('scene result focus and on-demand guidance persist during the same scene and reset on a new capture', () => {
  useContextStore.getState().clearSession();
  try {
    useContextStore.getState().setScene({ id: 'book-1', shelf: { kind: 'book' } } as Scene);
    useContextStore.getState().markSceneAnnounced('book-1');
    useContextStore.getState().toggleSceneGuidance('book-1');
    useContextStore.getState().updateScene({ id: 'book-1', shelf: { kind: 'book' } } as Scene);
    assert.equal(useContextStore.getState().announcedSceneId, 'book-1');
    assert.equal(useContextStore.getState().guidanceOpenSceneId, 'book-1');
    useContextStore.getState().setImage('data:image/jpeg;base64,YQ==');
    assert.equal(useContextStore.getState().announcedSceneId, null);
    assert.equal(useContextStore.getState().guidanceOpenSceneId, null);
    useContextStore.getState().setScene({ id: 'book-2', shelf: { kind: 'book' } } as Scene);
    assert.equal(useContextStore.getState().announcedSceneId, null);
  } finally { useContextStore.getState().clearSession(); }
});

test('public signed shelf resolution cache persists while scene and image remain session-only', () => {
  const resolutionCache = { version: 1 as const, entries: [{ kind: 'book' as const, title: 'Dune', author: 'Frank Herbert',
    qlooId: 'dune', qlooName: 'Dune', qlooType: 'urn:entity:book' }], signature: 'b'.repeat(64) };
  const saved = preferencesFromState({ profile, interests, locationEnabled: false,
    speechPreferences: defaultSpeechPreferences, resolutionCache });
  assert.deepEqual(decodePreferences(JSON.stringify(saved))?.resolutionCache, resolutionCache);
  assert.equal(JSON.stringify(saved).includes('image'), false);
});

test('restored preferences survive a new capture and deletion removes the required profile', () => {
  const state = useContextStore.getState();
  state.clearSession();
  try {
    state.restorePreferences(preferencesFromState({ profile, interests, locationEnabled: true,
      speechPreferences: defaultSpeechPreferences }));
    assert.equal(hasRequiredTasteProfile(useContextStore.getState().profile), true);
    useContextStore.getState().setImage('data:image/jpeg;base64,YQ==');
    assert.equal(hasRequiredTasteProfile(useContextStore.getState().profile), true);
    assert.equal(useContextStore.getState().locationEnabled, true);
    useContextStore.getState().clearTaste();
    assert.equal(hasRequiredTasteProfile(useContextStore.getState().profile), false);
    assert.equal(preferencesFromState(useContextStore.getState()).profile, null);
  } finally { useContextStore.getState().clearSession(); }
});

test('a real profile edit clears active image, scene, guidance and conversation but keeps saved settings', () => {
  const state = useContextStore.getState(); state.clearSession();
  try {
    state.restorePreferences(preferencesFromState({ profile, interests, locationEnabled: true,
      speechPreferences: defaultSpeechPreferences }));
    state.setScene({ id: 'flyer', event: { profileSignature: profile.signature } } as Scene);
    state.markSceneAnnounced('flyer');
    state.toggleSceneGuidance('flyer');
    state.addMessage({ role: 'assistant', content: 'Old event answer.' });
    const edited = { ...profile, signature: 'b'.repeat(64) };
    state.updateInterests({ ...interests, movies_tv: ['Interstellar', 'Arrival'] }, edited);
    const current = useContextStore.getState();
    assert.equal(current.scene, null);
    assert.equal(current.image, null);
    assert.equal(current.announcedSceneId, null);
    assert.equal(current.guidanceOpenSceneId, null);
    assert.deepEqual(current.messages, []);
    assert.equal(current.locationEnabled, true);
    assert.equal(current.profile?.signature, edited.signature);
    state.setScene({ id: 'second-scene' } as Scene);
    state.updateInterests({ ...interests, other: ['Unresolved local interest'] }, edited);
    assert.equal(useContextStore.getState().scene, null);
    state.setImage('data:image/jpeg;base64,YQ==');
    state.updateInterests({ ...interests, other: ['Another interest'] }, edited);
    assert.equal(useContextStore.getState().image, null);
  } finally { useContextStore.getState().clearSession(); }
});
