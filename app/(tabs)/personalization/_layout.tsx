import { Stack } from 'expo-router';
import { colors } from '@/components/ui';
import { PersonalizationBackButton } from '@/components/personalization-back-button';

export default function PersonalizationStack() {
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink,
    contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="taste" options={{ title: 'Personalization', headerLeft: () => <PersonalizationBackButton /> }} />
  </Stack>;
}
