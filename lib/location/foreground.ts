import { deriveLocality } from './locality';
import type { Locality } from '@/types/context';
type Permission = { granted: boolean };
export type LocationAdapter = {
  getPermission: () => Promise<Permission>; requestPermission: () => Promise<Permission>;
  getPosition: () => Promise<{ coords: { latitude: number; longitude: number } }>;
  reverseGeocode: (coordinates: { latitude: number; longitude: number }) => Promise<Parameters<typeof deriveLocality>[0][]>;
};
export type LocalityResult = { locality: Locality; warning?: undefined; denied?: undefined } | { locality?: undefined; warning: string; denied?: boolean };
/** Automatic refresh never opens a permission dialog; enabling the preference is explicit. */
export async function readForegroundLocality(adapter: LocationAdapter, current: () => boolean, requestPermission = false): Promise<LocalityResult> {
  const cancelled = () => { if (!current()) throw new Error('Location lookup was cancelled.'); };
  try {
    cancelled();
    let permission = await adapter.getPermission(); cancelled();
    if (!permission.granted && requestPermission) { permission = await adapter.requestPermission(); cancelled(); }
    if (!permission.granted) return { denied: true, warning: 'Device location is unavailable. You can still explore a scene without it.' };
    const position = await adapter.getPosition(); cancelled();
    const addresses = await adapter.reverseGeocode(position.coords); cancelled();
    if (!addresses[0]) throw new Error('No area returned');
    return { locality: deriveLocality(addresses[0]) };
  } catch {
    cancelled();
    return { warning: 'Your area could not be identified. Scene exploration still works without location.' };
  }
}
