import { json, error, requireDb, ensureParkingSchema } from "../../../_parking.js";

const PARKING_DATABASE_ID = "35e6bbfa7ec180a18deff12d69f95ebc";

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
      return property.formula?.string ??
             property.formula?.number ??
             property.formula?.boolean ??
             "";
    case "rollup":
      if (property.rollup?.type === "array") {
        return property.rollup.array.map(propertyText).filter(Boolean).join(" ");
      }
      return property.rollup?.string ?? property.rollup?.number ?? "";
    default: return "";
  }
}

function numberValue(property) {
  if (!property) return null;
  if (property.type === "number") return property.number;
  if (property.type === "formula" && property.formula?.type === "number") {
    return property.formula.number;
  }
  return null;
}

function relationIds(property) {
  return property?.type === "relation"
    ? (property.relation || []).map(item => item.id).filter(Boolean)
    : [];
}

function firstProperty(props, names) {
  for (const name of names) if (props[name]) return props[name];
  return null;
}

function pageTitle(page) {
  const props = page?.properties || {};
  for (const property of Object.values(props)) {
    if (property?.type === "title") {
      const value = propertyText(property);
      if (value) return value;
    }
  }
  return "";
}

function registrationFromPage(page) {
  const props = page?.properties || {};
  const preferred = ["Immatriculation", "Véhicule", "Vehicle", "Plaque", "Nom", "Name"];
  for (const name of preferred) {
    const value = String(propertyText(props[name]) || "").trim();
    if (value) return value.toUpperCase();
  }
  const title = pageTitle(page);
  const match = title.match(/[A-Z]{2}-\d{3}-[A-Z]{2}/i);
  return match ? match[0].toUpperCase() : title.toUpperCase();
}


function normalizeNotionId(value) {
  return String(value || "").replace(/-/g, "").toLowerCase();
}

function extractRegistration(value) {
  const text = String(value || "").toUpperCase().trim();
  const match = text.match(/[A-Z]{2}-\d{3}-[A-Z]{2}/);
  return match ? match[0] : text;
}

async function notionPage(token, pageId) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": "2022-06-28"
    }
  });
  const payload = await response.json();
  if (!response.ok) return null;
  return payload;
}

async function resolveMissingRelations(token, relationIdsList, vehicles) {
  const unique = [...new Set(relationIdsList)]
    .filter(id => !vehicles.has(normalizeNotionId(id)));

  // Une base Stationnement contient peu de relations occupées.
  // La limite évite de dépasser le plafond de sous-requêtes Cloudflare.
  const toFetch = unique.slice(0, 40);
  for (let index = 0; index < toFetch.length; index += 8) {
    const group = toFetch.slice(index, index + 8);
    const pages = await Promise.all(group.map(id => notionPage(token, id)));
    pages.forEach((page, pageIndex) => {
      if (!page) return;
      const registration = extractRegistration(registrationFromPage(page));
      if (registration) {
        vehicles.set(normalizeNotionId(group[pageIndex]), registration);
        vehicles.set(normalizeNotionId(page.id), registration);
      }
    });
  }
}


async function notionDatabase(token, databaseId) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": "2022-06-28"
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Impossible de lire la structure Notion.");
  return payload;
}

function relationDatabaseId(database, propertyNames) {
  const properties = database?.properties || {};
  for (const name of propertyNames) {
    const property = properties[name];
    if (property?.type === "relation" && property.relation?.database_id) {
      return property.relation.database_id;
    }
  }
  return "";
}

async function notionQuery(token, databaseId) {
  const pages = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Erreur Notion.");
    pages.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);
  return pages;
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    await ensureParkingSchema(db);

    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    const parkingDatabaseId =
      context.env.NOTION_PARKING_DATABASE_ID || PARKING_DATABASE_ID;

    // La base liée à « Mon parc » est déterminée directement depuis la structure
    // de la base Stationnement. Cela évite de dépendre d'un identifiant codé en dur.
    const parkingDatabase = await notionDatabase(token, parkingDatabaseId);
    const detectedVehiclesDatabaseId = relationDatabaseId(
      parkingDatabase,
      ["Mon parc", "Véhicule", "Véhicules", "Parc"]
    );
    const vehiclesDatabaseId =
      context.env.NOTION_VEHICLES_DATABASE_ID || detectedVehiclesDatabaseId;

    if (!vehiclesDatabaseId) {
      throw new Error(
        "La propriété relation « Mon parc » est introuvable dans la base Stationnement."
      );
    }

    const [parkingPages, vehiclePages] = await Promise.all([
      notionQuery(token, parkingDatabaseId),
      notionQuery(token, vehiclesDatabaseId)
    ]);

    const vehicles = new Map();
    for (const page of vehiclePages) {
      const registration = extractRegistration(registrationFromPage(page));
      if (registration) {
        vehicles.set(normalizeNotionId(page.id), registration);
      }
    }

    // Récupération globale des relations présentes dans les emplacements.
    const allRelationIds = parkingPages.flatMap(page => {
      const props = page.properties || {};
      return relationIds(
        firstProperty(props, ["Mon parc", "Véhicule", "Véhicules", "Parc"])
      );
    });

    // Sécurité supplémentaire : les pages liées non trouvées dans la requête
    // de base sont lues directement par leur identifiant.
    await resolveMissingRelations(token, allRelationIds, vehicles);

    const seen = [];
    let imported = 0;
    let occupiedSpots = 0;
    let linkedVehicles = 0;
    let resolvedRegistrations = 0;

    for (const page of parkingPages) {
      const props = page.properties || {};
      const name =
        propertyText(firstProperty(props, ["Emplacement", "Nom", "Name"])) ||
        pageTitle(page);
      if (!name) continue;

      const depot = propertyText(firstProperty(props, ["Depot", "Dépôt", "Site"]));
      const spotType = propertyText(firstProperty(props, ["Type", "Catégorie"]));
      const statusNotion = propertyText(firstProperty(props, ["Statut", "Status"]));
      const x = numberValue(firstProperty(props, ["X", "x"]));
      const y = numberValue(firstProperty(props, ["Y", "y"]));
      const ids = relationIds(
        firstProperty(props, ["Mon parc", "Véhicule", "Véhicules", "Parc"])
      );
      const registrations = ids
        .map(id => vehicles.get(normalizeNotionId(id)))
        .filter(Boolean);

      if (ids.length) occupiedSpots++;
      linkedVehicles += ids.length;
      resolvedRegistrations += registrations.length;

      // Une relation suffit à déclarer la place occupée, même si le titre
      // du véhicule ne pouvait exceptionnellement pas être résolu.
      const displayRegistrations = registrations.length
        ? registrations
        : ids.map((id, index) => `VÉHICULE LIÉ ${index + 1}`);

      seen.push(page.id);
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
        JSON.stringify(displayRegistrations), ids.length
      ).run();
      imported++;
    }

    if (seen.length) {
      const placeholders = seen.map(() => "?").join(",");
      await db.prepare(
        `DELETE FROM parking_spots WHERE notion_page_id NOT IN (${placeholders})`
      ).bind(...seen).run();
    }

    return json({
      ok: true,
      imported,
      vehicles_loaded: vehiclePages.length,
      vehicles_database_id: vehiclesDatabaseId,
      relation_property_detected: Boolean(detectedVehiclesDatabaseId),
      occupied_spots: occupiedSpots,
      linked_vehicles: linkedVehicles,
      resolved_registrations: resolvedRegistrations,
      message: `${imported} emplacement(s) synchronisé(s), ${linkedVehicles} véhicule(s) affecté(s), ${resolvedRegistrations} immatriculation(s) reconnue(s).`
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
