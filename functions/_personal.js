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

export async function ensureSettings(db) {
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
