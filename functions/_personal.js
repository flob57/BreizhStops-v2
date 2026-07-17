import { json, error, requireDb, createId } from "./_lib.js";

export { json, error, requireDb, createId };

export function isoNow() {
  return new Date().toISOString();
}

export function parisDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function dateRangeDays(start, end) {
  const rows = [];
  let cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    rows.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

export function minutesBetween(start, end = new Date().toISOString()) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

export function parseClock(value) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function declaredTotal(body) {
  let total = 0;
  for (const [startKey, endKey] of [
    ["morning_start", "morning_end"],
    ["afternoon_start", "afternoon_end"]
  ]) {
    const start = parseClock(body[startKey]);
    const end = parseClock(body[endKey]);
    if (start !== null && end !== null && end >= start) total += end - start;
  }
  return total;
}

export function sqlDateExpression(column) {
  return `date(${column}, '+2 hours')`;
}


export async function ensurePersonalSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS personal_settings (id TEXT PRIMARY KEY, overtime_balance_minutes INTEGER NOT NULL DEFAULT 0, overtime_baseline_date TEXT NOT NULL DEFAULT '2026-07-17', paid_leave_n1 REAL NOT NULL DEFAULT 0, paid_leave_n REAL NOT NULL DEFAULT 0, paid_leave_baseline_date TEXT NOT NULL DEFAULT '2026-07-17', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS work_sessions (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS driving_sessions (id TEXT PRIMARY KEY, work_session_id TEXT NOT NULL, vehicle_registration TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, km_start INTEGER NOT NULL, km_end INTEGER, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS fuel_fillups (id TEXT PRIMARY KEY, driving_session_id TEXT, vehicle_registration TEXT NOT NULL, filled_at TEXT NOT NULL, odometer_km INTEGER NOT NULL, litres REAL NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS declared_hours (id TEXT PRIMARY KEY, work_date TEXT NOT NULL UNIQUE, morning_start TEXT NOT NULL DEFAULT '', morning_end TEXT NOT NULL DEFAULT '', afternoon_start TEXT NOT NULL DEFAULT '', afternoon_end TEXT NOT NULL DEFAULT '', total_minutes INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS vehicles_cache (id TEXT PRIMARY KEY, notion_page_id TEXT NOT NULL UNIQUE, registration TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_work_sessions_started ON work_sessions(started_at)`,
    `CREATE INDEX IF NOT EXISTS idx_driving_sessions_started ON driving_sessions(started_at)`,
    `CREATE INDEX IF NOT EXISTS idx_fuel_fillups_vehicle ON fuel_fillups(vehicle_registration, odometer_km)`,
    `CREATE INDEX IF NOT EXISTS idx_declared_hours_date ON declared_hours(work_date)`,
    `CREATE INDEX IF NOT EXISTS idx_vehicles_registration ON vehicles_cache(registration)`
  ];
  for (const statement of statements) await db.prepare(statement).run();
  await db.prepare(`INSERT OR IGNORE INTO personal_settings (id, overtime_balance_minutes, overtime_baseline_date, paid_leave_n1, paid_leave_n, paid_leave_baseline_date) VALUES ('main',720,'2026-07-17',28,5,'2026-07-17')`).run();
}

export async function ensureSettings(db) {
  await ensurePersonalSchema(db);
  await db.prepare(
    `INSERT OR IGNORE INTO personal_settings (
       id, overtime_balance_minutes, overtime_baseline_date,
       paid_leave_n1, paid_leave_n, paid_leave_baseline_date
     ) VALUES ('main', 720, '2026-07-17', 28, 5, '2026-07-17')`
  ).run();
  return db.prepare("SELECT * FROM personal_settings WHERE id = 'main'").first();
}

export async function calendarForRange(db, start, end) {
  const result = await db.prepare(
    `SELECT * FROM depot_calendar
     WHERE start_date <= ? AND end_date >= ?
     ORDER BY start_date`
  ).bind(end, start).all();
  return result.results || [];
}

export function calendarEventForDate(events, date) {
  return events.find(e => e.start_date <= date && e.end_date >= date) || null;
}

export function expectedMinutesForDate(date, events) {
  const event = calendarEventForDate(events, date);
  if (event && ["public_holiday", "recovery", "paid_leave"].includes(event.event_type)) {
    return 0;
  }
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5 ? 450 : 0;
}

export function prefillForDate(date, events) {
  const event = calendarEventForDate(events, date);
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (event && ["public_holiday", "recovery", "paid_leave"].includes(event.event_type)) {
    return { morning_start: "", morning_end: "", afternoon_start: "", afternoon_end: "" };
  }
  if (event && event.event_type === "school_holiday") {
    return day >= 1 && day <= 5
      ? { morning_start: "06:30", morning_end: "10:30", afternoon_start: "14:30", afternoon_end: "18:00" }
      : { morning_start: "", morning_end: "", afternoon_start: "", afternoon_end: "" };
  }
  if (day === 3) {
    return { morning_start: "06:15", morning_end: "13:45", afternoon_start: "", afternoon_end: "" };
  }
  if ([1, 2, 4, 5].includes(day)) {
    return { morning_start: "06:15", morning_end: "10:30", afternoon_start: "15:00", afternoon_end: "18:15" };
  }
  return { morning_start: "", morning_end: "", afternoon_start: "", afternoon_end: "" };
}
