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
    const source = String(body.source || "GTFS complet").slice(0, 200);

    const agencies = Array.isArray(body.agencies) ? body.agencies : [];
    const routes = Array.isArray(body.routes) ? body.routes : [];
    const patterns = Array.isArray(body.patterns) ? body.patterns : [];

    for (const agency of agencies) {
      await db.prepare(
        `INSERT INTO gtfs_agencies (
           id, source, name, url, timezone,
           first_seen_at, last_seen_at
         ) VALUES (?, ?, ?, ?, ?,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           name = excluded.name,
           url = excluded.url,
           timezone = excluded.timezone,
           last_seen_at = CURRENT_TIMESTAMP`
      ).bind(
        String(agency.id),
        source,
        String(agency.name || "Réseau"),
        String(agency.url || ""),
        String(agency.timezone || "Europe/Paris")
      ).run();
    }

    for (const route of routes) {
      await db.prepare(
        `INSERT INTO gtfs_routes (
           id, source, agency_id, short_name, long_name,
           route_type, color, text_color,
           first_seen_at, last_seen_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           agency_id = excluded.agency_id,
           short_name = excluded.short_name,
           long_name = excluded.long_name,
           route_type = excluded.route_type,
           color = excluded.color,
           text_color = excluded.text_color,
           last_seen_at = CURRENT_TIMESTAMP`
      ).bind(
        String(route.id),
        source,
        String(route.agency_id || "default"),
        String(route.short_name || ""),
        String(route.long_name || ""),
        String(route.route_type || ""),
        String(route.color || "005493"),
        String(route.text_color || "FFFFFF")
      ).run();
    }

    let stopRouteCount = 0;

    for (const pattern of patterns) {
      await db.prepare(
        `INSERT INTO gtfs_patterns (
           id, source, route_id, direction_id,
           headsign, label, shape_json, trip_count,
           first_seen_at, last_seen_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           route_id = excluded.route_id,
           direction_id = excluded.direction_id,
           headsign = excluded.headsign,
           label = excluded.label,
           shape_json = excluded.shape_json,
           trip_count = excluded.trip_count,
           last_seen_at = CURRENT_TIMESTAMP`
      ).bind(
        String(pattern.id),
        source,
        String(pattern.route_id),
        String(pattern.direction_id || ""),
        String(pattern.headsign || ""),
        String(pattern.label || ""),
        pattern.shape ? JSON.stringify(pattern.shape) : null,
        Number(pattern.trip_count || 0)
      ).run();

      await db.prepare(
        "DELETE FROM gtfs_pattern_stops WHERE pattern_id = ?"
      ).bind(String(pattern.id)).run();

      const statements = [];

      for (const stop of pattern.stops || []) {
        statements.push(
          db.prepare(
            `INSERT INTO gtfs_pattern_stops (
               pattern_id, stop_id, stop_sequence,
               stop_name, commune, lat, lon
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            String(pattern.id),
            String(stop.stop_id),
            Number(stop.sequence || 0),
            String(stop.name || "Arrêt"),
            String(stop.commune || ""),
            Number(stop.lat),
            Number(stop.lon)
          )
        );

        statements.push(
          db.prepare(
            `INSERT OR IGNORE INTO gtfs_stop_routes (
               stop_id, route_id
             ) VALUES (?, ?)`
          ).bind(
            String(stop.stop_id),
            String(pattern.route_id)
          )
        );

        stopRouteCount++;
      }

      for (let index = 0; index < statements.length; index += 80) {
        await db.batch(statements.slice(index, index + 80));
      }
    }

    await db.prepare(
      `INSERT INTO gtfs_imports (
         id, source, agencies, routes, patterns, imported_at
       ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
      createId("import-"),
      source,
      agencies.length,
      routes.length,
      patterns.length
    ).run();

    return json({
      agencies: agencies.length,
      routes: routes.length,
      patterns: patterns.length,
      stop_routes: stopRouteCount
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
