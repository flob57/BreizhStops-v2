
import { ensurePlanningTables, json, error, parisDate } from "../../_planning.js";

function minutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function nowParisMinutes() {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export async function onRequestGet(context) {
  try {
    const db = await ensurePlanningTables(context);
    const url = new URL(context.request.url);
    const date = url.searchParams.get("date") || parisDate();
    const result = await db.prepare(`
      SELECT *
      FROM planning_items
      WHERE planning_type = 'driver' AND planning_date = ?
      ORDER BY entity_name, start_time
    `).bind(date).all();

    const rows = result.results || [];
    const now = nowParisMinutes();
    const grouped = new Map();

    for (const row of rows) {
      const name = row.entity_name || "Conducteur non identifié";
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(row);
    }

    const drivers = [];
    for (const [name, activities] of grouped) {
      let current = null;
      let next = null;

      for (const activity of activities) {
        const start = minutes(activity.start_time);
        const end = minutes(activity.end_time);

        if (
          start !== null && end !== null &&
          now >= start && now <= end
        ) current = activity;

        if (start !== null && start > now && start <= now + 60) {
          if (!next || start < minutes(next.start_time)) next = activity;
        }
      }

      drivers.push({ name, current, next, activities });
    }

    return json({ date, drivers, now_minutes: now });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
