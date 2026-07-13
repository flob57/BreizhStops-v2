import {
  json,
  error,
  requireAdmin,
  requireDb
} from "../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const stopId = decodeURIComponent(context.params.id);

    const detail = await db
      .prepare(
        `SELECT stop_id, notes, status, updated_at
         FROM stop_details
         WHERE stop_id = ?`
      )
      .bind(stopId)
      .first();

    const linesResult = await db
      .prepare(
        `SELECT line_name
         FROM stop_lines
         WHERE stop_id = ?
         ORDER BY line_name`
      )
      .bind(stopId)
      .all();

    const photosResult = await db
      .prepare(
        `SELECT id, object_key, filename, content_type, created_at
         FROM stop_photos
         WHERE stop_id = ?
         ORDER BY created_at DESC`
      )
      .bind(stopId)
      .all();

    return json({
      stop_id: stopId,
      notes: detail?.notes || "",
      status: detail?.status || "",
      updated_at: detail?.updated_at || null,
      lines: (linesResult.results || []).map(row => row.line_name),
      photos: photosResult.results || []
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPut(context) {
  try {
    const denied = requireAdmin(context);

    if (denied) {
      return denied;
    }

    const db = requireDb(context);
    const stopId = decodeURIComponent(context.params.id);
    const body = await context.request.json();

    const notes = String(body.notes || "").slice(0, 10000);
    const status = String(body.status || "").slice(0, 50);
    const lines = Array.isArray(body.lines)
      ? body.lines
          .map(value => String(value).trim().slice(0, 100))
          .filter(Boolean)
      : [];

    const statements = [
      db.prepare(
        `INSERT INTO stop_details (
           stop_id, notes, status, updated_at
         ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(stop_id) DO UPDATE SET
           notes = excluded.notes,
           status = excluded.status,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(stopId, notes, status),

      db.prepare(
        "DELETE FROM stop_lines WHERE stop_id = ?"
      ).bind(stopId),

      ...lines.map(line =>
        db.prepare(
          `INSERT OR IGNORE INTO stop_lines (
             stop_id, line_name
           ) VALUES (?, ?)`
        ).bind(stopId, line)
      )
    ];

    await db.batch(statements);

    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
