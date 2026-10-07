import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import { Body, Button, Card, Heading, Screen, styles } from '@/components/ui';
import { useContextStore } from '@/stores/context';

export default function SettingsScreen() {
  const { autoSpeak, setAutoSpeak, clearSession } = useContextStore();
  const queryClient = useQueryClient();
  return <Screen>
    <Heading>Make Context yours.</Heading>
    <Card><View style={{ gap: 12 }}>
      <Text style={styles.body}>Read responses aloud automatically</Text>
      <Switch accessibilityLabel="Read responses aloud automatically" value={autoSpeak} onValueChange={(value) => { setAutoSpeak(value); if (!value) void Speech.stop(); }} />
    </View><Body>Every response is also available as text. Replay and stop controls are available with responses.</Body></Card>
    <Heading>Your privacy</Heading>
    <Body>Context requests camera, microphone, and foreground location access only when you choose those features.</Body>
    <Body>There is no background location tracking or continuous camera recording. Location permission is optional, and you can enter an area name.</Body>
    <Body>Images and precise coordinates are not saved permanently by the app. Only the current scene, locality, and conversation stay in memory. Closing the app or clearing the session removes that context.</Body>
    <Body>Images, questions, cultural references, and locality may be sent to analysis providers when you request analysis. Provider retention policies must be confirmed when those services are connected.</Body>
    <Button title="Clear current scene and conversation" onPress={() => {
      void Speech.stop(); clearSession(); queryClient.clear(); router.replace('/');
    }} secondary />
  </Screen>;
}
