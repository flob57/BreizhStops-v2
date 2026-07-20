import { onRequestPost as adminPost } from "../../admin/notion/sync-today.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
