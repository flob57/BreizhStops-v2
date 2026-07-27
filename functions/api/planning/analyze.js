
import {
  json, error, safeJson, parseClock, normalizeRegistration
} from "../../_planning.js";
import {
  queryDatabase, propertyText, firstProperty, pageTitle
} from "../../_home_status.js";

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const VEHICLE_DB_FALLBACK = "2e66bbfa7ec1804f963bc019a4d6de92";

function dataUrl(buffer, mimeType) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return `data:${mimeType || "image/png"};base64,${btoa(binary)}`;
}

function promptFor(type, expectedDate) {
  const base = `
Tu analyses une capture d'écran d'un planning d'exploitation d'autocars.
Réponds UNIQUEMENT avec du JSON valide, sans markdown.
La date attendue est ${expectedDate || "à détecter dans l'image"}.
Les heures sont estimées à partir de la grille horizontale 0h-24h.
Utilise un niveau de confiance entre 0 et 1.
`;

  if (type === "vehicle") {
    return base + `
Il s'agit d'un planning VEHICULES.
La première colonne contient les numéros de parc Océlorn.
Une ligne avec au moins un segment signifie que le véhicule roule ou a une activité.
ATELIER signifie atelier. TRANSFERT signifie transfert.
Ne cherche pas à lire tous les codes de course : détecte surtout la première et la dernière activité.
Retourne:
{
  "planning_type":"vehicle",
  "date":"YYYY-MM-DD",
  "items":[
    {
      "ocelorn_number":"AE CR06307",
      "registration":"",
      "start_time":"07:15",
      "end_time":"18:10",
      "activity_type":"circulation|atelier|transfert|inactif",
      "activity_label":"texte bref",
      "confidence":0.95
    }
  ]
}`;
  }

  if (type === "workshop") {
    return base + `
Il s'agit d'un tableau de PLANNING ATELIER hebdomadaire.
Lis chaque rendez-vous réel et retourne:
{
  "planning_type":"workshop",
  "date":"YYYY-MM-DD",
  "items":[
    {
      "entity_name":"immatriculation ou référence",
      "registration":"immatriculation si lisible",
      "start_time":"08:30",
      "end_time":"17:00",
      "activity_type":"atelier",
      "activity_label":"nature du rendez-vous",
      "location":"lieu",
      "details":"dépôt, dépose, reprise, voiture bloquée, personne présente",
      "confidence":0.95
    }
  ]
}`;
  }

  return base + `
Il s'agit d'un planning CONDUCTEURS.
La première colonne contient les noms.
Règles:
- RH ou RHO = repos
- CONGE = congé
- AT = accident du travail
- MALADIE = arrêt maladie
- REPOS = repos
- premier segment violet = prise de service
- dernier segment violet = fin de service
- segment noir = HLP
- code commençant par Q = course QUB
- code commençant par AE = course BreizhGo
- code commençant par LC = course Le Coeur
- segment bleu clair ou rose = service occasionnel
- un espace entre activités = coupure/pause
Retourne un item par segment ou absence:
{
  "planning_type":"driver",
  "date":"YYYY-MM-DD",
  "items":[
    {
      "entity_name":"NOM conducteur",
      "start_time":"06:30",
      "end_time":"08:45",
      "activity_type":"prise_service|conduite_qub|conduite_breizhgo|conduite_lecoeur|hlp|occasionnel|coupure|repos|conge|at|maladie|fin_service",
      "activity_label":"code lisible ou libellé",
      "confidence":0.85
    }
  ]
}`;
}

function uniquePropertyValue(property) {
  if (!property) return "";
  if (property.type === "unique_id") {
    const prefix = property.unique_id?.prefix || "";
    const number = property.unique_id?.number;
    return number == null ? "" : `${prefix}${number}`;
  }
  return propertyText(property);
}

async function vehicleIndex(context) {
  const token = context.env.NOTION_TOKEN;
  if (!token) return new Map();

  const databaseId =
    context.env.NOTION_VEHICLES_DATABASE_ID || VEHICLE_DB_FALLBACK;
  const pages = await queryDatabase(token, databaseId);
  const index = new Map();

  for (const page of pages) {
    const properties = page.properties || {};
    const registration =
      propertyText(firstProperty(properties, [
        "Immatriculation", "Véhicule", "Vehicule", "Nom", "Name"
      ])) || pageTitle(page);

    const ocelorn = uniquePropertyValue(firstProperty(properties, [
      "N° parc Océlorn", "N° Parc Océlorn", "Parc Océlorn",
      "N° parc", "Numéro de parc", "Numero de parc"
    ]));

    const keys = [
      String(ocelorn || "").toUpperCase().replace(/\s+/g, ""),
      String(ocelorn || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
      String(ocelorn || "").toUpperCase().trim()
    ].filter(Boolean);

    for (const key of keys) {
      index.set(key, normalizeRegistration(registration));
    }
  }

  return index;
}

function resolveVehicle(item, index) {
  const raw = String(item.ocelorn_number || "");
  const candidates = [
    raw.toUpperCase().replace(/\s+/g, ""),
    raw.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    raw.toUpperCase().trim()
  ];

  for (const key of candidates) {
    if (index.has(key)) return index.get(key);
  }
  return normalizeRegistration(item.registration);
}

export async function onRequestPost(context) {
  try {
    if (!context.env.AI) {
      return error(
        "La liaison Workers AI nommée AI n'est pas configurée dans Cloudflare Pages.",
        503
      );
    }

    const form = await context.request.formData();
    const file = form.get("image");
    const type = String(form.get("type") || "vehicle");
    const expectedDate = String(form.get("date") || "");

    if (!(file instanceof File)) return error("Image manquante.", 400);
    if (!["vehicle", "workshop", "driver"].includes(type)) {
      return error("Type de planning invalide.", 400);
    }
    if (file.size > 12 * 1024 * 1024) {
      return error("L'image dépasse 12 Mo.", 413);
    }

    const image = dataUrl(await file.arrayBuffer(), file.type);
    const response = await context.env.AI.run(VISION_MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Tu extrais des données structurées depuis des captures de planning. " +
            "Tu dois produire exclusivement du JSON valide."
        },
        { role: "user", content: promptFor(type, expectedDate) }
      ],
      image,
      max_tokens: 6000,
      temperature: 0.1
    });

    const parsed = safeJson(
      response?.response || response?.result || response,
      { planning_type: type, date: expectedDate, items: [] }
    );

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const index = type === "vehicle" ? await vehicleIndex(context) : new Map();

    const normalizedItems = items.map(item => ({
      entity_name: String(item.entity_name || ""),
      registration:
        type === "vehicle"
          ? resolveVehicle(item, index)
          : normalizeRegistration(item.registration),
      ocelorn_number: String(item.ocelorn_number || ""),
      start_time: parseClock(item.start_time),
      end_time: parseClock(item.end_time),
      activity_type: String(item.activity_type || ""),
      activity_label: String(item.activity_label || ""),
      location: String(item.location || ""),
      details: String(item.details || ""),
      confidence: Math.max(0, Math.min(1, Number(item.confidence || 0))),
      source_payload: item
    }));

    return json({
      planning_type: type,
      date: String(parsed.date || expectedDate || ""),
      items: normalizedItems,
      model: VISION_MODEL
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
