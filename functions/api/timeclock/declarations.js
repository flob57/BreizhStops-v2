import {
  json, error, requireDb, createId, declaredTotal,
  calendarForRange, prefillForDate, parisDate, ensurePersonalSchema} from "../../_personal.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    await ensurePersonalSchema(db);
    const url = new URL(context.request.url);
    const date = url.searchParams.get("date");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    if (date) {
      const existing = await db.prepare(
        "SELECT * FROM declared_hours WHERE work_date = ?"
      ).bind(date).first();
      const events = await calendarForRange(db, date, date);
      return json({
        declaration: existing || null,
        prefill: existing || prefillForDate(date, events),
        calendar_event: events[0] || null
      });
    }

    const from = start || parisDate();
    const to = end || from;
    const result = await db.prepare(
      `SELECT * FROM declared_hours
       WHERE work_date BETWEEN ? AND ?
       ORDER BY work_date DESC`
    ).bind(from, to).all();
    return json({ declarations: result.results || [] });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();
    const date = String(body.work_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return error("Date invalide.", 400);
    const total = declaredTotal(body);
    const id = createId("declared-");

    await db.prepare(
      `INSERT INTO declared_hours (
         id, work_date, morning_start, morning_end,
         afternoon_start, afternoon_end, total_minutes, notes,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(work_date) DO UPDATE SET
         morning_start = excluded.morning_start,
         morning_end = excluded.morning_end,
         afternoon_start = excluded.afternoon_start,
         afternoon_end = excluded.afternoon_end,
         total_minutes = excluded.total_minutes,
         notes = excluded.notes,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(
      id, date,
      String(body.morning_start || ""), String(body.morning_end || ""),
      String(body.afternoon_start || ""), String(body.afternoon_end || ""),
      total, String(body.notes || "").trim()
    ).run();

    return json({ ok: true, total_minutes: total });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
