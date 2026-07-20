import { onRequestDelete as adminDelete } from "../../../admin/depot-calendar/[id]/index.js";

export async function onRequestDelete(context) {
  return adminDelete(context);
}
