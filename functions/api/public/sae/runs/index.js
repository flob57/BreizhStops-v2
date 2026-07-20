import { onRequestPost as adminPost } from "../../../admin/sae/runs/index.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
