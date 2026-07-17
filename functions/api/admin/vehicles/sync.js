import { json, error, requireDb, ensurePersonalSchema} from "../../../_personal.js";

const FALLBACK_DATABASE_ID = "2e66bbfa7ec1804f963bc019a4d6de92";

function plainText(parts) {
  return Array.isArray(parts) ? parts.map(p => p?.plain_text || "").join("").trim() : "";
}

function propertyText(property) {
  if (!property) return "";
  if (property.type === "title") return plainText(property.title);
  if (property.type === "rich_text") return plainText(property.rich_text);
  if (property.type === "select") return property.select?.name || "";
  if (property.type === "formula") return property.formula?.string || property.formula?.number || "";
  if (property.type === "rollup") {
    if (property.rollup?.type === "array") {
      return property.rollup.array.map(propertyText).filter(Boolean).join(" ");
    }
    return property.rollup?.string || property.rollup?.number || "";
  }
  return "";
}

function registrationFromPage(page) {
  const props = page.properties || {};
  const preferred = ["Immatriculation", "Véhicule", "Vehicle", "Plaque", "Nom", "Name"];
  for (const name of preferred) {
    const value = String(propertyText(props[name]) || "").trim();
    if (value) return value.toUpperCase();
  }
  for (const property of Object.values(props)) {
    const value = String(propertyText(property) || "").trim();
    if (/^[A-Z]{2}-\d{3}-[A-Z]{2}$/i.test(value)) return value.toUpperCase();
  }
  return "";
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    await ensurePersonalSchema(db);
    const token = context.env.NOTION_TOKEN;
    const databaseId = context.env.NOTION_VEHICLES_DATABASE_ID || FALLBACK_DATABASE_ID;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    let cursor = null;
    let imported = 0;
    const seen = [];

    do {
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 })
      });
      const payload = await response.json();
      if (!response.ok) return error(payload.message || "Erreur Notion véhicules.", response.status);

      for (const page of payload.results || []) {
        const registration = registrationFromPage(page);
        if (!registration) continue;
        seen.push(page.id);
        await db.prepare(
          `INSERT INTO vehicles_cache (id, notion_page_id, registration, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(notion_page_id) DO UPDATE SET
             registration = excluded.registration,
             updated_at = CURRENT_TIMESTAMP`
        ).bind(`vehicle-${page.id}`, page.id, registration).run();
        imported++;
      }
      cursor = payload.has_more ? payload.next_cursor : null;
    } while (cursor);

    return json({ ok: true, imported });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
