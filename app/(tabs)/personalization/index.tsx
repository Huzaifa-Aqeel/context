import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { clearSpokenOutput } from '@/lib/audio/playback';
import { LocationControl } from '@/components/location-control';
import { Body, Button, Card, Heading, Screen, styles } from '@/components/ui';
import { useContextStore } from '@/stores/context';

export default function PersonalizationScreen() {
  const { profile, interests, personalization, setPersonalization, clearTaste } = useContextStore();
  const count = interests ? Object.values(interests).flat().length : profile?.entities.length ?? 0;
  return <Screen>
    <Heading>Personalization</Heading>
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={[styles.body, { fontWeight: '700' }]}>My Interests (optional)</Text>
      <Body>Share or change what you like by voice. Context uses supported interests to explain cultural references that matter to you. You can still explore without a profile.</Body>
      <Card>
        <Body>{count ? `${count} ${count === 1 ? 'interest' : 'interests'} shared${profile ? `, ${profile.entities.length} matched` : ''}.` : 'No interests added yet.'}</Body>
        <Button title="My Interests" onPress={() => router.push('/personalization/taste')} hint="Opens the voice control to hear and change your interests." />
      </Card>
      {profile && <>
        <Text style={styles.body}>Personalize cultural context? This changes what Context highlights and explains first. All detected references remain available.</Text>
        <View style={{ minHeight: 56, justifyContent: 'center', alignItems: 'flex-start' }}>
          <Switch accessibilityLabel="Personalize cultural context" accessibilityHint="Double tap to change. Detected references stay the same."
            value={personalization} onValueChange={(value) => { clearSpokenOutput(); setPersonalization(value); }} />
        </View>
        <Button title="Forget my taste profile" onPress={() => { clearSpokenOutput(); clearTaste(); }} secondary />
      </>}
    </View>
    <View style={{ height: 1, backgroundColor: '#C1CDC7', marginVertical: 8 }} accessible={false} />
    <LocationControl />
  </Screen>;
}
