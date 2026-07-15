import {
  json,
  error,
  requireDb
} from "../../../../../_lib.js";

export async function onRequestPut(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();
    const stops = Array.isArray(body.stops) ? body.stops : [];

    const statements = stops.map(stop =>
      db.prepare(
        `UPDATE sae_course_stops SET
           matched_stop_id = ?,
           lat = ?,
           lon = ?,
           commune = COALESCE(NULLIF(?, ''), commune),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND course_id = ?`
      ).bind(
        stop.matched_stop_id || null,
        Number(stop.lat),
        Number(stop.lon),
        String(stop.commune || ""),
        stop.id,
        context.params.id
      )
    );

    for (let index = 0; index < statements.length; index += 80) {
      await db.batch(statements.slice(index, index + 80));
    }

    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
