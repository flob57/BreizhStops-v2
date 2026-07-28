import { json, error, requireDb } from "../../../_lib.js";

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS my_maps_routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT '',
    line TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#0066cc',
    network_url TEXT NOT NULL DEFAULT '',
    source_name TEXT NOT NULL DEFAULT '',
    segments_json TEXT NOT NULL DEFAULT '[]',
    imported_at TEXT,
    synced_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_my_maps_routes_network_line ON my_maps_routes(network, line)`).run();
}

function normalize(row) {
  let segments = [];
  try { segments = JSON.parse(row.segments_json || "[]"); } catch {}
  return {
    id: row.id,
    name: row.name,
    network: row.network || "",
    line: row.line || "",
    direction: row.direction || "",
    color: row.color || "#0066cc",
    networkUrl: row.network_url || "",
    sourceName: row.source_name || "",
    segments,
    importedAt: row.imported_at || null,
    syncedAt: row.synced_at || null,
    updatedAt: row.updated_at || null
  };
}

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    await ensureTable(db);
    const result = await db.prepare(`SELECT * FROM my_maps_routes ORDER BY network, line, name`).all();
    return json((result.results || []).map(normalize));
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    await ensureTable(db);
    const body = await context.request.json();
    if (!body?.id || !body?.name) return error("Identifiant et nom obligatoires.", 400);

    await db.prepare(`INSERT INTO my_maps_routes (
      id, name, network, line, direction, color, network_url,
      source_name, segments_json, imported_at, synced_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      network = excluded.network,
      line = excluded.line,
      direction = excluded.direction,
      color = excluded.color,
      network_url = excluded.network_url,
      source_name = excluded.source_name,
      segments_json = excluded.segments_json,
      imported_at = COALESCE(excluded.imported_at, my_maps_routes.imported_at),
      synced_at = excluded.synced_at,
      updated_at = CURRENT_TIMESTAMP`).bind(
        String(body.id).slice(0, 160),
        String(body.name).slice(0, 300),
        String(body.network || "").slice(0, 100),
        String(body.line || "").slice(0, 100),
        String(body.direction || "").slice(0, 300),
        String(body.color || "#0066cc").slice(0, 20),
        String(body.networkUrl || "").slice(0, 1500),
        String(body.sourceName || "").slice(0, 300),
        JSON.stringify(Array.isArray(body.segments) ? body.segments : []),
        body.importedAt || null,
        body.syncedAt || null
      ).run();

    return json({ ok: true, id: body.id }, 201);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
