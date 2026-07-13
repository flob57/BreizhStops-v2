import {
  json,
  error,
  requireDb,
  parseJson
} from "../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);

    const row = await db.prepare(
      `SELECT *
       FROM routes
       WHERE share_token = ?
         AND visibility = 'link'`
    )
      .bind(context.params.token)
      .first();

    if (!row) {
      return error("Lien de partage invalide.", 404);
    }

    return json({
      ...row,
      stops: parseJson(row.stops_json, []),
      waypoints: parseJson(row.waypoints_json, []),
      geometry: parseJson(row.geometry_json, null)
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
