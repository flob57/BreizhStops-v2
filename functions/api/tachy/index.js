import {
  json, error, propertyText, propertyDate, firstProperty, pageTitle,
  queryDatabase, coverUrl, parisDate
} from "../../_home_status.js";

const FALLBACK_DATABASE_ID = "2e66bbfa7ec1804f963bc019a4d6de92";
const PARKING_DATABASE_ID = "35e6bbfa7ec180a18deff12d69f95ebc";
const WORKSHOP_NAME = "Coat-Conq - Atelier";
const DAY = 86400000;

function normalize(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();
}

function text(properties, names) {
  return propertyText(firstProperty(properties, names));
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

function dateUtc(value) {
  if (!value) return null;
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function addDays(value, days) {
  const timestamp = dateUtc(value);
  if (timestamp == null) return "";
  return new Date(timestamp + days * DAY).toISOString().slice(0, 10);
}

function isIncluded(state) {
  const value = normalize(state);
  return value === "en service" ||
    value === "en service sur mon parc" ||
    value === "provisoirement sur parc" ||
    value === "provisoire sur parc";
}
async function findWorkshopParkingPage(token, parkingDatabaseId) {
  try {
    const candidates = await queryDatabase(token, parkingDatabaseId, {
      filter: { property: "Emplacement", title: { equals: WORKSHOP_NAME } }
    });
    if (candidates.length) return candidates[0];
  } catch {}
  try {
    const all = await queryDatabase(token, parkingDatabaseId);
    return all.find(page => normalize(pageTitle(page)) === normalize(WORKSHOP_NAME)) || null;
  } catch {
    return null;
  }
}

function statusFor(daysRemaining, missingDate) {
  if (missingDate) return "unknown";
  if (daysRemaining < 0) return "late";
  if (daysRemaining <= 30) return "soon";
  return "current";
}

function sortRank(status) {
  return status === "unknown" ? 0 : status === "late" ? 1 : status === "soon" ? 2 : 3;
}

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);
    const databaseId = context.env.NOTION_VEHICLES_DATABASE_ID || FALLBACK_DATABASE_ID;
    const pages = await queryDatabase(token, databaseId);
    const parkingDatabaseId = context.env.NOTION_PARKING_DATABASE_ID || PARKING_DATABASE_ID;
    const workshopPage = await findWorkshopParkingPage(token, parkingDatabaseId);
    let workshopVehicleIds = new Set();
    if (workshopPage?.id) {
      workshopVehicleIds = new Set(pages.filter(page =>
        Object.values(page.properties || {}).some(property =>
          property?.type === "relation" &&
          (property.relation || []).some(item => item.id === workshopPage.id)
        )
      ).map(page => page.id));
    }
    const today = parisDate();
    const todayUtc = dateUtc(today);
    const vehicles = [];

    for (const page of pages) {
      if (page.archived) continue;
      const properties = page.properties || {};
      const state = text(properties, ["État", "Etat", "Statut"]);
      const atWorkshop = workshopVehicleIds.has(page.id);
      if (!isIncluded(state) && !atWorkshop) continue;

      const registration = text(properties, ["Immatriculation", "Véhicule", "Vehicule", "Nom", "Name"]) || pageTitle(page);
      if (!registration) continue;
      const lastDownload = propertyDate(firstProperty(properties, [
        "Vidange Tachy", "Vidange tachy", "Vidange tachygraphe", "Dernière vidange Tachy",
        "Derniere vidange Tachy", "Dernier déchargement tachy", "Dernier dechargement tachy"
      ]));
      const dueDate = addDays(lastDownload, 90);
      const dueUtc = dateUtc(dueDate);
      const missingDate = !lastDownload || dueUtc == null;
      const daysRemaining = missingDate ? null : Math.round((dueUtc - todayUtc) / DAY);
      const status = statusFor(daysRemaining, missingDate);

      vehicles.push({
        id: page.id,
        notion_url: page.url || `https://www.notion.so/${page.id.replaceAll("-", "")}`,
        cover_url: coverUrl(page),
        registration,
        ocelorn_number: uniqueValue(firstProperty(properties, [
          "N° parc Océlorn", "N° Parc Océlorn", "Parc Océlorn", "N° parc", "Numéro de parc", "Numero de parc"
        ])),
        state,
        at_workshop: atWorkshop,
        location_label: atWorkshop ? "À l’atelier" : (normalize(state).includes("provisoirement") ? "Provisoirement sur parc" : ""),
        last_download: lastDownload,
        due_date: dueDate,
        days_remaining: daysRemaining,
        status
      });
    }

    vehicles.sort((a, b) => {
      const rank = sortRank(a.status) - sortRank(b.status);
      if (rank) return rank;
      if (a.status === "late") return a.days_remaining - b.days_remaining; // retard le plus important d'abord
      if (a.days_remaining != null && b.days_remaining != null && a.days_remaining !== b.days_remaining) {
        return a.days_remaining - b.days_remaining;
      }
      return a.registration.localeCompare(b.registration, "fr", { numeric: true });
    });

    const counts = vehicles.reduce((result, vehicle) => {
      result.total++;
      result[vehicle.status]++;
      return result;
    }, { total: 0, late: 0, soon: 0, current: 0, unknown: 0 });

    return json({ vehicles, counts, today, limit_days: 90, warning_days: 30, updated_at: new Date().toISOString() });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
