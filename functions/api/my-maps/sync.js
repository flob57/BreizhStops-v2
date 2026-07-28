const ALLOWED_HOSTS = new Set(["www.google.com", "google.com"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function onRequestGet({ request }) {
  try {
    const requestUrl = new URL(request.url);
    const source = requestUrl.searchParams.get("url");
    if (!source) return json({ ok: false, error: "URL My Maps manquante." }, 400);

    let target;
    try { target = new URL(source); }
    catch { return json({ ok: false, error: "URL My Maps invalide." }, 400); }

    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname) || target.pathname !== "/maps/d/kml") {
      return json({ ok: false, error: "Seuls les liens KML réseau Google My Maps sont autorisés." }, 400);
    }
    if (!target.searchParams.get("mid")) {
      return json({ ok: false, error: "Identifiant My Maps absent du lien." }, 400);
    }
    target.searchParams.set("forcekml", "1");

    const upstream = await fetch(target.toString(), {
      headers: { "user-agent": "BreizhStops/11.2", "accept": "application/vnd.google-earth.kml+xml, application/vnd.google-earth.kmz, application/xml, text/xml, */*" },
      redirect: "follow"
    });
    if (!upstream.ok) {
      return json({ ok: false, error: `Google My Maps a répondu ${upstream.status}. Vérifie que la carte est accessible par lien.` }, 502);
    }

    const body = await upstream.arrayBuffer();
    if (!body.byteLength) return json({ ok: false, error: "Google My Maps a renvoyé un fichier vide." }, 502);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/vnd.google-earth.kml+xml",
        "content-disposition": 'inline; filename="mymaps.kml"',
        "cache-control": "no-store",
        "x-breizhstops-source": target.toString()
      }
    });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Synchronisation impossible." }, 500);
  }
}
