import { onRequestPost as adminOnRequestPost } from "../../admin/stops/create.js";

export async function onRequestPost(context) {
  return adminOnRequestPost(context);
}
