import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/components/ui';
import { loadLocalPreferences, saveLocalPreferences } from '@/lib/local/preferences-storage';
import { preferencesFromState } from '@/lib/local/preferences';
import { useContextStore } from '@/stores/context';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 }, queries: { retry: 1 } } }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const saved = loadLocalPreferences();
    if (saved) useContextStore.getState().restorePreferences(saved);
    let previous = JSON.stringify(preferencesFromState(useContextStore.getState()));
    const unsubscribe = useContextStore.subscribe((state) => {
      const next = preferencesFromState(state);
      const serialized = JSON.stringify(next);
      if (serialized === previous) return;
      saveLocalPreferences(next);
      previous = serialized;
    });
    queueMicrotask(() => { if (active) setReady(true); });
    return () => { active = false; unsubscribe(); };
  }, []);
  if (!ready) return null;
  return <SafeAreaProvider><QueryClientProvider client={queryClient}>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  </QueryClientProvider></SafeAreaProvider>;
}
