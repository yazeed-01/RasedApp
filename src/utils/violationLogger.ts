import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { insertViolation } from '../db/database';
import { plateCropRegion } from './plateOcr';
import type { DetectedVehicle } from '../types';
import type { CameraSettings } from '../types';

const VIOLATIONS_DIR = `${FileSystem.documentDirectory}violations/`;

export async function ensureViolationsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(VIOLATIONS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VIOLATIONS_DIR, { intermediates: true });
  }
}

/**
 * Called when a vehicle track exits the frame.
 * Saves the plate crop image and inserts a DB record.
 */
export async function logVehicleExit(
  vehicle: DetectedVehicle,
  frameUri: string | null,
  frameW: number,
  frameH: number,
  settings: CameraSettings,
): Promise<void> {
  if (!vehicle.speed) return; // no speed measured — skip

  const isViolation = vehicle.speed > settings.speedLimit;

  // Save plate crop image
  let imagePath = '';
  if (frameUri) {
    try {
      const crop = plateCropRegion(vehicle.bbox, frameW, frameH);
      const cropped = await ImageManipulator.manipulateAsync(
        frameUri,
        [{ crop }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      );
      const dest = `${VIOLATIONS_DIR}${vehicle.trackId}_${Date.now()}.jpg`;
      await FileSystem.moveAsync({ from: cropped.uri, to: dest });
      imagePath = dest;
    } catch {
      imagePath = '';
    }
  }

  await insertViolation({
    id: uuidv4(),
    plate: vehicle.plate ?? '',
    speedKmh: Math.round(vehicle.speed),
    speedLimit: settings.speedLimit,
    isViolation,
    timestamp: new Date().toISOString(),
    cameraId: settings.cameraId,
    gpsLat: settings.gpsLat,
    gpsLng: settings.gpsLng,
    imagePath,
    confidence: vehicle.plateConfidence,
    synced: false,
  });
}
