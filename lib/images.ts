import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export function discardTemporaryFile(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web') return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* OS cache cleanup remains the fallback. */ }
}

export async function prepareImage(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  const ratio = Math.min(1, 1600 / Math.max(width, height));
  context.resize({ width: Math.round(width * ratio), height: Math.round(height * ratio) });
  const image = await context.renderAsync();
  let temporaryUri: string | undefined;
  try {
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    temporaryUri = result.uri;
    if (!result.base64 || result.base64.length > 8_000_000 - 30) throw new Error('This image is too large. Try a smaller image.');
    return `data:image/jpeg;base64,${result.base64}`;
  } finally {
    discardTemporaryFile(temporaryUri);
    image.release();
    context.release();
  }
}
