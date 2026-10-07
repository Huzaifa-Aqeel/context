import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { Button, Notice } from '@/components/ui';
import { useSpokenOutput } from '@/hooks/use-spoken-output';
import { useContextStore } from '@/stores/context';

export function ResponseControls({ text, automatic = true }: { text: string; automatic?: boolean }) {
  const { speak, stop, autoSpeak, state } = useSpokenOutput();
  const focused = useIsFocused();
  const recording = useContextStore((state) => Boolean(state.recordingOwner));
  useEffect(() => {
    if (automatic && autoSpeak && focused) speak(text);
    return stop;
  }, [automatic, autoSpeak, focused, speak, stop, text]);
  return <>
    <Button title={state.status === 'loading' ? 'Preparing spoken response…' : 'Replay response'} onPress={() => speak(text)} disabled={recording || state.status === 'loading'} secondary />
    <Button title="Stop speaking" onPress={stop} secondary />
    <Notice text={state.error} speech={false} />
  </>;
}
