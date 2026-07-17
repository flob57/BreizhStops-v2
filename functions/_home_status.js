
import { json, error } from "./_lib.js";

export { json, error };

export function richText(parts) {
  return Array.isArray(parts)
    ? parts.map(part => part?.plain_text || part?.text?.content || "").join("").trim()
    : "";
}

export function propertyText(property) {
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
    case "number":
      return property.number ?? "";
    case "formula":
      return property.formula?.string ??
             property.formula?.number ??
             property.formula?.boolean ??
             "";
    case "rollup":
      return property.rollup?.number ??
             property.rollup?.date?.start ??
             "";
    default:
      return "";
  }
}

export function propertyDate(property) {
  if (!property) return "";
  if (property.type === "date") return property.date?.start?.slice(0, 10) || "";
  if (property.type === "formula" && property.formula?.type === "date") {
    return property.formula.date?.start?.slice(0, 10) || "";
  }
  if (property.type === "rollup" && property.rollup?.type === "date") {
    return property.rollup.date?.start?.slice(0, 10) || "";
  }
  return "";
}

export function firstProperty(properties, names) {
  for (const name of names) {
    if (properties?.[name]) return properties[name];
  }
  return null;
}

export function pageTitle(page) {
  for (const property of Object.values(page?.properties || {})) {
    if (property?.type === "title") {
      const value = propertyText(property);
      if (value) return value;
    }
  }
  return "";
}

export async function notionRequest(token, url, options = {}) {
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

export async function queryAllPages(token, databaseId) {
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

export function coverUrl(page) {
  const cover = page?.cover;
  if (!cover) return "";
  if (cover.type === "external") return cover.external?.url || "";
  if (cover.type === "file") return cover.file?.url || "";
  return "";
}


export async function queryDatabase(token, databaseId, body = {}) {
  const pages = [];
  let cursor = null;

  do {
    const requestBody = {
      page_size: 100,
      ...body
    };
    if (cursor) requestBody.start_cursor = cursor;

    const payload = await notionRequest(
      token,
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      { method: "POST", body: JSON.stringify(requestBody) }
    );

    pages.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return pages;
}

export async function notionPage(token, pageId) {
  return notionRequest(
    token,
    `https://api.notion.com/v1/pages/${pageId}`,
    { method: "GET" }
  );
}

export async function relationTitles(token, property) {
  if (!property || property.type !== "relation") return [];

  const titles = [];
  for (const relation of property.relation || []) {
    const page = await notionPage(token, relation.id);
    const title = pageTitle(page);
    if (title && !titles.includes(title)) titles.push(title);
  }
  return titles;
}

export function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function daysBetweenInclusive(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const [sy, sm, sd] = startDate.slice(0,10).split("-").map(Number);
  const [ey, em, ed] = endDate.slice(0,10).split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.max(0, Math.floor((end - start) / 86400000) + 1);
}
