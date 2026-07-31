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
         overrides.stop_id,
         overrides.custom_name,
         overrides.direction,
         overrides.deleted,
         COALESCE(details.status, '') AS status
       FROM stop_overrides AS overrides
       LEFT JOIN stop_details AS details
         ON details.stop_id = overrides.stop_id`
    ).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
