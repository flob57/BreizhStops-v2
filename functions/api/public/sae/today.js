import { onRequestGet as adminGet } from "../../admin/sae/today.js";

export async function onRequestGet(context) {
  return adminGet(context);
}
