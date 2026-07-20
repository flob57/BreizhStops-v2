import { onRequestPost as adminOnRequestPost } from "../../admin/stops/import.js";

export async function onRequestPost(context){
  return adminOnRequestPost(context);
}
