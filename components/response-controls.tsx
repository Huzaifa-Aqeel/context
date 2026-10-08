import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { Button, Notice } from '@/components/ui';
import { useSpokenOutput } from '@/hooks/use-spoken-output';
import { useContextStore } from '@/stores/context';
import { getSpokenText } from '@/lib/audio/playback';

export function ResponseControls({ text, automatic = true }: { text: string; automatic?: boolean }) {
  const { speak, stop, autoSpeak, state } = useSpokenOutput();
  const focused = useIsFocused();
  const recording = useContextStore((state) => Boolean(state.recordingOwner));
  useEffect(() => {
    if (automatic && autoSpeak && focused) speak(text);
    return () => { if (getSpokenText() === text) stop(); };
  }, [automatic, autoSpeak, focused, speak, stop, text]);
  return <>
    <Button title={state.status === 'loading' || state.status === 'playing' ? 'Stop speaking' : 'Replay response'}
      onPress={() => { if (state.status === 'loading' || state.status === 'playing') stop(); else void speak(text); }}
      disabled={recording} secondary />
    <Notice text={state.error} speech={false} />
  </>;
}
