import {
  json,
  error,
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
