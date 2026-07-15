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

    const source = String(body.source || "Source importée").slice(0, 200);
    const sourceType = String(body.source_type || "").slice(0, 50);
    const stops = Array.isArray(body.stops) ? body.stops : [];

    if (!stops.length) {
      return error("Aucun arrêt à importer.");
    }

    const stats = {
      added: 0,
      linked: 0,
      updated: 0
    };

    for (const imported of stops) {
      const sourceId = String(imported.source_id || "").slice(0, 300);

      if (!sourceId) {
        continue;
      }

      const existingMapping = await db.prepare(
        `SELECT stop_id
         FROM stop_sources
         WHERE source = ? AND source_id = ?`
      )
        .bind(source, sourceId)
        .first();

      if (existingMapping) {
        await db.prepare(
          `UPDATE stop_sources
           SET last_seen_at = CURRENT_TIMESTAMP
           WHERE source = ? AND source_id = ?`
        )
          .bind(source, sourceId)
          .run();

        const custom = await db.prepare(
          "SELECT id FROM custom_stops WHERE id = ?"
        )
          .bind(existingMapping.stop_id)
          .first();

        if (custom) {
          await db.prepare(
            `UPDATE custom_stops SET
               name = COALESCE(NULLIF(?, ''), name),
               commune = COALESCE(NULLIF(?, ''), commune),
               network = COALESCE(NULLIF(?, ''), network),
               lat = ?,
               lon = ?,
               address = COALESCE(NULLIF(?, ''), address),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
            .bind(
              String(imported.name || "").slice(0, 300),
              String(imported.commune || "").slice(0, 200),
              String(imported.network || "").slice(0, 200),
              Number(imported.lat),
              Number(imported.lon),
              String(imported.address || "").slice(0, 1000),
              existingMapping.stop_id
            )
            .run();

          stats.updated++;
        } else {
          stats.linked++;
        }

        continue;
      }

      if (imported.matched_stop_id) {
        await db.prepare(
          `INSERT INTO stop_sources (
             source, source_type, source_id, stop_id,
             first_seen_at, last_seen_at
           ) VALUES (?, ?, ?, ?,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
          .bind(
            source,
            sourceType,
            sourceId,
            String(imported.matched_stop_id)
          )
          .run();

        stats.linked++;
        continue;
      }

      const lat = Number(imported.lat);
      const lon = Number(imported.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      const id = createId("IMPORT:");

      await db.batch([
        db.prepare(
          `INSERT INTO custom_stops (
             id, name, commune, network, lat, lon,
             address, trusted, manual,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        ).bind(
          id,
          String(imported.name || "Arrêt importé").slice(0, 300),
          String(imported.commune || "").slice(0, 200),
          String(imported.network || "").slice(0, 200),
          lat,
          lon,
          String(imported.address || "").slice(0, 1000),
          sourceType === "inroute" ? 1 : 0
        ),

        db.prepare(
          `INSERT INTO stop_sources (
             source, source_type, source_id, stop_id,
             first_seen_at, last_seen_at
           ) VALUES (?, ?, ?, ?,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        ).bind(source, sourceType, sourceId, id)
      ]);

      stats.added++;
    }

    return json(stats);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
