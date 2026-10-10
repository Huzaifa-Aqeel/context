import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, Text, View } from 'react-native';
import { colors, styles } from './ui';

export function SceneGuidanceDisclosure({ text, expanded, onToggle }: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const guidance = useRef<Text>(null);
  const focusRequested = useRef(false);
  useEffect(() => {
    if (!expanded || !focusRequested.current || Platform.OS === 'web') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        if (!enabled || cancelled || !guidance.current) return;
        const handle = findNodeHandle(guidance.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }).catch(() => {});
      focusRequested.current = false;
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [expanded]);
  return <View style={{ gap: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="What can I ask Context?"
      accessibilityHint={expanded ? 'Hides suggestions for exploring this scene.' : 'Shows suggestions for exploring this scene.'}
      accessibilityState={{ expanded }}
      onPress={() => { focusRequested.current = !expanded; onToggle(); }}
      style={{ minHeight: 56, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={[styles.body, { color: colors.accent, textDecorationLine: 'underline', fontWeight: '600' }]}>What can I ask Context?</Text>
    </Pressable>
    {expanded && <Text ref={guidance} style={styles.body}
      accessibilityLabel={`Ask Context guidance. ${text}`}
      accessibilityLiveRegion={Platform.OS === 'web' ? 'polite' : 'none'}>{text}</Text>}
  </View>;
}
