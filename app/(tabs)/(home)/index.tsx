import { useCallback, useState } from 'react';
import { useForegroundTask } from '@/hooks/use-foreground-task';
import { Text } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Body, Button, Heading, Notice, Screen, styles } from '@/components/ui';
import { ImageTooLargeError, prepareImage } from '@/lib/images';
import { useContextStore } from '@/stores/context';

export default function HomeScreen() {
  const { setImage, scene, messages } = useContextStore();
  const [pending, setPending] = useState(false);
  const task = useForegroundTask(useCallback(() => setPending(false), []), true);
  const [error, setError] = useState('');
  async function chooseImage() {
    setPending(true); setError('');
    const ticket = task.begin();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled && ticket.current()) {
        const image = result.assets[0];
        const prepared = await prepareImage(image.uri);
        if (!ticket.current()) return;
        setImage(prepared);
        router.push('/scene');
      }
    } catch (cause) { if (ticket.current()) setError(cause instanceof ImageTooLargeError ? cause.message : 'The image could not be opened. Please try another photo.'); }
    finally { if (task.mounted() && ticket.current()) setPending(false); }
  }
  return <Screen>
    <Text style={styles.small}>YOUR CULTURAL COMPANION</Text>
    <Heading>There’s more to the scene.</Heading>
    <Body>Understand the references, culture, and connections around you.</Body>
    <Button title="Capture a scene" onPress={() => router.push('/camera')} hint="Opens the camera. Capturing a photo starts analysis." />
    <Button title={pending ? 'Preparing image…' : 'Choose a photo'} onPress={() => { void chooseImage(); }} disabled={pending} secondary />
    {(scene || messages.length > 0) && <Button title="Continue the conversation" onPress={() => router.push('/conversation')} secondary />}
    <Notice text={error} />
    <Text style={styles.small}>Captured or chosen photos are sent for analysis. Your microphone starts only when you tap the voice orb.</Text>
    <Text style={[styles.small, { textAlign: 'center' }]}>or</Text>
    <Button title="Ask Context" onPress={() => router.push('/conversation')} hint="Opens the voice conversation. Tap its orb to speak." secondary />
  </Screen>;
}
