
import {
  ensurePlanningTables, json, error, uuid, parisDate
} from "../../../_planning.js";

export async function onRequestGet(context) {
  try {
    const db = await ensurePlanningTables(context);
    const url = new URL(context.request.url);
    const type = url.searchParams.get("type") || "";
    const date = url.searchParams.get("date") || "";

    const conditions = [];
    const values = [];
    if (type) { conditions.push("planning_type = ?"); values.push(type); }
    if (date) { conditions.push("planning_date = ?"); values.push(date); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await db.prepare(`
      SELECT *
      FROM planning_items
      ${where}
      ORDER BY planning_date DESC, entity_name, start_time
    `).bind(...values).all();

    return json({ items: result.results || [] });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = await ensurePlanningTables(context);
    const body = await context.request.json();
    const type = String(body.type || "");
    const date = String(body.date || parisDate());
    const items = Array.isArray(body.items) ? body.items : [];

    if (!["vehicle", "workshop", "driver"].includes(type)) {
      return error("Type de planning invalide.", 400);
    }
    if (!items.length) return error("Aucune donnée à enregistrer.", 400);

    const importId = uuid();
    await db.prepare(`
      INSERT INTO planning_imports (
        id, planning_type, planning_date, source_name, source_payload
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      importId,
      type,
      date,
      String(body.source_name || ""),
      JSON.stringify(body)
    ).run();

    await db.prepare(`
      DELETE FROM planning_items
      WHERE planning_type = ? AND planning_date = ?
    `).bind(type, date).run();

    for (const item of items) {
      await db.prepare(`
        INSERT INTO planning_items (
          id, import_id, planning_type, planning_date,
          entity_name, registration, ocelorn_number,
          start_time, end_time, activity_type, activity_label,
          location, details, confidence, source_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        uuid(), importId, type, date,
        String(item.entity_name || ""),
        String(item.registration || ""),
        String(item.ocelorn_number || ""),
        String(item.start_time || ""),
        String(item.end_time || ""),
        String(item.activity_type || ""),
        String(item.activity_label || ""),
        String(item.location || ""),
        String(item.details || ""),
        Number(item.confidence || 0),
        JSON.stringify(item.source_payload || item)
      ).run();
    }

    return json({ saved: items.length, import_id: importId, date, type });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
