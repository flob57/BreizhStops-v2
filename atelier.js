const $ = id => document.getElementById(id);
function localDate(d = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"); }
function addDays(date, n) { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return localDate(d); }
async function api(url, options = {}) { const r = await fetch(url, options); const text = await r.text(); let p; try { p = JSON.parse(text); } catch { throw new Error("Réponse du serveur illisible."); } if (!r.ok) throw new Error(p.error || "Erreur du serveur."); return p; }
function displayDate(date) { return new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }

async function loadVehicles() {
  const select = $("registration");
  try {
    const payload = await api("/api/planning/vehicle-index");
    const registrations = [...new Set((payload.vehicles || []).map(v => String(v.registration || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"));
    select.innerHTML = `<option value="">Choisir un véhicule</option>` + registrations.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
  } catch (e) {
    select.innerHTML = `<option value="">Impossible de charger les véhicules</option>`;
    showFormMessage(e.message, true);
  }
}

function showFormMessage(text, error = false) {
  const box = $("formMessage"); box.hidden = !text; box.textContent = text || ""; box.classList.toggle("error", error);
}

async function load() {
  try {
    $("message").textContent = "Chargement…";
    const p = await api(`/api/planning/workshop?from=${$("from").value}&to=${$("to").value}`);
    const groups = new Map();
    for (const item of p.items || []) { if (!groups.has(item.planning_date)) groups.set(item.planning_date, []); groups.get(item.planning_date).push(item); }
    $("days").innerHTML = groups.size ? [...groups].map(([date, items]) => `<section class="day"><h2>${displayDate(date)}</h2><div class="items">${items.map(i => `<article class="item"><div><h3>${esc(i.registration || i.entity_name || "Véhicule")}</h3><p><strong>${esc(i.activity_label || "ATELIER")}</strong></p></div><button class="delete-appointment" data-id="${esc(i.id)}" title="Supprimer">×</button></article>`).join("")}</div></section>`).join("") : `<p class="empty-state">Aucun rendez-vous atelier sur cette période.</p>`;
    $("message").textContent = "";
  } catch (e) { $("message").textContent = e.message; }
}

$("appointmentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("saveAppointment"); button.disabled = true; showFormMessage("Enregistrement…");
  try {
    await api("/api/planning/workshop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registration: $("registration").value, planning_date: $("appointmentDate").value, appointment_type: $("appointmentType").value }) });
    showFormMessage("Rendez-vous ajouté ✓");
    $("from").value = $("appointmentDate").value;
    $("to").value = addDays($("appointmentDate").value, 7);
    await load();
  } catch (e) { showFormMessage(e.message, true); } finally { button.disabled = false; }
});

$("days").addEventListener("click", async event => {
  const button = event.target.closest(".delete-appointment"); if (!button) return;
  if (!confirm("Supprimer ce rendez-vous atelier ?")) return;
  button.disabled = true;
  try { await api(`/api/planning/workshop?id=${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" }); await load(); }
  catch (e) { alert(e.message); button.disabled = false; }
});

const today = localDate(); $("appointmentDate").value = today; $("from").value = today; $("to").value = addDays(today, 14); $("refresh").onclick = load; loadVehicles(); load();
