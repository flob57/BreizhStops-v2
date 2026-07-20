import { onRequestPost as adminPost } from "../../../../admin/sae/runs/[id]/finish.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
