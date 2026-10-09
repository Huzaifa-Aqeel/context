import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePreferences, preferencesFromState } from '../lib/local/preferences';
import { hasRequiredTasteProfile } from '../lib/taste/required';
import { defaultSpeechPreferences } from '../lib/audio/options';
import { useContextStore } from '../stores/context';

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
  const saved = preferencesFromState({ profile, interests, locationEnabled: true, autoSpeakScene: false,
    speechPreferences: defaultSpeechPreferences });
  assert.deepEqual(decodePreferences(JSON.stringify(saved)), saved);
  assert.equal(JSON.stringify(saved).includes('latitude'), false);
  assert.equal(decodePreferences('{broken'), null);
  assert.equal(decodePreferences(JSON.stringify({ ...saved, profile: { entities: profile.entities } })), null);
});

test('public signed shelf resolution cache persists while scene and image remain session-only', () => {
  const resolutionCache = { version: 1 as const, entries: [{ kind: 'book' as const, title: 'Dune', author: 'Frank Herbert',
    qlooId: 'dune', qlooName: 'Dune', qlooType: 'urn:entity:book' }], signature: 'b'.repeat(64) };
  const saved = preferencesFromState({ profile, interests, locationEnabled: false, autoSpeakScene: true,
    speechPreferences: defaultSpeechPreferences, resolutionCache });
  assert.deepEqual(decodePreferences(JSON.stringify(saved))?.resolutionCache, resolutionCache);
  assert.equal(JSON.stringify(saved).includes('image'), false);
});

test('restored preferences survive a new capture and deletion removes the required profile', () => {
  const state = useContextStore.getState();
  state.clearSession();
  try {
    state.restorePreferences(preferencesFromState({ profile, interests, locationEnabled: true, autoSpeakScene: false,
      speechPreferences: defaultSpeechPreferences }));
    assert.equal(hasRequiredTasteProfile(useContextStore.getState().profile), true);
    useContextStore.getState().setImage('data:image/jpeg;base64,YQ==');
    assert.equal(hasRequiredTasteProfile(useContextStore.getState().profile), true);
    assert.equal(useContextStore.getState().locationEnabled, true);
    assert.equal(useContextStore.getState().autoSpeakScene, false);
    useContextStore.getState().clearTaste();
    assert.equal(hasRequiredTasteProfile(useContextStore.getState().profile), false);
    assert.equal(preferencesFromState(useContextStore.getState()).profile, null);
  } finally { useContextStore.getState().clearSession(); }
});
