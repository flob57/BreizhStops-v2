import { json, error, requireDb, createId, isoNow, ensurePersonalSchema} from "../../_personal.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    await ensurePersonalSchema(db);
    const body = await context.request.json();
    const driving = await db.prepare(
      "SELECT * FROM driving_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    ).first();
    if (!driving) return error("Aucune conduite en cours.", 409);

    const km = Number(body.odometer_km);
    const litres = Number(body.litres);
    if (!Number.isFinite(km) || km < Number(driving.km_start)) {
      return error("Kilométrage du plein invalide.", 400);
    }
    if (!Number.isFinite(litres) || litres <= 0) {
      return error("Litrage invalide.", 400);
    }

    const id = createId("fuel-");
    await db.prepare(
      `INSERT INTO fuel_fillups (
         id, driving_session_id, vehicle_registration,
         filled_at, odometer_km, litres, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, driving.id, driving.vehicle_registration,
      isoNow(), Math.round(km), litres, String(body.notes || "").trim()
    ).run();

    return json({ ok: true, id });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
