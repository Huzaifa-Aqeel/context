import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { clearSpokenOutput, stopSpokenOutput } from '@/lib/audio/playback';
import { TasteControls } from '@/components/taste-controls';
import { speechStyleLabels, speechStyles, speechVoices } from '@/lib/audio/options';
import { ResponseControls } from '@/components/response-controls';
import { Body, Button, Card, Heading, Screen, styles } from '@/components/ui';
import { useContextStore } from '@/stores/context';

export default function SettingsScreen() {
  const { autoSpeak, setAutoSpeak, clearSession, speechPreferences, setSpeechPreferences } = useContextStore();
  const queryClient = useQueryClient();
  return <Screen>
    <Heading>Make Context yours.</Heading>
    <Card><View style={{ gap: 12 }}>
      <Text style={styles.body}>Read responses aloud automatically</Text>
      <Switch accessibilityLabel="Read responses aloud automatically" value={autoSpeak} onValueChange={(value) => { setAutoSpeak(value); if (!value) stopSpokenOutput(); }} />
    </View><Body>Every response is also available as text. Replay and stop controls are available with responses.</Body></Card>
    <TasteControls />
    <Heading>Your voice</Heading>
    <Body>Choose the voice that feels comfortable to listen to. Current voice: {speechPreferences.voice}.</Body>
    {speechVoices.map((voice) => <Button key={voice} title={`${voice[0].toUpperCase()}${voice.slice(1)}${speechPreferences.voice === voice ? ' · Selected' : ''}`}
      onPress={() => { clearSpokenOutput(); setSpeechPreferences({ ...speechPreferences, voice }); }} secondary />)}
    <Heading>Speaking style</Heading>
    <Body>Vocal directions shape the delivery. Choose natural conversation or a tone and pace you prefer.</Body>
    {speechStyles.map((style) => <Button key={style} title={`${speechStyleLabels[style]}${speechPreferences.style === style ? ' · Selected' : ''}`}
      onPress={() => { clearSpokenOutput(); setSpeechPreferences({ ...speechPreferences, style }); }} secondary />)}
    <Body>Preview your voice and style.</Body>
    <ResponseControls text="Welcome to Context. There is more to the scene. Let's explore the cultural references around you." automatic={false} />
    <Heading>Your privacy</Heading>
    <Body>Context requests camera, microphone, and foreground location access only when you choose those features.</Body>
    <Body>There is no background location tracking or continuous camera recording. Location permission is optional, and you can enter an area name.</Body>
    <Body>Images and precise coordinates are not saved permanently by the app. Only the current scene, locality, and conversation stay in memory. Closing the app or clearing the session removes that context.</Body>
    <Body>Images and voice recordings are sent to Groq for analysis. Response text is sent to Groq to generate spoken output. Public reference names and area names are sent to Qloo; questions and cultural evidence are sent to Groq for explanation. These providers apply their own data retention policies.</Body>
    <Button title="Clear current scene and conversation" onPress={() => {
      clearSpokenOutput(); clearSession(); queryClient.clear(); router.replace('/');
    }} secondary />
  </Screen>;
}
