import {
  json,
  error,
  requireDb
} from "../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const url = new URL(context.request.url);
    const routeId = url.searchParams.get("route_id");

    if (!routeId) {
      return json([]);
    }

    const result = await db.prepare(
      `SELECT
         id, route_id, direction_id,
         headsign, label, trip_count
       FROM gtfs_patterns
       WHERE route_id = ?
       ORDER BY direction_id, label`
    ).bind(routeId).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
