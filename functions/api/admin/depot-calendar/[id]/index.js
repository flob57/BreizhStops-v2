import {
  json,
  error,
  requireDb
} from "../../../_lib.js";

export async function onRequestDelete(context) {
  try {
    const db = requireDb(context);
    const id = decodeURIComponent(context.params.id);

    await db.prepare(
      "DELETE FROM depot_calendar WHERE id = ?"
    ).bind(id).run();

    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
