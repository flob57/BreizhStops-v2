
import {
  json, error, propertyText, firstProperty, pageTitle,
  queryAllPages, coverUrl
} from "../../_home_status.js";

const DEFAULT_DATABASE_ID = "35f6bbfa7ec180b6a5eee3e10f899ebc";

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    const databaseId =
      context.env.NOTION_WORKSHOP_DATABASE_ID || DEFAULT_DATABASE_ID;

    const pages = await queryAllPages(token, databaseId);

    const vehicles = pages
      .filter(page => !page.archived)
      .map(page => {
        const properties = page.properties || {};
        const registration =
          propertyText(firstProperty(properties, [
            "Immatriculation", "Véhicule", "Vehicule", "Nom", "Name"
          ])) || pageTitle(page);

        const durationRaw = propertyText(firstProperty(properties, [
          "Durée atelier", "Duree atelier", "Durée", "Duree",
          "Nombre de jours", "Jours"
        ]));

        const durationDays =
          typeof durationRaw === "number"
            ? durationRaw
            : Number(String(durationRaw || "").replace(",", ".")) || 0;

        return {
          id: page.id,
          registration,
          duration_days: durationDays,
          cover_url: coverUrl(page)
        };
      })
      .filter(item => item.registration)
      .sort((a, b) => b.duration_days - a.duration_days);

    return json({ vehicles });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
