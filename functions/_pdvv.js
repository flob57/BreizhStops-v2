import {
  propertyText,
  pageTitle,
  queryDatabase,
  notionPage,
  notionRequest
} from "./_home_status.js";

export const PDVV_FALLBACK_DATABASE_ID = "3a46bbfa7ec1801f8675d4a8b498aaf4";

const VEHICLE_REGISTRATION_PROPERTIES = [
  "Immatriculation", "Véhicule", "Vehicule", "Registration", "Nom", "Name"
];

function normalizedName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function propertyByMeaning(properties, candidates, expectedType = "") {
  const entries = Object.entries(properties || {});
  const wanted = candidates.map(normalizedName);

  // 1. Correspondance exacte, sans tenir compte des accents/emojis/espaces.
  for (const [name, property] of entries) {
    if (expectedType && property?.type !== expectedType) continue;
    const normalized = normalizedName(name);
    if (wanted.includes(normalized)) return property;
  }

  // 2. Correspondance souple : « Affectation actuelle », « Bus théorique », etc.
  for (const [name, property] of entries) {
    if (expectedType && property?.type !== expectedType) continue;
    const normalized = normalizedName(name);
    if (wanted.some(value => normalized.includes(value) || value.includes(normalized))) {
      return property;
    }
  }

  return null;
}

function uniqueValue(property) {
  if (!property) return "";
  if (property.type === "unique_id") {
    const prefix = property.unique_id?.prefix || "";
    const number = property.unique_id?.number;
    return number == null ? "" : `${prefix}${number}`;
  }
  return propertyText(property);
}

function checkboxValue(property) {
  if (!property) return false;
  if (property.type === "checkbox") return property.checkbox === true;
  if (property.type === "formula" && property.formula?.type === "boolean") {
    return property.formula.boolean === true;
  }
  return String(propertyText(property)).toLowerCase() === "true";
}

export function normalizeRegistration(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

function vehicleRegistrationFromPage(page) {
  const properties = page?.properties || {};
  const preferred = propertyByMeaning(properties, VEHICLE_REGISTRATION_PROPERTIES);
  const preferredValue = propertyText(preferred);
  if (preferredValue) return String(preferredValue).trim();

  for (const property of Object.values(properties)) {
    const value = String(propertyText(property) || "").trim();
    if (/^[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}$/i.test(value)) return value;
  }

  return pageTitle(page);
}

async function fullRelationIds(token, pageId, property) {
  if (!property || property.type !== "relation") return [];

  const ids = (property.relation || []).map(item => item.id).filter(Boolean);
  if (!property.has_more || !property.id) return [...new Set(ids)];

  let cursor = null;
  do {
    const url = new URL(
      `https://api.notion.com/v1/pages/${pageId}/properties/${encodeURIComponent(property.id)}`
    );
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const payload = await notionRequest(token, url.toString(), { method: "GET" });
    for (const item of payload.results || []) {
      const relationId = item?.relation?.id;
      if (relationId) ids.push(relationId);
    }
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return [...new Set(ids)];
}

async function relatedVehicles(token, page, property, pageCache) {
  if (!property) return [];

  if (property.type !== "relation") {
    const direct = propertyText(property);
    return direct ? [String(direct)] : [];
  }

  const labels = [];
  const relationIds = await fullRelationIds(token, page.id, property);

  for (const relationId of relationIds) {
    if (!pageCache.has(relationId)) {
      pageCache.set(relationId, await notionPage(token, relationId));
    }
    const registration = vehicleRegistrationFromPage(pageCache.get(relationId));
    if (registration && !labels.includes(registration)) labels.push(registration);
  }
  return labels;
}

export async function loadPdvv(token, databaseId = PDVV_FALLBACK_DATABASE_ID) {
  const pages = await queryDatabase(token, databaseId);
  const devices = [];
  const pageCache = new Map();

  for (const page of pages) {
    if (page.archived) continue;

    const properties = page.properties || {};
    const serialProperty = propertyByMeaning(properties, [
      "Numéro de série", "Numero de serie", "N° de série", "N° série", "Serial", "Nom", "Name"
    ]);
    const serial = propertyText(serialProperty) || pageTitle(page);

    const pdvvProperty = propertyByMeaning(properties, [
      "Numéro PDVV", "Numero PDVV", "N° PDVV", "PDVV"
    ]);
    const pdvvNumber = uniqueValue(pdvvProperty);

    const theoreticalProperty = propertyByMeaning(
      properties,
      ["Théorique", "Theorique", "Véhicule théorique", "Vehicule theorique", "Bus théorique"],
      "relation"
    );
    const assignmentProperty = propertyByMeaning(
      properties,
      ["Affectation", "Affectation actuelle", "Véhicule affecté", "Vehicule affecte"],
      "relation"
    );

    const theoreticalValues = await relatedVehicles(token, page, theoreticalProperty, pageCache);
    const assignmentValues = await relatedVehicles(token, page, assignmentProperty, pageCache);

    const matchProperty = propertyByMeaning(properties, ["Match", "Correspondance"]);
    const match = checkboxValue(matchProperty);

    devices.push({
      id: page.id,
      notion_url: page.url || `https://www.notion.so/${page.id.replaceAll("-", "")}`,
      serial_number: String(serial || ""),
      pdvv_number: String(pdvvNumber || ""),
      theoretical_registration: theoreticalValues.join(", "),
      assignment_registration: assignmentValues.join(", "),
      theoretical_registrations: theoreticalValues,
      assignment_registrations: assignmentValues,
      match,
      relation_debug: {
        theoretical_property_found: Boolean(theoreticalProperty),
        assignment_property_found: Boolean(assignmentProperty)
      }
    });
  }

  devices.sort((a, b) =>
    String(a.pdvv_number).localeCompare(String(b.pdvv_number), "fr", { numeric: true })
  );

  return devices;
}

function devicesByRegistration(devices, field, arrayField) {
  const map = new Map();
  for (const device of devices || []) {
    const source = Array.isArray(device[arrayField])
      ? device[arrayField]
      : String(device[field] || "").split(",");
    for (const value of source) {
      const registration = normalizeRegistration(value);
      if (registration) map.set(registration, device);
    }
  }
  return map;
}

export function pdvvByAssignment(devices) {
  return devicesByRegistration(devices, "assignment_registration", "assignment_registrations");
}

export function pdvvByTheoretical(devices) {
  return devicesByRegistration(devices, "theoretical_registration", "theoretical_registrations");
}
