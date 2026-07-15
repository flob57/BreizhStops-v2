import {
  json,
  error,
  requireDb,
  createId
} from "../../../../../_lib.js";

function delaySeconds(scheduledTime, actualIso) {
  if (!scheduledTime) {
    return null;
  }

  const actual = new Date(actualIso);
  const [hours, minutes, seconds = "0"] = scheduledTime.split(":");

  const scheduled = new Date(actual);
  scheduled.setHours(
    Number(hours),
    Number(minutes),
    Number(seconds),
    0
  );

  return Math.round(
    (actual.getTime() - scheduled.getTime()) / 1000
  );
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();

    const run = await db.prepare(
      "SELECT * FROM sae_runs WHERE id = ?"
    ).bind(context.params.id).first();

    if (!run) {
      return error("Course SAE introuvable.", 404);
    }

    const courseStop = await db.prepare(
      "SELECT * FROM sae_course_stops WHERE id = ?"
    ).bind(body.course_stop_id).first();

    if (!courseStop) {
      return error("Arrêt de course introuvable.", 404);
    }

    const boardings = Math.max(0, Number(body.boardings || 0));
    const alightings = Math.max(0, Number(body.alightings || 0));
    const onboardBefore = Math.max(0, Number(body.onboard_before || 0));
    const onboardAfter = Math.max(
      0,
      onboardBefore + boardings - alightings
    );

    const actualTime = String(
      body.actual_time || new Date().toISOString()
    );

    await db.batch([
      db.prepare(
        `INSERT INTO sae_stop_events (
           id, run_id, course_stop_id, stop_index,
           scheduled_time, actual_time, delay_seconds,
           boardings, alightings,
           onboard_before, onboard_after,
           automatic, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           CURRENT_TIMESTAMP)`
      ).bind(
        createId("event-"),
        run.id,
        courseStop.id,
        Number(body.stop_index || 0),
        courseStop.scheduled_time || "",
        actualTime,
        delaySeconds(courseStop.scheduled_time, actualTime),
        boardings,
        alightings,
        onboardBefore,
        onboardAfter,
        body.auto ? 1 : 0
      ),

      db.prepare(
        `UPDATE sae_runs SET
           current_stop_index = ?,
           onboard = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(
        Number(body.stop_index || 0) + 1,
        onboardAfter,
        run.id
      )
    ]);

    return json({
      ok: true,
      onboard_after: onboardAfter
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
