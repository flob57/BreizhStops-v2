import {
  json, error, requireDb, ensureTodoSchema, createId, parisDate
} from "../../../_todos.js";

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    await ensureTodoSchema(db);

    const notionPageId = context.params.id;
    if (!notionPageId) return error("Tâche introuvable.", 404);

    let body = {};
    try { body = await context.request.json(); } catch {}

    const date = String(body.date || parisDate()).slice(0, 10);

    await db.prepare(
      `INSERT INTO todo_completions (
        id, notion_page_id, completion_date, completed_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(notion_page_id, completion_date) DO UPDATE SET
        completed_at = CURRENT_TIMESTAMP`
    ).bind(
      createId("todo_"),
      notionPageId,
      date
    ).run();

    return json({ ok: true, notion_page_id: notionPageId, date });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
