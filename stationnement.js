const $ = id => document.getElementById(id);
const state = { spots: [] };

const LESTONAN_LAYOUT = {
  "lestonan 1": [63.5, 7, 5.2, 18],
  "lestonan 2": [63.5, 29, 5.2, 18],
  "lestonan 3": [69.2, 7, 5.2, 18],
  "lestonan 4": [69.2, 29, 5.2, 18],
  "lestonan 5": [75.0, 29, 5.2, 18],
  "lestonan 6": [1.5, 78, 11.2, 8],
  "lestonan 7": [1.5, 68, 11.2, 8],
  "lestonan 8": [1.5, 58, 11.2, 8],
  "lestonan 9": [1.5, 48, 11.2, 8],
  "lestonan 10": [1.5, 38, 11.2, 8],
  "lestonan 11": [84.5, 12, 6.8, 22],
  "lestonan mini": [91.5, 35, 7.2, 10],
  "lestonan mini 1": [91.5, 35, 7.2, 10],
  "lestonan mini 2": [21, 78, 11.2, 8],
  "lestonan vl 1": [82.5, 52, 10.5, 7],
  "lestonan vl 2": [83.5, 61, 10.5, 7],
  "lestonan surcharge 1": [77.5, 78, 8.5, 17],
  "lestonan surcharge 2": [86.5, 78, 8.5, 17]
};

const GOURVILY_LAYOUT = {
  "gourvily mini": [1.0, 6.5, 7.0, 9.5, -42],
  "gourvily 1": [7.6, 6.5, 7.0, 9.5, -42],
  "gourvily 2": [14.2, 6.5, 7.0, 9.5, -42],
  "gourvily 3": [20.8, 6.5, 7.0, 9.5, -42],
  "gourvily 4": [27.4, 6.5, 7.0, 9.5, -42],
  "gourvily 5": [34.0, 6.5, 7.0, 9.5, -42],
  "gourvily 6": [40.6, 6.5, 7.0, 9.5, -42],
  "gourvily 7": [47.2, 6.5, 7.0, 9.5, -42],
  "gourvily 8": [53.8, 6.5, 7.0, 9.5, -42],
  "gourvily 9": [49.0, 20.5, 11.5, 7.5, -12],
  "gourvily 10": [54.0, 30.0, 11.5, 7.5, -12],
  "gourvily 11": [82.0, 16, 14, 8, 0],
  "gourvily vl": [65.2, 68.5, 6.8, 22, 0],
  "gourvily surcharge 1": [73.5, 80.5, 14, 8, 0],
  "gourvily surcharge 2": [73.5, 69.0, 14, 8, 0]
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

function makeSpot(spot, layout) {
  const template = $("spotTemplate").content.firstElementChild.cloneNode(true);
  const { overload, neutral } = classify(spot);
  template.classList.add(spot.occupied ? "occupied" : "free");
  template.classList.add(overload ? "overload" : neutral ? "neutral" : "standard");
  template.querySelector(".spot-name").textContent = spot.name;
  template.querySelector(".spot-state").textContent = spot.occupied ? "Occupé" : "Libre";

  const vehicles = template.querySelector(".spot-vehicles");
  if (spot.registrations.length) {
    spot.registrations.forEach(registration => {
      const badge = document.createElement("span");
      badge.className = "vehicle-badge";
      badge.textContent = `🚌 ${registration}`;
      vehicles.appendChild(badge);
    });
  } else {
    vehicles.innerHTML = `<span class="empty-label">${overload ? "Doit rester libre" : "Disponible"}</span>`;
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
      card.className = "external-card";
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

  const vehicles = state.spots.reduce((sum, spot) => sum + spot.registrations.length, 0);
  $("occupiedSummary").textContent = vehicles;
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
  try {
    const payload = await api("/api/admin/parking/sync", { method: "POST" });
    showMessage(payload.message);
    await load();
  } catch (error) {
    showMessage(error.message, true);
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
