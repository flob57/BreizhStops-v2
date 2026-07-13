export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export function requireAdmin(context) {
  const configured = context.env.ADMIN_TOKEN;

  if (!configured) {
    throw new Error(
      "Configuration Cloudflare incomplète : secret ADMIN_TOKEN absent."
    );
  }

  const authorization =
    context.request.headers.get("Authorization") || "";

  if (authorization !== `Bearer ${configured}`) {
    return error("Accès administrateur refusé.", 401);
  }

  return null;
}

export function requireDb(context) {
  if (!context.env.DB) {
    throw new Error(
      "Configuration Cloudflare incomplète : liaison D1 DB absente."
    );
  }

  return context.env.DB;
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createId(prefix = "") {
  return `${prefix}${crypto.randomUUID()}`;
}
