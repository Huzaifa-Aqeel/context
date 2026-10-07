import { Switch, Text } from 'react-native';
import { router } from 'expo-router';
import { clearSpokenOutput, stopSpokenOutput } from '@/lib/audio/playback';
import { useContextStore } from '@/stores/context';
import { Body, Button, Card, styles } from './ui';
export function TasteControls({ onExplore, disabled = false }: { onExplore?: (question: string) => void; disabled?: boolean }) {
  const { profile, personalization, setPersonalization, strategy, setStrategy } = useContextStore();
  return <Card>
    <Text accessibilityRole="header" style={styles.body}>Personalize cultural context</Text>
    <Switch accessibilityLabel="Personalize cultural context" accessibilityHint="Changes ordering, highlighting, and explanations. Your detected references stay the same." value={personalization} disabled={!profile} onValueChange={(value) => { clearSpokenOutput(); setPersonalization(value); }} />
    <Body>{profile ? `${profile.entities.length} confirmed interests. Personalization is ${personalization ? 'on' : 'off'}.` : 'Optional. Explore any scene without sharing interests.'}</Body>
    <Button title={profile ? 'Review or edit interests' : 'Add cultural interests'} onPress={() => router.push('/taste')} secondary />
    {personalization && <>
      <Body>Choose how to explore. All significant references remain available.</Body>
      <Button title={`Start with something familiar${strategy === 'familiar' ? ' · Selected' : ''}`} onPress={() => { stopSpokenOutput(); setStrategy('familiar'); onExplore?.('Start with something familiar. Which significant reference connects to my interests?'); }} disabled={disabled} secondary />
      <Button title={`Discover something new${strategy === 'discover' ? ' · Selected' : ''}`} onPress={() => { stopSpokenOutput(); setStrategy('discover'); onExplore?.('Help me discover something new among the significant references here.'); }} disabled={disabled} secondary />
    </>}
    <Text style={styles.small}>Your detected references stay the same. Earlier personalized answers are excluded from future context when personalization is off or your interests change.</Text>
  </Card>;
}
