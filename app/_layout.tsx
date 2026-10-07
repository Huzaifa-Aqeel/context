import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/components/ui';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 }, queries: { retry: 1 } } }));
  return <SafeAreaProvider><QueryClientProvider client={queryClient}>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="index" options={{ title: 'Context' }} />
      <Stack.Screen name="camera" options={{ title: 'Capture a scene' }} />
      <Stack.Screen name="scene" options={{ title: 'Scene context' }} />
      <Stack.Screen name="conversation" options={{ title: 'Explore together' }} />
      <Stack.Screen name="location" options={{ title: 'Location context' }} />
      <Stack.Screen name="taste" options={{ title: 'Your cultural interests' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings & privacy' }} />
    </Stack>
  </QueryClientProvider></SafeAreaProvider>;
}
