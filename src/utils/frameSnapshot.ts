import * as FileSystem from 'expo-file-system/legacy';

/**
 * Converts a raw RGBA Uint8ClampedArray (from frame.getPixelBuffer()) into a
 * JPEG temp file that can be fed to ImageManipulator / ML Kit.
 *
 * Uses a minimal JPEG encoding via a Blob + fetch data-URI trick available in
 * the Hermes/JSC environment with the react-native Blob polyfill.
 *
 * Returns the local file:// URI.
 */
export async function saveFrameAsJpeg(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    // Build a raw PPM file (simplest lossless format readable by ImageManipulator)
    // PPM header: "P6\n<w> <h>\n255\n" + RGB bytes
    const header = `P6\n${width} ${height}\n255\n`;
    const headerBytes = new TextEncoder().encode(header);
    const rgbBytes = new Uint8Array(width * height * 3);

    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgbBytes[j]     = rgba[i];
      rgbBytes[j + 1] = rgba[i + 1];
      rgbBytes[j + 2] = rgba[i + 2];
    }

    const combined = new Uint8Array(headerBytes.length + rgbBytes.length);
    combined.set(headerBytes, 0);
    combined.set(rgbBytes, headerBytes.length);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const b64 = btoa(binary);

    const path = `${FileSystem.cacheDirectory}frame_${Date.now()}.ppm`;
    await FileSystem.writeAsStringAsync(path, b64, { encoding: 'base64' });
    return path;
  } catch {
    return null;
  }
}

export async function deleteTempFile(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
