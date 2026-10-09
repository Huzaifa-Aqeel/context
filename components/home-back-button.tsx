import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { colors } from './ui';

export function HomeBackButton() {
  return <Pressable accessibilityRole="button" accessibilityLabel="Back to Home"
    onPress={() => router.replace('/')}
    style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: pressed ? 0.7 : 1 })}>
    <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '600' }}>‹ Home</Text>
  </Pressable>;
}
