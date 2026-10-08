import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { MAX_SCENE_IMAGE_DATA_URI_LENGTH } from './image-limits';

export class ImageTooLargeError extends Error {
  constructor() { super('This full-resolution photo is too large to analyze. Choose another photo or move closer and capture only the reference you want to explore.'); }
}

export function discardTemporaryFile(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web') return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* OS cache cleanup remains the fallback. */ }
}

export async function prepareImage(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  const image = await context.renderAsync();
  let temporaryUri: string | undefined;
  try {
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
    temporaryUri = result.uri;
    if (!result.base64) throw new Error('The image could not be prepared.');
    const dataUri = `data:image/jpeg;base64,${result.base64}`;
    if (dataUri.length > MAX_SCENE_IMAGE_DATA_URI_LENGTH) throw new ImageTooLargeError();
    return dataUri;
  } finally {
    discardTemporaryFile(temporaryUri);
    image.release();
    context.release();
  }
}
