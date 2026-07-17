
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
