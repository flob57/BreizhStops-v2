import {
  propertyText,
  firstProperty,
  pageTitle,
  queryDatabase,
  notionPage
} from "./_home_status.js";

export const PDVV_FALLBACK_DATABASE_ID = "3a46bbfa7ec1801f8675d4a8b498aaf4";

const VEHICLE_REGISTRATION_PROPERTIES = [
  "Immatriculation",
  "Véhicule",
  "Vehicule",
  "Véhicule immatriculation",
  "Vehicule immatriculation",
  "Registration",
  "Nom",
  "Name"
];

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
  const preferred = propertyText(firstProperty(properties, VEHICLE_REGISTRATION_PROPERTIES));
  if (preferred) return String(preferred).trim();

  // Certaines bases utilisent une formule ou un rollup pour afficher
  // l'immatriculation dans une relation. On cherche alors une valeur
  // ressemblant réellement à une immatriculation française.
  for (const property of Object.values(properties)) {
    const value = String(propertyText(property) || "").trim();
    if (/^[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}$/i.test(value)) return value;
  }

  return pageTitle(page);
}

async function relatedVehicles(token, property, pageCache) {
  if (!property) return [];

  if (property.type !== "relation") {
    const direct = propertyText(property);
    return direct ? [String(direct)] : [];
  }

  const labels = [];
  for (const relation of property.relation || []) {
    if (!pageCache.has(relation.id)) {
      pageCache.set(relation.id, await notionPage(token, relation.id));
    }
    const registration = vehicleRegistrationFromPage(pageCache.get(relation.id));
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
    const serial = propertyText(firstProperty(properties, [
      "Numéro de série", "Numero de serie", "N° de série", "N° série",
      "Serial", "Nom", "Name"
    ])) || pageTitle(page);

    const pdvvNumber = uniqueValue(firstProperty(properties, [
      "Numéro PDVV", "Numero PDVV", "N° PDVV", "PDVV"
    ]));

    const theoreticalValues = await relatedVehicles(
      token,
      firstProperty(properties, [
        "Théorique", "Theorique", "Véhicule théorique", "Vehicule theorique"
      ]),
      pageCache
    );

    const assignmentValues = await relatedVehicles(
      token,
      firstProperty(properties, [
        "Affectation", "Véhicule affecté", "Vehicule affecte",
        "Véhicule", "Vehicule"
      ]),
      pageCache
    );

    const match = checkboxValue(firstProperty(properties, [
      "Match", "Correspondance"
    ]));

    devices.push({
      id: page.id,
      notion_url: page.url || `https://www.notion.so/${page.id.replaceAll("-", "")}`,
      serial_number: String(serial || ""),
      pdvv_number: String(pdvvNumber || ""),
      theoretical_registration: theoreticalValues.join(", "),
      assignment_registration: assignmentValues.join(", "),
      theoretical_registrations: theoreticalValues,
      assignment_registrations: assignmentValues,
      match
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

// Pour les prises de service : équipement réellement présent dans le véhicule.
export function pdvvByAssignment(devices) {
  return devicesByRegistration(
    devices,
    "assignment_registration",
    "assignment_registrations"
  );
}

// Pour Mon parc : équipement théoriquement attribué au véhicule.
export function pdvvByTheoretical(devices) {
  return devicesByRegistration(
    devices,
    "theoretical_registration",
    "theoretical_registrations"
  );
}
