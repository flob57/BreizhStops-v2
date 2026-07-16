import {
  json,
  error,
  requireDb,
  createId
} from "../../_lib.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const dutyId = decodeURIComponent(context.params.id);
    const body = await context.request.json().catch(() => ({}));

    const duty = await db.prepare(
      `SELECT id, service_date
       FROM duty_services
       WHERE id = ?`
    ).bind(dutyId).first();

    if (!duty) {
      return error("Prise de service introuvable.", 404);
    }

    const validated = body.validated === false ? 0 : 1;

    if (!validated) {
      await db.prepare(
        `DELETE FROM duty_validations
         WHERE duty_service_id = ?
           AND service_date = ?`
      ).bind(duty.id, duty.service_date).run();

      return json({
        ok: true,
        validated: false,
        validated_at: null
      });
    }

    const id = `validation-${duty.service_date}-${duty.id}`;

    await db.prepare(
      `INSERT INTO duty_validations (
         id,
         duty_service_id,
         service_date,
         validated,
         validated_at,
         created_at
       ) VALUES (
         ?, ?, ?, 1,
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
       )
       ON CONFLICT(duty_service_id, service_date) DO UPDATE SET
         validated = 1,
         validated_at = CURRENT_TIMESTAMP`
    ).bind(id, duty.id, duty.service_date).run();

    const validation = await db.prepare(
      `SELECT validated_at
       FROM duty_validations
       WHERE duty_service_id = ?
         AND service_date = ?`
    ).bind(duty.id, duty.service_date).first();

    return json({
      ok: true,
      validated: true,
      validated_at: validation?.validated_at || null
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
