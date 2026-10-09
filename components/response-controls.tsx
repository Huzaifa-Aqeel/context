import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { AccessibilityInfo, Platform } from 'react-native';
import { Button, Notice } from '@/components/ui';
import { useSpokenOutput } from '@/hooks/use-spoken-output';
import { useContextStore } from '@/stores/context';
import { getSpokenText } from '@/lib/audio/playback';

const automaticallySpoken = new Set<string>();
function markAutomaticallySpoken(key: string) {
  automaticallySpoken.add(key);
  if (automaticallySpoken.size > 10) automaticallySpoken.delete(automaticallySpoken.values().next().value!);
}

export function ResponseControls({ text, automatic = true, autoKey }: { text: string; automatic?: boolean; autoKey: string }) {
  const { speak, stop, autoSpeak, state } = useSpokenOutput();
  const focused = useIsFocused();
  const recording = useContextStore((state) => Boolean(state.recordingOwner));
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (automatic && autoSpeak && focused && !automaticallySpoken.has(autoKey)) {
      // A screen reader may still be announcing the new screen. Do not focus or
      // live-announce the result while Orpheus starts, and give navigation speech time to settle.
      void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        if (cancelled) return;
        if (enabled && Platform.OS !== 'web') timer = setTimeout(() => { if (!cancelled) { markAutomaticallySpoken(autoKey); void speak(text); } }, 900);
        else { markAutomaticallySpoken(autoKey); void speak(text); }
      }).catch(() => { if (!cancelled) { markAutomaticallySpoken(autoKey); void speak(text); } });
    }
    return () => { cancelled = true; if (timer) clearTimeout(timer); if (getSpokenText() === text) stop(); };
  }, [autoKey, automatic, autoSpeak, focused, speak, stop, text]);
  return <>
    <Button title={state.status === 'loading' || state.status === 'playing' ? 'Stop speaking' : 'Replay response'}
      onPress={() => { if (state.status === 'loading' || state.status === 'playing') stop(); else void speak(text); }}
      disabled={recording} secondary />
    <Notice text={state.error} speech={false} />
  </>;
}
