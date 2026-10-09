import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useExploration } from '@/hooks/use-exploration';
import { useSpokenOutput } from '@/hooks/use-spoken-output';
import { Body, Card, Notice, Screen, styles } from '@/components/ui';
import { VoiceInput } from '@/components/voice-input';
import { getSpokenText } from '@/lib/audio/playback';
import { conversationForRequest, useContextStore } from '@/stores/context';
import { hasRequiredTasteProfile } from '@/lib/taste/required';
import { ProfileRequired } from '@/components/profile-required';

export default function ConversationScreen() {
  const { scene, locality, messages, profile } = useContextStore();
  const profileReady = hasRequiredTasteProfile(profile);
  const [notice, setNotice] = useState('');
  const answer = useExploration();
  const focused = useIsFocused();
  const { speak, stop, autoSpeak } = useSpokenOutput();
  const latestResponse = [...conversationForRequest()].reverse().find((message) => message.role === 'assistant')?.content;
  const guidance = scene?.event ? 'Ask Context to compare performers, check current ticket details, or add the event to Calendar.'
    : scene?.dining ? 'Ask about a dining place, its address, hours, or why it fits your interests.'
      : scene?.shelf ? 'Ask about a visible title, compare choices, or explore what fits your interests.'
        : scene || locality ? 'Ask about a reference, its connections, or the surrounding area.'
          : 'Ask Context to find dining near you. Location and My Interests are used only when you ask.';
  useEffect(() => {
    if (profileReady && focused && autoSpeak && latestResponse) void speak(latestResponse);
    return () => { if (latestResponse && getSpokenText() === latestResponse) stop(); };
  }, [profileReady, autoSpeak, focused, latestResponse, speak, stop]);
  const ask = (text: string) => {
    setNotice('');
    answer.mutate(text, { onError: (error) => setNotice(error.message), onSuccess: (result) => setNotice(result.warnings?.join(' ') ?? '') });
  };
  if (!profileReady) return <ProfileRequired />;
  return <Screen>
    <Body>{guidance}</Body>
    {messages.map((message, index) => <Card key={index}>
      <Text style={[styles.small, { fontWeight: '700' }]}>{message.role === 'user' ? 'You' : 'Context'}</Text>
      <Body>{message.content}</Body>
    </Card>)}
    <VoiceInput onText={ask} disabled={answer.isPending} replayText={latestResponse} />
    <Notice text={notice} speech={false} />
  </Screen>;
}
