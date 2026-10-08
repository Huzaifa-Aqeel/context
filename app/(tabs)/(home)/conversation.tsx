import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useExploration } from '@/hooks/use-exploration';
import { useSpokenOutput } from '@/hooks/use-spoken-output';
import { Body, Card, Notice, Screen, styles } from '@/components/ui';
import { VoiceInput } from '@/components/voice-input';
import { getSpokenText } from '@/lib/audio/playback';
import { conversationForRequest, useContextStore } from '@/stores/context';

export default function ConversationScreen() {
  const { scene, locality, messages } = useContextStore();
  const [notice, setNotice] = useState('');
  const answer = useExploration();
  const focused = useIsFocused();
  const { speak, stop, autoSpeak } = useSpokenOutput();
  const latestResponse = [...conversationForRequest()].reverse().find((message) => message.role === 'assistant')?.content;
  useEffect(() => {
    if (focused && autoSpeak && latestResponse) void speak(latestResponse);
    return () => { if (latestResponse && getSpokenText() === latestResponse) stop(); };
  }, [autoSpeak, focused, latestResponse, speak, stop]);
  const ask = (text: string) => {
    setNotice('');
    answer.mutate(text, { onError: (error) => setNotice(error.message), onSuccess: (result) => setNotice(result.warnings?.join(' ') ?? '') });
  };
  return <Screen>
    <Body>{scene || locality ? 'Ask about a reference, its connections, or the surrounding area.' : 'Ask about a cultural reference. To capture a scene, return to Home.'}</Body>
    {messages.map((message, index) => <Card key={index}>
      <Text style={[styles.small, { fontWeight: '700' }]}>{message.role === 'user' ? 'You' : 'Context'}</Text>
      <Body>{message.content}</Body>
    </Card>)}
    <VoiceInput onText={ask} disabled={answer.isPending} replayText={latestResponse} />
    <Notice text={notice} speech={false} />
  </Screen>;
}
