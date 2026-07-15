const V4 = {
  agencies: [],
  routes: [],
  patterns: [],
  selectedPattern: null,
  gpsMap: null,
  gpsRouteLayer: null,
  gpsStopsLayer: null,
  gpsPositionMarker: null,
  gpsAccuracyCircle: null,
  gpsWatchId: null,
  gpsData: null,
  gpsCurrentStopIndex: 0,
  gpsVoiceEnabled: true,
  gpsLastAnnouncement: ""
};

async function v4ApiFetch(url, options = {}) {
  try {
    return await apiFetch(url, {
      credentials: "include",
      ...options
    });
  } catch (error) {
    if (
      error instanceof TypeError ||
      String(error.message).includes("Failed to fetch")
    ) {
      $("adminLoginDialog").showModal();
      throw new Error(
        "Connexion Cloudflare Access nécessaire. " +
        "Clique sur « Ouvrir la connexion », connecte-toi, puis réessaie."
      );
    }
    throw error;
  }
}

function fillV4Select(select, placeholder, rows, valueKey, labelBuilder) {
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;

  rows.forEach(row => {
    const option = document.createElement("option");
    option.value = row[valueKey];
    option.textContent = labelBuilder(row);
    select.appendChild(option);
  });

  select.disabled = rows.length === 0;
}

async function loadAgenciesInto(...selects) {
  if (!V4.agencies.length) {
    V4.agencies = await apiFetch("/api/gtfs/agencies");
  }

  selects.forEach(select => {
    fillV4Select(
      select,
      "Choisir un réseau",
      V4.agencies,
      "id",
      agency => agency.name
    );
  });
}

async function loadRoutesForAgency(agencyId, ...selects) {
  const routes = agencyId
    ? await apiFetch(`/api/gtfs/routes?agency_id=${encodeURIComponent(agencyId)}`)
    : [];

  V4.routes = routes;

  selects.forEach(select => {
    fillV4Select(
      select,
      "Choisir une ligne",
      routes,
      "id",
      route => {
        const number = route.short_name ? `${route.short_name} — ` : "";
        return `${number}${route.long_name || "Ligne"}`;
      }
    );
  });
}

async function loadPatternsForRoute(routeId, ...selects) {
  const patterns = routeId
    ? await apiFetch(`/api/gtfs/patterns?route_id=${encodeURIComponent(routeId)}`)
    : [];

  V4.patterns = patterns;

  selects.forEach(select => {
    fillV4Select(
      select,
      "Choisir une variante",
      patterns,
      "id",
      pattern => pattern.label || pattern.headsign || "Parcours principal"
    );
  });
}

async function loadPattern(patternId) {
  const pattern = await apiFetch(
    `/api/gtfs/patterns/${encodeURIComponent(patternId)}`
  );

  V4.selectedPattern = pattern;
  return pattern;
}

function renderLineDetails(pattern) {
  const route = pattern.route || {};
  const stopsList = (pattern.stops || []).map((stop, index) => `
    <li>
      <button
        class="link-button"
        type="button"
        onclick="focusGtfsStop('${String(stop.stop_id).replaceAll("'", "\\'")}')"
      >
        ${escapeHtml(stop.name)}
      </button>
      ${stop.commune ? ` — ${escapeHtml(stop.commune)}` : ""}
    </li>
  `).join("");

  $("lineDetails").innerHTML = `
    <div class="line-title-row">
      <div
        class="line-color"
        style="background:#${escapeHtml(route.color || "005493")}"
      ></div>
      <div>
        <strong>
          ${escapeHtml(route.short_name || "")}
          ${escapeHtml(route.long_name || "")}
        </strong>
        <div class="meta">
          ${escapeHtml(pattern.label || pattern.headsign || "")}
          · ${(pattern.stops || []).length} arrêts
        </div>
      </div>
    </div>

    <ol class="line-stop-list">${stopsList}</ol>
  `;
}

function patternLatLngs(pattern) {
  if (pattern.shape?.coordinates?.length) {
    return pattern.shape.coordinates.map(([lon, lat]) => [lat, lon]);
  }

  return (pattern.stops || [])
    .filter(stop => Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lon)))
    .map(stop => [Number(stop.lat), Number(stop.lon)]);
}

function showPatternOnMainMap(pattern) {
  routeLayer.clearLayers();
  markersLayer.clearLayers();

  const latLngs = patternLatLngs(pattern);

  if (latLngs.length > 1) {
    const route = pattern.route || {};
    const polyline = L.polyline(latLngs, {
      color: `#${route.color || "005493"}`,
      weight: 6,
      opacity: 0.9
    }).addTo(routeLayer);

    map.fitBounds(polyline.getBounds(), { padding: [35, 35] });
  }

  (pattern.stops || []).forEach((stop, index) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="route-stop-marker">${index + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    L.marker([Number(stop.lat), Number(stop.lon)], { icon })
      .bindPopup(`
        <strong>${index + 1}. ${escapeHtml(stop.name)}</strong><br>
        ${escapeHtml(stop.commune || "")}
      `)
      .addTo(markersLayer);
  });

  routeDisplayMode = true;
  $("showAllStops").classList.remove("hidden");
}

async function focusGtfsStop(stopId) {
  const stop = (V4.selectedPattern?.stops || [])
    .find(item => String(item.stop_id) === String(stopId));

  if (!stop) {
    return;
  }

  $("linesExplorerDialog").close();
  map.setView([Number(stop.lat), Number(stop.lon)], 17);
}

async function enrichOpenStopSheetWithLines(stop) {
  const containerId = "v4StopLines";
  let container = $(containerId);

  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    $("stopDialogMeta").insertAdjacentElement("afterend", container);
  }

  container.innerHTML = "<small>Chargement des lignes…</small>";

  try {
    const rows = await apiFetch(
      `/api/gtfs/stops/${encodeURIComponent(stop.id)}/routes`
    );

    if (!rows.length) {
      container.innerHTML =
        '<div class="meta">Aucune ligne GTFS associée à cet arrêt.</div>';
      return;
    }

    container.innerHTML = `
      <div class="stop-lines-list">
        ${rows.map(row => `
          <button
            type="button"
            class="stop-line-chip"
            onclick="openLineFromStop('${String(row.route_id).replaceAll("'", "\\'")}')"
          >
            🚌 ${escapeHtml(row.short_name || row.long_name || "Ligne")}
          </button>
        `).join("")}
      </div>
    `;
  } catch (error) {
    container.innerHTML =
      `<div class="meta">Lignes indisponibles : ${escapeHtml(error.message)}</div>`;
  }
}

const originalOpenStopSheetForV4 = openStopSheetFor;
openStopSheetFor = async function(stop) {
  await originalOpenStopSheetForV4(stop);
  enrichOpenStopSheetWithLines(stop);
};

async function openLineFromStop(routeId) {
  $("stopDialog").close();
  $("linesExplorerDialog").showModal();

  await loadAgenciesInto($("lineAgencySelect"));
  const route = await apiFetch(
    `/api/gtfs/routes/${encodeURIComponent(routeId)}`
  );

  $("lineAgencySelect").value = route.agency_id || "";
  await loadRoutesForAgency(route.agency_id, $("lineRouteSelect"));
  $("lineRouteSelect").value = routeId;
  await loadPatternsForRoute(routeId, $("linePatternSelect"));
}

async function openLinesExplorer() {
  $("linesExplorerDialog").showModal();
  await loadAgenciesInto($("lineAgencySelect"));
}

async function openGpsLauncher() {
  $("gpsLauncherDialog").showModal();

  await loadAgenciesInto($("gpsAgencySelect"));

  try {
    const saved = await v4ApiFetch("/api/admin/routes", {
      headers: apiHeaders(false)
    });

    fillV4Select(
      $("gpsSavedRouteSelect"),
      "Choisir un itinéraire",
      saved,
      "id",
      route => route.name
    );
  } catch (error) {
    $("gpsSavedRouteSelect").innerHTML =
      '<option value="">Connexion requise</option>';
  }
}

function buildGpsDataFromPattern(pattern) {
  return {
    name:
      `${pattern.route?.short_name || ""} ` +
      `${pattern.route?.long_name || ""}`.trim(),
    direction: pattern.label || pattern.headsign || "",
    color: `#${pattern.route?.color || "005493"}`,
    geometry: {
      type: "LineString",
      coordinates: patternLatLngs(pattern)
        .map(([lat, lon]) => [lon, lat])
    },
    stops: (pattern.stops || []).map(stop => ({
      id: stop.stop_id,
      nom: stop.name,
      commune: stop.commune || "",
      lat: Number(stop.lat),
      lon: Number(stop.lon)
    }))
  };
}

function initGpsMap() {
  if (V4.gpsMap) {
    setTimeout(() => V4.gpsMap.invalidateSize(), 50);
    return;
  }

  V4.gpsMap = L.map("gpsMap", {
    zoomControl: false
  }).setView([48.2, -3.2], 8);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }
  ).addTo(V4.gpsMap);

  V4.gpsRouteLayer = L.layerGroup().addTo(V4.gpsMap);
  V4.gpsStopsLayer = L.layerGroup().addTo(V4.gpsMap);
}

function renderGpsRoute(data) {
  initGpsMap();

  V4.gpsRouteLayer.clearLayers();
  V4.gpsStopsLayer.clearLayers();

  const latLngs = (data.geometry?.coordinates || [])
    .map(([lon, lat]) => [lat, lon]);

  if (latLngs.length > 1) {
    const polyline = L.polyline(latLngs, {
      color: data.color || "#005493",
      weight: 7,
      opacity: 0.92
    }).addTo(V4.gpsRouteLayer);

    V4.gpsMap.fitBounds(polyline.getBounds(), {
      padding: [25, 25]
    });
  }

  (data.stops || []).forEach((stop, index) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="route-stop-marker">${index + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    L.marker([stop.lat, stop.lon], { icon })
      .bindTooltip(stop.nom)
      .addTo(V4.gpsStopsLayer);
  });
}

function distanceToPolylineMeters(position, coordinates) {
  let minimum = Infinity;

  coordinates.forEach(([lon, lat]) => {
    const distance = distanceKm(
      position,
      { lat, lon }
    ) * 1000;

    minimum = Math.min(minimum, distance);
  });

  return minimum;
}

function speakGps(text) {
  if (
    !V4.gpsVoiceEnabled ||
    !("speechSynthesis" in window) ||
    text === V4.gpsLastAnnouncement
  ) {
    return;
  }

  V4.gpsLastAnnouncement = text;
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  speechSynthesis.speak(utterance);
}

function updateGpsStopDisplay(position) {
  const stopsList = V4.gpsData?.stops || [];

  if (!stopsList.length) {
    $("gpsNextStop").textContent = "Parcours sans arrêt";
    return;
  }

  let index = Math.min(
    V4.gpsCurrentStopIndex,
    stopsList.length - 1
  );

  const next = stopsList[index];
  const distance = distanceKm(position, next) * 1000;

  if (distance <= 45 && index < stopsList.length - 1) {
    V4.gpsCurrentStopIndex++;
    index++;
    speakGps(`Arrêt ${next.nom}. Prochain arrêt ${stopsList[index].nom}.`);
  }

  const currentNext = stopsList[index];
  const currentDistance =
    distanceKm(position, currentNext) * 1000;

  $("gpsNextStop").textContent = currentNext.nom;
  $("gpsNextDistance").textContent =
    currentDistance >= 1000
      ? `${(currentDistance / 1000).toFixed(1)} km`
      : `${Math.round(currentDistance)} m`;

  const following = stopsList[index + 1];
  $("gpsFollowingStop").textContent =
    following ? `Puis : ${following.nom}` : "Terminus";

  if (currentDistance <= 350 && currentDistance > 45) {
    speakGps(
      `Dans ${Math.round(currentDistance / 10) * 10} mètres, ` +
      `arrêt ${currentNext.nom}.`
    );
  }
}

function onGpsPosition(position) {
  const point = {
    lat: position.coords.latitude,
    lon: position.coords.longitude
  };

  if (!V4.gpsPositionMarker) {
    V4.gpsPositionMarker = L.circleMarker(
      [point.lat, point.lon],
      {
        radius: 10,
        color: "white",
        weight: 3,
        fillColor: "#1677ff",
        fillOpacity: 1
      }
    ).addTo(V4.gpsMap);

    V4.gpsAccuracyCircle = L.circle(
      [point.lat, point.lon],
      {
        radius: position.coords.accuracy,
        color: "#1677ff",
        weight: 1,
        fillOpacity: 0.12
      }
    ).addTo(V4.gpsMap);
  } else {
    V4.gpsPositionMarker.setLatLng([point.lat, point.lon]);
    V4.gpsAccuracyCircle
      .setLatLng([point.lat, point.lon])
      .setRadius(position.coords.accuracy);
  }

  updateGpsStopDisplay(point);

  const distanceFromRoute = distanceToPolylineMeters(
    point,
    V4.gpsData.geometry?.coordinates || []
  );

  const status = $("gpsRouteStatus");

  if (distanceFromRoute > 120) {
    status.textContent =
      `⚠ Hors itinéraire : ${Math.round(distanceFromRoute)} m`;
    status.className = "gps-status off-route";
    speakGps("Attention, vous quittez l’itinéraire.");
  } else {
    status.textContent =
      `✓ Sur l’itinéraire · précision ${Math.round(position.coords.accuracy)} m`;
    status.className = "gps-status on-route";
  }
}

function startGps(data) {
  if (!navigator.geolocation) {
    alert("La géolocalisation n’est pas disponible.");
    return;
  }

  V4.gpsData = data;
  V4.gpsCurrentStopIndex = 0;
  V4.gpsPositionMarker = null;
  V4.gpsAccuracyCircle = null;
  V4.gpsLastAnnouncement = "";

  $("gpsRouteName").textContent = data.name || "Parcours BreizhStops";
  $("gpsDirection").textContent = data.direction || "";
  $("gpsScreen").classList.remove("hidden");
  $("gpsLauncherDialog").close();

  renderGpsRoute(data);

  V4.gpsWatchId = navigator.geolocation.watchPosition(
    onGpsPosition,
    error => {
      $("gpsRouteStatus").textContent =
        `Position indisponible : ${error.message}`;
      $("gpsRouteStatus").className = "gps-status off-route";
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 2000
    }
  );
}

function stopGps() {
  if (V4.gpsWatchId !== null) {
    navigator.geolocation.clearWatch(V4.gpsWatchId);
    V4.gpsWatchId = null;
  }

  speechSynthesis?.cancel();
  $("gpsScreen").classList.add("hidden");

  if (V4.gpsMap) {
    V4.gpsMap.remove();
    V4.gpsMap = null;
  }
}

async function confirmStartGps() {
  try {
    if ($("gpsSourceType").value === "gtfs") {
      const patternId = $("gpsPatternSelect").value;

      if (!patternId) {
        throw new Error("Choisis une variante de ligne.");
      }

      const pattern = await loadPattern(patternId);
      startGps(buildGpsDataFromPattern(pattern));
      return;
    }

    const savedId = $("gpsSavedRouteSelect").value;

    if (!savedId) {
      throw new Error("Choisis un itinéraire enregistré.");
    }

    const route = await v4ApiFetch(
      `/api/admin/routes/${encodeURIComponent(savedId)}`,
      { headers: apiHeaders(false) }
    );

    startGps({
      name: route.name,
      direction: route.description || "",
      color: route.color || "#005493",
      geometry: route.geometry,
      stops: route.stops || []
    });
  } catch (error) {
    alert(error.message);
  }
}


async function parseGtfsArchiveV4(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const archive = fflate.unzipSync(bytes);

  function textEntry(filename, required = false) {
    const key = Object.keys(archive).find(
      name => name.toLowerCase().endsWith(filename.toLowerCase())
    );

    if (!key) {
      if (required) {
        throw new Error(`Fichier GTFS absent : ${filename}`);
      }
      return "";
    }

    return new TextDecoder("utf-8").decode(archive[key]);
  }

  function rows(filename, required = false) {
    const text = textEntry(filename, required);

    if (!text) {
      return [];
    }

    const clean = text.replace(/^\uFEFF/, "");
    const lines = clean.split(/\r?\n/).filter(line => line.trim());
    const delimiter =
      (lines[0].match(/;/g) || []).length >
      (lines[0].match(/,/g) || []).length
        ? ";"
        : ",";

    const headers = parseCsvLine(lines[0], delimiter);

    return lines.slice(1).map(line => {
      const values = parseCsvLine(line, delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index] || "";
      });
      return row;
    });
  }

  const agencies = rows("agency.txt");
  const routes = rows("routes.txt", true);
  const trips = rows("trips.txt", true);
  const stopTimes = rows("stop_times.txt", true);
  const gtfsStops = rows("stops.txt", true);
  const shapes = rows("shapes.txt");

  const stopsById = new Map(
    gtfsStops.map(stop => [
      stop.stop_id,
      {
        stop_id: stop.stop_id,
        name: stop.stop_name,
        commune:
          stop.commune ||
          stop.stop_city ||
          stop.municipality ||
          "",
        lat: Number(String(stop.stop_lat).replace(",", ".")),
        lon: Number(String(stop.stop_lon).replace(",", "."))
      }
    ])
  );

  const timesByTrip = new Map();

  stopTimes.forEach(row => {
    if (!timesByTrip.has(row.trip_id)) {
      timesByTrip.set(row.trip_id, []);
    }

    timesByTrip.get(row.trip_id).push({
      stop_id: row.stop_id,
      sequence: Number(row.stop_sequence || 0)
    });
  });

  timesByTrip.forEach(list => {
    list.sort((a, b) => a.sequence - b.sequence);
  });

  const tripsByPatternKey = new Map();

  trips.forEach(trip => {
    const sequence = timesByTrip.get(trip.trip_id) || [];

    if (!sequence.length) {
      return;
    }

    const key = [
      trip.route_id,
      trip.direction_id || "",
      trip.shape_id || "",
      sequence.map(item => item.stop_id).join(">")
    ].join("|");

    if (!tripsByPatternKey.has(key)) {
      tripsByPatternKey.set(key, {
        route_id: trip.route_id,
        direction_id: trip.direction_id || "",
        headsign: trip.trip_headsign || "",
        shape_id: trip.shape_id || "",
        stops: sequence,
        trip_count: 0
      });
    }

    tripsByPatternKey.get(key).trip_count++;
  });

  const shapeGroups = new Map();

  shapes.forEach(point => {
    if (!shapeGroups.has(point.shape_id)) {
      shapeGroups.set(point.shape_id, []);
    }

    shapeGroups.get(point.shape_id).push({
      sequence: Number(point.shape_pt_sequence || 0),
      lat: Number(point.shape_pt_lat),
      lon: Number(point.shape_pt_lon)
    });
  });

  shapeGroups.forEach(points => {
    points.sort((a, b) => a.sequence - b.sequence);
  });

  return {
    agencies: agencies.map((agency, index) => ({
      id: agency.agency_id || `agency-${index + 1}`,
      name: agency.agency_name || "Réseau",
      url: agency.agency_url || "",
      timezone: agency.agency_timezone || "Europe/Paris"
    })),
    routes: routes.map(route => ({
      id: route.route_id,
      agency_id: route.agency_id || agencies[0]?.agency_id || "default",
      short_name: route.route_short_name || "",
      long_name: route.route_long_name || "",
      route_type: route.route_type || "",
      color: route.route_color || "005493",
      text_color: route.route_text_color || "FFFFFF"
    })),
    patterns: [...tripsByPatternKey.values()].map((pattern, index) => ({
      id:
        `pattern-${normalize(pattern.route_id)}-` +
        `${pattern.direction_id || "x"}-${index + 1}`,
      ...pattern,
      label:
        pattern.headsign ||
        `Direction ${pattern.direction_id || "non indiquée"}`,
      stops: pattern.stops.map(item => ({
        ...item,
        ...stopsById.get(item.stop_id)
      })),
      shape: pattern.shape_id && shapeGroups.has(pattern.shape_id)
        ? {
            type: "LineString",
            coordinates: shapeGroups
              .get(pattern.shape_id)
              .map(point => [point.lon, point.lat])
          }
        : null
    }))
  };
}

async function sendGtfsV4Import(payload, sourceName) {
  const result = await v4ApiFetch("/api/admin/gtfs/import", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      source: sourceName,
      ...payload
    })
  });

  return result;
}

const originalAnalyseImportFileV4 = analyseImportFile;
analyseImportFile = async function() {
  const file = $("importFile").files[0];

  if (
    $("importSourceType").value === "gtfs-full" &&
    file?.name.toLowerCase().endsWith(".zip")
  ) {
    try {
      $("importReport").innerHTML =
        "<p>Analyse complète du GTFS en cours…</p>";

      const payload = await parseGtfsArchiveV4(file);
      analysedImport = payload;
      importAnalysis = {
        fullGtfs: true,
        source:
          $("importSourceName").value.trim() ||
          "GTFS complet"
      };

      $("importReport").innerHTML = `
        <div class="import-summary">
          <strong>GTFS complet analysé</strong>
          ${payload.agencies.length} réseau(x)<br>
          ${payload.routes.length} ligne(s)<br>
          ${payload.patterns.length} variante(s) de parcours<br>
          ${payload.patterns.reduce(
            (sum, pattern) => sum + pattern.stops.length,
            0
          )} passages d’arrêts<br>
          <b>Aucune donnée ancienne ne sera supprimée.</b>
        </div>
      `;

      $("confirmImport").disabled = false;
      return;
    } catch (error) {
      $("importReport").innerHTML =
        `<p>Analyse impossible : ${escapeHtml(error.message)}</p>`;
      return;
    }
  }

  return originalAnalyseImportFileV4();
};

const originalConfirmIncrementalImportV4 = confirmIncrementalImport;
confirmIncrementalImport = async function() {
  if (!importAnalysis?.fullGtfs) {
    return originalConfirmIncrementalImportV4();
  }

  try {
    $("confirmImport").disabled = true;
    $("importReport").innerHTML =
      "<p>Import des réseaux, lignes et variantes…</p>";

    const result = await sendGtfsV4Import(
      analysedImport,
      importAnalysis.source
    );

    $("importReport").innerHTML = `
      <div class="import-summary">
        <strong>Import GTFS terminé</strong>
        ${result.agencies} réseau(x) traité(s)<br>
        ${result.routes} ligne(s) traitée(s)<br>
        ${result.patterns} variante(s) traitée(s)<br>
        ${result.stop_routes} associations arrêt-ligne<br>
        <b>Aucune ancienne donnée supprimée.</b>
      </div>
    `;

    V4.agencies = [];
  } catch (error) {
    alert(error.message);
  }
};

$("openLinesExplorer").addEventListener("click", openLinesExplorer);
$("openGpsLauncher").addEventListener("click", openGpsLauncher);

$("lineAgencySelect").addEventListener("change", event => {
  loadRoutesForAgency(event.target.value, $("lineRouteSelect"));
  $("linePatternSelect").disabled = true;
  $("showSelectedLine").disabled = true;
  $("startGpsFromLine").disabled = true;
});

$("lineRouteSelect").addEventListener("change", event => {
  loadPatternsForRoute(event.target.value, $("linePatternSelect"));
  $("showSelectedLine").disabled = true;
  $("startGpsFromLine").disabled = true;
});

$("linePatternSelect").addEventListener("change", async event => {
  if (!event.target.value) {
    return;
  }

  const pattern = await loadPattern(event.target.value);
  renderLineDetails(pattern);
  $("showSelectedLine").disabled = false;
  $("startGpsFromLine").disabled = false;
});

$("showSelectedLine").addEventListener("click", () => {
  if (V4.selectedPattern) {
    showPatternOnMainMap(V4.selectedPattern);
    $("linesExplorerDialog").close();
  }
});

$("startGpsFromLine").addEventListener("click", () => {
  if (V4.selectedPattern) {
    startGps(buildGpsDataFromPattern(V4.selectedPattern));
  }
});

$("gpsSourceType").addEventListener("change", event => {
  const gtfs = event.target.value === "gtfs";
  $("gpsGtfsChooser").classList.toggle("hidden", !gtfs);
  $("gpsSavedChooser").classList.toggle("hidden", gtfs);
});

$("gpsAgencySelect").addEventListener("change", event => {
  loadRoutesForAgency(event.target.value, $("gpsRouteSelect"));
});

$("gpsRouteSelect").addEventListener("change", event => {
  loadPatternsForRoute(event.target.value, $("gpsPatternSelect"));
});

$("confirmStartGps").addEventListener("click", confirmStartGps);
$("stopGps").addEventListener("click", stopGps);

$("gpsRecenter").addEventListener("click", () => {
  const position = V4.gpsPositionMarker?.getLatLng();
  if (position) {
    V4.gpsMap.setView(position, 17);
  }
});

$("gpsPreviousStop").addEventListener("click", () => {
  V4.gpsCurrentStopIndex = Math.max(0, V4.gpsCurrentStopIndex - 1);
});

$("gpsNextStopButton").addEventListener("click", () => {
  V4.gpsCurrentStopIndex = Math.min(
    (V4.gpsData?.stops?.length || 1) - 1,
    V4.gpsCurrentStopIndex + 1
  );
});

$("gpsVoiceToggle").addEventListener("click", () => {
  V4.gpsVoiceEnabled = !V4.gpsVoiceEnabled;
  $("gpsVoiceToggle").textContent =
    V4.gpsVoiceEnabled ? "🔊 Voix activée" : "🔇 Voix coupée";
});

$("openAccessLogin").addEventListener("click", () => {
  window.open("/api/admin/session", "_blank", "noopener");
});

$("testAdminSession").addEventListener("click", async () => {
  try {
    await v4ApiFetch("/api/admin/session");
    $("adminSessionStatus").innerHTML =
      '<p class="information-box">✅ Connexion administrateur active.</p>';
  } catch (error) {
    $("adminSessionStatus").innerHTML =
      `<p class="information-box">${escapeHtml(error.message)}</p>`;
  }
});
