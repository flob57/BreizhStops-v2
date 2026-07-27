import { ensurePlanningTables, json, error } from "../../_planning.js";

function normalizeName(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function onRequestGet(context) {
  try {
    const db = await ensurePlanningTables(context);
    const result = await db.prepare(`
      SELECT DISTINCT TRIM(driver_name) AS name
      FROM duty_services
      WHERE TRIM(COALESCE(driver_name, '')) <> ''
      ORDER BY name
    `).all();

    const seen = new Set();
    const drivers = [];
    for (const row of result.results || []) {
      const name = String(row.name || "").trim();
      const key = normalizeName(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      drivers.push({ name, key });
    }

    return json({ drivers });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
