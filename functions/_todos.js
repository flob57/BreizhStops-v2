import { json, error, requireDb, createId } from "./_lib.js";

export { json, error, requireDb, createId };

export async function ensureTodoSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS todo_completions (
      id TEXT PRIMARY KEY,
      notion_page_id TEXT NOT NULL,
      completion_date TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(notion_page_id, completion_date)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_todo_completions_date
     ON todo_completions(completion_date)`,
    `CREATE INDEX IF NOT EXISTS idx_todo_completions_page
     ON todo_completions(notion_page_id)`
  ];

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

export function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
