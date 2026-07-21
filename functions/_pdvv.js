import {
  propertyText,
  firstProperty,
  pageTitle,
  queryDatabase,
  relationTitles
} from "./_home_status.js";

export const PDVV_FALLBACK_DATABASE_ID = "3a46bbfa7ec1801f8675d4a8b498aaf4";

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

async function relationValue(token, properties, names) {
  const property = firstProperty(properties, names);
  if (!property) return "";
  if (property.type === "relation") {
    return (await relationTitles(token, property)).join(", ");
  }
  return propertyText(property);
}

export async function loadPdvv(token, databaseId = PDVV_FALLBACK_DATABASE_ID) {
  const pages = await queryDatabase(token, databaseId);
  const devices = [];

  for (const page of pages) {
    if (page.archived) continue;
    const properties = page.properties || {};
    const serial = propertyText(firstProperty(properties, [
      "Numéro de série", "Numero de serie", "N° de série", "N° série", "Serial", "Nom", "Name"
    ])) || pageTitle(page);
    const pdvvNumber = uniqueValue(firstProperty(properties, [
      "Numéro PDVV", "Numero PDVV", "N° PDVV", "PDVV"
    ]));
    const theoretical = await relationValue(token, properties, [
      "Théorique", "Theorique", "Véhicule théorique", "Vehicule theorique"
    ]);
    const assignment = await relationValue(token, properties, [
      "Affectation", "Véhicule affecté", "Vehicule affecte", "Véhicule", "Vehicule"
    ]);
    const match = checkboxValue(firstProperty(properties, ["Match", "Correspondance"]));

    devices.push({
      id: page.id,
      notion_url: page.url || `https://www.notion.so/${page.id.replaceAll("-", "")}`,
      serial_number: String(serial || ""),
      pdvv_number: String(pdvvNumber || ""),
      theoretical_registration: theoretical,
      assignment_registration: assignment,
      match
    });
  }

  devices.sort((a, b) =>
    String(a.pdvv_number).localeCompare(String(b.pdvv_number), "fr", { numeric: true })
  );
  return devices;
}

export function pdvvByAssignment(devices) {
  const map = new Map();
  for (const device of devices || []) {
    const registrations = String(device.assignment_registration || "")
      .split(",")
      .map(normalizeRegistration)
      .filter(Boolean);
    for (const registration of registrations) map.set(registration, device);
  }
  return map;
}
