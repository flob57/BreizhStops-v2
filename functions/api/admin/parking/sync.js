import { json, error, requireDb, ensureParkingSchema } from "../../../_parking.js";

const PARKING_DATABASE_ID = "35e6bbfa7ec180a18deff12d69f95ebc";
const BATCH_SIZE = 10;

function richText(parts) {
  return Array.isArray(parts)
    ? parts.map(part => part?.plain_text || part?.text?.content || "").join("").trim()
    : "";
}
function propertyText(property) {
  if (!property) return "";
  switch (property.type) {
    case "title": return richText(property.title);
    case "rich_text": return richText(property.rich_text);
    case "select": return property.select?.name || "";
    case "status": return property.status?.name || "";
    case "formula":
      return property.formula?.string ?? property.formula?.number ?? property.formula?.boolean ?? "";
    case "rollup":
      if (property.rollup?.type === "array") return property.rollup.array.map(propertyText).filter(Boolean).join(" ");
      return property.rollup?.string ?? property.rollup?.number ?? "";
    default: return "";
  }
}
function numberValue(property) {
  if (!property) return null;
  if (property.type === "number") return property.number;
  if (property.type === "formula" && property.formula?.type === "number") return property.formula.number;
  return null;
}
function firstProperty(props, names) {
  for (const name of names) if (props[name]) return props[name];
  return null;
}
function pageTitle(page) {
  for (const property of Object.values(page?.properties || {})) {
    if (property?.type === "title") {
      const value = propertyText(property);
      if (value) return value;
    }
  }
  return "";
}
function registrationFromPage(page) {
  const props = page?.properties || {};
  for (const name of ["Immatriculation", "Véhicule", "Vehicle", "Plaque", "Nom", "Name"]) {
    const value = String(propertyText(props[name]) || "").trim();
    if (value) {
      const match = value.toUpperCase().match(/[A-Z]{2}-\d{3}-[A-Z]{2}/);
      return match ? match[0] : value.toUpperCase();
    }
  }
  const title = pageTitle(page).toUpperCase();
  const match = title.match(/[A-Z]{2}-\d{3}-[A-Z]{2}/);
  return match ? match[0] : title;
}
async function notionRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Erreur Notion ${response.status}.`);
  return payload;
}
async function readDatabase(token, databaseId) {
  return notionRequest(token, `https://api.notion.com/v1/databases/${databaseId}`);
}
function findRelationProperty(database) {
  const properties = database?.properties || {};
  for (const name of ["Mon parc", "Véhicule", "Véhicules", "Parc"]) {
    const property = properties[name];
    if (property?.type === "relation") return { name, id: property.id };
  }
  for (const [name, property] of Object.entries(properties)) {
    if (property?.type === "relation") return { name, id: property.id };
  }
  return null;
}
async function queryParkingBatch(token, databaseId, startCursor) {
  const body = { page_size: BATCH_SIZE };
  if (startCursor) body.start_cursor = startCursor;
  return notionRequest(token, `https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
async function readRelationIds(token, page, relationProperty) {
  const inlineProperty = page?.properties?.[relationProperty.name];
  const inlineIds = inlineProperty?.type === "relation"
    ? (inlineProperty.relation || []).map(item => item.id).filter(Boolean)
    : [];
  if (inlineIds.length && !inlineProperty.has_more) return inlineIds;

  const ids = [...inlineIds];
  let cursor = null;
  do {
    const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const payload = await notionRequest(
      token,
      `https://api.notion.com/v1/pages/${page.id}/properties/${encodeURIComponent(relationProperty.id)}${query}`
    );
    for (const item of payload.results || []) {
      const relationId = item?.relation?.id || item?.relation?.page_id || null;
      if (relationId && !ids.includes(relationId)) ids.push(relationId);
    }
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);
  return ids;
}
async function readVehiclePage(token, pageId) {
  try {
    return await notionRequest(token, `https://api.notion.com/v1/pages/${pageId}`);
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    await ensureParkingSchema(db);

    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    let requestBody = {};
    try { requestBody = await context.request.json(); } catch {}

    const startCursor = requestBody.start_cursor || null;
    const reset = Boolean(requestBody.reset);
    const parkingDatabaseId = context.env.NOTION_PARKING_DATABASE_ID || PARKING_DATABASE_ID;

    if (reset) await db.prepare(`DELETE FROM parking_spots`).run();

    const database = await readDatabase(token, parkingDatabaseId);
    const relationProperty = findRelationProperty(database);
    if (!relationProperty) throw new Error("Aucune propriété relation trouvée dans la base Stationnement.");

    const batch = await queryParkingBatch(token, parkingDatabaseId, startCursor);

    let imported = 0, occupiedSpots = 0, linkedVehicles = 0, resolvedRegistrations = 0;
    const vehicleCache = new Map();

    for (const page of batch.results || []) {
      const props = page.properties || {};
      const name = propertyText(firstProperty(props, ["Emplacement", "Nom", "Name"])) || pageTitle(page);
      if (!name) continue;

      const depot = propertyText(firstProperty(props, ["Depot", "Dépôt", "Site"]));
      const spotType = propertyText(firstProperty(props, ["Type", "Catégorie"]));
      const statusNotion = propertyText(firstProperty(props, ["Statut", "Status"]));
      const x = numberValue(firstProperty(props, ["X", "x"]));
      const y = numberValue(firstProperty(props, ["Y", "y"]));

      const relationIds = await readRelationIds(token, page, relationProperty);
      const registrations = [];

      for (const relationId of relationIds) {
        let registration = vehicleCache.get(relationId);
        if (registration === undefined) {
          const vehiclePage = await readVehiclePage(token, relationId);
          registration = vehiclePage ? registrationFromPage(vehiclePage) : "";
          vehicleCache.set(relationId, registration);
        }
        if (registration) registrations.push(registration);
      }

      if (relationIds.length) occupiedSpots++;
      linkedVehicles += relationIds.length;
      resolvedRegistrations += registrations.length;

      const displayRegistrations = registrations.length
        ? registrations
        : relationIds.map((_, index) => `VÉHICULE LIÉ ${index + 1}`);

      await db.prepare(
        `INSERT INTO parking_spots (
          notion_page_id, name, depot, spot_type, status_notion, x, y,
          registrations_json, relation_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(notion_page_id) DO UPDATE SET
          name = excluded.name,
          depot = excluded.depot,
          spot_type = excluded.spot_type,
          status_notion = excluded.status_notion,
          x = excluded.x,
          y = excluded.y,
          registrations_json = excluded.registrations_json,
          relation_count = excluded.relation_count,
          updated_at = CURRENT_TIMESTAMP`
      ).bind(
        page.id, name, depot, spotType, statusNotion, x, y,
        JSON.stringify(displayRegistrations), relationIds.length
      ).run();

      imported++;
    }

    return json({
      ok: true,
      imported,
      occupied_spots: occupiedSpots,
      linked_vehicles: linkedVehicles,
      resolved_registrations: resolvedRegistrations,
      relation_property: relationProperty.name,
      has_more: Boolean(batch.has_more),
      next_cursor: batch.has_more ? batch.next_cursor : null
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
