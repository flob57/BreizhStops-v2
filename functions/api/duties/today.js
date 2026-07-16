import {
  json,
  error,
  requireDb
} from "../../_lib.js";

function parisDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const url = new URL(context.request.url);
    const date = url.searchParams.get("date") || parisDate();

    const result = await db.prepare(
      `SELECT
         duty_services.id,
         duty_services.service_date,
         duty_services.source_profile,
         duty_services.ps_time,
         duty_services.qub_reference,
         duty_services.driver_name,
         duty_services.first_course,
         duty_services.vehicle_registration,
         CASE
           WHEN duty_validations.validated = 1 THEN 1
           ELSE 0
         END AS validated,
         duty_validations.validated_at
       FROM duty_services
       LEFT JOIN duty_validations
         ON duty_validations.duty_service_id = duty_services.id
        AND duty_validations.service_date = duty_services.service_date
       WHERE duty_services.service_date = ?
       ORDER BY duty_services.ps_time, duty_services.qub_reference`
    ).bind(date).all();

    const calendarEvent = await db.prepare(
      `SELECT
         label,
         event_type,
         service_profile
       FROM depot_calendar
       WHERE start_date <= ?
         AND end_date >= ?
       ORDER BY start_date DESC
       LIMIT 1`
    ).bind(date, date).first();

    return json({
      date,
      calendar_event: calendarEvent || null,
      services: result.results || []
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
