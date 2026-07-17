import { json, error, requireDb, createId, isoNow } from "../../_personal.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();
    const action = body.action;

    if (action === "start") {
      const existing = await db.prepare(
        "SELECT id FROM work_sessions WHERE ended_at IS NULL LIMIT 1"
      ).first();
      if (existing) return error("Un poste est déjà en cours.", 409);
      const id = createId("work-");
      await db.prepare(
        `INSERT INTO work_sessions (id, started_at) VALUES (?, ?)`
      ).bind(id, isoNow()).run();
      return json({ ok: true, id });
    }

    if (action === "stop") {
      const driving = await db.prepare(
        "SELECT id FROM driving_sessions WHERE ended_at IS NULL LIMIT 1"
      ).first();
      if (driving) return error("Termine d’abord la session de conduite.", 409);
      const work = await db.prepare(
        "SELECT id FROM work_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
      ).first();
      if (!work) return error("Aucun poste en cours.", 404);
      await db.prepare(
        `UPDATE work_sessions SET ended_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(isoNow(), work.id).run();
      return json({ ok: true });
    }

    return error("Action inconnue.", 400);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
