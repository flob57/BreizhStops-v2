import {
  json, error, propertyText, propertyDate, firstProperty, pageTitle,
  queryDatabase, coverUrl, parisDate, daysBetweenInclusive
} from "../../_home_status.js";

const VEHICLES_DATABASE_ID = "2e66bbfa7ec1804f963bc019a4d6de92";
const PARKING_DATABASE_ID = "35e6bbfa7ec180a18deff12d69f95ebc";
const WORKSHOP_NAME = "Coat-Conq - Atelier";

async function findWorkshopParkingPage(token, parkingDatabaseId) {
  const candidates = await queryDatabase(token, parkingDatabaseId, {
    filter: {
      property: "Emplacement",
      title: { equals: WORKSHOP_NAME }
    }
  });

  if (candidates.length) return candidates[0];

  // Repli robuste si la propriété titre a été renommée.
  const all = await queryDatabase(token, parkingDatabaseId);
  return all.find(page => pageTitle(page).trim() === WORKSHOP_NAME) || null;
}

export async function onRequestGet(context) {
  try {
    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    const vehiclesDatabaseId =
      context.env.NOTION_VEHICLES_DATABASE_ID || VEHICLES_DATABASE_ID;
    const parkingDatabaseId =
      context.env.NOTION_PARKING_DATABASE_ID || PARKING_DATABASE_ID;

    const workshopParkingPage =
      await findWorkshopParkingPage(token, parkingDatabaseId);

    if (!workshopParkingPage) {
      return error(
        `Emplacement Notion « ${WORKSHOP_NAME} » introuvable dans la base Stationnement.`,
        404
      );
    }

    let pages = [];
    try {
      pages = await queryDatabase(token, vehiclesDatabaseId, {
        filter: {
          property: "Stationnement",
          relation: { contains: workshopParkingPage.id }
        }
      });
    } catch {
      // Repli si la relation porte un autre nom : on lit la base et filtre localement
      // par l'identifiant de relation, sans faire un appel par véhicule.
      const all = await queryDatabase(token, vehiclesDatabaseId);
      pages = all.filter(page =>
        Object.values(page.properties || {}).some(property =>
          property?.type === "relation" &&
          (property.relation || []).some(item => item.id === workshopParkingPage.id)
        )
      );
    }

    const today = parisDate();

    const vehicles = pages
      .filter(page => !page.archived)
      .map(page => {
        const properties = page.properties || {};
        const registration =
          propertyText(firstProperty(properties, [
            "Immatriculation", "Véhicule", "Vehicule", "Nom", "Name"
          ])) || pageTitle(page);

        const workshopDate = propertyDate(firstProperty(properties, [
          "Date atelier", "Entrée atelier", "Entree atelier",
          "Date d'entrée atelier", "Date entree atelier"
        ]));

        const explicitDuration = propertyText(firstProperty(properties, [
          "Durée atelier", "Duree atelier"
        ]));

        const durationDays =
          explicitDuration !== "" && explicitDuration !== null
            ? Number(String(explicitDuration).replace(",", ".")) || 0
            : daysBetweenInclusive(workshopDate, today);

        return {
          id: page.id,
          registration,
          duration_days: durationDays,
          workshop_date: workshopDate,
          cover_url: coverUrl(page)
        };
      })
      .filter(item => item.registration)
      .sort((a, b) => b.duration_days - a.duration_days);

    return json({
      workshop: WORKSHOP_NAME,
      vehicles
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
