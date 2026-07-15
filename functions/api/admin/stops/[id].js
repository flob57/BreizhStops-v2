import {
  json,
  error,
  requireDb
} from "../../../_lib.js";

export async function onRequestPut(context) {
  try {
    const db = requireDb(context);
    const stopId = decodeURIComponent(context.params.id);
    const body = await context.request.json();

    const notes = String(body.notes || "").slice(0, 10000);
    const status = String(body.status || "").slice(0, 50);
    const customName = String(body.name || "").trim().slice(0, 300);
    const direction = ["entrant", "sortant"].includes(body.direction)
      ? body.direction
      : "";

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
        `INSERT INTO stop_overrides (
           stop_id, custom_name, direction, deleted, updated_at
         ) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
         ON CONFLICT(stop_id) DO UPDATE SET
           custom_name = excluded.custom_name,
           direction = excluded.direction,
           deleted = 0,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(stopId, customName, direction),

      db.prepare("DELETE FROM stop_lines WHERE stop_id = ?").bind(stopId),

      ...lines.map(line =>
        db.prepare(
          `INSERT OR IGNORE INTO stop_lines (
             stop_id, line_name
           ) VALUES (?, ?)`
        ).bind(stopId, line)
      )
    ];

    await db.batch(statements);

    return json({
      ok: true,
      name: customName,
      direction
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = requireDb(context);
    const stopId = decodeURIComponent(context.params.id);

    await db.prepare(
      `INSERT INTO stop_overrides (
         stop_id, custom_name, direction, deleted, updated_at
       ) VALUES (?, '', '', 1, CURRENT_TIMESTAMP)
       ON CONFLICT(stop_id) DO UPDATE SET
         deleted = 1,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(stopId).run();

    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
