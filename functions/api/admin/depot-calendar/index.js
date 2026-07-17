import {
  json,
  error,
  requireDb,
  createId
} from "../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const result = await db.prepare(
      `SELECT
         id,
         label,
         event_type,
         start_date,
         end_date,
         service_profile,
         notes
       FROM depot_calendar
       ORDER BY start_date, end_date`
    ).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();

    const label = String(body.label || "").trim();
    const eventType = ["school_holiday", "public_holiday", "recovery", "paid_leave"]
      .includes(body.event_type)
      ? body.event_type
      : "school_holiday";

    const startDate = String(body.start_date || "");
    const endDate = String(body.end_date || startDate);
    const serviceProfile = ["vacation", "none", "lmjv", "wednesday"]
      .includes(body.service_profile)
      ? body.service_profile
      : "vacation";

    if (!label || !startDate || !endDate) {
      return error("Nom et dates obligatoires.", 400);
    }

    const id = createId("calendar-");

    await db.prepare(
      `INSERT INTO depot_calendar (
         id,
         label,
         event_type,
         start_date,
         end_date,
         service_profile,
         notes,
         created_at,
         updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?,
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
       )`
    ).bind(
      id,
      label,
      eventType,
      startDate,
      endDate,
      serviceProfile,
      String(body.notes || "").trim()
    ).run();

    return json({ ok: true, id });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
