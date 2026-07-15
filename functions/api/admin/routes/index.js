import {
  json,
  error,
  requireDb,
  createId
} from "../../../_lib.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);

    const result = await db.prepare(
      `SELECT
         id, name, network, color, visibility,
         share_token, distance, duration,
         created_at, updated_at
       FROM routes
       ORDER BY updated_at DESC`
    ).all();

    return json(result.results || []);
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const body = await context.request.json();

    const id = createId("route-");
    const visibility =
      body.visibility === "link" ? "link" : "private";

    const shareToken =
      visibility === "link" ? crypto.randomUUID() : null;

    await db.prepare(
      `INSERT INTO routes (
         id, name, network, color, visibility,
         share_token, description,
         stops_json, waypoints_json, geometry_json,
         distance, duration, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )`
    )
      .bind(
        id,
        String(body.name || "").slice(0, 200),
        String(body.network || "").slice(0, 100),
        String(body.color || "#005493").slice(0, 20),
        visibility,
        shareToken,
        String(body.description || "").slice(0, 10000),
        JSON.stringify(body.stops || []),
        JSON.stringify(body.waypoints || []),
        JSON.stringify(body.geometry || null),
        Number(body.distance || 0),
        Number(body.duration || 0)
      )
      .run();

    return json({
      id,
      share_token: shareToken
    }, 201);
  } catch (exception) {
    return error(exception.message, 500);
  }
}
