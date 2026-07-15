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


CREATE TABLE IF NOT EXISTS custom_stops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commune TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  trusted INTEGER NOT NULL DEFAULT 0,
  manual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_stops_location
ON custom_stops(lat, lon);

CREATE TABLE IF NOT EXISTS stop_sources (
  source TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_stop_sources_stop
ON stop_sources(stop_id);


CREATE TABLE IF NOT EXISTS gtfs_agencies (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gtfs_routes (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  long_name TEXT NOT NULL DEFAULT '',
  route_type TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '005493',
  text_color TEXT NOT NULL DEFAULT 'FFFFFF',
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gtfs_routes_agency
ON gtfs_routes(agency_id);

CREATE TABLE IF NOT EXISTS gtfs_patterns (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  route_id TEXT NOT NULL,
  direction_id TEXT NOT NULL DEFAULT '',
  headsign TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  shape_json TEXT,
  trip_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gtfs_patterns_route
ON gtfs_patterns(route_id);

CREATE TABLE IF NOT EXISTS gtfs_pattern_stops (
  pattern_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  stop_name TEXT NOT NULL,
  commune TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  PRIMARY KEY(pattern_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS idx_gtfs_pattern_stops_stop
ON gtfs_pattern_stops(stop_id);

CREATE TABLE IF NOT EXISTS gtfs_stop_routes (
  stop_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  PRIMARY KEY(stop_id, route_id)
);

CREATE INDEX IF NOT EXISTS idx_gtfs_stop_routes_stop
ON gtfs_stop_routes(stop_id);

CREATE TABLE IF NOT EXISTS gtfs_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  agencies INTEGER NOT NULL DEFAULT 0,
  routes INTEGER NOT NULL DEFAULT 0,
  patterns INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
