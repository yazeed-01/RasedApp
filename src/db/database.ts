import * as SQLite from 'expo-sqlite';
import { CREATE_VIOLATIONS_TABLE, CREATE_READINGS_TABLE } from './schema';
import type { Violation } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('rased.db');
  await db.execAsync(CREATE_VIOLATIONS_TABLE);
  await db.execAsync(CREATE_READINGS_TABLE);
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function insertViolation(v: Violation): Promise<void> {
  await getDb().runAsync(
    `INSERT OR IGNORE INTO violations
      (id, plate, speed_kmh, speed_limit, is_violation, timestamp, camera_id,
       gps_lat, gps_lng, image_path, confidence, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [v.id, v.plate, v.speedKmh, v.speedLimit, v.isViolation ? 1 : 0,
     v.timestamp, v.cameraId, v.gpsLat, v.gpsLng, v.imagePath, v.confidence,
     v.synced ? 1 : 0],
  );
}

export async function deleteViolation(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM violations WHERE id = ?', [id]);
}

export async function updateViolationPlate(id: string, plate: string): Promise<void> {
  await getDb().runAsync('UPDATE violations SET plate = ? WHERE id = ?', [plate, id]);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export interface ViolationFilter {
  violationsOnly?: boolean;
  cameraId?: string;
  dateFrom?: string; // ISO date string
  dateTo?: string;
}

export async function getViolations(
  filter: ViolationFilter = {},
  limit = 100,
  offset = 0,
): Promise<Violation[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.violationsOnly) {
    conditions.push('is_violation = 1');
  }
  if (filter.cameraId) {
    conditions.push('camera_id = ?');
    params.push(filter.cameraId);
  }
  if (filter.dateFrom) {
    conditions.push('timestamp >= ?');
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    conditions.push('timestamp <= ?');
    params.push(filter.dateTo);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const rows = await getDb().getAllAsync<any>(
    `SELECT * FROM violations ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map(rowToViolation);
}

export async function getViolationById(id: string): Promise<Violation | null> {
  const row = await getDb().getFirstAsync<any>(
    'SELECT * FROM violations WHERE id = ?',
    [id],
  );
  return row ? rowToViolation(row) : null;
}

export async function getViolationCount(filter: ViolationFilter = {}): Promise<number> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.violationsOnly) conditions.push('is_violation = 1');
  if (filter.cameraId) { conditions.push('camera_id = ?'); params.push(filter.cameraId); }
  if (filter.dateFrom) { conditions.push('timestamp >= ?'); params.push(filter.dateFrom); }
  if (filter.dateTo)   { conditions.push('timestamp <= ?'); params.push(filter.dateTo); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = await getDb().getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM violations ${where}`,
    params,
  );
  return row?.count ?? 0;
}

export async function getAllViolationsForExport(): Promise<Violation[]> {
  const rows = await getDb().getAllAsync<any>(
    'SELECT * FROM violations ORDER BY timestamp DESC',
  );
  return rows.map(rowToViolation);
}

export async function getDistinctCameraIds(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ camera_id: string }>(
    'SELECT DISTINCT camera_id FROM violations ORDER BY camera_id',
  );
  return rows.map((r) => r.camera_id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToViolation(row: any): Violation {
  return {
    id: row.id,
    plate: row.plate,
    speedKmh: row.speed_kmh,
    speedLimit: row.speed_limit,
    isViolation: row.is_violation === 1,
    timestamp: row.timestamp,
    cameraId: row.camera_id,
    gpsLat: row.gps_lat,
    gpsLng: row.gps_lng,
    imagePath: row.image_path,
    confidence: row.confidence,
    synced: row.synced === 1,
  };
}
