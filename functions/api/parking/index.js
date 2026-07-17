import { json, error, requireDb, ensureParkingSchema } from "../../_parking.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    await ensureParkingSchema(db);
    const result = await db.prepare(
      `SELECT notion_page_id, name, depot, spot_type, status_notion, x, y,
              registrations_json, relation_count, updated_at
       FROM parking_spots
       ORDER BY depot, name`
    ).all();

    const spots = (result.results || []).map(row => ({
      ...row,
      registrations: JSON.parse(row.registrations_json || "[]"),
      occupied: Number(row.relation_count || 0) > 0
    }));

    const updatedAt = spots.reduce((latest, row) =>
      !latest || row.updated_at > latest ? row.updated_at : latest, "");

    return json({ ok: true, spots, updated_at: updatedAt });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
