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
         COUNT(s.id) AS stop_count,
         (
           SELECT r.id
           FROM sae_runs r
           WHERE r.course_id = c.id
             AND r.service_date = c.service_date
           ORDER BY
             CASE WHEN r.status = 'finished' THEN 0 ELSE 1 END,
             r.started_at DESC
           LIMIT 1
         ) AS run_id,
         (
           SELECT r.status
           FROM sae_runs r
           WHERE r.course_id = c.id
             AND r.service_date = c.service_date
           ORDER BY
             CASE WHEN r.status = 'finished' THEN 0 ELSE 1 END,
             r.started_at DESC
           LIMIT 1
         ) AS run_status,
         (
           SELECT COUNT(*)
           FROM sae_stop_events e
           JOIN sae_runs r ON r.id = e.run_id
           WHERE r.course_id = c.id
             AND r.service_date = c.service_date
             AND r.id = (
               SELECT r2.id
               FROM sae_runs r2
               WHERE r2.course_id = c.id
                 AND r2.service_date = c.service_date
               ORDER BY
                 CASE WHEN r2.status = 'finished' THEN 0 ELSE 1 END,
                 r2.started_at DESC
               LIMIT 1
             )
         ) AS recorded_stop_count
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
