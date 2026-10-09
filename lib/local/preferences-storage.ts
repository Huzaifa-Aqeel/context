import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { decodePreferences, type SavedPreferences } from './preferences';

const storageKey = 'context.preferences.v1';

export function loadLocalPreferences(): SavedPreferences | null {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(storageKey) ?? null
      : (() => { const file = new File(Paths.document, `${storageKey}.json`); return file.exists ? file.textSync() : null; })();
    return decodePreferences(raw);
  } catch { return null; }
}

export function saveLocalPreferences(preferences: SavedPreferences) {
  const raw = JSON.stringify(preferences);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(storageKey, raw);
  else new File(Paths.document, `${storageKey}.json`).write(raw);
}
