import { useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { deriveLocality } from '@/lib/location/locality';
import { useContextStore } from '@/stores/context';

export function useLocality() {
  const setLocality = useContextStore((state) => state.setLocality);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');

  async function requestLocality() {
    if (pending) return;
    setPending(true);
    setNotice('Requesting foreground location.');
    try {
      if (AppState.currentState !== 'active') throw new Error('Open Context to use foreground location.');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocality(null);
        setNotice('Location permission was not granted. You can still explore a scene or enter an area name.');
        return;
      }
      if (AppState.currentState !== 'active') return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (AppState.currentState !== 'active') return;
      const addresses = await Location.reverseGeocodeAsync(position.coords);
      if (AppState.currentState !== 'active') return;
      if (!addresses[0]) throw new Error('Your area could not be identified. Enter an area name or continue with a scene.');
      // Drop coordinates and exact address immediately after deriving the locality.
      const locality = deriveLocality(addresses[0]);
      setLocality(locality);
      setNotice(`Area identified: ${Object.values(locality).filter(Boolean).join(', ')}.`);
    } catch {
      setNotice('Your area could not be identified. You can enter an area name or continue with a scene.');
    } finally { setPending(false); }
  }
  return { requestLocality, pending, notice };
}
