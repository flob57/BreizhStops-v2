import {
  json,
  error,
  requireDb,
  parseJson
} from "../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);

    const pattern = await db.prepare(
      `SELECT *
       FROM gtfs_patterns
       WHERE id = ?`
    ).bind(context.params.id).first();

    if (!pattern) {
      return error("Variante introuvable.", 404);
    }

    const route = await db.prepare(
      `SELECT *
       FROM gtfs_routes
       WHERE id = ?`
    ).bind(pattern.route_id).first();

    const stops = await db.prepare(
      `SELECT
         stop_id, stop_sequence AS sequence,
         stop_name AS name, commune, lat, lon
       FROM gtfs_pattern_stops
       WHERE pattern_id = ?
       ORDER BY stop_sequence`
    ).bind(context.params.id).all();

    return json({
      ...pattern,
      shape: parseJson(pattern.shape_json, null),
      route,
      stops: stops.results || []
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
