import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { colors } from './ui';

export function PersonalizationBackButton() {
  return <Pressable accessibilityRole="button" accessibilityLabel="Back to Personalization"
    onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/personalization'); }}
    style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: pressed ? 0.7 : 1 })}>
    <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '600' }}>‹</Text>
  </Pressable>;
}
