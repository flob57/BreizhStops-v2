import { onRequestDelete as adminDelete } from "../../admin/stops/[id].js";
import { onRequestPut as adminPut } from "../../admin/stops/[id].js";

export async function onRequestDelete(context) {
  return adminDelete(context);
}

export async function onRequestPut(context) {
  return adminPut(context);
}
