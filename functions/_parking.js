import { json, error, requireDb } from "./_lib.js";

export { json, error, requireDb };

export async function ensureParkingSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS parking_spots (
      notion_page_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      depot TEXT NOT NULL DEFAULT '',
      spot_type TEXT NOT NULL DEFAULT '',
      status_notion TEXT NOT NULL DEFAULT '',
      x REAL,
      y REAL,
      registrations_json TEXT NOT NULL DEFAULT '[]',
      relation_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_parking_spots_depot ON parking_spots(depot)`,
    `CREATE INDEX IF NOT EXISTS idx_parking_spots_name ON parking_spots(name)`
  ];
  for (const statement of statements) await db.prepare(statement).run();
}
