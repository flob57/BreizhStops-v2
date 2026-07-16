import {
  json,
  error,
  requireDb
} from "../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const url = new URL(context.request.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return error("Date obligatoire.", 400);
    }

    const result = await db.prepare(
      `SELECT
         d.id,
         d.service_date,
         d.source_profile,
         d.source_service_page_id,
         d.course_index,
         d.course_page_id,
         d.departure_time,
         d.course_name,
         d.origin_name,
         d.arrival_time,
         d.driver_name,
         d.vehicle_registration,
         d.qub_reference,
         d.stops_json,
         CASE WHEN v.validated = 1 THEN 1 ELSE 0 END AS duty_validated,
         v.validated_at
       FROM daily_departures d
       LEFT JOIN duty_services s
         ON s.service_date = d.service_date
        AND s.notion_page_id = d.source_service_page_id
       LEFT JOIN duty_validations v
         ON v.duty_service_id = s.id
        AND v.service_date = d.service_date
       WHERE d.service_date = ?
       ORDER BY d.departure_time, d.course_index`
    ).bind(date).all();

    const departures = (result.results || []).map(row => ({
      ...row,
      stops: JSON.parse(row.stops_json || "[]")
    }));

    return json({ date, departures });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
