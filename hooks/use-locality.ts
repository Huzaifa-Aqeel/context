import { useCallback, useState } from 'react';
import { useForegroundTask } from './use-foreground-task';
import { deviceLocality } from '@/lib/location/device';
import { localityKey, useContextStore } from '@/stores/context';

export function useLocality() {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const task = useForegroundTask(useCallback(() => setPending(false), []), false, true);
  async function requestLocality() {
    if (pending) return;
    setPending(true); setNotice('Requesting foreground location.');
    const ticket = task.begin();
    try {
      const result = await deviceLocality(ticket.current, true);
      if (!ticket.current()) return;
      if (result.locality) {
        const state = useContextStore.getState();
        if (!state.locationEnabled) state.setLocationEnabled(true);
        if (!state.locality || localityKey(state.locality) !== localityKey(result.locality)) useContextStore.getState().setLocality(result.locality);
        setNotice(`Area available: ${Object.values(result.locality).filter(Boolean).join(', ')}.`);
      } else {
        if (result.denied) useContextStore.getState().setLocationEnabled(false);
        setNotice(result.warning);
      }
    } catch { if (ticket.current()) setNotice('Location lookup was cancelled. Scene exploration still works without location.'); }
    finally { if (task.mounted() && ticket.current()) setPending(false); }
  }
  return { requestLocality, pending, notice };
}
