import { onRequestPost as adminPost } from "../../admin/stops/import.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
