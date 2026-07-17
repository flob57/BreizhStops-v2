import { json, error, requireDb } from "../../_personal.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const result = await db.prepare(
      "SELECT registration FROM vehicles_cache ORDER BY registration"
    ).all();
    return json({ vehicles: (result.results || []).map(r => r.registration) });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
