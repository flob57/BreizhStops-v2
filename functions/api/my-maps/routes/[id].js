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
}

export async function onRequestDelete(context) {
  try {
    const db = requireDb(context);
    await ensureTable(db);
    await db.prepare("DELETE FROM my_maps_routes WHERE id = ?").bind(context.params.id).run();
    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
