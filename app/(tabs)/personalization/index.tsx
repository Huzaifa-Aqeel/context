import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { clearSpokenOutput } from '@/lib/audio/playback';
import { LocationControl } from '@/components/location-control';
import { Body, Button, Card, Heading, Screen, styles } from '@/components/ui';
import { useContextStore } from '@/stores/context';

export default function PersonalizationScreen() {
  const { profile, interests, clearTaste, autoSpeakScene, setAutoSpeakScene } = useContextStore();
  const count = interests ? Object.values(interests).flat().length : profile?.entities.length ?? 0;
  return <Screen>
    <Heading>Personalization</Heading>
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={[styles.body, { fontWeight: '700' }]}>My Interests</Text>
      <Body>Share or change what you like by voice. Context uses matched interests to help you explore and decide.</Body>
      <Card>
        <Body>{count ? `${count} ${count === 1 ? 'interest' : 'interests'} shared${profile ? `, ${profile.entities.length} matched` : ''}.` : 'No interests added yet.'}</Body>
        <Button title="My Interests" onPress={() => router.push('/personalization/taste')} hint="Opens the voice control to hear and change your interests." />
      </Card>
      {profile && <>
        <Button title="Forget my taste profile" onPress={() => { clearSpokenOutput(); clearTaste(); }} secondary />
      </>}
    </View>
    <View style={{ height: 1, backgroundColor: '#C1CDC7', marginVertical: 8 }} accessible={false} />
    <LocationControl />
    <View style={{ height: 1, backgroundColor: '#C1CDC7', marginVertical: 8 }} accessible={false} />
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={[styles.body, { fontWeight: '700' }]}>Scene speech</Text>
      <Text style={styles.body}>Would you like Context to speak scene results automatically? When off, the scene answer stays available as text for TalkBack or VoiceOver.</Text>
      <View style={{ minHeight: 56, justifyContent: 'center', alignItems: 'flex-start' }}>
        <Switch value={autoSpeakScene} onValueChange={setAutoSpeakScene}
          accessibilityLabel="Speak scene results automatically"
          accessibilityHint="When off, Context does not start its own voice for a new scene. You can still use the Replay response button."
          accessibilityState={{ checked: autoSpeakScene }} />
      </View>
    </View>
  </Screen>;
}
