import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { VoiceConversationScreen } from '@/components/voice-conversation-screen';
import { useTasteConversation } from '@/hooks/use-taste-conversation';
import { styles } from '@/components/ui';
import { useContextStore } from '@/stores/context';
import { interestGroups } from '@/schemas/taste';
import { displayedInterests, interestGroupLabels } from '@/lib/taste/edit-feedback';

const editInstruction = 'Your interests are below. To edit them, use the voice button and say what to add, remove, or change. For example, remove Interstellar from movies.';
const setupInstruction = 'Tell Context a few things you like in movies and TV, music, books and podcasts, food, places, brands, games, or anything else. Mention as many or as few as you want. Tap the voice button to start. For example, I like Interstellar and Radiohead.';

export default function TasteScreen() {
  const profile = useContextStore((state) => state.profile);
  const interests = useContextStore((state) => state.interests);
  const focused = useIsFocused();
  const instruction = useRef<Text>(null);
  const focusedInstruction = useRef(false);
  const hasProfile = Boolean(profile?.entities.length);
  const voice = useTasteConversation(hasProfile);
  useEffect(() => {
    if (!focused || Platform.OS === 'web' || focusedInstruction.current) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        if (!enabled || cancelled || !instruction.current) return;
        const handle = findNodeHandle(instruction.current);
        if (handle) { focusedInstruction.current = true; AccessibilityInfo.setAccessibilityFocus(handle); }
      }).catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [focused, hasProfile]);
  useEffect(() => { if (!focused) focusedInstruction.current = false; }, [focused]);
  const displayed = displayedInterests(interests, profile);
  const visibleGroups = interestGroups.filter((group) => displayed[group]?.length);
  return <VoiceConversationScreen voice={voice} orbLabel={hasProfile ? 'Edit interests by voice' : 'Set up interests by voice'} directRecording
    idleHint={hasProfile
      ? 'Double tap to start recording. Say what you want to add, remove, or change.'
      : 'Double tap to start recording. Tell Context some things you like.'}
    listeningHint={hasProfile ? 'Double tap to finish and submit your changes.' : 'Double tap to finish and save your interests.'}
    modeControl={<View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={[styles.body, { fontWeight: '700' }]}>My Interests</Text>
      <Text ref={instruction} style={styles.body}>{hasProfile ? editInstruction : setupInstruction}</Text>
      {hasProfile && <>
        {visibleGroups.map((group) => <View key={group} style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={[styles.body, { fontWeight: '700' }]}>{interestGroupLabels[group]}</Text>
          {displayed[group].map((value, index) => <Text key={`${group}-${index}`} style={styles.body}>{value}</Text>)}
        </View>)}
      </>}
    </View>} />;
}
