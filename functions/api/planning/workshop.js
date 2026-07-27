
import { ensurePlanningTables, json, error, parisDate } from "../../_planning.js";

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
      ORDER BY planning_date, start_time, entity_name
    `).bind(from, to).all();

    return json({ from, to, items: result.results || [] });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
