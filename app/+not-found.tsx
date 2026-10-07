import { router } from 'expo-router';
import { Body, Button, Heading, Screen } from '@/components/ui';

export default function NotFoundScreen() {
  return <Screen><Heading>This screen isn’t available.</Heading><Body>Return to Context to capture a scene or explore your area.</Body>
    <Button title="Return to Context" onPress={() => router.replace('/')} /></Screen>;
}
