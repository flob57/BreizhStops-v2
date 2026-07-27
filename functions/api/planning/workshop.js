import { ensurePlanningTables, json, error, parisDate, uuid, normalizeRegistration } from "../../_planning.js";

const TYPES = ["ATELIER", "RDV TODD", "PREPA-MINES", "CT", "VIDANGE"];

export async function onRequestGet(context) {
  try {
    const db = await ensurePlanningTables(context);
    const url = new URL(context.request.url);
    const from = url.searchParams.get("from") || parisDate();
    const to = url.searchParams.get("to") || from;

    const result = await db.prepare(`
      SELECT *
      FROM planning_items
      WHERE planning_type = 'workshop'
        AND planning_date >= ?
        AND planning_date <= ?
      ORDER BY planning_date, registration, created_at
    `).bind(from, to).all();

    return json({ from, to, items: result.results || [] });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = await ensurePlanningTables(context);
    const body = await context.request.json();
    const registration = normalizeRegistration(body.registration);
    const planningDate = String(body.planning_date || "").trim();
    const appointmentType = String(body.appointment_type || "").trim().toUpperCase();

    if (!registration) return error("Choisis une immatriculation.", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) return error("Choisis une date valide.", 400);
    if (!TYPES.includes(appointmentType)) return error("Choisis un type de rendez-vous valide.", 400);

    const id = uuid();
    const importId = `manual-${id}`;
    await db.prepare(`
      INSERT INTO planning_items (
        id, import_id, planning_type, planning_date,
        entity_name, registration, ocelorn_number,
        start_time, end_time, activity_type, activity_label,
        location, details, confidence, source_payload
      ) VALUES (?, ?, 'workshop', ?, ?, ?, '', '', '', 'atelier', ?, '', '', 1, ?)
    `).bind(
      id, importId, planningDate, registration, registration,
      appointmentType,
      JSON.stringify({ source: "manual", appointment_type: appointmentType })
    ).run();

    return json({ saved: true, id, registration, planning_date: planningDate, appointment_type: appointmentType }, 201);
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = await ensurePlanningTables(context);
    const url = new URL(context.request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return error("Identifiant manquant.", 400);

    const result = await db.prepare(`
      DELETE FROM planning_items
      WHERE id = ? AND planning_type = 'workshop'
    `).bind(id).run();

    return json({ deleted: Number(result.meta?.changes || 0) > 0 });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
