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


CREATE TABLE IF NOT EXISTS sae_courses (
  id TEXT PRIMARY KEY,
  notion_page_id TEXT UNIQUE,
  service_date TEXT NOT NULL,
  name TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  girouette TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'notion',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sae_courses_date
ON sae_courses(service_date);

CREATE TABLE IF NOT EXISTS sae_course_stops (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  stop_name TEXT NOT NULL,
  scheduled_time TEXT NOT NULL DEFAULT '',
  commune TEXT NOT NULL DEFAULT '',
  matched_stop_id TEXT,
  lat REAL,
  lon REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(course_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS idx_sae_course_stops_course
ON sae_course_stops(course_id, stop_sequence);

CREATE TABLE IF NOT EXISTS sae_runs (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  service_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  onboard INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sae_runs_course
ON sae_runs(course_id, service_date);

CREATE TABLE IF NOT EXISTS sae_stop_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  course_stop_id TEXT NOT NULL,
  stop_index INTEGER NOT NULL,
  scheduled_time TEXT NOT NULL DEFAULT '',
  actual_time TEXT NOT NULL,
  delay_seconds INTEGER,
  boardings INTEGER NOT NULL DEFAULT 0,
  alightings INTEGER NOT NULL DEFAULT 0,
  onboard_before INTEGER NOT NULL DEFAULT 0,
  onboard_after INTEGER NOT NULL DEFAULT 0,
  automatic INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sae_stop_events_run
ON sae_stop_events(run_id, stop_index);


CREATE TABLE IF NOT EXISTS stop_overrides (
  stop_id TEXT PRIMARY KEY,
  custom_name TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stop_overrides_deleted
ON stop_overrides(deleted);


-- ============================================================
-- V5.6 — Gestion du dépôt / prises de service
-- ============================================================

CREATE TABLE IF NOT EXISTS depot_calendar (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'school_holiday',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  service_profile TEXT NOT NULL DEFAULT 'vacation',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_depot_calendar_dates
ON depot_calendar(start_date, end_date);

CREATE TABLE IF NOT EXISTS duty_services (
  id TEXT PRIMARY KEY,
  service_date TEXT NOT NULL,
  source_profile TEXT NOT NULL,
  notion_page_id TEXT NOT NULL DEFAULT '',
  ps_time TEXT NOT NULL DEFAULT '',
  qub_reference TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  first_course TEXT NOT NULL DEFAULT '',
  vehicle_registration TEXT NOT NULL DEFAULT '',
  source_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(service_date, source_profile, notion_page_id)
);

CREATE INDEX IF NOT EXISTS idx_duty_services_date
ON duty_services(service_date, ps_time);

CREATE TABLE IF NOT EXISTS duty_validations (
  id TEXT PRIMARY KEY,
  duty_service_id TEXT NOT NULL,
  service_date TEXT NOT NULL,
  validated INTEGER NOT NULL DEFAULT 1,
  validated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(duty_service_id, service_date)
);

CREATE INDEX IF NOT EXISTS idx_duty_validations_date
ON duty_validations(service_date);


-- ============================================================
-- V6.4 — Tableau des départs
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_departures (
  id TEXT PRIMARY KEY,
  service_date TEXT NOT NULL,
  source_profile TEXT NOT NULL,
  source_service_page_id TEXT NOT NULL,
  course_index INTEGER NOT NULL,
  course_page_id TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  course_name TEXT NOT NULL DEFAULT '',
  origin_name TEXT NOT NULL DEFAULT '',
  arrival_time TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  vehicle_registration TEXT NOT NULL DEFAULT '',
  qub_reference TEXT NOT NULL DEFAULT '',
  stops_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(service_date, source_service_page_id, course_index)
);

CREATE INDEX IF NOT EXISTS idx_daily_departures_date_time
ON daily_departures(service_date, departure_time);


-- ============================================================
-- V7.5 — Prise de poste, conduite, pleins et statistiques
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_settings (
  id TEXT PRIMARY KEY,
  overtime_balance_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_baseline_date TEXT NOT NULL DEFAULT '2026-07-17',
  paid_leave_n1 REAL NOT NULL DEFAULT 0,
  paid_leave_n REAL NOT NULL DEFAULT 0,
  paid_leave_baseline_date TEXT NOT NULL DEFAULT '2026-07-17',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO personal_settings (
  id, overtime_balance_minutes, overtime_baseline_date,
  paid_leave_n1, paid_leave_n, paid_leave_baseline_date
) VALUES (
  'main', 720, '2026-07-17', 28, 5, '2026-07-17'
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_started
ON work_sessions(started_at);

CREATE TABLE IF NOT EXISTS driving_sessions (
  id TEXT PRIMARY KEY,
  work_session_id TEXT NOT NULL,
  vehicle_registration TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  km_start INTEGER NOT NULL,
  km_end INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driving_sessions_started
ON driving_sessions(started_at);

CREATE TABLE IF NOT EXISTS fuel_fillups (
  id TEXT PRIMARY KEY,
  driving_session_id TEXT,
  vehicle_registration TEXT NOT NULL,
  filled_at TEXT NOT NULL,
  odometer_km INTEGER NOT NULL,
  litres REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fuel_fillups_vehicle
ON fuel_fillups(vehicle_registration, odometer_km);

CREATE TABLE IF NOT EXISTS declared_hours (
  id TEXT PRIMARY KEY,
  work_date TEXT NOT NULL UNIQUE,
  morning_start TEXT NOT NULL DEFAULT '',
  morning_end TEXT NOT NULL DEFAULT '',
  afternoon_start TEXT NOT NULL DEFAULT '',
  afternoon_end TEXT NOT NULL DEFAULT '',
  total_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_declared_hours_date
ON declared_hours(work_date);

CREATE TABLE IF NOT EXISTS vehicles_cache (
  id TEXT PRIMARY KEY,
  notion_page_id TEXT NOT NULL UNIQUE,
  registration TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicles_registration
ON vehicles_cache(registration);


-- V7.5 — Stationnement
CREATE TABLE IF NOT EXISTS parking_spots (
  notion_page_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  depot TEXT NOT NULL DEFAULT '',
  spot_type TEXT NOT NULL DEFAULT '',
  status_notion TEXT NOT NULL DEFAULT '',
  x REAL,
  y REAL,
  registrations_json TEXT NOT NULL DEFAULT '[]',
  relation_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_parking_spots_depot ON parking_spots(depot);
CREATE INDEX IF NOT EXISTS idx_parking_spots_name ON parking_spots(name);



-- ============================================================
-- V7.5 — Tâches du jour
-- ============================================================

CREATE TABLE IF NOT EXISTS todo_completions (
  id TEXT PRIMARY KEY,
  notion_page_id TEXT NOT NULL,
  completion_date TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notion_page_id, completion_date)
);

CREATE INDEX IF NOT EXISTS idx_todo_completions_date
ON todo_completions(completion_date);

CREATE INDEX IF NOT EXISTS idx_todo_completions_page
ON todo_completions(notion_page_id);
