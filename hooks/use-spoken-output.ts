import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { clearSpokenOutput, getSpeechState, speakResponse, stopSpokenOutput, subscribeSpeech } from '@/lib/audio/playback';
import { useContextStore } from '@/stores/context';

export function useSpokenOutput() {
  const autoSpeak = useContextStore((state) => state.autoSpeak);
  const state = useSyncExternalStore(subscribeSpeech, getSpeechState, getSpeechState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => { if (status !== 'active') clearSpokenOutput(); });
    return () => { subscription.remove(); clearSpokenOutput(); };
  }, []);
  return { speak: speakResponse, stop: stopSpokenOutput, autoSpeak, state };
}
