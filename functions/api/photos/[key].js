import { error } from "../../_lib.js";

export async function onRequestGet(context) {
  try {
    if (!context.env.PHOTOS) {
      throw new Error(
        "Configuration Cloudflare incomplète : liaison R2 PHOTOS absente."
      );
    }

    const key = decodeURIComponent(context.params.key);
    const object = await context.env.PHOTOS.get(key);

    if (!object) {
      return error("Photo introuvable.", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=86400");

    return new Response(object.body, { headers });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
