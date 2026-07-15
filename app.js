const ROUTING_ENDPOINT = "https://router.project-osrm.org/route/v1/driving";

let stops = [];
let routeStops = [];
let currentResults = [];
let selectedStartStop = null;
let currentPosition = null;
let activeStop = null;

let map;
let markersLayer;
let routeLayer;
let waypointLayer;
let markerById = new Map();

let routeWaypoints = [];
let tracedRoute = null;
let editingRouteId = null;
let waypointMode = false;
let routeDisplayMode = false;
let createStopMode = false;
let pendingStopPosition = null;
let analysedImport = [];
let importAnalysis = null;

const $ = id => document.getElementById(id);

const searchInput = $("search");
const resultsEl = $("results");
const counterEl = $("counter");
const routeListEl = $("routeList");
const routeSummaryEl = $("routeSummary");

const openRouteBtn = $("openRoute");
const openInRouteBtn = $("openInRoute");
const exportGpxBtn = $("exportGpx");
const optimizeRouteBtn = $("optimizeRoute");
const traceRouteBtn = $("traceRoute");
const saveRouteBtn = $("saveRoute");
const shareRouteBtn = $("shareRoute");
const clearRouteBtn = $("clearRoute");

const networkFilter = $("networkFilter");
const cityFilter = $("cityFilter");
const statusEl = $("status");

const startStopArea = $("startStopArea");
const startStopSearch = $("startStopSearch");
const startStopResults = $("startStopResults");
const selectedStartStopEl = $("selectedStartStop");
const locationStatus = $("locationStatus");

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function apiHeaders(json = true) {
  return json
    ? { "Content-Type": "application/json" }
    : {};
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object"
        ? payload.error || "Erreur du serveur"
        : payload || "Erreur du serveur";

    throw new Error(message);
  }

  return payload;
}

function getDepartureMode() {
  return document.querySelector(
    'input[name="departureMode"]:checked'
  )?.value || "current";
}

function initMap() {
  map = L.map("map").setView([48.2, -3.2], 8);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  waypointLayer = L.layerGroup().addTo(map);

  map.on("click", event => {
    if (createStopMode) {
      createStopMode = false;
      map.getContainer().classList.remove("create-stop-cursor");
      pendingStopPosition = {
        lat: event.latlng.lat,
        lon: event.latlng.lng
      };
      openCreateStopDialog(pendingStopPosition);
      return;
    }

    if (!waypointMode) {
      return;
    }

    routeWaypoints.push({
      lat: event.latlng.lat,
      lon: event.latlng.lng,
      nom: "Passage imposé"
    });

    renderWaypoints();
    traceRoute().catch(error => alert(error.message));
  });
}

async function loadStops() {
  statusEl.textContent = "Chargement des arrêts…";

  try {
    const response = await fetch(
      `./data/stops.json?v=${Date.now()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Le fichier stops.json est invalide.");
    }

    stops = data;

    try {
      const extraStops = await apiFetch("/api/stops-extra");
      if (Array.isArray(extraStops)) {
        const existingIds = new Set(stops.map(stop => String(stop.id)));
        extraStops.forEach(stop => {
          if (!existingIds.has(String(stop.id))) {
            stops.push(stop);
            existingIds.add(String(stop.id));
          }
        });
      }
    } catch (extraError) {
      console.warn("Arrêts D1 non chargés :", extraError);
    }

    initMap();
    updateLinkedFilters();
    refreshSearch();
    updateRoute();

    statusEl.textContent = `${stops.length} arrêts chargés`;
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Erreur de chargement";
    resultsEl.innerHTML = `
      <p>
        Impossible de charger les arrêts.<br>
        <small>${escapeHtml(error.message)}</small>
      </p>
    `;
  }
}

function fillSelect(select, defaultLabel, values, selectedValue) {
  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  select.appendChild(defaultOption);

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  select.value =
    selectedValue && values.includes(selectedValue)
      ? selectedValue
      : "";
}

function updateLinkedFilters() {
  const selectedNetwork = networkFilter.value;
  const selectedCity = cityFilter.value;

  const cities = [
    ...new Set(
      stops
        .filter(stop =>
          !selectedNetwork || stop.reseau === selectedNetwork
        )
        .map(stop => stop.commune)
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "fr"));

  const networks = [
    ...new Set(
      stops
        .filter(stop =>
          !selectedCity || stop.commune === selectedCity
        )
        .map(stop => stop.reseau)
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "fr"));

  fillSelect(cityFilter, "Toutes les communes", cities, selectedCity);
  fillSelect(networkFilter, "Tous les réseaux", networks, selectedNetwork);
}

function refreshSearch() {
  updateLinkedFilters();

  const query = normalize(searchInput.value.trim());
  const selectedNetwork = networkFilter.value;
  const selectedCity = cityFilter.value;
  const words = query.split(/\s+/).filter(Boolean);

  const matches = stops.filter(stop => {
    if (selectedNetwork && stop.reseau !== selectedNetwork) {
      return false;
    }

    if (selectedCity && stop.commune !== selectedCity) {
      return false;
    }

    if (!words.length) {
      return Boolean(selectedNetwork || selectedCity);
    }

    const haystack = normalize(
      `${stop.nom || ""} ${stop.commune || ""} ${stop.reseau || ""}`
    );

    return words.every(word => haystack.includes(word));
  });

  currentResults = matches.slice(0, 100);
  displayResults(currentResults, matches.length);

  if (!routeDisplayMode) {
    displayMarkers(currentResults);
  }
}

function getSourceBadges(stop) {
  const badges = [];

  if (stop.verified_terrain || stop.trusted) {
    badges.push(`<span class="badge trusted">✓ Vérifié terrain</span>`);
  }

  if (Array.isArray(stop.sources)) {
    stop.sources.forEach(source => {
      badges.push(`<span class="badge">${escapeHtml(source)}</span>`);
    });
  }

  return badges.join("");
}

function displayResults(results, total) {
  counterEl.textContent =
    `${total} résultat(s). ` +
    (total > results.length ? "Affichage des 100 premiers." : "");

  if (!results.length) {
    resultsEl.innerHTML = "<p>Aucun arrêt trouvé.</p>";
    markersLayer?.clearLayers();
    return;
  }

  resultsEl.innerHTML = results.map((stop, index) => `
    <article class="result">
      <div class="result-title">
        🚏 ${escapeHtml(stop.nom || "Arrêt sans nom")}
      </div>

      <div class="meta">
        📍 ${escapeHtml(stop.commune || "Commune inconnue")}
        ${stop.reseau ? ` — 🚌 ${escapeHtml(stop.reseau)}` : ""}
      </div>

      <div class="badges">${getSourceBadges(stop)}</div>

      <button onclick="zoomToStop(${index})">Voir sur la carte</button>
      <button onclick="openStopSheet(${index})">📝 Fiche arrêt</button>

      <a
        class="map-link"
        target="_blank"
        rel="noopener"
        href="https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lon}"
      >
        Google Maps
      </a>

      <button onclick="addToRoute(${index})">Ajouter</button>
    </article>
  `).join("");
}

function displayMarkers(results) {
  markersLayer.clearLayers();
  markerById.clear();

  const bounds = [];

  results.forEach(stop => {
    const lat = Number(stop.lat);
    const lon = Number(stop.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const marker = L.marker([lat, lon]);
    const safeId = String(stop.id)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");

    marker.bindPopup(`
      <div class="popup-title">
        🚏 ${escapeHtml(stop.nom || "Arrêt sans nom")}
      </div>
      <div>📍 ${escapeHtml(stop.commune || "")}</div>
      <div>🚌 ${escapeHtml(stop.reseau || "")}</div>
      <br>
      <button onclick="openStopSheetById('${safeId}')">
        📝 Fiche arrêt
      </button>
      <button onclick="addStopById('${safeId}')">
        Ajouter à l’itinéraire
      </button>
    `);

    marker.addTo(markersLayer);
    markerById.set(String(stop.id), marker);
    bounds.push([lat, lon]);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 16);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 15
    });
  }
}


function displayRouteMarkers(points) {
  markersLayer.clearLayers();
  markerById.clear();

  points.forEach((stop, index) => {
    const lat = Number(stop.lat);
    const lon = Number(stop.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const icon = L.divIcon({
      className: "",
      html: `<div class="route-stop-marker">${index + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const marker = L.marker([lat, lon], { icon })
      .bindPopup(`
        <div class="popup-title">
          ${index + 1}. 🚏 ${escapeHtml(stop.nom || "Arrêt")}
        </div>
        <div>📍 ${escapeHtml(stop.commune || "")}</div>
      `)
      .addTo(markersLayer);

    markerById.set(String(stop.id), marker);
  });

  routeDisplayMode = true;
  $("showAllStops").classList.remove("hidden");
}

function restoreAllStopMarkers() {
  routeDisplayMode = false;
  $("showAllStops").classList.add("hidden");
  displayMarkers(currentResults);
}

function zoomToStop(index) {
  const stop = currentResults[index];

  if (!stop) {
    return;
  }

  map.setView([Number(stop.lat), Number(stop.lon)], 16);
  markerById.get(String(stop.id))?.openPopup();
}

function addToRoute(index) {
  const stop = currentResults[index];

  if (stop) {
    addStop(stop);
  }
}

function addStopById(id) {
  const stop = stops.find(item => String(item.id) === String(id));

  if (stop) {
    addStop(stop);
  }
}

function addStop(stop) {
  if (!routeStops.some(item => String(item.id) === String(stop.id))) {
    routeStops.push(stop);
    invalidateTrace();
    updateRoute();
  }
}

function removeFromRoute(index) {
  routeStops.splice(index, 1);
  invalidateTrace();
  updateRoute();
}

function moveRouteStop(index, direction) {
  const target = index + direction;

  if (target < 0 || target >= routeStops.length) {
    return;
  }

  [routeStops[index], routeStops[target]] =
    [routeStops[target], routeStops[index]];

  invalidateTrace();
  updateRoute();
}

function invalidateTrace() {
  tracedRoute = null;
  routeLayer?.clearLayers();
  routeSummaryEl.classList.add("hidden");
  saveRouteBtn.disabled = true;
  shareRouteBtn.disabled = true;
}

function updateRoute() {
  if (!routeStops.length) {
    routeListEl.className = "empty";
    routeListEl.innerHTML = "Aucun arrêt ajouté.";
  } else {
    routeListEl.className = "";

    routeListEl.innerHTML = routeStops.map((stop, index) => `
      <div class="route-item">
        ${index + 1}.
        <strong>${escapeHtml(stop.nom || "Arrêt sans nom")}</strong>
        <br>
        ${escapeHtml(stop.commune || "")}

        <div class="route-item-buttons">
          <button
            onclick="moveRouteStop(${index}, -1)"
            ${index === 0 ? "disabled" : ""}
          >↑</button>

          <button
            onclick="moveRouteStop(${index}, 1)"
            ${index === routeStops.length - 1 ? "disabled" : ""}
          >↓</button>

          <button
            class="secondary"
            onclick="removeFromRoute(${index})"
          >Retirer</button>
        </div>
      </div>
    `).join("");
  }

  const enabled = routeStops.length >= 2;

  traceRouteBtn.disabled = !enabled;
  optimizeRouteBtn.disabled = !enabled;
  openRouteBtn.disabled = !enabled;
  openInRouteBtn.disabled = !enabled;
  exportGpxBtn.disabled = !enabled;

  if (!tracedRoute) {
    saveRouteBtn.disabled = true;
    shareRouteBtn.disabled = true;
  }
}

function handleDepartureModeChange() {
  const mode = getDepartureMode();

  if (mode === "stop") {
    startStopArea.classList.remove("hidden");
    locationStatus.textContent =
      "Choisis l’arrêt qui doit rester en première position.";
  } else {
    startStopArea.classList.add("hidden");
    startStopResults.innerHTML = "";

    locationStatus.textContent =
      mode === "automatic"
        ? "L’ordre complet sera optimisé."
        : "La position sera demandée lors du tracé.";
  }

  invalidateTrace();
}

function searchStartStops() {
  const query = normalize(startStopSearch.value.trim());

  if (query.length < 2) {
    startStopResults.innerHTML = "";
    return;
  }

  const words = query.split(/\s+/).filter(Boolean);

  const matches = stops
    .filter(stop => {
      const haystack = normalize(
        `${stop.nom || ""} ${stop.commune || ""} ${stop.reseau || ""}`
      );

      return words.every(word => haystack.includes(word));
    })
    .slice(0, 8);

  startStopResults.innerHTML = matches.map(stop => {
    const safeId = String(stop.id)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");

    return `
      <div
        class="start-result"
        onclick="selectStartStop('${safeId}')"
      >
        <strong>${escapeHtml(stop.nom || "")}</strong><br>
        ${escapeHtml(stop.commune || "")}
        ${stop.reseau ? ` — ${escapeHtml(stop.reseau)}` : ""}
      </div>
    `;
  }).join("");
}

function selectStartStop(id) {
  const stop = stops.find(item => String(item.id) === String(id));

  if (!stop) {
    return;
  }

  selectedStartStop = stop;

  selectedStartStopEl.innerHTML = `
    <div class="selected-start">
      <strong>Départ sélectionné :</strong><br>
      🚏 ${escapeHtml(stop.nom || "")}<br>
      📍 ${escapeHtml(stop.commune || "")}<br><br>
      <button class="secondary" onclick="clearSelectedStartStop()">
        Modifier
      </button>
    </div>
  `;

  startStopResults.innerHTML = "";
  startStopSearch.value = "";
  invalidateTrace();
}

function clearSelectedStartStop() {
  selectedStartStop = null;
  selectedStartStopEl.innerHTML = "";
  startStopSearch.focus();
  invalidateTrace();
}

function distanceKm(a, b) {
  const earthRadius = 6371;
  const latA = Number(a.lat) * Math.PI / 180;
  const latB = Number(b.lat) * Math.PI / 180;
  const deltaLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
  const deltaLon = (Number(b.lon) - Number(a.lon)) * Math.PI / 180;

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) *
    Math.cos(latB) *
    Math.sin(deltaLon / 2) ** 2;

  return earthRadius * 2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function routeDistance(points) {
  let total = 0;

  for (let index = 0; index < points.length - 1; index++) {
    total += distanceKm(points[index], points[index + 1]);
  }

  return total;
}

function nearestNeighbour(start, points) {
  const remaining = [...points];
  const ordered = [];
  let current = start;

  while (remaining.length) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    remaining.forEach((point, index) => {
      const distance = distanceKm(current, point);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const next = remaining.splice(nearestIndex, 1)[0];
    ordered.push(next);
    current = next;
  }

  return ordered;
}

function optimizeWithoutFixedStart(points) {
  let bestRoute = [...points];
  let bestDistance = routeDistance(bestRoute);

  points.forEach(start => {
    const remaining = points.filter(
      point => String(point.id) !== String(start.id)
    );

    const candidate = [start, ...nearestNeighbour(start, remaining)];
    const distance = routeDistance(candidate);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestRoute = candidate;
    }
  });

  return bestRoute;
}

async function getCurrentPositionPoint() {
  if (currentPosition) {
    return currentPosition;
  }

  if (!navigator.geolocation) {
    throw new Error("La géolocalisation n’est pas disponible.");
  }

  locationStatus.textContent = "Recherche de la position actuelle…";

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });

  currentPosition = {
    id: "__current_position__",
    nom: "Ma position actuelle",
    lat: position.coords.latitude,
    lon: position.coords.longitude
  };

  locationStatus.textContent =
    `Position détectée : ${currentPosition.lat.toFixed(5)}, ` +
    `${currentPosition.lon.toFixed(5)}`;

  return currentPosition;
}

async function buildOrderedRoute(optimize = true) {
  if (routeStops.length < 2) {
    throw new Error("Ajoute au moins deux arrêts.");
  }

  const mode = getDepartureMode();

  if (mode === "current") {
    const start = await getCurrentPositionPoint();

    return optimize
      ? [start, ...nearestNeighbour(start, routeStops)]
      : [start, ...routeStops];
  }

  if (mode === "stop") {
    if (!selectedStartStop) {
      throw new Error("Choisis d’abord l’arrêt de départ.");
    }

    const remaining = routeStops.filter(
      stop => String(stop.id) !== String(selectedStartStop.id)
    );

    return optimize
      ? [selectedStartStop, ...nearestNeighbour(selectedStartStop, remaining)]
      : [selectedStartStop, ...remaining];
  }

  return optimize
    ? optimizeWithoutFixedStart(routeStops)
    : [...routeStops];
}

async function optimizeRoute() {
  try {
    const ordered = await buildOrderedRoute(true);
    const mode = getDepartureMode();

    routeStops = ordered.filter(point =>
      point.id !== "__current_position__" &&
      (
        mode !== "stop" ||
        String(point.id) !== String(selectedStartStop?.id)
      )
    );

    invalidateTrace();
    updateRoute();
  } catch (error) {
    alert(error.message);
  }
}

function renderWaypoints() {
  waypointLayer.clearLayers();

  routeWaypoints.forEach((point, index) => {
    L.marker(
      [point.lat, point.lon],
      {
        draggable: true,
        title: `Passage ${index + 1}`
      }
    )
      .bindTooltip(`Passage ${index + 1}`)
      .on("dragend", event => {
        const position = event.target.getLatLng();
        routeWaypoints[index].lat = position.lat;
        routeWaypoints[index].lon = position.lng;

        traceRoute().catch(error => alert(error.message));
      })
      .addTo(waypointLayer);
  });
}

async function traceRoute() {
  const orderedStops = await buildOrderedRoute(false);

  const points = [
    ...orderedStops.slice(0, 1),
    ...routeWaypoints,
    ...orderedStops.slice(1)
  ];

  const coordinates = points
    .map(point => `${Number(point.lon)},${Number(point.lat)}`)
    .join(";");

  statusEl.textContent = "Calcul de l’itinéraire…";

  try {
    const url =
      `${ROUTING_ENDPOINT}/${coordinates}` +
      "?overview=full&geometries=geojson&steps=false";

    const data = await apiFetch(url);

    if (!data.routes?.length) {
      throw new Error("Aucun itinéraire routier trouvé.");
    }

    const route = data.routes[0];

    tracedRoute = {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      orderedStops,
      waypoints: [...routeWaypoints]
    };

    routeLayer.clearLayers();
    displayRouteMarkers(orderedStops);

    const latLngs = route.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon]
    );

    const polyline = L.polyline(
      latLngs,
      {
        color: "#005493",
        weight: 6,
        opacity: 0.85
      }
    ).addTo(routeLayer);

    map.fitBounds(polyline.getBounds(), {
      padding: [35, 35]
    });

    const km = route.distance / 1000;
    const minutes = Math.round(route.duration / 60);

    routeSummaryEl.innerHTML = `
      <strong>Itinéraire tracé</strong><br>
      ${km.toFixed(1)} km · environ ${minutes} min<br>
      ${routeWaypoints.length} passage(s) imposé(s)
    `;

    routeSummaryEl.classList.remove("hidden");
    saveRouteBtn.disabled = false;
    shareRouteBtn.disabled = false;

    statusEl.textContent = `${stops.length} arrêts chargés`;
  } catch (error) {
    statusEl.textContent = `${stops.length} arrêts chargés`;
    throw error;
  }
}

async function openGoogleRoute() {
  try {
    const points = await buildOrderedRoute(true);
    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1);

    const parameters = new URLSearchParams({
      api: "1",
      origin: `${origin.lat},${origin.lon}`,
      destination: `${destination.lat},${destination.lon}`,
      travelmode: "driving"
    });

    if (waypoints.length) {
      parameters.set(
        "waypoints",
        waypoints
          .map(point => `${point.lat},${point.lon}`)
          .join("|")
      );
    }

    window.open(
      `https://www.google.com/maps/dir/?${parameters}`,
      "_blank",
      "noopener"
    );
  } catch (error) {
    alert(error.message);
  }
}

async function openInRoute() {
  try {
    const points = await buildOrderedRoute(
      getDepartureMode() !== "automatic"
    );

    const locations = points.map(point =>
      `loc=${encodeURIComponent(point.nom || "Étape")}/` +
      `${Number(point.lat)}/${Number(point.lon)}`
    );

    const action =
      getDepartureMode() === "automatic"
        ? "action=opt&"
        : "";

    window.location.href =
      `inroute://coordinates?${action}${locations.join("&")}`;
  } catch (error) {
    alert(error.message);
  }
}

function escapeXml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createGpx(points) {
  const routePoints = points.map((point, index) => `
    <rtept lat="${Number(point.lat)}" lon="${Number(point.lon)}">
      <name>${escapeXml(point.nom || `Étape ${index + 1}`)}</name>
    </rtept>
  `).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BreizhStops"
xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Itinéraire BreizhStops</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <rte>
    <name>Itinéraire BreizhStops</name>
    ${routePoints}
  </rte>
</gpx>`;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportGpx() {
  try {
    const points = await buildOrderedRoute(true);
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replaceAll(":", "");

    downloadFile(
      createGpx(points),
      `breizhstops-${stamp}.gpx`,
      "application/gpx+xml;charset=utf-8"
    );
  } catch (error) {
    alert(error.message);
  }
}

function openStopSheet(index) {
  const stop = currentResults[index];

  if (stop) {
    openStopSheetFor(stop);
  }
}

function openStopSheetById(id) {
  const stop = stops.find(item => String(item.id) === String(id));

  if (stop) {
    openStopSheetFor(stop);
  }
}

async function openStopSheetFor(stop) {
  activeStop = stop;

  $("stopDialogTitle").textContent = stop.nom || "Fiche arrêt";
  $("stopDialogMeta").textContent =
    `${stop.commune || ""} · ${stop.reseau || ""}`;

  $("stopLines").value = "";
  $("stopNotes").value = "";
  $("stopStatus").value = "";
  $("stopPhotos").innerHTML = "";

  $("stopDialog").showModal();

  try {
    const data = await apiFetch(
      `/api/stops/${encodeURIComponent(stop.id)}`
    );

    $("stopLines").value = (data.lines || []).join(", ");
    $("stopNotes").value = data.notes || "";
    $("stopStatus").value = data.status || "";

    renderStopPhotos(data.photos || []);
  } catch (error) {
    if (!error.message.includes("Configuration")) {
      console.warn(error);
    }
  }
}

function renderStopPhotos(photos) {
  $("stopPhotos").innerHTML = photos.map(photo => `
    <figure class="photo-card">
      <img
        src="/api/photos/${encodeURIComponent(photo.object_key)}"
        alt="Photo de l’arrêt"
        loading="lazy"
      >
    </figure>
  `).join("");
}

async function saveStopDetails() {
  if (!activeStop) {
    return;
  }

  const lines = $("stopLines").value
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  try {
    await apiFetch(
      `/api/admin/stops/${encodeURIComponent(activeStop.id)}`,
      {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({
          notes: $("stopNotes").value.trim(),
          status: $("stopStatus").value,
          lines
        })
      }
    );

    alert("Fiche arrêt enregistrée.");
  } catch (error) {
    alert(error.message);
  }
}

async function uploadStopPhoto() {
  if (!activeStop) {
    return;
  }

  const file = $("stopPhoto").files[0];

  if (!file) {
    alert("Sélectionne d’abord une photo.");
    return;
  }

  const form = new FormData();
  form.append("photo", file);

  const headers = {};

  try {
    const data = await apiFetch(
      `/api/admin/stops/${encodeURIComponent(activeStop.id)}/photos`,
      {
        method: "POST",
        headers,
        body: form
      }
    );

    $("stopPhoto").value = "";
    renderStopPhotos(data.photos || []);
    alert("Photo ajoutée.");
  } catch (error) {
    alert(error.message);
  }
}

function openSaveRouteDialog() {
  if (!tracedRoute) {
    return;
  }

  $("routeDialog").showModal();
}

async function confirmSaveRoute() {
  if (!tracedRoute) {
    return;
  }

  const name = $("routeName").value.trim();

  if (!name) {
    alert("Donne un nom à l’itinéraire.");
    return;
  }

  const payload = {
    name,
    network: $("routeNetwork").value.trim(),
    color: $("routeColor").value,
    visibility: $("routeVisibility").value,
    description: $("routeDescription").value.trim(),
    stops: tracedRoute.orderedStops,
    waypoints: tracedRoute.waypoints,
    geometry: tracedRoute.geometry,
    distance: tracedRoute.distance,
    duration: tracedRoute.duration
  };

  try {
    const url = editingRouteId
      ? `/api/admin/routes/${editingRouteId}`
      : "/api/admin/routes";

    const method = editingRouteId ? "PUT" : "POST";

    const data = await apiFetch(url, {
      method,
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });

    editingRouteId = data.id;
    $("routeDialog").close();

    alert("Itinéraire enregistré.");

    if (data.share_token) {
      await copyShareLink(data.share_token);
    }
  } catch (error) {
    alert(error.message);
  }
}

async function openRoutesLibrary() {
  $("routesLibraryDialog").showModal();
  $("routesLibrary").innerHTML = "<p>Chargement…</p>";

  try {
    const routes = await apiFetch("/api/admin/routes", {
      headers: apiHeaders(false)
    });

    renderRoutesLibrary(routes);
  } catch (error) {
    $("routesLibrary").innerHTML = `
      <p>Impossible de charger les itinéraires.<br>
      <small>${escapeHtml(error.message)}</small></p>
    `;
  }
}

function renderRoutesLibrary(routes) {
  if (!routes.length) {
    $("routesLibrary").innerHTML =
      "<p>Aucun itinéraire enregistré.</p>";
    return;
  }

  $("routesLibrary").innerHTML = routes.map(route => `
    <article class="library-item">
      <h3>${escapeHtml(route.name)}</h3>
      <div class="meta">
        ${escapeHtml(route.network || "")}
        · ${(route.distance / 1000).toFixed(1)} km
        · ${Math.round(route.duration / 60)} min
      </div>

      <button onclick="loadSavedRoute('${route.id}')">
        Ouvrir
      </button>

      ${route.share_token ? `
        <button onclick="copyShareLink('${route.share_token}')">
          Copier le lien
        </button>
      ` : ""}

      <button class="danger" onclick="deleteSavedRoute('${route.id}')">
        Supprimer
      </button>
    </article>
  `).join("");
}

async function loadSavedRoute(id) {
  try {
    const route = await apiFetch(`/api/admin/routes/${id}`, {
      headers: apiHeaders(false)
    });

    editingRouteId = route.id;
    routeStops = route.stops || [];
    routeWaypoints = route.waypoints || [];

    tracedRoute = {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      orderedStops: route.stops || [],
      waypoints: route.waypoints || []
    };

    updateRoute();
    renderWaypoints();

    routeLayer.clearLayers();
    displayRouteMarkers(orderedStops);

    const latLngs = route.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon]
    );

    const polyline = L.polyline(
      latLngs,
      {
        color: route.color || "#005493",
        weight: 6,
        opacity: 0.85
      }
    ).addTo(routeLayer);

    map.fitBounds(polyline.getBounds(), {
      padding: [35, 35]
    });

    routeSummaryEl.innerHTML = `
      <strong>${escapeHtml(route.name)}</strong><br>
      ${(route.distance / 1000).toFixed(1)} km
      · environ ${Math.round(route.duration / 60)} min
    `;

    routeSummaryEl.classList.remove("hidden");
    saveRouteBtn.disabled = false;
    shareRouteBtn.disabled = false;

    $("routeName").value = route.name || "";
    $("routeNetwork").value = route.network || "";
    $("routeColor").value = route.color || "#005493";
    $("routeVisibility").value = route.visibility || "private";
    $("routeDescription").value = route.description || "";

    $("routesLibraryDialog").close();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteSavedRoute(id) {
  if (!confirm("Supprimer définitivement cet itinéraire ?")) {
    return;
  }

  try {
    await apiFetch(`/api/admin/routes/${id}`, {
      method: "DELETE",
      headers: apiHeaders(false)
    });

    await openRoutesLibrary();
  } catch (error) {
    alert(error.message);
  }
}

async function shareCurrentRoute() {
  if (!editingRouteId) {
    openSaveRouteDialog();
    $("routeVisibility").value = "link";
    return;
  }

  try {
    const route = await apiFetch(`/api/admin/routes/${editingRouteId}`, {
      headers: apiHeaders(false)
    });

    if (!route.share_token) {
      alert(
        "Rouvre l’enregistrement et choisis « Accessible par lien »."
      );
      return;
    }

    await copyShareLink(route.share_token);
  } catch (error) {
    alert(error.message);
  }
}

async function copyShareLink(token) {
  const url =
    `${window.location.origin}${window.location.pathname}` +
    `?share=${encodeURIComponent(token)}`;

  await navigator.clipboard.writeText(url);
  alert("Lien de partage copié.");
}

async function loadSharedRouteFromUrl() {
  const token = new URLSearchParams(window.location.search).get("share");

  if (!token) {
    return;
  }

  try {
    const route = await apiFetch(`/api/share/${encodeURIComponent(token)}`);

    routeStops = route.stops || [];
    routeWaypoints = route.waypoints || [];
    tracedRoute = {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      orderedStops: route.stops || [],
      waypoints: route.waypoints || []
    };

    updateRoute();
    renderWaypoints();

    const latLngs = route.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon]
    );

    const polyline = L.polyline(
      latLngs,
      {
        color: route.color || "#005493",
        weight: 6,
        opacity: 0.85
      }
    ).addTo(routeLayer);

    map.fitBounds(polyline.getBounds(), {
      padding: [35, 35]
    });

    routeSummaryEl.innerHTML = `
      <strong>${escapeHtml(route.name)}</strong><br>
      ${(route.distance / 1000).toFixed(1)} km
      · environ ${Math.round(route.duration / 60)} min
    `;

    routeSummaryEl.classList.remove("hidden");
  } catch (error) {
    alert(`Itinéraire partagé indisponible : ${error.message}`);
  }
}


function startManualStopCreation() {
  createStopMode = true;
  waypointMode = false;
  $("toggleWaypointMode").classList.remove("active");
  $("toggleWaypointMode").textContent = "📌 Ajouter un passage par une rue";
  map.getContainer().classList.add("create-stop-cursor");
  alert("Clique maintenant sur la carte à l’emplacement du nouvel arrêt.");
}

function openCreateStopDialog(position) {
  pendingStopPosition = position;
  $("newStopName").value = "";
  $("newStopCity").value = cityFilter.value || "";
  $("newStopNetwork").value = networkFilter.value || "";
  $("newStopSource").value = "Création manuelle";
  $("newStopLat").value = Number(position.lat).toFixed(7);
  $("newStopLon").value = Number(position.lon).toFixed(7);
  $("newStopNotes").value = "";
  $("createStopDialog").showModal();
}

async function createStopFromCurrentPosition() {
  try {
    const position = await getCurrentPositionPoint();
    $("dataAdminDialog").close();
    openCreateStopDialog(position);
  } catch (error) {
    alert(error.message);
  }
}

async function confirmCreateStop() {
  const name = $("newStopName").value.trim();

  if (!name) {
    alert("Le nom de l’arrêt est obligatoire.");
    return;
  }

  const payload = {
    name,
    commune: $("newStopCity").value.trim(),
    network: $("newStopNetwork").value.trim(),
    source: $("newStopSource").value.trim() || "Création manuelle",
    lat: Number($("newStopLat").value),
    lon: Number($("newStopLon").value),
    notes: $("newStopNotes").value.trim()
  };

  try {
    const created = await apiFetch("/api/admin/stops/create", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });

    stops.push(created);
    $("createStopDialog").close();

    searchInput.value = created.nom;
    refreshSearch();
    map.setView([created.lat, created.lon], 17);

    alert("Arrêt créé et enregistré.");
  } catch (error) {
    alert(error.message);
  }
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}

function parseGtfsText(text) {
  const cleanText = text.replace(/^\uFEFF/, "");
  const lines = cleanText.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error("Le fichier GTFS est vide.");
  }

  const delimiter =
    (lines[0].match(/;/g) || []).length >
    (lines[0].match(/,/g) || []).length
      ? ";"
      : ",";

  const headers = parseCsvLine(lines[0], delimiter)
    .map(value => value.trim());

  const required = ["stop_id", "stop_name", "stop_lat", "stop_lon"];

  required.forEach(column => {
    if (!headers.includes(column)) {
      throw new Error(`Colonne GTFS absente : ${column}`);
    }
  });

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line, delimiter);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return {
      source_id: row.stop_id,
      name: row.stop_name,
      commune:
        row.commune ||
        row.stop_city ||
        row.municipality ||
        "",
      network: row.reseau || row.network || "",
      lat: Number(String(row.stop_lat).replace(",", ".")),
      lon: Number(String(row.stop_lon).replace(",", "."))
    };
  }).filter(stop =>
    stop.source_id &&
    stop.name &&
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lon)
  );
}

function parseGpx(text) {
  const documentXml = new DOMParser().parseFromString(
    text,
    "application/xml"
  );

  if (documentXml.querySelector("parsererror")) {
    throw new Error("Le fichier GPX est invalide.");
  }

  return [...documentXml.querySelectorAll("wpt")].map(
    (element, index) => {
      const name =
        element.querySelector("name")?.textContent?.trim() ||
        `Point inRoute ${index + 1}`;

      const address =
        element.querySelector("src")?.textContent?.trim() ||
        element.querySelector("desc")?.textContent?.trim() ||
        "";

      const postalMatch = address.match(/\b\d{5}\s+([^,]+)/);

      return {
        source_id:
          `gpx-${normalize(name)}-` +
          `${Number(element.getAttribute("lat")).toFixed(6)}-` +
          `${Number(element.getAttribute("lon")).toFixed(6)}`,
        name,
        commune: postalMatch ? postalMatch[1].trim() : "",
        network: "",
        lat: Number(element.getAttribute("lat")),
        lon: Number(element.getAttribute("lon")),
        address
      };
    }
  ).filter(stop =>
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lon)
  );
}

async function readImportFile(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".zip")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const archive = fflate.unzipSync(bytes);

    const stopsEntry = Object.keys(archive).find(
      name => name.toLowerCase().endsWith("stops.txt")
    );

    if (!stopsEntry) {
      throw new Error("Le ZIP ne contient pas de fichier stops.txt.");
    }

    return parseGtfsText(
      new TextDecoder("utf-8").decode(archive[stopsEntry])
    );
  }

  const text = await file.text();

  if (
    lowerName.endsWith(".gpx") ||
    text.trim().startsWith("<?xml") ||
    text.includes("<gpx")
  ) {
    return parseGpx(text);
  }

  return parseGtfsText(text);
}

function nearbyMatch(imported) {
  let best = null;

  for (const stop of stops) {
    const latDifference = Math.abs(Number(stop.lat) - imported.lat);
    const lonDifference = Math.abs(Number(stop.lon) - imported.lon);

    if (latDifference > 0.001 || lonDifference > 0.0015) {
      continue;
    }

    const distance = distanceKm(stop, imported) * 1000;
    const sameName =
      normalize(stop.nom) === normalize(imported.name) ||
      normalize(stop.nom).includes(normalize(imported.name)) ||
      normalize(imported.name).includes(normalize(stop.nom));

    if (
      distance <= 8 ||
      (distance <= 35 && sameName)
    ) {
      if (!best || distance < best.distance) {
        best = { stop, distance };
      }
    }
  }

  return best;
}

async function analyseImportFile() {
  const file = $("importFile").files[0];

  if (!file) {
    alert("Sélectionne d’abord un fichier.");
    return;
  }

  try {
    $("importReport").innerHTML = "<p>Analyse en cours…</p>";

    const parsed = await readImportFile(file);
    const sourceName =
      $("importSourceName").value.trim() ||
      $("importSourceType").value;

    const existingById = new Map();

    stops.forEach(stop => {
      if (stop.id) {
        existingById.set(String(stop.id), stop);
      }

      if (stop.code) {
        existingById.set(String(stop.code), stop);
      }
    });

    let knownIds = 0;
    let proximityMatches = 0;
    let newStops = 0;

    analysedImport = parsed.map(item => {
      const direct = existingById.get(String(item.source_id));

      if (direct) {
        knownIds++;
        return {
          ...item,
          matched_stop_id: direct.id,
          match_type: "identifiant"
        };
      }

      const nearby = nearbyMatch(item);

      if (nearby) {
        proximityMatches++;
        return {
          ...item,
          matched_stop_id: nearby.stop.id,
          match_type: "proximité"
        };
      }

      newStops++;
      return {
        ...item,
        matched_stop_id: null,
        match_type: "nouveau"
      };
    });

    importAnalysis = {
      source: sourceName,
      source_type: $("importSourceType").value,
      total: parsed.length,
      knownIds,
      proximityMatches,
      newStops
    };

    $("importReport").innerHTML = `
      <div class="import-summary">
        <strong>Analyse terminée</strong>
        ${parsed.length} arrêt(s) lu(s)<br>
        ${knownIds} déjà connu(s) par identifiant<br>
        ${proximityMatches} doublon(s) probable(s) par proximité<br>
        ${newStops} nouvel/nouveaux arrêt(s)<br>
        <b>0 arrêt ne sera supprimé.</b>
        <div class="import-progress"><div id="importProgressBar"></div></div>
      </div>
    `;

    $("confirmImport").disabled = false;
  } catch (error) {
    $("importReport").innerHTML = `
      <p>Analyse impossible : ${escapeHtml(error.message)}</p>
    `;
    $("confirmImport").disabled = true;
  }
}

async function confirmIncrementalImport() {
  if (!analysedImport.length || !importAnalysis) {
    return;
  }

  $("confirmImport").disabled = true;
  $("analyseImport").disabled = true;

  const batchSize = 250;
  const totals = {
    added: 0,
    linked: 0,
    updated: 0
  };

  try {
    for (
      let index = 0;
      index < analysedImport.length;
      index += batchSize
    ) {
      const batch = analysedImport.slice(index, index + batchSize);

      const response = await apiFetch("/api/admin/stops/import", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          source: importAnalysis.source,
          source_type: importAnalysis.source_type,
          stops: batch
        })
      });

      totals.added += response.added || 0;
      totals.linked += response.linked || 0;
      totals.updated += response.updated || 0;

      const progress = Math.min(
        100,
        Math.round((index + batch.length) / analysedImport.length * 100)
      );

      const progressBar = $("importProgressBar");

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
    }

    const extraStops = await apiFetch("/api/stops-extra");
    const staticIds = new Set(stops.map(stop => String(stop.id)));

    extraStops.forEach(stop => {
      if (!staticIds.has(String(stop.id))) {
        stops.push(stop);
        staticIds.add(String(stop.id));
      }
    });

    updateLinkedFilters();
    refreshSearch();

    $("importReport").innerHTML = `
      <div class="import-summary">
        <strong>Import terminé</strong>
        ${totals.added} nouvel/nouveaux arrêt(s) ajouté(s)<br>
        ${totals.linked} arrêt(s) relié(s) à une source existante<br>
        ${totals.updated} arrêt(s) D1 mis à jour<br>
        <b>Aucun ancien arrêt n’a été supprimé.</b>
      </div>
    `;
  } catch (error) {
    alert(error.message);
  } finally {
    $("analyseImport").disabled = false;
  }
}

document
  .querySelectorAll('input[name="departureMode"]')
  .forEach(input => {
    input.addEventListener("change", handleDepartureModeChange);
  });

searchInput.addEventListener("input", refreshSearch);
networkFilter.addEventListener("change", refreshSearch);
cityFilter.addEventListener("change", refreshSearch);
startStopSearch.addEventListener("input", searchStartStops);

traceRouteBtn.addEventListener(
  "click",
  () => traceRoute().catch(error => alert(error.message))
);

optimizeRouteBtn.addEventListener("click", optimizeRoute);
openRouteBtn.addEventListener("click", openGoogleRoute);
openInRouteBtn.addEventListener("click", openInRoute);
exportGpxBtn.addEventListener("click", exportGpx);
saveRouteBtn.addEventListener("click", openSaveRouteDialog);
shareRouteBtn.addEventListener("click", shareCurrentRoute);

$("toggleWaypointMode").addEventListener("click", () => {
  waypointMode = !waypointMode;

  $("toggleWaypointMode").classList.toggle("active", waypointMode);
  $("toggleWaypointMode").textContent = waypointMode
    ? "✅ Clique sur la rue voulue"
    : "📌 Ajouter un passage par une rue";
});

$("clearWaypoints").addEventListener("click", () => {
  routeWaypoints = [];
  waypointLayer.clearLayers();
  invalidateTrace();
});

clearRouteBtn.addEventListener("click", () => {
  routeStops = [];
  routeWaypoints = [];
  selectedStartStop = null;
  currentPosition = null;
  editingRouteId = null;

  selectedStartStopEl.innerHTML = "";
  waypointLayer.clearLayers();
  invalidateTrace();
  restoreAllStopMarkers();
  updateRoute();
});

$("saveStopDetails").addEventListener("click", saveStopDetails);
$("uploadStopPhoto").addEventListener("click", uploadStopPhoto);
$("confirmSaveRoute").addEventListener("click", confirmSaveRoute);
$("openRoutesLibrary").addEventListener("click", openRoutesLibrary);

$("openDataAdmin").addEventListener("click", () => {
  $("dataAdminDialog").showModal();
});

$("startCreateStop").addEventListener("click", startManualStopCreation);
$("showAllStops").addEventListener("click", restoreAllStopMarkers);
$("createStopFromPosition").addEventListener(
  "click",
  createStopFromCurrentPosition
);
$("confirmCreateStop").addEventListener("click", confirmCreateStop);
$("analyseImport").addEventListener("click", analyseImportFile);
$("confirmImport").addEventListener("click", confirmIncrementalImport);

$("importSourceType").addEventListener("change", event => {
  const suggested = {
    gtfs: "GTFS complémentaire",
    inroute: "inRoute",
    other: "Source complémentaire"
  };

  $("importSourceName").value = suggested[event.target.value];
});


handleDepartureModeChange();

loadStops().then(() => {
  loadSharedRouteFromUrl();
});
