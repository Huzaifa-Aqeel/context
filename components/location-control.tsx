import { Switch, Text, View } from 'react-native';
import { useLocality } from '@/hooks/use-locality';
import { clearSpokenOutput } from '@/lib/audio/playback';
import { useContextStore } from '@/stores/context';
import { Body, Notice, styles } from './ui';

const explanation = 'Location can help me explain how this scene relates to the area around you. Would you like to enable it?';

export function LocationControl() {
  const { locationEnabled, setLocationEnabled, locality } = useContextStore();
  const { requestLocality, pending, notice } = useLocality();
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={[styles.body, { fontWeight: '700' }]}>Location</Text>
    <Text style={styles.body}>{explanation}</Text>
    <View style={{ minHeight: 56, justifyContent: 'center', alignItems: 'flex-start' }}>
      <Switch accessibilityLabel="Use my location" accessibilityHint="Requests foreground location permission when enabled. Double tap to change."
        accessibilityState={{ disabled: pending }} value={locationEnabled} disabled={pending}
        onValueChange={(value) => { clearSpokenOutput(); setLocationEnabled(value); if (value) void requestLocality(); }} />
    </View>
    {pending ? <Body>Finding your area…</Body> : locality ? <Body>Current area: {Object.values(locality).filter(Boolean).join(', ')}</Body> : locationEnabled ? <Body>Location is on. Your area will be used when available.</Body> : null}
    <Notice text={notice} />
  </View>;
}
