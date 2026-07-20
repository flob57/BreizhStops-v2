import { onRequestPut as adminPut } from "../../../../admin/sae/courses/[id]/matches.js";

export async function onRequestPut(context) {
  return adminPut(context);
}
