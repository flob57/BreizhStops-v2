(() => {
  const DB_NAME = "breizhstops-network-routes";
  const STORE = "routes";
  const DB_VERSION = 1;
  let dbPromise;
  let routeLayerGroup;
  let routeRecords = [];

  const $n = id => document.getElementById(id);
  const esc = text => String(text || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function getAllRoutes() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function putRoute(route) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(route);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteRoute(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearRoutes() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function colorFromName(name) {
    const palette = ["#0066cc", "#d62828", "#2a9d8f", "#8a2be2", "#f77f00", "#008000", "#c2185b", "#455a64"];
    let n = 0;
    for (const c of name) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    return palette[n % palette.length];
  }

  function directChildrenByTag(node, tag) {
    return [...node.children].filter(child => child.localName === tag);
  }

  function parseCoordinates(text) {
    return String(text || "").trim().split(/\s+/).map(part => {
      const [lon, lat] = part.split(",").map(Number);
      return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
    }).filter(Boolean);
  }

  function placemarkName(pm, fallback) {
    const name = [...pm.children].find(child => child.localName === "name")?.textContent?.trim();
    return name || fallback;
  }

  function collectLineStrings(node, output = []) {
    for (const child of node.children || []) {
      if (child.localName === "LineString") {
        const coords = [...child.children].find(x => x.localName === "coordinates")?.textContent;
        const points = parseCoordinates(coords);
        if (points.length >= 2) output.push(points);
      } else {
        collectLineStrings(child, output);
      }
    }
    return output;
  }

  function parseKml(kmlText, sourceName) {
    const xml = new DOMParser().parseFromString(kmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("KML invalide");
    const placemarks = [...xml.getElementsByTagNameNS("*", "Placemark")];
    const routes = [];
    placemarks.forEach((pm, index) => {
      const segments = collectLineStrings(pm);
      if (!segments.length) return;
      const name = placemarkName(pm, `${sourceName} ${index + 1}`);
      routes.push({
        id: `kml-${hashText(sourceName + "|" + name + "|" + JSON.stringify(segments))}`,
        name,
        sourceName,
        segments,
        color: colorFromName(name),
        visible: true,
        importedAt: new Date().toISOString()
      });
    });
    return routes;
  }

  async function textFromFile(file) {
    if (file.name.toLowerCase().endsWith(".kmz")) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const entries = fflate.unzipSync(bytes);
      const kmlName = Object.keys(entries).find(name => name.toLowerCase().endsWith(".kml"));
      if (!kmlName) throw new Error("Aucun fichier KML trouvé dans le KMZ");
      return new TextDecoder("utf-8").decode(entries[kmlName]);
    }
    return file.text();
  }

  function ensureLayer() {
    if (!window.map || !window.L) return false;
    if (!routeLayerGroup) routeLayerGroup = L.layerGroup().addTo(map);
    return true;
  }

  function drawRoutes() {
    if (!ensureLayer()) return;
    routeLayerGroup.clearLayers();
    const globalVisible = $n("showAllKml")?.checked !== false;
    if (!globalVisible) return;

    routeRecords.filter(r => r.visible !== false).forEach(route => {
      route.segments.forEach(points => {
        L.polyline(points, { color: route.color, weight: 5, opacity: 0.82 })
          .bindPopup(`<strong>${esc(route.name)}</strong><br><small>${esc(route.sourceName)}</small>`)
          .addTo(routeLayerGroup);
      });
    });
  }

  function renderList() {
    const list = $n("kmlRoutesList");
    if (!list) return;
    if (!routeRecords.length) {
      list.innerHTML = '<p class="empty">Aucun tracé importé.</p>';
      return;
    }
    list.innerHTML = routeRecords.slice().sort((a,b) => a.name.localeCompare(b.name, "fr")).map(route => `
      <article class="kml-route-row" data-id="${esc(route.id)}">
        <label class="kml-route-main">
          <input class="kml-route-visible" type="checkbox" ${route.visible !== false ? "checked" : ""}>
          <span class="kml-route-swatch" style="background:${esc(route.color)}"></span>
          <span><strong>${esc(route.name)}</strong><small>${esc(route.sourceName)} · ${route.segments.length} tracé(s)</small></span>
        </label>
        <div class="kml-route-actions">
          <button type="button" class="secondary kml-zoom">Voir</button>
          <button type="button" class="danger kml-delete">Supprimer</button>
        </div>
      </article>`).join("");
  }

  function routeBounds(route) {
    const points = route.segments.flat();
    return points.length ? L.latLngBounds(points) : null;
  }

  async function importFiles(files) {
    const status = $n("kmlImportStatus");
    const all = [...files].filter(f => /\.(kml|kmz)$/i.test(f.name));
    if (!all.length) {
      status.textContent = "Aucun fichier KML ou KMZ sélectionné.";
      return;
    }
    let imported = 0, replaced = 0, failed = 0, totalRoutes = 0;
    for (let i = 0; i < all.length; i++) {
      const file = all[i];
      status.textContent = `Analyse ${i + 1}/${all.length} : ${file.name}`;
      try {
        const text = await textFromFile(file);
        const parsed = parseKml(text, file.name.replace(/\.(kml|kmz)$/i, ""));
        totalRoutes += parsed.length;
        for (const route of parsed) {
          const exists = routeRecords.some(old => old.id === route.id);
          await putRoute(route);
          if (exists) replaced++; else imported++;
        }
      } catch (error) {
        console.error(file.name, error);
        failed++;
      }
    }
    routeRecords = await getAllRoutes();
    renderList(); drawRoutes();
    status.textContent = `${all.length} fichier(s) traité(s) · ${totalRoutes} tracé(s) trouvé(s) · ${imported} ajouté(s) · ${replaced} déjà présent(s) · ${failed} échec(s).`;
  }

  function fitAllVisible() {
    const bounds = [];
    routeRecords.filter(r => r.visible !== false).forEach(r => r.segments.flat().forEach(p => bounds.push(p)));
    if (bounds.length) map.fitBounds(bounds, { padding: [35,35] });
  }

  async function init() {
    const dialog = $n("kmlLibraryDialog");
    if (!dialog) return;
    routeRecords = await getAllRoutes();
    ensureLayer(); renderList(); drawRoutes();

    $n("openKmlLibrary")?.addEventListener("click", () => { renderList(); dialog.showModal(); });
    const input = $n("kmlFiles");
    const zone = $n("kmlDropZone");
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") input.click(); });
    ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, e => { e.preventDefault(); zone.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(type => zone.addEventListener(type, e => { e.preventDefault(); zone.classList.remove("dragging"); }));
    zone.addEventListener("drop", e => importFiles(e.dataTransfer.files));
    input.addEventListener("change", () => { importFiles(input.files); input.value = ""; });
    $n("showAllKml")?.addEventListener("change", drawRoutes);
    $n("fitKmlRoutes")?.addEventListener("click", fitAllVisible);
    $n("deleteAllKml")?.addEventListener("click", async () => {
      if (!confirm("Supprimer tous les tracés KML enregistrés ?")) return;
      await clearRoutes(); routeRecords = []; renderList(); drawRoutes();
    });
    $n("kmlRoutesList")?.addEventListener("click", async e => {
      const row = e.target.closest(".kml-route-row");
      if (!row) return;
      const route = routeRecords.find(r => r.id === row.dataset.id);
      if (!route) return;
      if (e.target.closest(".kml-delete")) {
        await deleteRoute(route.id); routeRecords = routeRecords.filter(r => r.id !== route.id); renderList(); drawRoutes();
      } else if (e.target.closest(".kml-zoom")) {
        const bounds = routeBounds(route); if (bounds) map.fitBounds(bounds, {padding:[30,30]}); dialog.close();
      }
    });
    $n("kmlRoutesList")?.addEventListener("change", async e => {
      if (!e.target.classList.contains("kml-route-visible")) return;
      const row = e.target.closest(".kml-route-row");
      const route = routeRecords.find(r => r.id === row.dataset.id);
      route.visible = e.target.checked; await putRoute(route); drawRoutes();
    });
  }

  const timer = setInterval(() => {
    if (window.map && window.L) { clearInterval(timer); init().catch(console.error); }
  }, 100);
})();
