import { json, error, requireDb } from "../../_lib.js";

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS works_routes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Travaux',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    route_type TEXT NOT NULL DEFAULT 'travaux',
    control_points_json TEXT NOT NULL DEFAULT '[]',
    route_points_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await db.prepare(`PRAGMA table_info(works_routes)`).all();
  if (!(columns.results || []).some(column => column.name === 'route_type')) {
    await db.prepare(`ALTER TABLE works_routes ADD COLUMN route_type TEXT NOT NULL DEFAULT 'travaux'`).run();
  }
}

export async function onRequestDelete(context) {
  try {
    const db = requireDb(context);
    await ensureTable(db);
    await db.prepare("DELETE FROM works_routes WHERE id = ?").bind(String(context.params.id)).run();
    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
