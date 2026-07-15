import {
  json,
  error,
  requireDb
} from "../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const result = await db.prepare(
      `SELECT id, name, url, timezone
       FROM gtfs_agencies
       ORDER BY name`
    ).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
