const $ = id => document.getElementById(id);
let vehicles = [];

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function formatDate(value) {
  if (!value) return "Non renseignée";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}
function deadlineText(vehicle) {
  if (vehicle.status === "unknown") return "Date de vidange inconnue";
  if (vehicle.days_remaining < 0) return `${Math.abs(vehicle.days_remaining)} jour(s) de retard`;
  if (vehicle.days_remaining === 0) return "Échéance aujourd’hui";
  return `${vehicle.days_remaining} jour(s) restant(s)`;
}
function statusLabel(status) {
  return status === "unknown" ? "Prioritaire" : status === "late" ? "En retard" : status === "soon" ? "À vider" : "À jour";
}
function card(vehicle) {
  return `<a class="vehicle ${escapeHtml(vehicle.status)}" href="${escapeHtml(vehicle.notion_url)}" target="_blank" rel="noopener">
    ${vehicle.cover_url ? `<img class="vehicle-cover" src="${escapeHtml(vehicle.cover_url)}" alt="${escapeHtml(vehicle.registration)}">` : `<div class="vehicle-placeholder">🚌</div>`}
    <div class="vehicle-body">
      <div class="vehicle-head"><div><h2>${escapeHtml(vehicle.registration)}</h2><span class="park">Parc Océlorn : ${escapeHtml(vehicle.ocelorn_number || "—")}</span></div><span class="badge">${statusLabel(vehicle.status)}</span></div>
      <p class="deadline">${escapeHtml(deadlineText(vehicle))}</p>
      <div class="dates"><span>Dernier déchargement</span><strong>${escapeHtml(formatDate(vehicle.last_download))}</strong><span>Échéance</span><strong>${escapeHtml(formatDate(vehicle.due_date))}</strong></div>
    </div>
  </a>`;
}
function render() {
  const query = normalize($("search").value);
  const filtered = vehicles.filter(vehicle => !query || normalize(`${vehicle.registration} ${vehicle.ocelorn_number}`).includes(query));
  $("vehicles").innerHTML = filtered.length ? filtered.map(card).join("") : `<div class="empty">Aucun véhicule ne correspond à la recherche.</div>`;
}
async function load() {
  $("message").hidden = false;
  $("message").textContent = "Chargement des véhicules…";
  try {
    const response = await fetch("/api/tachy", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
    vehicles = payload.vehicles || [];
    const counts = payload.counts || {};
    $("lateCount").textContent = Number(counts.late || 0) + Number(counts.unknown || 0);
    $("soonCount").textContent = counts.soon || 0;
    $("currentCount").textContent = counts.current || 0;
    $("total").textContent = `${counts.total || 0} véhicule(s)`;
    $("message").hidden = true;
    render();
  } catch (error) {
    $("message").textContent = `Impossible de charger les échéances : ${error.message}`;
    $("vehicles").innerHTML = "";
  }
}
$("search").addEventListener("input", render);
$("refresh").addEventListener("click", load);
load();
