import { onRequestPost as adminPost } from "../../admin/vehicles/sync.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
