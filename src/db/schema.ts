export const CREATE_VIOLATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS violations (
    id TEXT PRIMARY KEY,
    plate TEXT NOT NULL,
    speed_kmh REAL NOT NULL,
    speed_limit INTEGER NOT NULL,
    is_violation INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    gps_lat REAL NOT NULL DEFAULT 0,
    gps_lng REAL NOT NULL DEFAULT 0,
    image_path TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0,
    synced INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_READINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS readings (
    id TEXT PRIMARY KEY,
    plate TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    speed_kmh REAL NOT NULL,
    gps_lat REAL NOT NULL DEFAULT 0,
    gps_lng REAL NOT NULL DEFAULT 0,
    synced INTEGER NOT NULL DEFAULT 0
  );
`;
