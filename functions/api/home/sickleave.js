
import {
  json, error, propertyText, propertyDate, firstProperty,
  pageTitle, queryAllPages
} from "../../_home_status.js";

const DEFAULT_DATABASE_ID = "3676bbfa7ec18044a3a4e3c511cc92af";

function formatDate(date) {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    const databaseId =
      context.env.NOTION_SICKLEAVE_DATABASE_ID || DEFAULT_DATABASE_ID;

    const pages = await queryAllPages(token, databaseId);

    const leaves = pages
      .filter(page => !page.archived)
      .map(page => {
        const properties = page.properties || {};

        const driver =
          propertyText(firstProperty(properties, [
            "Conducteur", "Conducteurs", "Mes Conducteurs",
            "Nom", "Name"
          ])) || pageTitle(page);

        const endDate = propertyDate(firstProperty(properties, [
          "Date de fin", "Fin", "Date fin"
        ]));

        const daysRaw = propertyText(firstProperty(properties, [
          "Nombre de jours", "Jours", "Durée", "Duree"
        ]));

        const days =
          typeof daysRaw === "number"
            ? daysRaw
            : Number(String(daysRaw || "").replace(",", ".")) || 0;

        return {
          id: page.id,
          driver,
          end_date: endDate,
          end_date_label: formatDate(endDate),
          days
        };
      })
      .filter(item => item.driver)
      .sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));

    return json({ leaves });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
