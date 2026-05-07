import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import type { BoundingBox } from '../types';

// Jordan plate formats:
//   Private:    2 digits – 4 digits   (e.g. 12-3456)
//   Commercial: 2 digits – 5 digits   (e.g. 12-34567)
//   Also seen:  3 letters + 4-5 digits in some special categories
const JORDAN_PLATE_RE = /^(\d{1,3}[-\s]?\d{4,5}|[A-Z]{1,3}[-\s]?\d{4,5})$/;

const MIN_PLATE_CONFIDENCE_LENGTH = 5; // raw text must be at least 5 chars

/**
 * Heuristic crop: lower 30 % of vehicle bbox, horizontally centred.
 * Returns absolute pixel coords suitable for ImageManipulator.crop.
 */
export function plateCropRegion(
  vehicleBbox: BoundingBox,
  frameW: number,
  frameH: number,
): { originX: number; originY: number; width: number; height: number } {
  const plateH = vehicleBbox.height * 0.3;
  const plateY = vehicleBbox.y + vehicleBbox.height * 0.68;
  const plateW = vehicleBbox.width * 0.7;
  const plateX = vehicleBbox.x + vehicleBbox.width * 0.15;

  return {
    originX: Math.max(0, Math.round(plateX)),
    originY: Math.max(0, Math.round(plateY)),
    width:   Math.min(Math.round(plateW), frameW),
    height:  Math.min(Math.round(plateH), frameH),
  };
}

/**
 * Fix common OCR misreads on licence plates:
 * O↔0, I/l↔1, S↔5, B↔8, Z↔2
 */
export function fixOcrErrors(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')
    .replace(/\s+/g, '-');
}

export function isValidJordanPlate(text: string): boolean {
  const cleaned = text.replace(/\s/g, '').toUpperCase();
  return JORDAN_PLATE_RE.test(cleaned);
}

/**
 * Run ML Kit OCR on a vehicle crop saved to a temp file.
 * Returns the recognised plate string or null.
 */
export async function recognisePlateFromFile(filePath: string): Promise<string | null> {
  try {
    const result = await TextRecognition.recognize(filePath, TextRecognitionScript.LATIN);
    const allText = result.blocks.map((b) => b.text).join(' ').trim();

    if (allText.length < MIN_PLATE_CONFIDENCE_LENGTH) return null;

    // Try each text block individually — the plate is usually a single block
    for (const block of result.blocks) {
      const fixed = fixOcrErrors(block.text.replace(/\s+/g, ''));
      if (isValidJordanPlate(fixed)) return fixed;
    }

    // Fallback: clean the full text and test
    const fixed = fixOcrErrors(allText.replace(/\s+/g, ''));
    return isValidJordanPlate(fixed) ? fixed : null;
  } catch {
    return null;
  }
}

/**
 * Crop a region from a full-frame image URI and run OCR on the crop.
 * @param frameUri  URI of the saved frame snapshot (JPEG)
 */
export async function recognisePlate(
  frameUri: string,
  crop: { originX: number; originY: number; width: number; height: number },
): Promise<string | null> {
  if (crop.width < 20 || crop.height < 8) return null;

  try {
    const cropped = await ImageManipulator.manipulateAsync(
      frameUri,
      [{ crop }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );
    const plate = await recognisePlateFromFile(cropped.uri);

    // Clean up temp crop file
    await FileSystem.deleteAsync(cropped.uri, { idempotent: true });
    return plate;
  } catch {
    return null;
  }
}
