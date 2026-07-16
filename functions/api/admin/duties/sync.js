import {
  json,
  error,
  requireDb,
  createId
} from "../../../_lib.js";

const NOTION_VERSION = "2022-06-28";
const PAGE_CACHE = new Map();

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

async function pageTitle(pageId, token) {
  if (!pageId) {
    return "";
  }

  if (PAGE_CACHE.has(pageId)) {
    return PAGE_CACHE.get(pageId);
  }

  const page = await notionRequest(
    `https://api.notion.com/v1/pages/${pageId}`,
    token
  );

  const titleProperty = Object.values(page.properties || {})
    .find(property => property.type === "title");

  const title = basicPropertyText(titleProperty);
  PAGE_CACHE.set(pageId, title);
  return title;
}

async function propertyText(property, token) {
  const simple = basicPropertyText(property);

  if (simple) {
    return simple;
  }

  if (property?.type === "relation") {
    const titles = [];

    for (const relation of property.relation || []) {
      const title = await pageTitle(relation.id, token);

      if (title) {
        titles.push(title);
      }
    }

    return titles.join(", ");
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
    const rows = [];

    for (const page of pages) {
      const properties = page.properties || {};

      const psTime = await propertyText(properties["PS"], token);
      const qubReference = await propertyText(properties["QUB"], token);
      const driverName = await propertyText(properties["Conducteur"], token);
      const firstCourse = await propertyText(properties["Course 1"], token);
      const vehicleRegistration = await propertyText(
        properties["Véhicule"],
        token
      );

      if (
        !psTime &&
        !qubReference &&
        !driverName &&
        !firstCourse &&
        !vehicleRegistration
      ) {
        continue;
      }

      rows.push({
        id: `duty-${date}-${page.id}`,
        notion_page_id: page.id,
        ps_time: psTime,
        qub_reference: qubReference,
        driver_name: driverName,
        first_course: firstCourse,
        vehicle_registration: vehicleRegistration
      });
    }

    rows.sort((left, right) =>
      sortTime(left.ps_time).localeCompare(sortTime(right.ps_time))
    );

    const currentIds = rows.map(row => row.id);

    if (currentIds.length) {
      const placeholders = currentIds.map(() => "?").join(",");

      await db.prepare(
        `DELETE FROM duty_services
         WHERE service_date = ?
           AND id NOT IN (${placeholders})`
      ).bind(date, ...currentIds).run();
    } else {
      await db.prepare(
        "DELETE FROM duty_services WHERE service_date = ?"
      ).bind(date).run();
    }

    for (const row of rows) {
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
    }

    return json({
      date,
      profile: resolution.profile,
      profile_label: resolution.label,
      imported: rows.length,
      services: rows
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
