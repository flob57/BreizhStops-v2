import {
  json, error, requireDb, ensureTodoSchema, parisDate
} from "../../_todos.js";

const DEFAULT_DATABASE_ID = "3846bbfa7ec180928dc0d29a9b7aa8c6";

function richText(parts) {
  return Array.isArray(parts)
    ? parts.map(part => part?.plain_text || part?.text?.content || "").join("").trim()
    : "";
}

function propertyText(property) {
  if (!property) return "";
  switch (property.type) {
    case "title":
      return richText(property.title);
    case "rich_text":
      return richText(property.rich_text);
    case "select":
      return property.select?.name || "";
    case "status":
      return property.status?.name || "";
    case "multi_select":
      return (property.multi_select || []).map(item => item.name).join(", ");
    case "formula":
      return String(
        property.formula?.string ??
        property.formula?.number ??
        property.formula?.boolean ??
        ""
      );
    default:
      return "";
  }
}

function dateValue(property) {
  if (!property) return "";
  if (property.type === "date") return property.date?.start?.slice(0, 10) || "";
  if (property.type === "formula" && property.formula?.type === "date") {
    return property.formula.date?.start?.slice(0, 10) || "";
  }
  return "";
}

function firstProperty(properties, names) {
  for (const name of names) {
    if (properties[name]) return properties[name];
  }
  return null;
}

function pageTitle(page) {
  for (const property of Object.values(page?.properties || {})) {
    if (property?.type === "title") {
      const value = propertyText(property);
      if (value) return value;
    }
  }
  return "";
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function weekdayFor(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long"
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

async function notionRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `Erreur Notion ${response.status}.`);
  }
  return payload;
}

async function queryAllPages(token, databaseId) {
  const pages = [];
  let cursor = null;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const payload = await notionRequest(
      token,
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      { method: "POST", body: JSON.stringify(body) }
    );

    pages.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return pages;
}

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    await ensureTodoSchema(db);

    const token = context.env.NOTION_TOKEN;
    if (!token) return error("Secret NOTION_TOKEN absent.", 500);

    const url = new URL(context.request.url);
    const date = url.searchParams.get("date") || parisDate();
    const dayName = normalize(weekdayFor(date));
    const databaseId =
      context.env.NOTION_TODO_DATABASE_ID || DEFAULT_DATABASE_ID;

    const pages = await queryAllPages(token, databaseId);

    const completedRows = await db.prepare(
      `SELECT notion_page_id
       FROM todo_completions
       WHERE completion_date = ?`
    ).bind(date).all();

    const completed = new Set(
      (completedRows.results || []).map(row => row.notion_page_id)
    );

    const tasks = [];

    for (const page of pages) {
      if (page.archived || completed.has(page.id)) continue;

      const properties = page.properties || {};
      const title =
        propertyText(firstProperty(properties, ["To do", "Tâche", "Tache", "Nom", "Name"])) ||
        pageTitle(page);

      if (!title) continue;

      const recurringDay = propertyText(
        firstProperty(properties, ["Jour", "Day"])
      );
      const taskDate = dateValue(
        firstProperty(properties, ["Date", "Échéance", "Echéance", "Due"])
      );

      const recurringMatches =
        recurringDay && normalize(recurringDay) === dayName;
      const datedMatches = taskDate && taskDate === date;

      if (!recurringMatches && !datedMatches) continue;

      tasks.push({
        id: page.id,
        title,
        kind: datedMatches ? "unique" : "recurring",
        day: recurringDay || "",
        date: taskDate || ""
      });
    }

    tasks.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "unique" ? -1 : 1;
      return a.title.localeCompare(b.title, "fr");
    });

    return json({
      date,
      weekday: weekdayFor(date),
      tasks
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
