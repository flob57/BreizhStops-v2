import {
  json, error, propertyText, propertyDate, firstProperty, pageTitle,
  queryDatabase, coverUrl, notionPage
} from "../../_home_status.js";

const FALLBACK_DATABASE_ID = "2e66bbfa7ec1804f963bc019a4d6de92";

function value(properties, names) {
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

function yearsOld(date) {
  if (!date) return null;
  const start = new Date(`${date.slice(0,10)}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - start.getUTCFullYear();
  const beforeAnniversary =
    now.getUTCMonth() < start.getUTCMonth() ||
    (now.getUTCMonth() === start.getUTCMonth() && now.getUTCDate() < start.getUTCDate());
  if (beforeAnniversary) years--;
  return Math.max(0, years);
}

async function relationLabel(token, property, cache) {
  if (!property || property.type !== "relation" || !property.relation?.length) return "";
  const labels = [];
  for (const item of property.relation) {
    if (!cache.has(item.id)) {
      const page = await notionPage(token, item.id);
      cache.set(item.id, pageTitle(page));
    }
    const label = cache.get(item.id);
    if (label) labels.push(label);
  }
  return labels.join(", ");
}

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);
    const databaseId = context.env.NOTION_VEHICLES_DATABASE_ID || FALLBACK_DATABASE_ID;
    const pages = await queryDatabase(token, databaseId);
    const cache = new Map();
    const vehicles = [];

    for (const page of pages) {
      if (page.archived) continue;
      const p = page.properties || {};
      const registration = value(p, ["Immatriculation", "Véhicule", "Vehicule", "Nom", "Name"]) || pageTitle(page);
      if (!registration) continue;

      const companyProperty = firstProperty(p, ["Société", "Societe", "Entreprise", "Exploitant"]);
      const company = companyProperty?.type === "relation"
        ? await relationLabel(token, companyProperty, cache)
        : propertyText(companyProperty);

      const circulationDate = propertyDate(firstProperty(p, [
        "Date de mise en circulation", "Mise en circulation", "Date MEC", "1ère mise en circulation",
        "Première mise en circulation", "Premiere mise en circulation", "Année", "Annee"
      ]));
      const explicitAge = Number(value(p, ["Âge", "Age", "Age véhicule", "Age vehicule"]));

      vehicles.push({
        id: page.id,
        notion_url: page.url || `https://www.notion.so/${page.id.replaceAll("-", "")}`,
        cover_url: coverUrl(page),
        registration,
        state: value(p, ["Etat", "État", "Statut"]) || "Non renseigné",
        ocelorn_number: uniqueValue(firstProperty(p, ["N° parc Océlorn", "N° Parc Océlorn", "Parc Océlorn", "N° parc", "Numéro de parc", "Numero de parc"])),
        qub_number: uniqueValue(firstProperty(p, ["N° QUB", "Numéro QUB", "Numero QUB", "Réf QUB", "Ref QUB", "QUB"])),
        company,
        circulation_date: circulationDate,
        age: Number.isFinite(explicitAge) && explicitAge > 0 ? explicitAge : yearsOld(circulationDate)
      });
    }

    vehicles.sort((a,b) => a.registration.localeCompare(b.registration, "fr", {numeric:true}));
    return json({ vehicles, updated_at: new Date().toISOString() });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
