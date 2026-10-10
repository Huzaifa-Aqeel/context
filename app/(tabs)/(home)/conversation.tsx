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
import { capabilityAnswer } from '@/lib/guidance/scene-guidance';
import { SceneGuidanceDisclosure } from '@/components/scene-guidance-disclosure';

export default function ConversationScreen() {
  const { scene, messages, profile, locationEnabled, markHomeAskTipSeen } = useContextStore();
  const profileReady = hasRequiredTasteProfile(profile);
  const [notice, setNotice] = useState('');
  const [showFirstHomeTip, setShowFirstHomeTip] = useState(() => !useContextStore.getState().homeAskTipSeen);
  const [homeTipExpanded, setHomeTipExpanded] = useState(false);
  const answer = useExploration();
  const focused = useIsFocused();
  const { speak, stop, autoSpeak } = useSpokenOutput();
  const latestResponse = [...conversationForRequest()].reverse().find((message) => message.role === 'assistant')?.content;
  const noPhotoConversation = !scene || (scene.origin === 'conversation' && !scene.dining && !scene.area);
  useEffect(() => {
    if (focused && profileReady && locationEnabled && noPhotoConversation && showFirstHomeTip) markHomeAskTipSeen();
    return () => {
      if (focused) {
        setShowFirstHomeTip(false);
        setHomeTipExpanded(false);
      }
    };
  }, [focused, profileReady, locationEnabled, noPhotoConversation, showFirstHomeTip, markHomeAskTipSeen]);
  const guidance = scene?.event ? 'Ask Context to compare performers, check current ticket details, or add the event to Calendar.'
    : scene?.dining ? 'Ask about one recommended place’s cuisine, address, distance, business rating, phone number, or opening hours.'
      : scene?.shelf ? 'Ask about a visible title, compare choices, or explore what fits your interests.'
        : !scene || scene.origin === 'conversation' ? capabilityAnswer(scene)
          : 'Ask about a reference, its connections, or a named nearby place category.';
  useEffect(() => {
    if (profileReady && focused && (locationEnabled || !noPhotoConversation) && autoSpeak && latestResponse) void speak(latestResponse);
    return () => { if (latestResponse && getSpokenText() === latestResponse) stop(); };
  }, [profileReady, locationEnabled, noPhotoConversation, autoSpeak, focused, latestResponse, speak, stop]);
  const ask = (text: string) => {
    setNotice('');
    answer.mutate(text, { onError: (error) => setNotice(error.message), onSuccess: (result) => setNotice(result.warnings?.join(' ') ?? '') });
  };
  if (!profileReady) return <ProfileRequired />;
  if (noPhotoConversation && !locationEnabled) return <Screen>
    <Body>Turn on Location in Personalization to use Ask Context without a photo. You can still capture a scene and ask about it.</Body>
  </Screen>;
  return <Screen>
    {noPhotoConversation
      ? showFirstHomeTip ? <Body>{guidance}</Body>
        : <SceneGuidanceDisclosure text={capabilityAnswer(scene)} expanded={homeTipExpanded}
            onToggle={() => setHomeTipExpanded((expanded) => !expanded)} />
      : <Body>{guidance}</Body>}
    {messages.map((message, index) => <Card key={index}>
      <Text style={[styles.small, { fontWeight: '700' }]}>{message.role === 'user' ? 'You' : 'Context'}</Text>
      <Body>{message.content}</Body>
    </Card>)}
    <VoiceInput onText={ask} disabled={answer.isPending} replayText={latestResponse} />
    <Notice text={notice} speech={false} />
  </Screen>;
}
