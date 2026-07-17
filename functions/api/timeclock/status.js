import { json, error, requireDb, minutesBetween, parisDate } from "../../_personal.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    const work = await db.prepare(
      `SELECT * FROM work_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
    ).first();
    const driving = await db.prepare(
      `SELECT * FROM driving_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
    ).first();

    const date = parisDate();
    const workToday = await db.prepare(
      `SELECT COALESCE(SUM(
         CAST((julianday(COALESCE(ended_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 1440 AS INTEGER)
       ), 0) AS minutes
       FROM work_sessions
       WHERE date(started_at, '+2 hours') = ?`
    ).bind(date).first();

    const drivingToday = await db.prepare(
      `SELECT COALESCE(SUM(
         CAST((julianday(COALESCE(ended_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 1440 AS INTEGER)
       ), 0) AS minutes
       FROM driving_sessions
       WHERE date(started_at, '+2 hours') = ?`
    ).bind(date).first();

    return json({
      work,
      driving,
      work_minutes_today: Number(workToday?.minutes || 0),
      driving_minutes_today: Number(drivingToday?.minutes || 0),
      live_work_minutes: work ? minutesBetween(work.started_at) : 0,
      live_driving_minutes: driving ? minutesBetween(driving.started_at) : 0
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
