PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stop_details (
  stop_id TEXT PRIMARY KEY,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stop_lines (
  stop_id TEXT NOT NULL,
  line_name TEXT NOT NULL,
  PRIMARY KEY (stop_id, line_name)
);

CREATE INDEX IF NOT EXISTS idx_stop_lines_stop
ON stop_lines(stop_id);

CREATE TABLE IF NOT EXISTS stop_photos (
  id TEXT PRIMARY KEY,
  stop_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stop_photos_stop
ON stop_photos(stop_id);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#005493',
  visibility TEXT NOT NULL DEFAULT 'private',
  share_token TEXT UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  stops_json TEXT NOT NULL,
  waypoints_json TEXT NOT NULL,
  geometry_json TEXT NOT NULL,
  distance REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_routes_updated
ON routes(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_routes_share
ON routes(share_token);
