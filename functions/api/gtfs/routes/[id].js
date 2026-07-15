import {
  json,
  error,
  requireDb
} from "../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const row = await db.prepare(
      `SELECT *
       FROM gtfs_routes
       WHERE id = ?`
    ).bind(context.params.id).first();

    if (!row) {
      return error("Ligne introuvable.", 404);
    }

    return json(row);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
