import { includeLocality, localityKey, useContextStore } from '@/stores/context';
import type { LocalityResult } from './foreground';
export async function refreshLocationForRequest(read: (current: () => boolean) => Promise<LocalityResult>, current: () => boolean) {
  let state = useContextStore.getState();
  if (!state.locationEnabled) return { generation: state.generation, warning: undefined };
  const result = await read(current);
  if (!current()) throw new Error('This context request was cancelled.');
  if (result.locality) {
    if (!state.locality || localityKey(state.locality) !== localityKey(result.locality)) state.setLocality(result.locality);
  } else {
    if (result.denied) state.setLocationEnabled(false);
    else state.setLocality(null);
  }
  state = useContextStore.getState();
  return { generation: state.generation, warning: result.warning };
}
export { includeLocality };
