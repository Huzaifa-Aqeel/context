import { useCallback, useState } from 'react';
import { useForegroundTask } from '@/hooks/use-foreground-task';
import { Text } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Body, Button, Heading, Notice, Screen, styles } from '@/components/ui';
import { ImageTooLargeError, prepareImage } from '@/lib/images';
import { useContextStore } from '@/stores/context';
import { hasRequiredTasteProfile } from '@/lib/taste/required';

export default function HomeScreen() {
  const { setImage, scene, messages, profile } = useContextStore();
  const profileReady = hasRequiredTasteProfile(profile);
  const [pending, setPending] = useState(false);
  const task = useForegroundTask(useCallback(() => setPending(false), []), true);
  const [error, setError] = useState('');
  async function chooseImage() {
    if (!hasRequiredTasteProfile(useContextStore.getState().profile)) { router.push('/personalization/taste'); return; }
    setPending(true); setError('');
    const ticket = task.begin();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled && ticket.current()) {
        const image = result.assets[0];
        const prepared = await prepareImage(image.uri);
        if (!ticket.current()) return;
        setImage(prepared, 'library');
        router.push('/scene');
      }
    } catch (cause) { if (ticket.current()) setError(cause instanceof ImageTooLargeError ? cause.message : 'The image could not be opened. Please try another photo.'); }
    finally { if (task.mounted() && ticket.current()) setPending(false); }
  }
  return <Screen>
    <Text style={styles.small}>YOUR CULTURAL COMPANION</Text>
    <Heading>There’s more to the scene.</Heading>
    <Body>Understand the references, culture, and connections around you.</Body>
    {!profileReady && <Body>Set up at least one matched interest in My Interests to start exploring.</Body>}
    <Button title="Capture a scene" onPress={() => router.push(profileReady ? '/camera' : '/personalization/taste')} hint={profileReady ? 'Opens the camera. Capturing a photo starts analysis.' : 'Opens My Interests voice setup first.'} />
    <Button title={pending ? 'Preparing image…' : 'Choose a photo'} onPress={() => { void chooseImage(); }} disabled={pending} secondary />
    {(scene || messages.length > 0) && <Button title={scene ? 'Continue exploring this scene' : 'Continue the conversation'}
      onPress={() => router.push(profileReady ? scene ? '/scene' : '/conversation' : '/personalization/taste')} secondary />}
    <Notice text={error} />
    <Text style={styles.small}>Captured or chosen photos are sent for analysis. Your microphone starts only when you tap the voice orb.</Text>
    <Text style={[styles.small, { textAlign: 'center' }]}>or</Text>
    <Button title="Ask Context" onPress={() => router.push(profileReady ? '/conversation' : '/personalization/taste')} hint={profileReady ? 'Opens the voice conversation. Tap its orb to speak.' : 'Opens My Interests voice setup first.'} secondary />
  </Screen>;
}
