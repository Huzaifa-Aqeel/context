import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { VoicePhase } from '@/lib/taste/conversation';
import { colors } from './ui';

/** Decorative motion; the adjacent live text communicates every state without color. */
export function VoiceOrb({ phase, level }: { phase: VoicePhase; level?: number }) {
  const { height, width } = useWindowDimensions();
  const diameter = Math.max(152, Math.min(248, height - 560, width - 56));
  const [scale] = useState(() => new Animated.Value(1));
  const [halo] = useState(() => new Animated.Value(0.35));
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    scale.stopAnimation(); halo.stopAnimation(); scale.setValue(1); halo.setValue(0.35);
    if (reducedMotion || phase === 'idle') return;
    const duration = phase === 'speaking' ? 650 : phase === 'processing' ? 1600 : 1000;
    const motion = Animated.loop(Animated.parallel([
      Animated.sequence([Animated.timing(scale, { toValue: phase === 'speaking' ? 1.08 : 1.04, duration, useNativeDriver: true }), Animated.timing(scale, { toValue: 1, duration, useNativeDriver: true })]),
      Animated.sequence([Animated.timing(halo, { toValue: 0.65, duration, useNativeDriver: true }), Animated.timing(halo, { toValue: 0.25, duration, useNativeDriver: true })]),
    ]));
    motion.start(); return () => motion.stop();
  }, [phase, reducedMotion, scale, halo]);
  const amplitude = phase === 'listening' ? !reducedMotion && level !== undefined ? Math.max(0, Math.min(1, (level + 60) / 50)) : 0.6 : phase === 'speaking' ? 0.7 : 0.2;
  const activeColor = phase === 'listening' ? colors.accent : colors.ink;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[orbStyles.space, { width: diameter, height: diameter }]}>
    <Animated.View style={[orbStyles.halo, { width: diameter - 10, height: diameter - 10, borderRadius: (diameter - 10) / 2, borderColor: activeColor, opacity: halo, transform: [{ scale }] }]} />
    <Animated.View style={[orbStyles.orb, { width: diameter - 44, height: diameter - 44, borderRadius: (diameter - 44) / 2, backgroundColor: activeColor, transform: [{ scale }] }]}>
      <View style={orbStyles.wave}>
        {[0.45, 0.8, 1, 0.8, 0.45].map((factor, index) => <View key={index} style={[orbStyles.bar, { height: 12 + 52 * amplitude * factor, opacity: phase === 'idle' ? 0.55 : 0.95 }]} />)}
      </View>
    </Animated.View>
  </View>;
}
const orbStyles = StyleSheet.create({
  space: { width: 248, height: 248, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 238, height: 238, borderRadius: 119, borderWidth: 2 },
  orb: { width: 204, height: 204, borderRadius: 102, alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: '#FFFFFF33', boxShadow: '0 14px 40px rgba(24, 44, 48, 0.16)' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 80 },
  bar: { width: 8, borderRadius: 5, backgroundColor: colors.paper },
});
