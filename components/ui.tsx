import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = { ink: '#182C30', paper: '#F6F3EC', muted: '#475D60', border: '#C1CDC7', accent: '#91401F', surface: '#FFFFFF' };

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </SafeAreaView>;
}
export function Heading({ children }: PropsWithChildren) { return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>; }
export function Body({ children }: PropsWithChildren) { return <Text style={styles.body}>{children}</Text>; }
export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function Notice({ text }: { text?: string }) {
  useEffect(() => { if (text && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text); }, [text]);
  return text ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{text}</Text> : null;
}
export function Button({ title, onPress, disabled = false, secondary = false, hint }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.disabled,
      pressed && styles.pressed, focused && styles.focused]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  page: { padding: 24, gap: 18, width: '100%', maxWidth: 680, alignSelf: 'center', paddingBottom: 48 },
  heading: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: colors.ink },
  body: { fontSize: 18, lineHeight: 28, color: colors.ink },
  small: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: { padding: 20, borderRadius: 18, backgroundColor: colors.surface, gap: 14, borderWidth: 1, borderColor: colors.border },
  button: { minHeight: 56, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  buttonText: { color: '#FFFFFF', fontSize: 18, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  secondaryText: { color: colors.ink },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.75 }, focused: { borderColor: colors.accent },
  notice: { color: colors.accent, fontSize: 17, lineHeight: 26 },
  input: { minHeight: 56, borderWidth: 2, borderColor: colors.muted, borderRadius: 12, padding: 16, fontSize: 18, color: colors.ink, backgroundColor: colors.surface },
});
