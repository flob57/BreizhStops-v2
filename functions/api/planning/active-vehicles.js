
import {
  ensurePlanningTables, json, error, parisDate, normalizeRegistration
} from "../../_planning.js";

export async function onRequestGet(context) {
  try {
    const db = await ensurePlanningTables(context);
    const url = new URL(context.request.url);
    const date = url.searchParams.get("date") || parisDate();

    const duties = await db.prepare(`
      SELECT vehicle_registration AS registration
      FROM duty_services
      WHERE service_date = ?
        AND TRIM(COALESCE(vehicle_registration, '')) <> ''
    `).bind(date).all();

    const imports = await db.prepare(`
      SELECT registration, ocelorn_number, activity_type,
             start_time, end_time, activity_label
      FROM planning_items
      WHERE planning_type = 'vehicle'
        AND planning_date = ?
        AND activity_type NOT IN ('inactif', 'atelier')
        AND TRIM(COALESCE(registration, '')) <> ''
    `).bind(date).all();

    const map = new Map();

    for (const row of duties.results || []) {
      const registration = normalizeRegistration(row.registration);
      if (!registration) continue;
      map.set(registration, {
        registration,
        source_duties: true,
        source_import: false,
        activity_type: "circulation"
      });
    }

    for (const row of imports.results || []) {
      const registration = normalizeRegistration(row.registration);
      if (!registration) continue;
      const current = map.get(registration) || {
        registration,
        source_duties: false,
        source_import: false
      };
      Object.assign(current, {
        source_import: true,
        activity_type: row.activity_type || "circulation",
        start_time: row.start_time || "",
        end_time: row.end_time || "",
        activity_label: row.activity_label || "",
        ocelorn_number: row.ocelorn_number || ""
      });
      map.set(registration, current);
    }

    return json({ date, vehicles: [...map.values()] });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
