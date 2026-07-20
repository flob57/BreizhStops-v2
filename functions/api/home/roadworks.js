import {
  json, error, propertyText, propertyDate, firstProperty, pageTitle,
  queryDatabase, relationTitles, parisDate
} from "../../_home_status.js";

const FALLBACK_DATABASE_ID = "3606bbfa7ec180c9a561c7c40dac1b4c";

function dateRange(properties) {
  const preferred = firstProperty(properties, [
    "Date", "Dates", "Période", "Periode", "Dates des travaux", "Travaux"
  ]);
  const candidates = preferred ? [preferred] : Object.values(properties || {}).filter(p => p?.type === "date");
  const property = candidates[0];
  if (!property) return { start:"", end:"" };
  if (property.type === "date") return {
    start: property.date?.start?.slice(0,10) || "",
    end: (property.date?.end || property.date?.start || "").slice(0,10)
  };
  const start = propertyDate(property);
  return { start, end:start };
}

async function textOrRelation(token, property) {
  if (!property) return "";
  if (property.type === "relation") return (await relationTitles(token, property)).join(", ");
  return propertyText(property);
}

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);
    const databaseId = context.env.NOTION_WORKS_DATABASE_ID || FALLBACK_DATABASE_ID;
    const pages = await queryDatabase(token, databaseId);
    const today = parisDate();
    const items = [];

    for (const page of pages) {
      if (page.archived) continue;
      const p = page.properties || {};
      const {start, end} = dateRange(p);
      if (!start) continue;
      const name = propertyText(firstProperty(p, ["Nom", "Travaux", "Déviation", "Deviation", "Intitulé", "Intitule"])) || pageTitle(page);
      const commune = await textOrRelation(token, firstProperty(p, ["Commune", "Communes", "Ville", "Localité", "Localite"]));
      const status = today >= start && today <= (end || start) ? "current" : start > today ? "upcoming" : "past";
      if (status === "past") continue;
      items.push({ id:page.id, name, commune, start_date:start, end_date:end || start, status, notion_url:page.url || "" });
    }

    items.sort((a,b) => a.start_date.localeCompare(b.start_date));
    return json({ today, current:items.filter(i=>i.status==="current"), upcoming:items.filter(i=>i.status==="upcoming") });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
