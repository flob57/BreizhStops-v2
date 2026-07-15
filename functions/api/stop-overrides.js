import {
  json,
  error,
  requireDb
} from "../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const result = await db.prepare(
      `SELECT
         stop_id,
         custom_name,
         direction,
         deleted
       FROM stop_overrides`
    ).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
