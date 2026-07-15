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

function titleValue(property) {
  if (!property) {
    return "";
  }

  const values =
    property.title ||
    property.rich_text ||
    (
      property.formula?.string
        ? [{ plain_text: property.formula.string }]
        : []
    );

  return values
    .map(item =>
      item.plain_text ||
      item.text?.content ||
      ""
    )
    .join("")
    .trim();
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

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || `Erreur Notion ${response.status}`
    );
  }

  return payload;
}

async function getAllBlockChildren(blockId, token) {
  let results = [];
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

    results = results.concat(payload.results || []);
    cursor = payload.has_more
      ? payload.next_cursor
      : undefined;
  } while (cursor);

  return results;
}

function richTextItemsToText(items) {
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

function blockText(block) {
  const value = block?.[block.type];
  return richTextItemsToText(value?.rich_text);
}

function normalizeTime(value) {
  const match = String(value || "").match(
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/
  );

  if (!match) {
    return "";
  }

  const hours = String(Number(match[1])).padStart(2, "0");
  const minutes = match[2];
  const seconds = match[3] || "00";

  return `${hours}:${minutes}:${seconds}`;
}

function removeTimeFromText(value) {
  return String(value || "")
    .replace(
      /\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function isHeaderText(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return [
    "arret",
    "arrets",
    "nom de l arret",
    "nom de l'arrêt",
    "stop",
    "stop name",
    "heure",
    "horaire",
    "time"
  ].includes(normalized);
}

function parseTableRow(row) {
  const cells = row?.table_row?.cells || [];

  const values = cells
    .map(cell => richTextItemsToText(cell))
    .map(value => value.trim());

  if (!values.some(Boolean)) {
    return null;
  }

  const timeCell = values.find(value => normalizeTime(value));
  const time = normalizeTime(timeCell);

  if (!time) {
    return null;
  }

  const stopCandidates = values
    .map(removeTimeFromText)
    .filter(Boolean)
    .filter(value => !isHeaderText(value))
    .sort((a, b) => b.length - a.length);

  const name = stopCandidates[0] || "";

  if (!name) {
    return null;
  }

  return {
    time,
    name
  };
}

function parseTimeStopText(text) {
  const time = normalizeTime(text);

  if (!time) {
    return null;
  }

  const name = removeTimeFromText(text);

  if (!name || isHeaderText(name)) {
    return null;
  }

  return {
    time,
    name
  };
}

async function parseCoursePage(pageId, token, config) {
  const page = await notionFetch(
    `https://api.notion.com/v1/pages/${pageId}`,
    token
  );

  const properties = page.properties || {};

  const titleProperty = Object.values(properties)
    .find(property => property.type === "title");

  const name =
    titleValue(properties[config.course_title_property]) ||
    titleValue(titleProperty) ||
    "Course";

  const girouette =
    titleValue(properties[config.girouette_property]) ||
    "";

  const service =
    titleValue(properties[config.service_property]) ||
    "";

  const network =
    titleValue(properties[config.network_property]) ||
    "";

  const blocks = await getAllBlockChildren(pageId, token);
  const stops = [];

  for (const block of blocks) {
    if (block.type === "table") {
      const rows = await getAllBlockChildren(block.id, token);

      for (const row of rows) {
        const parsed = parseTableRow(row);

        if (parsed) {
          stops.push(parsed);
        }
      }

      continue;
    }

    const parsed = parseTimeStopText(blockText(block));

    if (parsed) {
      stops.push(parsed);
    }
  }

  const uniqueStops = [];
  const seen = new Set();

  for (const stop of stops) {
    const key = `${stop.time}|${stop.name}`;

    if (!seen.has(key)) {
      seen.add(key);
      uniqueStops.push(stop);
    }
  }

  return {
    notion_page_id: pageId,
    name,
    girouette,
    service,
    network,
    stops: uniqueStops
  };
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
        context.env.NOTION_DATE_PROPERTY ||
        "Date",

      course_properties:
        JSON.parse(
          context.env.NOTION_COURSE_PROPERTIES ||
          '["Course 1","Course 2","Course 3","Course 4","Course 5"]'
        ),

      course_title_property:
        context.env.NOTION_COURSE_TITLE_PROPERTY ||
        "Nom",

      girouette_property:
        context.env.NOTION_GIROUETTE_PROPERTY ||
        "Girouette",

      service_property:
        context.env.NOTION_SERVICE_PROPERTY ||
        "Service",

      network_property:
        context.env.NOTION_NETWORK_PROPERTY ||
        "Réseau"
    };

    const body = await context.request.json();

    const date = String(
      body.date ||
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
            date: {
              equals: date
            }
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

    for (const coursePageId of [...new Set(coursePageIds)]) {
      const course = await parseCoursePage(
        coursePageId,
        token,
        config
      );

      if (!course.stops.length) {
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
       * On remplace les passages de cette course.
       * Cela corrige automatiquement les anciennes lignes
       * qui avaient été enregistrées sans nom d'arrêt.
       */
      await db.prepare(
        "DELETE FROM sae_course_stops WHERE course_id = ?"
      ).bind(courseId).run();

      const statements = course.stops.map(
        (stop, index) =>
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

      for (
        let index = 0;
        index < statements.length;
        index += 80
      ) {
        await db.batch(
          statements.slice(index, index + 80)
        );
      }

      courseCount++;
      stopCount += course.stops.length;
    }

    return json({
      courses: courseCount,
      stops: stopCount
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
