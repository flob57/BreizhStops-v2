import { onRequestDelete as adminDelete, onRequestGet as adminGet, onRequestPut as adminPut } from "../../admin/routes/[id].js";

export async function onRequestDelete(context) {
  return adminDelete(context);
}

export async function onRequestGet(context) {
  return adminGet(context);
}

export async function onRequestPut(context) {
  return adminPut(context);
}
