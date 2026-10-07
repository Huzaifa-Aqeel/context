import { useContextStore } from '@/stores/context';
import { AppState, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { apiErrorSchema } from '@/schemas/context';
import { withRequestSignal } from '@/lib/api/timeout';
import { apiUrl } from '@/lib/api/client';
import { SpeechSequence, type SpeechState } from './sequence';

let state: SpeechState = { status: 'idle' };
const listeners = new Set<() => void>();
export const subscribeSpeech = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSpeechState = () => state;
const updateState = (next: SpeechState) => { state = next; listeners.forEach((listener) => listener()); };

const sequence = new SpeechSequence({
  isActive: () => AppState.currentState === 'active', onState: updateState,
  generate: async (text, signal, preferences) => {
    const bytes = await withRequestSignal(async (requestSignal) => {
    const response = await fetch(apiUrl('/api/audio/speak'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, ...preferences }), signal: requestSignal });
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(await response.json());
      throw new Error(error.success ? error.data.error.message : 'Spoken output is unavailable. Try replay.');
    }
    return response.arrayBuffer();
    }, 35_000, signal);
    if (Platform.OS === 'web') {
      const uri = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
      return { uri, dispose: () => URL.revokeObjectURL(uri) };
    }
    const file = new File(Paths.cache, `context-speech-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    file.write(new Uint8Array(bytes));
    return { uri: file.uri, dispose: () => { try { if (file.exists) file.delete(); } catch { /* OS cache is the fallback. */ } } };
  },
  play: async (uri, signal) => {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
    if (signal.aborted || AppState.currentState !== 'active') return;
    const player = createAudioPlayer({ uri }, { updateInterval: 100 });
    try {
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = (error?: Error) => { if (finished) return; finished = true; clearTimeout(timer); listener.remove(); signal.removeEventListener('abort', cancel); player.pause(); if (error) reject(error); else resolve(); };
        const cancel = () => finish();
        const listener = player.addListener('playbackStatusUpdate', (status) => {
          if (status.error) finish(new Error('Audio playback failed. Try replay.'));
          else if (status.didJustFinish) finish();
        });
        const timer = setTimeout(() => finish(new Error('Audio playback timed out. Try replay.')), 90_000);
        signal.addEventListener('abort', cancel, { once: true });
        try { player.play(); } catch { finish(new Error('Audio playback failed. Try replay.')); }
      });
    } finally { player.remove(); }
  },
});

export const speakResponse = (text: string) => { void sequence.speak(text, useContextStore.getState().speechPreferences); };
export const stopSpokenOutput = () => sequence.stop();
export const clearSpokenOutput = () => sequence.clear();
