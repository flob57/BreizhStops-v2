import {
  json,
  error,
  requireDb,
  createId
} from "../../../_lib.js";

const NOTION_VERSION = "2022-06-28";
const PAGE_CACHE = new Map();
const PAGE_TEXT_CACHE = new Map();

function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

async function notionRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...notionHeaders(token),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Réponse Notion illisible (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(payload.message || `Erreur Notion ${response.status}`);
  }

  return payload;
}

function richText(items = []) {
  return items
    .map(item =>
      item.plain_text ||
      item.text?.content ||
      item.name ||
      ""
    )
    .join("")
    .trim();
}

function basicPropertyText(property) {
  if (!property) {
    return "";
  }

  switch (property.type) {
    case "title":
      return richText(property.title);
    case "rich_text":
      return richText(property.rich_text);
    case "number":
      return property.number === null || property.number === undefined
        ? ""
        : String(property.number);
    case "select":
      return property.select?.name || "";
    case "status":
      return property.status?.name || "";
    case "formula":
      return (
        property.formula?.string ||
        property.formula?.number?.toString() ||
        ""
      );
    case "rollup": {
      const rollup = property.rollup;

      if (rollup?.type === "array") {
        return rollup.array
          .map(item => basicPropertyText(item))
          .filter(Boolean)
          .join(", ");
      }

      if (rollup?.type === "number") {
        return rollup.number?.toString() || "";
      }

      return "";
    }
    default:
      return "";
  }
}

async function notionPage(pageId, token) {
  if (!pageId) {
    return null;
  }

  if (PAGE_CACHE.has(pageId)) {
    return PAGE_CACHE.get(pageId);
  }

  const page = await notionRequest(
    `https://api.notion.com/v1/pages/${pageId}`,
    token
  );

  PAGE_CACHE.set(pageId, page);
  return page;
}

function findProperty(properties, expectedNames = []) {
  const entries = Object.entries(properties || {});

  for (const expectedName of expectedNames) {
    const exact = entries.find(
      ([name]) =>
        name.trim().toLowerCase() ===
        expectedName.trim().toLowerCase()
    );

    if (exact) {
      return exact[1];
    }
  }

  return null;
}

async function pageTitle(pageId, token) {
  const page = await notionPage(pageId, token);

  if (!page) {
    return "";
  }

  const titleProperty = Object.values(page.properties || {})
    .find(property => property.type === "title");

  return basicPropertyText(titleProperty);
}

async function relationPageText(
  pageId,
  token,
  options = {},
  depth = 0,
  visited = new Set()
) {
  const cacheKey = `${pageId}|${options.preferredProperty || ""}`;

  if (PAGE_TEXT_CACHE.has(cacheKey)) {
    return PAGE_TEXT_CACHE.get(cacheKey);
  }

  if (!pageId || depth > 4 || visited.has(pageId)) {
    return "";
  }

  const nextVisited = new Set(visited);
  nextVisited.add(pageId);

  const page = await notionPage(pageId, token);

  if (!page) {
    return "";
  }

  const properties = page.properties || {};

  /*
   * Dans les bases de prises de service, la propriété « Conducteur »
   * pointe vers une page Affectation. Cette page contient elle-même
   * une relation « Conducteur » vers la fiche réelle du conducteur.
   */
  const preferredNames = [
    options.preferredProperty,
    "Conducteur",
    "Conducteurs",
    "Nom du conducteur",
    "Chauffeur",
    "Agent"
  ].filter(Boolean);

  const preferredProperty = findProperty(
    properties,
    preferredNames
  );

  if (preferredProperty) {
    const preferredValue = await propertyText(
      preferredProperty,
      token,
      {
        ...options,
        depth: depth + 1,
        visited: nextVisited
      }
    );

    if (preferredValue) {
      PAGE_TEXT_CACHE.set(cacheKey, preferredValue);
      return preferredValue;
    }
  }

  const titleProperty = Object.values(properties)
    .find(property => property.type === "title");

  const title = basicPropertyText(titleProperty);

  if (title) {
    PAGE_TEXT_CACHE.set(cacheKey, title);
    return title;
  }

  /*
   * Dernier recours : rechercher une relation unique et la suivre.
   * Cela rend le lecteur robuste si la propriété est renommée.
   */
  const relationProperties = Object.values(properties)
    .filter(property =>
      property.type === "relation" &&
      Array.isArray(property.relation) &&
      property.relation.length > 0
    );

  if (relationProperties.length === 1) {
    const fallback = await propertyText(
      relationProperties[0],
      token,
      {
        ...options,
        depth: depth + 1,
        visited: nextVisited
      }
    );

    PAGE_TEXT_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  PAGE_TEXT_CACHE.set(cacheKey, "");
  return "";
}

async function propertyText(property, token, options = {}) {
  if (!property) {
    return "";
  }

  const simple = basicPropertyText(property);

  if (simple) {
    return simple;
  }

  const depth = options.depth || 0;
  const visited = options.visited || new Set();

  if (depth > 6) {
    return "";
  }

  if (property.type === "relation") {
    const values = [];

    for (const relation of property.relation || []) {
      const value = await relationPageText(
        relation.id,
        token,
        options,
        depth,
        visited
      );

      if (value && !values.includes(value)) {
        values.push(value);
      }
    }

    return values.join(", ");
  }

  if (property.type === "rollup") {
    const rollup = property.rollup;

    if (!rollup) {
      return "";
    }

    if (rollup.type === "array") {
      const values = [];

      for (const item of rollup.array || []) {
        /*
         * Notion renvoie les éléments d’un rollup sous la même forme
         * que des propriétés : relation, title, rich_text, etc.
         */
        const value = await propertyText(
          item,
          token,
          {
            ...options,
            depth: depth + 1,
            visited
          }
        );

        if (value) {
          value
            .split(",")
            .map(part => part.trim())
            .filter(Boolean)
            .forEach(part => {
              if (!values.includes(part)) {
                values.push(part);
              }
            });
        }
      }

      return values.join(", ");
    }

    if (rollup.type === "number") {
      return rollup.number === null || rollup.number === undefined
        ? ""
        : String(rollup.number);
    }

    if (rollup.type === "date") {
      return rollup.date?.start || "";
    }

    return "";
  }

  if (property.type === "formula") {
    const formula = property.formula || {};

    if (formula.type === "string") {
      return formula.string || "";
    }

    if (formula.type === "number") {
      return formula.number === null || formula.number === undefined
        ? ""
        : String(formula.number);
    }

    if (formula.type === "boolean") {
      return formula.boolean ? "Oui" : "Non";
    }

    if (formula.type === "date") {
      return formula.date?.start || "";
    }
  }

  return "";
}


async function strictDriverNameFromPage(
  pageId,
  token,
  depth = 0,
  visited = new Set()
) {
  if (!pageId || depth > 6 || visited.has(pageId)) {
    return "";
  }

  const nextVisited = new Set(visited);
  nextVisited.add(pageId);

  const page = await notionPage(pageId, token);

  if (!page) {
    return "";
  }

  const properties = page.properties || {};

  const driverRelation = Object.entries(properties).find(
    ([name, property]) =>
      ["conducteur", "conducteurs", "chauffeur", "agent"]
        .includes(name.trim().toLowerCase()) &&
      property?.type === "relation" &&
      Array.isArray(property.relation) &&
      property.relation.length > 0
  );

  if (driverRelation) {
    for (const relation of driverRelation[1].relation) {
      const nestedName = await strictDriverNameFromPage(
        relation.id,
        token,
        depth + 1,
        nextVisited
      );

      if (nestedName) {
        return nestedName;
      }
    }
  }

  const titleProperty = Object.values(properties)
    .find(property => property?.type === "title");

  const title = basicPropertyText(titleProperty);

  if (title) {
    return title;
  }

  const relationProperties = Object.values(properties)
    .filter(property =>
      property?.type === "relation" &&
      Array.isArray(property.relation) &&
      property.relation.length > 0
    );

  if (relationProperties.length === 1) {
    for (const relation of relationProperties[0].relation) {
      const nestedName = await strictDriverNameFromPage(
        relation.id,
        token,
        depth + 1,
        nextVisited
      );

      if (nestedName) {
        return nestedName;
      }
    }
  }

  return "";
}

async function strictDriverNameFromProperty(property, token) {
  if (!property) {
    return "";
  }

  if (property.type === "relation") {
    for (const relation of property.relation || []) {
      const name = await strictDriverNameFromPage(
        relation.id,
        token
      );

      if (name) {
        return name;
      }
    }

    return "";
  }

  if (
    property.type === "rollup" &&
    property.rollup?.type === "array"
  ) {
    for (const item of property.rollup.array || []) {
      const name = await strictDriverNameFromProperty(
        item,
        token
      );

      if (name) {
        return name;
      }
    }
  }

  return "";
}

async function allDatabasePages(databaseId, token) {
  const results = [];
  let cursor;

  do {
    const body = {
      page_size: 100
    };

    if (cursor) {
      body.start_cursor = cursor;
    }

    const payload = await notionRequest(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      token,
      {
        method: "POST",
        body: JSON.stringify(body)
      }
    );

    results.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return results;
}

function parisDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function weekdayNumber(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12));
  return utcDate.getUTCDay();
}

async function activeCalendarEvent(db, date) {
  return db.prepare(
    `SELECT
       id,
       label,
       event_type,
       start_date,
       end_date,
       service_profile,
       notes
     FROM depot_calendar
     WHERE start_date <= ?
       AND end_date >= ?
     ORDER BY
       CASE event_type
         WHEN 'public_holiday' THEN 1
         WHEN 'school_holiday' THEN 2
         ELSE 3
       END,
       start_date DESC
     LIMIT 1`
  ).bind(date, date).first();
}

async function resolveProfile(db, date) {
  const event = await activeCalendarEvent(db, date);
  const weekday = weekdayNumber(date);

  if (event) {
    if (event.service_profile === "none") {
      return {
        profile: "none",
        label: event.label,
        reason: event.event_type
      };
    }

    if (event.service_profile === "lmjv") {
      return {
        profile: "lmjv",
        label: event.label,
        reason: event.event_type
      };
    }

    if (event.service_profile === "wednesday") {
      return {
        profile: "wednesday",
        label: event.label,
        reason: event.event_type
      };
    }

    return {
      profile: "vacation",
      label: event.label,
      reason: event.event_type
    };
  }

  if (weekday === 0) {
    return {
      profile: "none",
      label: "Dimanche",
      reason: "weekday"
    };
  }

  if (weekday === 3) {
    return {
      profile: "wednesday",
      label: "Mercredi période scolaire",
      reason: "weekday"
    };
  }

  if (weekday === 6) {
    return {
      profile: "vacation",
      label: "Samedi période scolaire",
      reason: "weekday"
    };
  }

  return {
    profile: "lmjv",
    label: "LMJV période scolaire",
    reason: "weekday"
  };
}

function databaseIdForProfile(env, profile) {
  if (profile === "lmjv") {
    return env.NOTION_LMJV_DATABASE_ID;
  }

  if (profile === "wednesday") {
    return env.NOTION_WEDNESDAY_DATABASE_ID;
  }

  if (profile === "vacation") {
    return env.NOTION_SATURDAY_HOLIDAYS_DATABASE_ID;
  }

  return "";
}

function sortTime(value) {
  const match = String(value || "").match(/([01]?\d|2[0-3]):([0-5]\d)/);

  if (!match) {
    return "99:99";
  }

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const token = context.env.NOTION_TOKEN;

    if (!token) {
      throw new Error("Secret NOTION_TOKEN absent.");
    }

    const body = await context.request.json().catch(() => ({}));
    const date = String(body.date || parisDate());

    const resolution = await resolveProfile(db, date);

    if (resolution.profile === "none") {
      await db.prepare(
        "DELETE FROM duty_services WHERE service_date = ?"
      ).bind(date).run();

      return json({
        date,
        profile: "none",
        profile_label: resolution.label,
        imported: 0,
        services: []
      });
    }

    const databaseId = databaseIdForProfile(
      context.env,
      resolution.profile
    );

    if (!databaseId) {
      throw new Error(
        `Identifiant Notion absent pour le profil ${resolution.profile}.`
      );
    }

    const pages = await allDatabasePages(databaseId, token);
    const offset = Math.max(0, Number(body.offset || 0));
    const reset = body.reset === true;

    if (reset) {
      await db.prepare(
        "DELETE FROM duty_services WHERE service_date = ?"
      ).bind(date).run();
    }

    if (offset >= pages.length) {
      return json({
        date,
        profile: resolution.profile,
        profile_label: resolution.label,
        imported: 0,
        processed: offset,
        total_services: pages.length,
        done: true,
        next_offset: null
      });
    }

    const page = pages[offset];
    const properties = page.properties || {};

    const psTime = await propertyText(properties["PS"], token);
    const qubReference = await propertyText(properties["QUB"], token);

    let driverName = await strictDriverNameFromProperty(
      properties["Conducteur"],
      token
    );

    if (!driverName) {
      const relationProperties = Object.values(properties)
        .filter(property =>
          property?.type === "relation" &&
          Array.isArray(property.relation) &&
          property.relation.length > 0
        );

      for (const relationProperty of relationProperties) {
        for (const relation of relationProperty.relation) {
          const candidate = await strictDriverNameFromPage(
            relation.id,
            token
          );

          if (candidate) {
            driverName = candidate;
            break;
          }
        }

        if (driverName) {
          break;
        }
      }
    }

    const firstCourse = await propertyText(
      properties["Course 1"],
      token
    );

    const vehicleRegistration = await propertyText(
      properties["Véhicule"],
      token
    );

    let imported = 0;

    if (
      psTime ||
      qubReference ||
      driverName ||
      firstCourse ||
      vehicleRegistration
    ) {
      const row = {
        id: `duty-${date}-${page.id}`,
        notion_page_id: page.id,
        ps_time: psTime,
        qub_reference: qubReference,
        driver_name: driverName,
        first_course: firstCourse,
        vehicle_registration: vehicleRegistration
      };

      await db.prepare(
        `INSERT INTO duty_services (
           id,
           service_date,
           source_profile,
           notion_page_id,
           ps_time,
           qub_reference,
           driver_name,
           first_course,
           vehicle_registration,
           source_payload,
           created_at,
           updated_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
         )
         ON CONFLICT(id) DO UPDATE SET
           source_profile = excluded.source_profile,
           ps_time = excluded.ps_time,
           qub_reference = excluded.qub_reference,
           driver_name = excluded.driver_name,
           first_course = excluded.first_course,
           vehicle_registration = excluded.vehicle_registration,
           source_payload = excluded.source_payload,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(
        row.id,
        date,
        resolution.profile,
        row.notion_page_id,
        row.ps_time,
        row.qub_reference,
        row.driver_name,
        row.first_course,
        row.vehicle_registration,
        JSON.stringify(row)
      ).run();

      imported = 1;
    }

    const nextOffset = offset + 1;

    return json({
      date,
      profile: resolution.profile,
      profile_label: resolution.label,
      imported,
      processed: nextOffset,
      total_services: pages.length,
      done: nextOffset >= pages.length,
      next_offset:
        nextOffset >= pages.length
          ? null
          : nextOffset
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
