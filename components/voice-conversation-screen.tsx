import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { VoicePhase } from '@/lib/taste/conversation';
import { colors, Screen, styles } from './ui';
import { VoiceOrb } from './voice-orb';

type VoiceSession = {
  phase: VoicePhase;
  orbVisible: boolean;
  busy: boolean;
  otherRecording: boolean;
  level?: number;
  message: string;
  start: () => void;
  end: () => void;
};

export function VoiceConversationScreen({ orbLabel, modeControl, voice }: {
  orbLabel: string;
  modeControl: ReactNode;
  voice: VoiceSession;
}) {
  const focused = useIsFocused();
  useEffect(() => {
    if (focused && voice.message && Platform.OS === 'ios' && voice.phase !== 'speaking') AccessibilityInfo.announceForAccessibility(voice.message);
  }, [focused, voice.message, voice.phase]);
  const speaking = voice.phase === 'speaking';
  const listening = voice.phase === 'listening';
  const canStop = speaking || listening;
  const unavailable = !focused || voice.otherRecording || (voice.busy && !canStop);
  const label = listening ? 'Stop recording' : speaking ? 'End conversation' : voice.phase === 'processing' ? 'Processing' : orbLabel;
  return <Screen>
    {modeControl}
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.body, { fontWeight: '700', alignSelf: 'stretch' }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        accessibilityHint={listening ? 'Stops recording and saves your response.' : speaking ? 'Stops this conversation.' : 'Hear a prompt, then speak one response. Tap again to finish.'}
        accessibilityState={{ disabled: unavailable, busy: voice.phase === 'processing' }}
        disabled={unavailable}
        onPress={canStop ? voice.end : voice.start}
        style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.75 : 1, borderRadius: 20, borderWidth: 2, borderColor: pressed ? colors.accent : 'transparent' })}>
        <VoiceOrb phase={voice.phase} level={voice.level} />
      </Pressable>
      {voice.message ? <Text accessibilityLiveRegion={focused && voice.phase !== 'speaking' ? 'polite' : 'none'} style={[styles.body, { textAlign: 'center' }]}>{voice.message}</Text> : null}
    </View>
  </Screen>;
}
