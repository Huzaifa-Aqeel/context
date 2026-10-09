import * as Location from 'expo-location';

/** User-initiated foreground position. Dining may retain it in active, non-persisted scene memory only. */
export async function devicePosition(current: () => boolean) {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!current()) throw new Error('This location request was cancelled.');
  if (!permission.granted) permission = await Location.requestForegroundPermissionsAsync();
  if (!current()) throw new Error('This location request was cancelled.');
  if (!permission.granted) return undefined;
  const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  if (!current()) throw new Error('This location request was cancelled.');
  return { latitude: result.coords.latitude, longitude: result.coords.longitude };
}
