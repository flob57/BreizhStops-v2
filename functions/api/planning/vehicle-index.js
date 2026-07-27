
import { json, error, normalizeRegistration } from "../../_planning.js";
import {
  queryDatabase, propertyText, firstProperty, pageTitle
} from "../../_home_status.js";

const VEHICLE_DB_FALLBACK = "2e66bbfa7ec1804f963bc019a4d6de92";

function propertyValue(property) {
  if (!property) return "";
  if (property.type === "unique_id") {
    const prefix = property.unique_id?.prefix || "";
    const number = property.unique_id?.number;
    return number == null ? "" : `${prefix}${number}`;
  }
  return propertyText(property);
}

function keysFor(value) {
  const raw = String(value || "").toUpperCase().trim();
  return [
    raw,
    raw.replace(/\s+/g, ""),
    raw.replace(/[^A-Z0-9]/g, "")
  ].filter(Boolean);
}

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("NOTION_TOKEN manquant.", 503);

    const databaseId =
      context.env.NOTION_VEHICLES_DATABASE_ID || VEHICLE_DB_FALLBACK;
    const pages = await queryDatabase(token, databaseId);
    const vehicles = [];

    for (const page of pages) {
      if (page.archived) continue;
      const properties = page.properties || {};
      const registration =
        propertyText(firstProperty(properties, [
          "Immatriculation", "Véhicule", "Vehicule", "Nom", "Name"
        ])) || pageTitle(page);

      const parkNumber = propertyValue(firstProperty(properties, [
        "N° parc Océlorn", "N° Parc Océlorn", "Parc Océlorn",
        "N° parc", "Numéro de parc", "Numero de parc"
      ]));

      vehicles.push({
        registration: normalizeRegistration(registration),
        park_number: String(parkNumber || ""),
        keys: keysFor(parkNumber)
      });
    }

    return json({ vehicles });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
