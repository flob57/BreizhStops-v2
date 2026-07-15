import {
  json,
  error,
  requireDb
} from "../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const url = new URL(context.request.url);
    const date = url.searchParams.get("date") ||
      new Date().toISOString().slice(0, 10);

    const result = await db.prepare(
      `SELECT
         c.id,
         c.name,
         c.network,
         c.service,
         c.girouette,
         c.start_time,
         c.end_time,
         COUNT(s.id) AS stop_count
       FROM sae_courses c
       LEFT JOIN sae_course_stops s ON s.course_id = c.id
       WHERE c.service_date = ?
       GROUP BY c.id
       ORDER BY c.start_time, c.name`
    ).bind(date).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
