import {
  json,
  error,
  requireDb
} from "../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const url = new URL(context.request.url);
    const agencyId = url.searchParams.get("agency_id");

    if (!agencyId) {
      return json([]);
    }

    const result = await db.prepare(
      `SELECT
         id, agency_id, short_name, long_name,
         route_type, color, text_color
       FROM gtfs_routes
       WHERE agency_id = ?
       ORDER BY short_name, long_name`
    ).bind(agencyId).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
