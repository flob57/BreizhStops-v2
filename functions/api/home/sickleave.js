import {
  json, error, propertyText, propertyDate, firstProperty,
  pageTitle, queryDatabase, relationTitles, parisDate
} from "../../_home_status.js";

const SICKLEAVE_DATABASE_ID = "34d6bbfa7ec180e89ac2da151f11e266";

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

async function driverName(token, properties, page) {
  const property = firstProperty(properties, [
    "Mes Conducteurs", "Mes Conducteur", "Conducteurs",
    "Conducteur", "Nom du conducteur"
  ]);

  if (property?.type === "relation") {
    const names = await relationTitles(token, property);
    if (names.length) return names.join(", ");
  }

  return propertyText(property) || pageTitle(page);
}

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    const databaseId =
      context.env.NOTION_SICKLEAVE_DATABASE_ID || SICKLEAVE_DATABASE_ID;
    const today = parisDate();

    let pages;
    try {
      pages = await queryDatabase(token, databaseId, {
        filter: {
          and: [
            {
              property: "Date de début",
              date: { on_or_before: today }
            },
            {
              property: "Date de fin",
              date: { on_or_after: today }
            }
          ]
        }
      });
    } catch {
      // Repli en cas de léger renommage d'une propriété.
      pages = await queryDatabase(token, databaseId);
      pages = pages.filter(page => {
        const properties = page.properties || {};
        const start = propertyDate(firstProperty(properties, [
          "Date de début", "Date debut", "Début", "Debut"
        ]));
        const end = propertyDate(firstProperty(properties, [
          "Date de fin", "Date fin", "Fin"
        ]));
        return start && end && start <= today && end >= today;
      });
    }

    const leaves = [];

    for (const page of pages.filter(page => !page.archived)) {
      const properties = page.properties || {};

      const driver = await driverName(token, properties, page);
      const startDate = propertyDate(firstProperty(properties, [
        "Date de début", "Date debut", "Début", "Debut"
      ]));
      const endDate = propertyDate(firstProperty(properties, [
        "Date de fin", "Date fin", "Fin"
      ]));

      const daysRaw = propertyText(firstProperty(properties, [
        "Nombre de jours", "Jours", "Durée", "Duree"
      ]));

      const days =
        typeof daysRaw === "number"
          ? daysRaw
          : Number(String(daysRaw || "").replace(",", ".")) || 0;

      if (!driver || !startDate || !endDate) continue;
      if (!(startDate <= today && endDate >= today)) continue;

      leaves.push({
        id: page.id,
        driver,
        start_date: startDate,
        end_date: endDate,
        end_date_label: formatDate(endDate),
        days
      });
    }

    leaves.sort((a, b) => a.end_date.localeCompare(b.end_date));

    return json({
      date: today,
      leaves
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
