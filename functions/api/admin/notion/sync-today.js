import {
  json,
  error,
  requireDb
} from "../../../_lib.js";

const NOTION_VERSION = "2022-06-28";

function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

function plainText(items) {
  return (items || [])
    .map(item =>
      item.plain_text ||
      item.text?.content ||
      item.equation?.expression ||
      ""
    )
    .join("")
    .replace(/\u00a0/g, " ")
    .trim();
}

function propertyText(property) {
  if (!property) {
    return "";
  }

  if (property.type === "title") {
    return plainText(property.title);
  }

  if (property.type === "rich_text") {
    return plainText(property.rich_text);
  }

  if (property.type === "select") {
    return property.select?.name || "";
  }

  if (property.type === "status") {
    return property.status?.name || "";
  }

  if (property.type === "number") {
    return property.number === null || property.number === undefined
      ? ""
      : String(property.number);
  }

  if (property.type === "formula") {
    return (
      property.formula?.string ||
      property.formula?.number?.toString() ||
      ""
    );
  }

  return "";
}

function relationIds(property) {
  return (property?.relation || []).map(item => item.id);
}

async function notionFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...notionHeaders(token),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Réponse Notion illisible (${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      payload.message || `Erreur Notion ${response.status}`
    );
  }

  return payload;
}

async function getAllChildren(blockId, token) {
  const results = [];
  let cursor;

  do {
    const url = new URL(
      `https://api.notion.com/v1/blocks/${blockId}/children`
    );

    url.searchParams.set("page_size", "100");

    if (cursor) {
      url.searchParams.set("start_cursor", cursor);
    }

    const payload = await notionFetch(url.toString(), token);
    results.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return results;
}

function normalizeTime(value) {
  const match = String(value || "").match(
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/
  );

  if (!match) {
    return "";
  }

  return (
    `${String(Number(match[1])).padStart(2, "0")}:` +
    `${match[2]}:${match[3] || "00"}`
  );
}

function removeTime(value) {
  return String(value || "")
    .replace(
      /\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedLabel(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeader(value) {
  return new Set([
    "arret",
    "arrets",
    "nom arret",
    "nom de l arret",
    "stop",
    "stop name",
    "heure",
    "horaire",
    "time"
  ]).has(normalizedLabel(value));
}

function parseTableRow(row) {
  const cells = row?.table_row?.cells || [];
  const values = cells.map(cell => plainText(cell));

  if (!values.some(Boolean)) {
    return null;
  }

  const time = values
    .map(normalizeTime)
    .find(Boolean);

  if (!time) {
    return null;
  }

  const candidates = values
    .map(removeTime)
    .filter(Boolean)
    .filter(value => !isHeader(value));

  if (!candidates.length) {
    return null;
  }

  // The stop name is normally the non-time cell. Longest text is safest
  // when an extra empty/comment column exists.
  candidates.sort((a, b) => b.length - a.length);

  return {
    name: candidates[0],
    time
  };
}

function parseTextBlock(block) {
  const value = block?.[block.type];
  const text = plainText(value?.rich_text);
  const time = normalizeTime(text);

  if (!time) {
    return null;
  }

  const name = removeTime(text);

  if (!name || isHeader(name)) {
    return null;
  }

  return { name, time };
}

async function parseCoursePage(pageId, token, config) {
  const page = await notionFetch(
    `https://api.notion.com/v1/pages/${pageId}`,
    token
  );

  const properties = page.properties || {};
  const titleProperty = Object.values(properties)
    .find(property => property.type === "title");

  const course = {
    notion_page_id: pageId,
    name:
      propertyText(properties[config.course_title_property]) ||
      propertyText(titleProperty) ||
      "Course",
    girouette:
      propertyText(properties[config.girouette_property]) || "",
    service:
      propertyText(properties[config.service_property]) || "",
    network:
      propertyText(properties[config.network_property]) || "",
    stops: []
  };

  const blocks = await getAllChildren(pageId, token);

  for (const block of blocks) {
    if (block.type === "table") {
      const rows = await getAllChildren(block.id, token);

      for (const row of rows) {
        const parsed = parseTableRow(row);

        if (parsed) {
          course.stops.push(parsed);
        }
      }

      continue;
    }

    const parsed = parseTextBlock(block);

    if (parsed) {
      course.stops.push(parsed);
    }
  }

  // Remove duplicate rows while preserving order.
  const seen = new Set();

  course.stops = course.stops.filter(stop => {
    const key = `${stop.time}|${normalizedLabel(stop.name)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return course;
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const token = context.env.NOTION_TOKEN;
    const databaseId =
      context.env.NOTION_PLANNING_DATABASE_ID;

    if (!token || !databaseId) {
      throw new Error(
        "Variables Cloudflare manquantes : " +
        "NOTION_TOKEN ou NOTION_PLANNING_DATABASE_ID."
      );
    }

    const config = {
      date_property:
        context.env.NOTION_DATE_PROPERTY || "Date",

      course_properties:
        JSON.parse(
          context.env.NOTION_COURSE_PROPERTIES ||
          '["Course 1","Course 2","Course 3","Course 4","Course 5"]'
        ),

      course_title_property:
        context.env.NOTION_COURSE_TITLE_PROPERTY || "Nom",

      girouette_property:
        context.env.NOTION_GIROUETTE_PROPERTY || "Girouette",

      service_property:
        context.env.NOTION_SERVICE_PROPERTY || "Service",

      network_property:
        context.env.NOTION_NETWORK_PROPERTY || "Réseau"
    };

    const requestBody = await context.request.json();
    const date = String(
      requestBody.date ||
      new Date().toISOString().slice(0, 10)
    );

    const query = await notionFetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          filter: {
            property: config.date_property,
            date: { equals: date }
          },
          page_size: 10
        })
      }
    );

    const coursePageIds = [];

    for (const planningPage of query.results || []) {
      const properties = planningPage.properties || {};

      for (const propertyName of config.course_properties) {
        coursePageIds.push(
          ...relationIds(properties[propertyName])
        );
      }
    }

    let courseCount = 0;
    let stopCount = 0;
    const warnings = [];

    for (const coursePageId of [...new Set(coursePageIds)]) {
      const course = await parseCoursePage(
        coursePageId,
        token,
        config
      );

      if (!course.stops.length) {
        warnings.push(
          `Aucun arrêt lisible dans la page « ${course.name} ».`
        );
        continue;
      }

      const courseId = `notion-${coursePageId}`;

      await db.prepare(
        `INSERT INTO sae_courses (
           id,
           notion_page_id,
           service_date,
           name,
           network,
           service,
           girouette,
           start_time,
           end_time,
           source,
           created_at,
           updated_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?, ?, 'notion',
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
         )
         ON CONFLICT(id) DO UPDATE SET
           service_date = excluded.service_date,
           name = excluded.name,
           network = excluded.network,
           service = excluded.service,
           girouette = excluded.girouette,
           start_time = excluded.start_time,
           end_time = excluded.end_time,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(
        courseId,
        course.notion_page_id,
        date,
        course.name,
        course.network,
        course.service,
        course.girouette,
        course.stops[0]?.time || "",
        course.stops.at(-1)?.time || ""
      ).run();

      /*
       * Existing rows are replaced so previous broken imports with blank
       * stop names are repaired immediately.
       */
      await db.prepare(
        "DELETE FROM sae_course_stops WHERE course_id = ?"
      ).bind(courseId).run();

      const statements = course.stops.map((stop, index) =>
        db.prepare(
          `INSERT INTO sae_course_stops (
             id,
             course_id,
             stop_sequence,
             stop_name,
             scheduled_time,
             created_at,
             updated_at
           ) VALUES (
             ?, ?, ?, ?, ?,
             CURRENT_TIMESTAMP,
             CURRENT_TIMESTAMP
           )`
        ).bind(
          `${courseId}-stop-${index + 1}`,
          courseId,
          index + 1,
          stop.name,
          stop.time
        )
      );

      for (let index = 0; index < statements.length; index += 80) {
        await db.batch(statements.slice(index, index + 80));
      }

      courseCount++;
      stopCount += course.stops.length;
    }

    return json({
      courses: courseCount,
      stops: stopCount,
      warnings
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
