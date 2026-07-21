import { json, error } from "../../_home_status.js";
import { loadPdvv, PDVV_FALLBACK_DATABASE_ID } from "../../_pdvv.js";

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);
    const databaseId = context.env.NOTION_PDVV_DATABASE_ID || PDVV_FALLBACK_DATABASE_ID;
    const devices = await loadPdvv(token, databaseId);
    return json({ devices, updated_at: new Date().toISOString() });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
