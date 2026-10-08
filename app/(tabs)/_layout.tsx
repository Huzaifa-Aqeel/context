import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/components/ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function CompactTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
    {state.routes.map((route, index) => {
      const selected = state.index === index;
      const options = descriptors[route.key].options;
      const label = route.name === 'personalization' ? 'Personalization' : 'Home';
      return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={`${label} tab`}
        accessibilityState={{ selected }} aria-selected={selected} onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!event.defaultPrevented) navigation.navigate(route.name, { screen: 'index' });
        }} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        testID={options.tabBarButtonTestID} style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}>
        <Text style={[styles.label, !selected && styles.inactive]}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

export default function MainTabs() {
  return <Tabs tabBar={(props) => <CompactTabBar {...props} />} screenOptions={{
    headerShown: false,
    sceneStyle: { backgroundColor: colors.paper },
  }}>
    <Tabs.Screen name="(home)" options={{ title: 'Context' }} />
    <Tabs.Screen name="personalization" options={{ title: 'Personalization' }} />
  </Tabs>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 72, paddingTop: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.paper },
  tab: { minHeight: 56, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 2, borderColor: 'transparent', flexShrink: 1 },
  selected: { backgroundColor: colors.surface, borderColor: colors.ink },
  pressed: { opacity: 0.7 },
  label: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  inactive: { color: colors.muted },
});
