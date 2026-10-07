import { useCallback, useState } from 'react';
import { useForegroundTask } from './use-foreground-task';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { deriveLocality } from '@/lib/location/locality';
import { useContextStore } from '@/stores/context';

export function useLocality() {
  const setLocality = useContextStore((state) => state.setLocality);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const task = useForegroundTask(useCallback(() => setPending(false), []), false, true);

  async function requestLocality() {
    if (pending) return;
    setPending(true);
    setNotice('Requesting foreground location.');
    const ticket = task.begin();
    try {
      if (AppState.currentState !== 'active') throw new Error('Open Context to use foreground location.');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!ticket.current()) return;
      if (!permission.granted) {
        setLocality(null);
        setNotice('Location permission was not granted. You can still explore a scene or enter an area name.');
        return;
      }
      if (!ticket.current()) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!ticket.current()) return;
      const addresses = await Location.reverseGeocodeAsync(position.coords);
      if (!ticket.current()) return;
      if (!addresses[0]) throw new Error('Your area could not be identified. Enter an area name or continue with a scene.');
      // Drop coordinates and exact address immediately after deriving the locality.
      const locality = deriveLocality(addresses[0]);
      setLocality(locality);
      setNotice(`Area identified: ${Object.values(locality).filter(Boolean).join(', ')}.`);
    } catch {
      if (ticket.current()) setNotice('Your area could not be identified. You can enter an area name or continue with a scene.');
    } finally { if (task.mounted()) setPending(false); }
  }
  return { requestLocality, pending, notice };
}
