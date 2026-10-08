import { deviceLocality } from '@/lib/location/device';
import { refreshLocationForRequest } from '@/lib/location/session';
import { assertCurrentSession, useContextStore } from '@/stores/context';
import { useForegroundTask } from './use-foreground-task';
export function useContextRequest() {
  const task = useForegroundTask();
  return async () => {
    let ticket = task.begin();
    const location = await refreshLocationForRequest(deviceLocality, ticket.current);
    assertCurrentSession(location.generation);
    // A successful area refresh advances generation; start a ticket for the new snapshot.
    ticket = task.begin();
    if (!ticket.current()) throw new Error('This context request was cancelled.');
    return { state: useContextStore.getState(), current: ticket.current, warning: location.warning };
  };
}
