import {
  json,
  error,
  requireDb,
  createId
} from "../../../_lib.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();

    const name = String(body.name || "").trim();
    const lat = Number(body.lat);
    const lon = Number(body.lon);

    if (!name) {
      return error("Le nom de l’arrêt est obligatoire.");
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return error("Coordonnées invalides.");
    }

    const id = createId("MANUAL:");

    await db.batch([
      db.prepare(
        `INSERT INTO custom_stops (
           id, name, commune, network, lat, lon,
           trusted, manual, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, 1,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(
        id,
        name,
        String(body.commune || "").trim(),
        String(body.network || "").trim(),
        lat,
        lon
      ),

      db.prepare(
        `INSERT INTO stop_sources (
           source, source_type, source_id, stop_id,
           first_seen_at, last_seen_at
         ) VALUES (?, 'manual', ?, ?,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(
        String(body.source || "Création manuelle").trim(),
        id,
        id
      )
    ]);

    if (String(body.notes || "").trim()) {
      await db.prepare(
        `INSERT INTO stop_details (
           stop_id, notes, status, updated_at
         ) VALUES (?, ?, '', CURRENT_TIMESTAMP)
         ON CONFLICT(stop_id) DO UPDATE SET
           notes = excluded.notes,
           updated_at = CURRENT_TIMESTAMP`
      )
        .bind(id, String(body.notes).trim())
        .run();
    }

    return json({
      id,
      nom: name,
      commune: String(body.commune || "").trim(),
      reseau: String(body.network || "").trim(),
      lat,
      lon,
      trusted: true,
      verified_terrain: true,
      sources: ["Création manuelle"]
    }, 201);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
