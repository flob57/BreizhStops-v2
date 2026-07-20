import { onRequestGet as adminGet } from "../../../admin/sae/courses/[id].js";

export async function onRequestGet(context) {
  return adminGet(context);
}
