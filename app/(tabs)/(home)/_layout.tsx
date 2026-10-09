import { Stack } from 'expo-router';
import { colors } from '@/components/ui';
import { HomeBackButton } from '@/components/home-back-button';

export default function HomeStack() {
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink,
    contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="camera" options={{ title: 'Capture a scene' }} />
    <Stack.Screen name="scene" options={{ title: '', headerLeft: () => <HomeBackButton /> }} />
    <Stack.Screen name="conversation" options={{ title: 'Ask Context' }} />
  </Stack>;
}
