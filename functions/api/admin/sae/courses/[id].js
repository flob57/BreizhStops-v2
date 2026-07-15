import {
  json,
  error,
  requireDb
} from "../../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const course = await db.prepare(
      `SELECT * FROM sae_courses WHERE id = ?`
    ).bind(context.params.id).first();

    if (!course) {
      return error("Course introuvable.", 404);
    }

    const stops = await db.prepare(
      `SELECT *
       FROM sae_course_stops
       WHERE course_id = ?
       ORDER BY stop_sequence`
    ).bind(context.params.id).all();

    return json({
      ...course,
      stops: stops.results || []
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
