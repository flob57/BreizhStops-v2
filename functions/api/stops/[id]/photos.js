import {
  json,
  error,
  requireAdmin,
  requireDb,
  createId
} from "../../../../_lib.js";

export async function onRequestPost(context) {
  try {
    const denied = requireAdmin(context);

    if (denied) {
      return denied;
    }

    if (!context.env.PHOTOS) {
      throw new Error(
        "Configuration Cloudflare incomplète : liaison R2 PHOTOS absente."
      );
    }

    const db = requireDb(context);
    const stopId = decodeURIComponent(context.params.id);
    const form = await context.request.formData();
    const photo = form.get("photo");

    if (!(photo instanceof File)) {
      return error("Aucune photo reçue.");
    }

    if (!photo.type.startsWith("image/")) {
      return error("Le fichier doit être une image.");
    }

    if (photo.size > 10 * 1024 * 1024) {
      return error("La photo dépasse 10 Mo.");
    }

    const id = createId("photo-");
    const extension =
      photo.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") ||
      "jpg";

    const objectKey = `${id}.${extension}`;

    await context.env.PHOTOS.put(
      objectKey,
      await photo.arrayBuffer(),
      {
        httpMetadata: {
          contentType: photo.type
        },
        customMetadata: {
          stopId,
          originalFilename: photo.name
        }
      }
    );

    await db.prepare(
      `INSERT INTO stop_photos (
         id, stop_id, object_key, filename, content_type, created_at
       ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(
        id,
        stopId,
        objectKey,
        photo.name,
        photo.type
      )
      .run();

    const photos = await db.prepare(
      `SELECT id, object_key, filename, content_type, created_at
       FROM stop_photos
       WHERE stop_id = ?
       ORDER BY created_at DESC`
    )
      .bind(stopId)
      .all();

    return json({
      ok: true,
      photos: photos.results || []
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
