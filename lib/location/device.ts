import * as Location from 'expo-location';
import { readForegroundLocality } from './foreground';
export const deviceLocality = (current: () => boolean, requestPermission = false) => readForegroundLocality({
  getPermission: Location.getForegroundPermissionsAsync, requestPermission: Location.requestForegroundPermissionsAsync,
  getPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), reverseGeocode: Location.reverseGeocodeAsync,
}, current, requestPermission);
