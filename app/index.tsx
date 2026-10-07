import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Body, Button, Card, colors, Heading, Notice, Screen, styles } from '@/components/ui';
import { modes } from '@/lib/modes';
import { prepareImage } from '@/lib/images';
import { useContextStore } from '@/stores/context';

export default function HomeScreen() {
  const { mode, setMode, setImage, scene } = useContextStore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [focusedMode, setFocusedMode] = useState('');
  async function chooseImage() {
    setPending(true); setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled) {
        const image = result.assets[0];
        setImage(await prepareImage(image.uri, image.width, image.height));
        router.push('/scene');
      }
    } catch { setError('The image could not be opened. Please try another photo.'); }
    finally { setPending(false); }
  }
  return <Screen>
    <Text style={styles.small}>YOUR CULTURAL COMPANION</Text>
    <Heading>There’s more to the scene.</Heading>
    <Body>Explore the references, connections, and local stories around you.</Body>
    <Button title="Capture a scene" onPress={() => router.push('/camera')} hint="Opens the camera. Capture one image to explore." />
    <Button title={pending ? 'Preparing image…' : 'Choose a photo'} onPress={() => { void chooseImage(); }} disabled={pending} secondary />
    {scene && <Button title="Continue exploring the current scene" onPress={() => router.push('/conversation')} secondary />}
    <Notice text={error} />
    <Button title="Add cultural interests · Optional" onPress={() => router.push('/taste')} secondary />
    <Heading>Choose your exploration</Heading>
    {modes.map((item) => <Pressable key={item.id} accessibilityRole="radio"
      accessibilityLabel={item.title} accessibilityHint={item.description}
      accessibilityState={{ checked: mode === item.id }}
      onFocus={() => setFocusedMode(item.id)} onBlur={() => setFocusedMode('')}
      onPress={() => { setMode(item.id); if (item.id === 'location') router.push('/location'); }}
      style={{ borderRadius: 18, borderWidth: 2, borderColor: focusedMode === item.id ? colors.accent : mode === item.id ? colors.ink : 'transparent' }}>
      <Card><Text style={[styles.body, { fontWeight: '700' }]}>{item.title}{mode === item.id ? ' · Selected' : ''}</Text>
        <Text style={styles.small}>{item.description}</Text></Card>
    </Pressable>)}
    <Body>Photos are analyzed only when you ask. Location is used only with permission while the app is open.</Body>
    <Button title="Settings and privacy" onPress={() => router.push('/settings')} secondary />
  </Screen>;
}
