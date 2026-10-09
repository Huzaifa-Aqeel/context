import { deviceLocality } from '@/lib/location/device';
import { refreshLocationForRequest } from '@/lib/location/session';
import { assertCurrentSession, useContextStore } from '@/stores/context';
import { asksAboutArea, asksForAreaDiscovery, asksForDiningDiscovery, asksForPracticalLookup } from '@/lib/orchestration/intent';
import { useForegroundTask } from './use-foreground-task';
export function useContextRequest() {
  const task = useForegroundTask();
  return async (question?: string) => {
    let ticket = task.begin();
    const active = useContextStore.getState().scene;
    const location = question && !active?.event && !active?.dining && !active?.area && asksAboutArea(question)
      && !asksForDiningDiscovery(question) && !asksForAreaDiscovery(question) && !asksForPracticalLookup(question)
      ? await refreshLocationForRequest(deviceLocality, ticket.current) : { generation: useContextStore.getState().generation, warning: undefined };
    assertCurrentSession(location.generation);
    // A successful area refresh advances generation; start a ticket for the new snapshot.
    ticket = task.begin();
    if (!ticket.current()) throw new Error('This context request was cancelled.');
    return { state: useContextStore.getState(), current: ticket.current, warning: location.warning };
  };
}
