import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import { useContextStore } from '@/stores/context';

export function useSpokenOutput() {
  const autoSpeak = useContextStore((state) => state.autoSpeak);
  const speak = useCallback((text: string) => { void Speech.stop(); Speech.speak(text); }, []);
  const stop = useCallback(() => { void Speech.stop(); }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') stop(); });
    return () => { subscription.remove(); stop(); };
  }, [stop]);
  return { speak, stop, autoSpeak };
}
