import { createMMKV } from 'react-native-mmkv';
import type { CameraSettings } from '../types';

const storage = createMMKV({ id: 'rased-settings' });

const DEFAULTS: CameraSettings = {
  cameraId: 'camera-1',
  speedLimit: 80,
  gpsLat: 0,
  gpsLng: 0,
  calibrationData: null,
  detectorModel: 'yolov8n',
  testSceneMetresPerPixel: 0.0005,
};

export function getSettings(): CameraSettings {
  const raw = storage.getString('settings');
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Partial<CameraSettings>): void {
  const current = getSettings();
  storage.set('settings', JSON.stringify({ ...current, ...settings }));
}

export function resetSettings(): void {
  storage.set('settings', JSON.stringify(DEFAULTS));
}
