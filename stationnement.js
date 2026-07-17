const $ = id => document.getElementById(id);
const state = { spots: [] };

const LESTONAN_LAYOUT = {
  "lestonan 1": [57.0, 5.0, 8.5, 11.0],
  "lestonan 2": [57.0, 27.0, 8.5, 11.0],
  "lestonan 3": [66.5, 5.0, 8.5, 11.0],
  "lestonan 4": [66.5, 27.0, 8.5, 11.0],
  "lestonan 5": [76.0, 27.0, 8.5, 11.0],

  "lestonan 6": [1.5, 72.0, 11.0, 8.5],
  "lestonan 7": [1.5, 58.0, 11.0, 8.5],
  "lestonan 8": [1.5, 44.0, 11.0, 8.5],
  "lestonan 9": [1.5, 30.0, 11.0, 8.5],
  "lestonan 10": [1.5, 16.0, 11.0, 8.5],

  /* Mini doit être strictement au-dessus de Lestonan 11 */
  "lestonan mini": [86.5, 4.0, 10.5, 8.5],
  "lestonan mini 1": [86.5, 4.0, 10.5, 8.5],
  "lestonan 11": [86.5, 16.0, 10.5, 8.5],

  "lestonan mini 2": [28.0, 75.0, 11.5, 8.5],
  "lestonan vl 1": [83.0, 43.0, 11.0, 8.0],
  "lestonan vl 2": [84.0, 54.0, 11.0, 8.0],
  "lestonan surcharge 1": [71.0, 75.0, 12.0, 13.0],
  "lestonan surcharge 2": [84.0, 75.0, 12.0, 13.0]
};

const GOURVILY_LAYOUT = {
  /* Ligne supérieure étalée sur presque toute la largeur */
  "gourvily mini": [1.5, 4.0, 13.5, 8.5, -42],
  "gourvily 1": [11.7, 4.0, 13.5, 8.5, -42],
  "gourvily 2": [21.9, 4.0, 13.5, 8.5, -42],
  "gourvily 3": [32.1, 4.0, 13.5, 8.5, -42],
  "gourvily 4": [42.3, 4.0, 13.5, 8.5, -42],
  "gourvily 5": [52.5, 4.0, 13.5, 8.5, -42],
  "gourvily 6": [62.7, 4.0, 13.5, 8.5, -42],
  "gourvily 7": [72.9, 4.0, 13.5, 8.5, -42],
  "gourvily 8": [83.1, 4.0, 13.5, 8.5, -42],

  "gourvily 9": [52.0, 22.0, 12.0, 8.0, -10],
  "gourvily 10": [56.0, 34.0, 12.0, 8.0, -10],
  "gourvily 11": [84.0, 12.0, 13.5, 8.5, 0],

  "gourvily vl": [66.0, 69.0, 7.0, 21.0, 0],
  "gourvily surcharge 1": [75.0, 79.0, 14.0, 8.0, 0],
  "gourvily surcharge 2": [75.0, 67.0, 14.0, 8.0, 0]
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function api(url, options = {}) {
  return fetch(url, options).then(async response => {
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error("Réponse du serveur illisible."); }
    if (!response.ok) throw new Error(payload.error || "Erreur du serveur.");
    return payload;
  });
}

function showMessage(text, isError = false) {
  $("message").hidden = !text;
  $("message").textContent = text || "";
  $("message").classList.toggle("error", isError);
}

function classify(spot) {
  const name = normalize(spot.name);
  const type = normalize(spot.spot_type);
  const overload = name.includes("surcharge") || type.includes("surcharge");
  const neutral =
    overload || name.includes(" mini") || name.includes(" vl") ||
    type.includes("mini") || type === "vl";
  return { overload, neutral };
}

function isExcludedFleetLocation(spot) {
  const name = normalize(spot.name);
  const depot = normalize(spot.depot);
  return name.includes("atelier") ||
    depot.includes("atelier") ||
    name.includes("autre depot") ||
    depot.includes("autre depot");
}

function isCoachFleetLocation(spot) {
  const name = normalize(spot.name);
  const depot = normalize(spot.depot);

  const lestonan = /^lestonan (?:[1-9]|10|11)$/.test(name);
  const lestonanOverload = /^lestonan surcharge [12]$/.test(name);
  const gourvily = /^gourvily (?:[1-9]|10|11)$/.test(name);
  const gourvilyOverload = /^gourvily surcharge [12]$/.test(name);

  const external = !isExcludedFleetLocation(spot) && (
    name.includes("quimper") ||
    name.includes("briec") ||
    depot.includes("quimper") ||
    depot.includes("briec") ||
    depot === "exterieur"
  );

  return lestonan || lestonanOverload || gourvily || gourvilyOverload || external;
}

function isCoachCapacityLocation(spot) {
  const name = normalize(spot.name);
  if (/surcharge/.test(name)) return false;
  return isCoachFleetLocation(spot);
}

function isMinibusLocation(spot) {
  const name = normalize(spot.name);
  return name === "lestonan mini" ||
    name === "lestonan mini 1" ||
    name === "lestonan mini 2" ||
    name === "gourvily mini";
}

function updateGlobalFleetCounters() {
  const coachLocations = state.spots.filter(isCoachFleetLocation);
  const coachCapacity = state.spots.filter(isCoachCapacityLocation).length;
  const coaches = coachLocations.reduce(
    (sum, spot) => sum + spot.registrations.length,
    0
  );

  const minibusLocations = state.spots.filter(isMinibusLocation);
  const minibusCapacity = minibusLocations.length;
  const minibuses = minibusLocations.reduce(
    (sum, spot) => sum + spot.registrations.length,
    0
  );

  $("occupiedSummary").textContent = `${coaches} / ${coachCapacity}`;
  $("occupiedSummaryLabel").textContent = "cars affectés / places";
  $("minibusSummary").textContent = `${minibuses} / ${minibusCapacity}`;
  $("minibusSummaryLabel").textContent = "minibus / places";
}

function verticalText(value) {
  return String(value || "").replace(/\s+/g, "").split("").join("<br>");
}

function verticalRegistration(value) {
  const registration = String(value || "").toUpperCase();
  const match = registration.match(/^([A-Z]{2})-(\d{3})-([A-Z]{2})$/);
  if (!match) return `🚌<br>${registration}`;
  return `🚌<br>${match[1]}-<br>${match[2]}<br>-${match[3]}`;
}


function makeSpot(spot, layout) {
  const template = $("spotTemplate").content.firstElementChild.cloneNode(true);
  const { overload, neutral } = classify(spot);
  const normalizedName = normalize(spot.name);
  const normalizedDepot = normalize(spot.depot);
  const verticalLestonan = /^lestonan [1-5]$/.test(normalizedName);
  const largeGourvily = /^gourvily (?:mini|[1-8])$/.test(normalizedName);

  template.classList.add(spot.occupied ? "occupied" : "free");
  template.classList.add(overload ? "overload" : neutral ? "neutral" : "standard");
  if (verticalLestonan) template.classList.add("vertical-lestonan");
  if (largeGourvily) template.classList.add("large-gourvily");

  template.dataset.spotName = normalizedName;
  template.dataset.depot = normalizedDepot;

  const nameElement = template.querySelector(".spot-name");
  const stateElement = template.querySelector(".spot-state");

  if (verticalLestonan) {
    const number = normalizedName.split(" ").pop();
    nameElement.innerHTML = `${verticalText("LESTONAN")}<br>${number}`;
  } else {
    nameElement.textContent = spot.name;
  }
  stateElement.textContent = spot.occupied ? "Occupé" : "Libre";

  const vehicles = template.querySelector(".spot-vehicles");
  if (spot.registrations.length) {
    spot.registrations.forEach(registration => {
      const badge = document.createElement("span");
      badge.className = verticalLestonan
        ? "vehicle-badge vehicle-badge-vertical"
        : "vehicle-badge";
      if (verticalLestonan) {
        badge.innerHTML = verticalRegistration(registration);
      } else {
        badge.textContent = `🚌 ${registration}`;
      }
      vehicles.appendChild(badge);
    });
  } else {
    vehicles.innerHTML =
      `<span class="empty-label">${overload ? "Doit rester libre" : "Disponible"}</span>`;
  }

  if (layout) {
    const [left, top, width, height, rotation = 0] = layout;
    Object.assign(template.style, {
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
      transform: `rotate(${rotation}deg)`
    });
  }
  return template;
}

function depotSpots(name) {
  const n = normalize(name);
  return state.spots.filter(spot =>
    normalize(spot.depot).includes(n) || normalize(spot.name).startsWith(n)
  );
}

function renderDepot(depot, targetId, layout, statsId, legendId) {
  const target = $(targetId);
  target.innerHTML = "";
  const spots = depotSpots(depot);
  const used = new Set();

  for (const [key, coordinates] of Object.entries(layout)) {
    const spot = spots.find(item => normalize(item.name) === key);
    if (!spot) continue;
    used.add(spot.notion_page_id);
    target.appendChild(makeSpot(spot, coordinates));
  }

  // Any unexpected new Notion spot still remains visible in a reserve column.
  const extras = spots.filter(spot => !used.has(spot.notion_page_id));
  extras.forEach((spot, index) => {
    target.appendChild(makeSpot(spot, [90, 40 + index * 9, 9, 8]));
  });

  const occupied = spots.filter(s => s.occupied).length;
  const vehicles = spots.reduce((sum, s) => sum + s.registrations.length, 0);
  $(statsId).innerHTML =
    `<span class="stat-chip">${occupied}/${spots.length} places occupées</span>` +
    `<span class="stat-chip">${vehicles} véhicule(s)</span>`;

  $(legendId).innerHTML = `
    <span class="legend-item"><i class="legend-color" style="background:#27883c"></i>Place standard libre</span>
    <span class="legend-item"><i class="legend-color" style="background:#626b65"></i>Mini / VL libre</span>
    <span class="legend-item"><i class="legend-color" style="background:#a52b27"></i>Place occupée</span>
    <span class="legend-item"><i class="legend-color" style="background:#ff2117"></i>Surcharge occupée — alerte</span>`;
}

function externalCategory(spot) {
  const name = normalize(spot.name);
  const depot = normalize(spot.depot);
  if (name.includes("quimper")) return "Quimper";
  if (name.includes("briec")) return "Briec";
  if (name.includes("atelier") || depot.includes("atelier")) return "Atelier";
  if (depot.includes("autre depot") || depot.includes("autre dépôt")) return "Autre dépôt";
  return "Extérieur";
}

function renderExternal() {
  const excluded = new Set([
    ...depotSpots("lestonan").map(s => s.notion_page_id),
    ...depotSpots("gourvily").map(s => s.notion_page_id)
  ]);
  const spots = state.spots.filter(spot => !excluded.has(spot.notion_page_id));
  const order = ["Quimper", "Briec", "Extérieur", "Atelier", "Autre dépôt"];
  const target = $("externalGroups");
  target.innerHTML = "";

  for (const groupName of order) {
    const groupSpots = spots.filter(spot => externalCategory(spot) === groupName);
    if (!groupSpots.length) continue;
    const section = document.createElement("section");
    section.className = "external-group";
    section.innerHTML = `<h3>${groupName}</h3><div class="external-list"></div>`;
    const list = section.querySelector(".external-list");

    groupSpots.sort((a,b) => a.name.localeCompare(b.name, "fr")).forEach(spot => {
      const card = document.createElement("article");
      card.className = `external-card ${spot.occupied ? "occupied" : "free"}`;
      card.innerHTML = `<h4>${spot.name}</h4><div class="spot-vehicles"></div>`;
      const vehicles = card.querySelector(".spot-vehicles");
      if (spot.registrations.length) {
        spot.registrations.forEach(registration => {
          vehicles.insertAdjacentHTML("beforeend", `<span class="vehicle-badge">🚌 ${registration}</span>`);
        });
      } else {
        vehicles.innerHTML = `<span class="empty-label">Aucun véhicule affecté</span>`;
      }
      list.appendChild(card);
    });
    target.appendChild(section);
  }

  const vehicles = spots.reduce((sum, spot) => sum + spot.registrations.length, 0);
  $("externalStats").innerHTML =
    `<span class="stat-chip">${spots.length} emplacement(s)</span>` +
    `<span class="stat-chip">${vehicles} véhicule(s)</span>`;
}

function render() {
  renderDepot("lestonan", "lestonanSpots", LESTONAN_LAYOUT, "lestonanStats", "lestonanLegend");
  renderDepot("gourvily", "gourvilySpots", GOURVILY_LAYOUT, "gourvilyStats", "gourvilyLegend");
  renderExternal();

  updateGlobalFleetCounters();
}

async function load() {
  try {
    const payload = await api("/api/parking");
    state.spots = payload.spots || [];
    render();
    $("lastUpdate").textContent =
      `Dernière mise à jour : ${payload.updated_at ? new Date(payload.updated_at + "Z").toLocaleString("fr-FR") : "jamais"}`;
    if (!state.spots.length) showMessage("Aucune donnée locale. Lance la synchronisation depuis Notion.");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function sync() {
  $("syncButton").disabled = true;
  showMessage("Synchronisation avec Notion en cours…");

  let cursor = null;
  let firstBatch = true;
  let totalImported = 0;
  let totalOccupied = 0;
  let totalLinked = 0;
  let totalResolved = 0;
  let batchNumber = 0;

  try {
    do {
      batchNumber++;
      const payload = await api("/api/admin/parking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_cursor: cursor, reset: firstBatch })
      });

      totalImported += Number(payload.imported || 0);
      totalOccupied += Number(payload.occupied_spots || 0);
      totalLinked += Number(payload.linked_vehicles || 0);
      totalResolved += Number(payload.resolved_registrations || 0);

      cursor = payload.has_more ? payload.next_cursor : null;
      firstBatch = false;

      showMessage(
        `Synchronisation Notion : lot ${batchNumber} — ` +
        `${totalImported} emplacement(s), ${totalLinked} véhicule(s) lié(s), ` +
        `${totalResolved} immatriculation(s) reconnue(s)…`
      );
    } while (cursor);

    showMessage(
      `${totalImported} emplacement(s) synchronisé(s), ` +
      `${totalOccupied} place(s) occupée(s), ` +
      `${totalResolved} immatriculation(s) reconnue(s).`
    );

    await load();
  } catch (error) {
    showMessage(`Synchronisation interrompue : ${error.message}`, true);
  } finally {
    $("syncButton").disabled = false;
  }
}

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));
    $(`${button.dataset.tab}Panel`).classList.add("active");
  });
});

$("syncButton").addEventListener("click", sync);
$("refreshButton").addEventListener("click", load);
load();
