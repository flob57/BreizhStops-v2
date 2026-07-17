import { json, error, requireDb, declaredTotal } from "../../../_personal.js";

export async function onRequestPatch(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();
    const total = declaredTotal(body);
    await db.prepare(
      `UPDATE declared_hours SET
         morning_start = ?, morning_end = ?,
         afternoon_start = ?, afternoon_end = ?,
         total_minutes = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      String(body.morning_start || ""), String(body.morning_end || ""),
      String(body.afternoon_start || ""), String(body.afternoon_end || ""),
      total, String(body.notes || ""), context.params.id
    ).run();
    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = requireDb(context);
    await db.prepare("DELETE FROM declared_hours WHERE id = ?").bind(context.params.id).run();
    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
