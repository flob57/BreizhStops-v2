import { json, error, requireDb, ensureSettings } from "../../_personal.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    return json({ settings: await ensureSettings(db) });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();
    await ensureSettings(db);
    await db.prepare(
      `UPDATE personal_settings SET
         overtime_balance_minutes = ?,
         overtime_baseline_date = ?,
         paid_leave_n1 = ?,
         paid_leave_n = ?,
         paid_leave_baseline_date = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = 'main'`
    ).bind(
      Math.round(Number(body.overtime_balance_minutes || 0)),
      String(body.overtime_baseline_date || "2026-07-17"),
      Number(body.paid_leave_n1 || 0),
      Number(body.paid_leave_n || 0),
      String(body.paid_leave_baseline_date || "2026-07-17")
    ).run();
    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
