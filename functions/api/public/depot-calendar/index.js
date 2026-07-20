import { onRequestGet as adminGet, onRequestPost as adminPost } from "../../admin/depot-calendar/index.js";

export async function onRequestGet(context) {
  return adminGet(context);
}

export async function onRequestPost(context) {
  return adminPost(context);
}
