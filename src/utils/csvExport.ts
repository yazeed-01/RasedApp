import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getAllViolationsForExport } from '../db/database';
import type { Violation } from '../types';

const CSV_HEADERS = [
  'ID', 'Plate', 'Speed (km/h)', 'Speed Limit', 'Is Violation',
  'Timestamp', 'Camera ID', 'GPS Lat', 'GPS Lng', 'Image Path', 'Confidence',
].join(',');

function escapeCsv(val: string | number | boolean): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(v: Violation): string {
  return [
    v.id, v.plate, v.speedKmh, v.speedLimit, v.isViolation,
    v.timestamp, v.cameraId, v.gpsLat, v.gpsLng, v.imagePath, v.confidence,
  ].map(escapeCsv).join(',');
}

export async function exportViolationsCsv(): Promise<void> {
  const violations = await getAllViolationsForExport();
  if (violations.length === 0) throw new Error('No records to export.');

  const lines = [CSV_HEADERS, ...violations.map(rowToCsv)];
  const csv = lines.join('\n');

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Cache directory unavailable.');

  const filename = `rased_violations_${Date.now()}.csv`;
  const path = `${cacheDir}${filename}`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: 'utf8' });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing not available on this device.');

  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Violations CSV',
    UTI: 'public.comma-separated-values-text',
  });

  // Clean up after share sheet is dismissed
  await FileSystem.deleteAsync(path, { idempotent: true });
}
