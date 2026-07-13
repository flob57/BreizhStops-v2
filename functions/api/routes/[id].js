import {
  json,
  error,
  requireAdmin,
  requireDb,
  parseJson
} from "../../_lib.js";

function normalizeRoute(row) {
  return {
    ...row,
    stops: parseJson(row.stops_json, []),
    waypoints: parseJson(row.waypoints_json, []),
    geometry: parseJson(row.geometry_json, null)
  };
}

export async function onRequestGet(context) {
  try {
    const denied = requireAdmin(context);

    if (denied) {
      return denied;
    }

    const db = requireDb(context);

    const row = await db.prepare(
      "SELECT * FROM routes WHERE id = ?"
    )
      .bind(context.params.id)
      .first();

    if (!row) {
      return error("Itinéraire introuvable.", 404);
    }

    return json(normalizeRoute(row));
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestPut(context) {
  try {
    const denied = requireAdmin(context);

    if (denied) {
      return denied;
    }

    const db = requireDb(context);
    const body = await context.request.json();

    const visibility =
      body.visibility === "link" ? "link" : "private";

    const current = await db.prepare(
      "SELECT share_token FROM routes WHERE id = ?"
    )
      .bind(context.params.id)
      .first();

    if (!current) {
      return error("Itinéraire introuvable.", 404);
    }

    const shareToken =
      visibility === "link"
        ? current.share_token || crypto.randomUUID()
        : null;

    await db.prepare(
      `UPDATE routes SET
         name = ?,
         network = ?,
         color = ?,
         visibility = ?,
         share_token = ?,
         description = ?,
         stops_json = ?,
         waypoints_json = ?,
         geometry_json = ?,
         distance = ?,
         duration = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
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
        Number(body.duration || 0),
        context.params.id
      )
      .run();

    return json({
      id: context.params.id,
      share_token: shareToken
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const denied = requireAdmin(context);

    if (denied) {
      return denied;
    }

    const db = requireDb(context);

    await db.prepare(
      "DELETE FROM routes WHERE id = ?"
    )
      .bind(context.params.id)
      .run();

    return json({ ok: true });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
