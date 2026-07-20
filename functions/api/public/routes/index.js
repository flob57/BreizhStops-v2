import { onRequestGet as adminGet, onRequestPost as adminPost } from "../../admin/routes/index.js";

export async function onRequestGet(context) {
  return adminGet(context);
}

export async function onRequestPost(context) {
  return adminPost(context);
}
