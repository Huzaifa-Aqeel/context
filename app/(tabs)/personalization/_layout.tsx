import { Stack } from 'expo-router';
import { colors } from '@/components/ui';

export default function PersonalizationStack() {
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink,
    contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="index" options={{ title: 'Personalization' }} />
    <Stack.Screen name="taste" options={{ title: 'Taste profile' }} />
  </Stack>;
}
