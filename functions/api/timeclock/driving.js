import { json, error, requireDb, createId, isoNow, ensurePersonalSchema} from "../../_personal.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    await ensurePersonalSchema(db);
    const body = await context.request.json();

    if (body.action === "start") {
      const work = await db.prepare(
        "SELECT id FROM work_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
      ).first();
      if (!work) return error("Prends d’abord ton poste.", 409);
      const existing = await db.prepare(
        "SELECT id FROM driving_sessions WHERE ended_at IS NULL LIMIT 1"
      ).first();
      if (existing) return error("Une conduite est déjà en cours.", 409);

      const registration = String(body.vehicle_registration || "").trim().toUpperCase();
      const kmStart = Number(body.km_start);
      if (!registration || !Number.isFinite(kmStart) || kmStart < 0) {
        return error("Véhicule et kilométrage de départ obligatoires.", 400);
      }

      const id = createId("drive-");
      await db.prepare(
        `INSERT INTO driving_sessions (
           id, work_session_id, vehicle_registration, started_at, km_start
         ) VALUES (?, ?, ?, ?, ?)`
      ).bind(id, work.id, registration, isoNow(), Math.round(kmStart)).run();
      return json({ ok: true, id });
    }

    if (body.action === "stop") {
      const driving = await db.prepare(
        "SELECT * FROM driving_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
      ).first();
      if (!driving) return error("Aucune conduite en cours.", 404);
      const kmEnd = Number(body.km_end);
      if (!Number.isFinite(kmEnd) || kmEnd < Number(driving.km_start)) {
        return error("Le kilométrage de fin doit être supérieur ou égal au départ.", 400);
      }
      await db.prepare(
        `UPDATE driving_sessions
         SET ended_at = ?, km_end = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(isoNow(), Math.round(kmEnd), driving.id).run();
      return json({ ok: true });
    }

    return error("Action inconnue.", 400);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
