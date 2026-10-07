import { useEffect } from 'react';
import { Button } from '@/components/ui';
import { useSpokenOutput } from '@/hooks/use-spoken-output';

export function ResponseControls({ text }: { text: string }) {
  const { speak, stop, autoSpeak } = useSpokenOutput();
  useEffect(() => { if (autoSpeak) speak(text); }, [autoSpeak, speak, text]);
  return <>
    <Button title="Replay response" onPress={() => speak(text)} secondary />
    <Button title="Stop speaking" onPress={stop} secondary />
  </>;
}
