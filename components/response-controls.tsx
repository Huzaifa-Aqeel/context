import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { Button, Notice } from '@/components/ui';
import { useSpokenOutput } from '@/hooks/use-spoken-output';

export function ResponseControls({ text, automatic = true }: { text: string; automatic?: boolean }) {
  const { speak, stop, autoSpeak, state } = useSpokenOutput();
  const focused = useIsFocused();
  useEffect(() => {
    if (automatic && autoSpeak && focused) speak(text);
    return stop;
  }, [automatic, autoSpeak, focused, speak, stop, text]);
  return <>
    <Button title={state.status === 'loading' ? 'Preparing spoken response…' : 'Replay response'} onPress={() => speak(text)} disabled={state.status === 'loading'} secondary />
    <Button title="Stop speaking" onPress={stop} secondary />
    <Notice text={state.error} />
  </>;
}
