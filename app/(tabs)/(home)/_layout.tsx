import { Stack } from 'expo-router';
import { colors } from '@/components/ui';

export default function HomeStack() {
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink,
    contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="index" options={{ title: 'Context' }} />
    <Stack.Screen name="camera" options={{ title: 'Capture a scene' }} />
    <Stack.Screen name="scene" options={{ headerShown: false }} />
    <Stack.Screen name="conversation" options={{ title: 'Ask Context' }} />
  </Stack>;
}
