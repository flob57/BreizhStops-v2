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
         id,
         name AS nom,
         commune,
         network AS reseau,
         lat,
         lon,
         address,
         trusted,
         manual
       FROM custom_stops
       ORDER BY updated_at DESC`
    ).all();

    return json(
      (result.results || []).map(stop => ({
        ...stop,
        trusted: Boolean(stop.trusted),
        verified_terrain: Boolean(stop.trusted),
        sources: stop.manual
          ? ["Création manuelle"]
          : ["Import D1"]
      }))
    );
  } catch (exception) {
    return error(exception.message, 500);
  }
}
