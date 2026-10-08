import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { VoiceConversationScreen } from '@/components/voice-conversation-screen';
import { useTasteConversation } from '@/hooks/use-taste-conversation';
import { styles } from '@/components/ui';
import { useContextStore } from '@/stores/context';

export default function TasteScreen() {
  const { interests, profile } = useContextStore();
  const hasInterests = Boolean(Object.values(interests ?? {}).flat().length || profile?.entities.length);
  const [preferEdit, setPreferEdit] = useState(hasInterests);
  const editExisting = hasInterests && preferEdit;
  const voice = useTasteConversation(editExisting, () => setPreferEdit(true));
  return <VoiceConversationScreen voice={voice} orbLabel={editExisting ? 'Update my interests' : 'Set up my interests'}
    modeControl={<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56 }}>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.body, { fontWeight: '700', flexShrink: 1 }]}>My taste profile</Text>
      <Switch value={editExisting} onValueChange={setPreferEdit} disabled={!hasInterests || voice.busy}
        accessibilityLabel={!hasInterests
          ? 'My taste profile. Set up interests with the orb below.'
          : editExisting
            ? 'My taste profile. Use the orb below to review, add, or remove saved interests.'
            : 'My taste profile. Use the orb below to set up a new profile. It will replace saved interests after you finish.'}
        accessibilityHint={hasInterests ? 'Double tap to choose between editing saved interests and setting up a new profile.' : 'Finish taste setup to enable this switch.'}
        accessibilityState={{ checked: editExisting, disabled: !hasInterests || voice.busy }} />
    </View>} />;
}
