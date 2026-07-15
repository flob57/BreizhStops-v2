import {
  json,
  error,
  requireDb
} from "../../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const courseId = decodeURIComponent(context.params.id);

    const course = await db.prepare(
      `SELECT
         id,
         notion_page_id,
         service_date,
         name,
         network,
         service,
         girouette,
         start_time,
         end_time,
         source,
         created_at,
         updated_at
       FROM sae_courses
       WHERE id = ?`
    ).bind(courseId).first();

    if (!course) {
      return error("Course introuvable.", 404);
    }

    const stopsResult = await db.prepare(
      `SELECT
         id,
         course_id,
         stop_sequence,
         stop_name AS name,
         scheduled_time,
         commune,
         matched_stop_id,
         lat,
         lon,
         created_at,
         updated_at
       FROM sae_course_stops
       WHERE course_id = ?
       ORDER BY stop_sequence`
    ).bind(courseId).all();

    const stops = (stopsResult.results || []).map(stop => ({
      ...stop,
      name: String(stop.name || "").trim(),
      scheduled_time: String(stop.scheduled_time || "").trim(),
      commune: String(stop.commune || "").trim(),
      lat:
        stop.lat === null || stop.lat === undefined
          ? null
          : Number(stop.lat),
      lon:
        stop.lon === null || stop.lon === undefined
          ? null
          : Number(stop.lon)
    }));

    return json({
      ...course,
      stops
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
