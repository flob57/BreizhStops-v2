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
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_works_routes_dates ON works_routes(start_date, end_date)`).run();
}

function parseJson(value) {
  try { return JSON.parse(value || "[]"); } catch { return []; }
}

function normalize(row) {
  return {
    id: row.id,
    title: row.title || "Travaux",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    comment: row.comment || "",
    routeType: row.route_type === 'deviation' ? 'deviation' : 'travaux',
    controlPoints: parseJson(row.control_points_json),
    routePoints: parseJson(row.route_points_json),
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null
  };
}

function cleanPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map(point => ({ lat: Number(point?.lat), lng: Number(point?.lng) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    await ensureTable(db);
    const result = await db.prepare(`SELECT * FROM works_routes ORDER BY title COLLATE NOCASE, updated_at DESC`).all();
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
    const id = String(body?.id || "").trim().slice(0, 180);
    if (!id) return error("Identifiant obligatoire.", 400);

    const controlPoints = cleanPoints(body.controlPoints);
    const routePoints = cleanPoints(body.routePoints);
    if (controlPoints.length < 2) return error("Deux points de contrôle minimum sont requis.", 400);

    const updatedAt = body.updatedAt && !Number.isNaN(Date.parse(body.updatedAt))
      ? new Date(body.updatedAt).toISOString()
      : new Date().toISOString();

    await db.prepare(`INSERT INTO works_routes (
      id, title, start_date, end_date, comment, route_type,
      control_points_json, route_points_json, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      comment = excluded.comment,
      route_type = excluded.route_type,
      control_points_json = excluded.control_points_json,
      route_points_json = excluded.route_points_json,
      updated_at = excluded.updated_at`).bind(
        id,
        String(body.title || "Travaux").slice(0, 300),
        String(body.startDate || "").slice(0, 30),
        String(body.endDate || "").slice(0, 30),
        String(body.comment || "").slice(0, 4000),
        body.routeType === 'deviation' ? 'deviation' : 'travaux',
        JSON.stringify(controlPoints),
        JSON.stringify(routePoints.length >= 2 ? routePoints : controlPoints),
        updatedAt
      ).run();

    return json({ ok: true, id, updatedAt }, 201);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
