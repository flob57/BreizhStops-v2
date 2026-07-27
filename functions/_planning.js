
import { requireDb } from "./_lib.js";

export function parisDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function normalizeRegistration(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

export async function ensurePlanningTables(context) {
  const db = requireDb(context);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS planning_imports (
      id TEXT PRIMARY KEY,
      planning_type TEXT NOT NULL,
      planning_date TEXT NOT NULL,
      source_name TEXT NOT NULL DEFAULT '',
      source_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS planning_items (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL,
      planning_type TEXT NOT NULL,
      planning_date TEXT NOT NULL,
      entity_name TEXT NOT NULL DEFAULT '',
      registration TEXT NOT NULL DEFAULT '',
      ocelorn_number TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      activity_type TEXT NOT NULL DEFAULT '',
      activity_label TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      source_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_planning_items_date_type
    ON planning_items(planning_date, planning_type)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_planning_items_registration
    ON planning_items(registration, planning_date)
  `).run();

  return db;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function error(message, status = 500) {
  return json({ error: String(message || "Erreur inconnue") }, status);
}

export function uuid() {
  return crypto.randomUUID();
}

export function safeJson(value, fallback = {}) {
  try {
    if (typeof value === "object" && value !== null) return value;
    const text = String(value || "")
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function parseClock(value) {
  const match = String(value || "").match(/(\d{1,2})[:h](\d{2})/i);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}
