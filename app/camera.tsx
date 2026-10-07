import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import { Body, Button, Heading, Notice, Screen } from '@/components/ui';
import { discardTemporaryFile, prepareImage } from '@/lib/images';
import { useContextStore } from '@/stores/context';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const focused = useIsFocused();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { setActive(state === 'active'); setReady(false); });
    return () => listener.remove();
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const setImage = useContextStore((state) => state.setImage);
  async function capture() {
    if (pending || AppState.currentState !== 'active') return;
    setPending(true); setError('');
    let temporaryUri: string | undefined;
    try {
      const image = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (!image) throw new Error('Camera did not return an image.');
      temporaryUri = image.uri;
      setImage(await prepareImage(image.uri, image.width, image.height));
      router.replace('/scene');
    } catch { setError('The image could not be captured. Please try again or choose a photo.'); }
    finally { discardTemporaryFile(temporaryUri); setPending(false); }
  }
  if (!permission?.granted) return <Screen>
    <Heading>Capture what’s around you</Heading>
    <Body>Allow camera access to capture a single scene. You can also choose an existing photo from the home screen.</Body>
    <Button title="Allow camera access" onPress={() => { void requestPermission().catch(() => setError('Camera permission is unavailable. Choose a photo from the home screen.')); }} disabled={permission?.canAskAgain === false} />
    <Notice text={permission?.canAskAgain === false ? 'Camera access is disabled. You can enable it in your device settings or choose a photo.' : error} />
    <Button title="Return to home" onPress={() => router.replace('/')} secondary />
  </Screen>;
  return <Screen>
    <Heading>Capture a scene</Heading>
    <Body>Point your camera toward the references you want to explore, then capture one image.</Body>
    <View style={cameraStyles.preview} accessible={false} importantForAccessibility="no-hide-descendants">
      {focused && active && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture"
        onCameraReady={() => setReady(true)} onMountError={() => setError('The camera is unavailable. Choose a photo from the home screen.')} />}
    </View>
    <Body>Camera preview is active. No video is recorded.</Body>
    <Button title={pending ? 'Preparing scene…' : 'Capture image'} onPress={() => { void capture(); }} disabled={!focused || !active || !ready || pending} />
    <Notice text={error} />
    <Button title="Cancel capture" onPress={() => router.back()} secondary />
  </Screen>;
}
const cameraStyles = StyleSheet.create({ preview: { height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#182C30' } });
