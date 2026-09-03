import { json, error, requireDb, ensurePersonalSchema } from "../../_personal.js";
import { onRequestPost as syncVehicles } from "../public/vehicles/sync.js";

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    await ensurePersonalSchema(db);

    // Always refresh the vehicle cache from Notion before displaying the
    // driving-session selector. This keeps newly added vehicles immediately
    // available without requiring a separate manual synchronization.
    try {
      await syncVehicles(context);
    } catch (syncError) {
      // Keep the cached list available if Notion is temporarily unavailable.
      console.warn("Synchronisation Notion des véhicules :", syncError.message);
    }

    const result = await db.prepare(
      "SELECT registration FROM vehicles_cache ORDER BY registration"
    ).all();

    return json({
      vehicles: (result.results || []).map(r => r.registration)
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
