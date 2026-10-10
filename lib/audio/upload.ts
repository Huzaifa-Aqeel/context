import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export async function recordingFormData(uri: string, filename: string, signal?: AbortSignal): Promise<FormData> {
  const form = new FormData();
  const audio = Platform.OS === 'web'
    ? await (await fetch(uri, { signal })).blob()
    : new Blob([await new File(uri).bytes()], { type: 'audio/mp4' });
  form.append('audio', audio, Platform.OS === 'web' ? `${filename}.webm` : `${filename}.m4a`);
  return form;
}
