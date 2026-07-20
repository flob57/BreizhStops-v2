import { onRequestPost as adminPost } from "../../admin/gtfs/import.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
