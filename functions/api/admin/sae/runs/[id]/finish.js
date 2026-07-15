import {
  json,
  error,
  requireDb
} from "../../../../../_lib.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();

    await db.prepare(
      `UPDATE sae_runs SET
         status = 'finished',
         finished_at = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      String(body.finished_at || new Date().toISOString()),
      context.params.id
    ).run();

    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
