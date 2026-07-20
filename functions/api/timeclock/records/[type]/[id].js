import { json, error, requireDb, ensurePersonalSchema} from "../../../../_personal.js";

const tables = {
  work: "work_sessions",
  driving: "driving_sessions",
  fuel: "fuel_fillups"
};

export async function onRequestDelete(context) {
  try {
    const db = requireDb(context);
    await ensurePersonalSchema(db);
    const table = tables[context.params.type];
    if (!table) return error("Type inconnu.", 400);
    await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(context.params.id).run();
    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPatch(context) {
  try {
    const db = requireDb(context);
    const type = context.params.type;
    const body = await context.request.json();

    const validIso = value =>
      value == null ||
      value === "" ||
      (!Number.isNaN(Date.parse(value)) && /T/.test(String(value)));

    if (!validIso(body.started_at) || !validIso(body.ended_at) || !validIso(body.filled_at)) {
      return error("Date ou heure invalide.", 400);
    }
    if (type === "work") {
      await db.prepare(
        `UPDATE work_sessions SET started_at = ?, ended_at = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(body.started_at, body.ended_at || null, String(body.notes || ""), context.params.id).run();
    } else if (type === "driving") {
      if (Number(body.km_end) < Number(body.km_start)) return error("Kilométrage final invalide.", 400);
      await db.prepare(
        `UPDATE driving_sessions SET vehicle_registration = ?, started_at = ?, ended_at = ?,
         km_start = ?, km_end = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(
        String(body.vehicle_registration || "").toUpperCase(), body.started_at, body.ended_at || null,
        Math.round(Number(body.km_start)), body.km_end === "" ? null : Math.round(Number(body.km_end)),
        String(body.notes || ""), context.params.id
      ).run();
    } else if (type === "fuel") {
      await db.prepare(
        `UPDATE fuel_fillups SET vehicle_registration = ?, filled_at = ?,
         odometer_km = ?, litres = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(
        String(body.vehicle_registration || "").toUpperCase(), body.filled_at,
        Math.round(Number(body.odometer_km)), Number(body.litres),
        String(body.notes || ""), context.params.id
      ).run();
    } else {
      return error("Type inconnu.", 400);
    }
    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
