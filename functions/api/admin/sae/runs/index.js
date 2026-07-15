import {
  json,
  error,
  requireDb,
  createId
} from "../../../../_lib.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();
    const courseId = String(body.course_id || "");
    const date = String(body.date || new Date().toISOString().slice(0, 10));

    let run = await db.prepare(
      `SELECT *
       FROM sae_runs
       WHERE course_id = ?
         AND service_date = ?
         AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`
    ).bind(courseId, date).first();

    if (!run) {
      const id = createId("run-");

      await db.prepare(
        `INSERT INTO sae_runs (
           id, course_id, service_date, status,
           current_stop_index, onboard,
           started_at, updated_at
         ) VALUES (?, ?, ?, 'active', 0, 0,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(id, courseId, date).run();

      run = {
        id,
        course_id: courseId,
        service_date: date,
        status: "active",
        current_stop_index: 0,
        onboard: 0
      };
    }

    return json(run, 201);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
