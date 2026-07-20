import { onRequestPost as adminPost } from "../../../../admin/sae/runs/[id]/validate-stop.js";

export async function onRequestPost(context) {
  return adminPost(context);
}
