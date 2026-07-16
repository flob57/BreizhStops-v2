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
  return items.map(item =>
    item.plain_text ||
    item.text?.content ||
    item.equation?.expression ||
    ""
  ).join("").replace(/\u00a0/g, " ").trim();
}

function propertyText(property) {
  if (!property) return "";

  switch (property.type) {
    case "title":
      return richText(property.title);
    case "rich_text":
      return richText(property.rich_text);
    case "number":
      return property.number == null ? "" : String(property.number);
    case "select":
      return property.select?.name || "";
    case "status":
      return property.status?.name || "";
    case "formula":
      return property.formula?.string ||
        (property.formula?.number == null ? "" : String(property.formula.number));
    case "rollup":
      if (property.rollup?.type === "array") {
        return property.rollup.array.map(propertyText).filter(Boolean).join(", ");
      }
      return property.rollup?.number == null ? "" : String(property.rollup.number);
    default:
      return "";
  }
}

function relationIds(property) {
  if (property?.type === "relation") {
    return (property.relation || []).map(item => item.id);
  }

  if (property?.type === "rollup" && property.rollup?.type === "array") {
    return property.rollup.array.flatMap(relationIds);
  }

  return [];
}

function normalizeTime(value) {
  const match = String(value || "").match(
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/
  );

  if (!match) return "";

  return `${String(Number(match[1])).padStart(2, "0")}:` +
    `${match[2]}:${match[3] || "00"}`;
}

function removeTime(value) {
  return String(value || "")
    .replace(/\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalized(value) {
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
    "arret", "arrets", "nom arret", "nom de l arret",
    "stop", "stop name", "heure", "horaire", "time"
  ]).has(normalized(value));
}

async function getAllChildren(blockId, token) {
  const results = [];
  let cursor;

  do {
    const url = new URL(
      `https://api.notion.com/v1/blocks/${blockId}/children`
    );
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const payload = await notionRequest(url.toString(), token);
    results.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return results;
}

function parseTableRow(row) {
  const values = (row?.table_row?.cells || []).map(richText);
  const time = values.map(normalizeTime).find(Boolean);
  if (!time) return null;

  const names = values.map(removeTime)
    .filter(Boolean)
    .filter(value => !isHeader(value))
    .sort((a, b) => b.length - a.length);

  return names.length ? { name: names[0], time } : null;
}

function parseTextBlock(block) {
  const value = block?.[block.type];
  const text = richText(value?.rich_text);
  const time = normalizeTime(text);
  const name = removeTime(text);

  if (!time || !name || isHeader(name)) return null;
  return { name, time };
}

async function parseCoursePage(pageId, token) {
  const page = await notionRequest(
    `https://api.notion.com/v1/pages/${pageId}`,
    token
  );

  const titleProperty = Object.values(page.properties || {})
    .find(property => property.type === "title");

  const course = {
    name: propertyText(titleProperty) || "Course",
    stops: []
  };

  const blocks = await getAllChildren(pageId, token);

  for (const block of blocks) {
    if (block.type === "table") {
      const rows = await getAllChildren(block.id, token);
      for (const row of rows) {
        const parsed = parseTableRow(row);
        if (parsed) course.stops.push(parsed);
      }
    } else {
      const parsed = parseTextBlock(block);
      if (parsed) course.stops.push(parsed);
    }
  }

  const seen = new Set();
  course.stops = course.stops.filter(stop => {
    const key = `${stop.time}|${normalized(stop.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return course;
}

async function allDatabasePages(databaseId, token) {
  const results = [];
  let cursor;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const payload = await notionRequest(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      token,
      { method: "POST", body: JSON.stringify(body) }
    );

    results.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);

  return results;
}

function weekdayNumber(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

async function resolveProfile(db, date) {
  const event = await db.prepare(
    `SELECT label, service_profile
     FROM depot_calendar
     WHERE start_date <= ? AND end_date >= ?
     ORDER BY
       CASE event_type WHEN 'public_holiday' THEN 1 ELSE 2 END,
       start_date DESC
     LIMIT 1`
  ).bind(date, date).first();

  if (event) {
    return {
      profile: event.service_profile,
      label: event.label
    };
  }

  const day = weekdayNumber(date);
  if (day === 0) return { profile: "none", label: "Dimanche" };
  if (day === 3) return { profile: "wednesday", label: "Mercredi période scolaire" };
  if (day === 6) return { profile: "vacation", label: "Samedi période scolaire" };
  return { profile: "lmjv", label: "LMJV période scolaire" };
}

function databaseId(env, profile) {
  if (profile === "lmjv") return env.NOTION_LMJV_DATABASE_ID;
  if (profile === "wednesday") return env.NOTION_WEDNESDAY_DATABASE_ID;
  if (profile === "vacation") return env.NOTION_SATURDAY_HOLIDAYS_DATABASE_ID;
  return "";
}

function departureTimeFromProperty(property) {
  const direct = propertyText(property);
  const time = normalizeTime(direct);
  if (time) return time;

  if (property?.type === "date") {
    const start = property.date?.start || "";
    const match = start.match(/T(\d{2}:\d{2})(?::\d{2})?/);
    if (match) return `${match[1]}:00`;
  }

  return "";
}

export async function onRequestPost(context) {
  try {
    const db = requireDb(context);
    const token = context.env.NOTION_TOKEN;
    if (!token) throw new Error("Secret NOTION_TOKEN absent.");

    const body = await context.request.json().catch(() => ({}));
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return error("Date invalide.", 400);
    }

    const resolution = await resolveProfile(db, date);

    if (resolution.profile === "none") {
      await db.prepare(
        "DELETE FROM daily_departures WHERE service_date = ?"
      ).bind(date).run();

      return json({
        date,
        profile: "none",
        profile_label: resolution.label,
        imported: 0
      });
    }

    const dbId = databaseId(context.env, resolution.profile);
    if (!dbId) {
      throw new Error(`Identifiant Notion absent pour ${resolution.profile}.`);
    }

    const servicePages = await allDatabasePages(dbId, token);
    const offset = Math.max(0, Number(body.offset || 0));
    const reset = body.reset === true;

    if (reset) {
      await db.prepare(
        "DELETE FROM daily_departures WHERE service_date = ?"
      ).bind(date).run();
    }

    if (offset >= servicePages.length) {
      return json({
        date,
        profile: resolution.profile,
        profile_label: resolution.label,
        imported: 0,
        processed: offset,
        total_services: servicePages.length,
        done: true,
        next_offset: null
      });
    }

    const servicePage = servicePages[offset];

    const duty = await db.prepare(
      `SELECT driver_name, vehicle_registration, qub_reference
       FROM duty_services
       WHERE service_date = ?
         AND notion_page_id = ?
       LIMIT 1`
    ).bind(date, servicePage.id).first() || {};

    const properties = servicePage.properties || {};
    const rows = [];
    const courseCache = new Map();

    const courseEntries = Object.entries(properties)
      .map(([name, property]) => {
        const match = name.match(/^Course\s*(\d+)$/i);
        return match ? {
          index: Number(match[1]),
          property
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);

    for (const entry of courseEntries) {
      const coursePageId = relationIds(entry.property)[0];
      if (!coursePageId) continue;

      const scheduleProperty =
        properties[`Horaire ${entry.index}`] ||
        properties[`Horaire${entry.index}`];

      let departureTime = departureTimeFromProperty(scheduleProperty);

      let course = courseCache.get(coursePageId);
      if (!course) {
        course = await parseCoursePage(coursePageId, token);
        courseCache.set(coursePageId, course);
      }

      if (!course.stops.length) continue;
      if (!departureTime) departureTime = course.stops[0].time;

      rows.push({
        id: `departure-${date}-${servicePage.id}-${entry.index}`,
        source_service_page_id: servicePage.id,
        course_index: entry.index,
        course_page_id: coursePageId,
        departure_time: departureTime,
        course_name: course.name,
        origin_name: course.stops[0]?.name || "",
        arrival_time: course.stops.at(-1)?.time || "",
        driver_name: duty.driver_name || "",
        vehicle_registration: duty.vehicle_registration || "",
        qub_reference: duty.qub_reference || "",
        stops_json: JSON.stringify(course.stops)
      });
    }

    /*
     * Replace only the departures belonging to the current service.
     * Other services are handled by subsequent invocations.
     */
    await db.prepare(
      `DELETE FROM daily_departures
       WHERE service_date = ?
         AND source_service_page_id = ?`
    ).bind(date, servicePage.id).run();

    for (const row of rows) {
      await db.prepare(
        `INSERT INTO daily_departures (
           id, service_date, source_profile,
           source_service_page_id, course_index, course_page_id,
           departure_time, course_name, origin_name, arrival_time,
           driver_name, vehicle_registration, qub_reference, stops_json,
           created_at, updated_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT(id) DO UPDATE SET
           source_profile = excluded.source_profile,
           departure_time = excluded.departure_time,
           course_name = excluded.course_name,
           origin_name = excluded.origin_name,
           arrival_time = excluded.arrival_time,
           driver_name = excluded.driver_name,
           vehicle_registration = excluded.vehicle_registration,
           qub_reference = excluded.qub_reference,
           stops_json = excluded.stops_json,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(
        row.id, date, resolution.profile,
        row.source_service_page_id, row.course_index, row.course_page_id,
        row.departure_time, row.course_name, row.origin_name, row.arrival_time,
        row.driver_name, row.vehicle_registration, row.qub_reference,
        row.stops_json
      ).run();
    }

    const nextOffset = offset + 1;

    return json({
      date,
      profile: resolution.profile,
      profile_label: resolution.label,
      imported: rows.length,
      processed: nextOffset,
      total_services: servicePages.length,
      done: nextOffset >= servicePages.length,
      next_offset: nextOffset >= servicePages.length ? null : nextOffset
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
