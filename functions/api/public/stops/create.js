import { onRequestPost as adminPost } from "../../admin/stops/create.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
