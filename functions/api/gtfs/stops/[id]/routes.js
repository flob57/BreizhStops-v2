import {
  json,
  error,
  requireDb
} from "../../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const stopId = decodeURIComponent(context.params.id);

    let result = await db.prepare(
      `SELECT DISTINCT
         r.id AS route_id,
         r.short_name,
         r.long_name,
         r.color,
         r.text_color
       FROM gtfs_stop_routes sr
       JOIN gtfs_routes r ON r.id = sr.route_id
       WHERE sr.stop_id = ?
       ORDER BY r.short_name, r.long_name`
    ).bind(stopId).all();

    if (!(result.results || []).length) {
      result = await db.prepare(
        `SELECT DISTINCT
           r.id AS route_id,
           r.short_name,
           r.long_name,
           r.color,
           r.text_color
         FROM gtfs_pattern_stops ps
         JOIN gtfs_patterns p ON p.id = ps.pattern_id
         JOIN gtfs_routes r ON r.id = p.route_id
         WHERE ps.stop_name = (
           SELECT stop_name
           FROM gtfs_pattern_stops
           WHERE stop_id = ?
           LIMIT 1
         )
         ORDER BY r.short_name, r.long_name`
      ).bind(stopId).all();
    }

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
