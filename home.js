const $ = id => document.getElementById(id);

function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function updateClock() {
  const now = new Date();
  $("digitalTime").textContent = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);

  $("homeDate").textContent = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(now);
}

function secondsUntil(time) {
  const match = String(time || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const now = new Date();
  const target = new Date(now);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return Math.round((target - now) / 1000);
}

async function loadDashboard() {
  try {
    const response = await fetch(`/api/duties/today?date=${encodeURIComponent(parisDate())}`);
    if (!response.ok) throw new Error(`Erreur ${response.status}`);
    const payload = await response.json();
    const services = (payload.services || []).filter(service =>
      String(service.driver_name || "").trim() ||
      String(service.vehicle_registration || "").trim()
    );
    const validated = services.filter(service => Number(service.validated) === 1).length;
    $("validatedCount").textContent = `${validated} / ${services.length}`;
    $("validationProgress").style.width = services.length
      ? `${Math.round(validated / services.length * 100)}%`
      : "0%";

    const next = services
      .map(service => ({ service, seconds: secondsUntil(service.ps_time) }))
      .filter(item => item.seconds !== null && item.seconds >= 0)
      .sort((a, b) => a.seconds - b.seconds)[0];

    if (next) {
      $("nextDuty").textContent = `Prochaine prise de service à ${next.service.ps_time} · ${next.service.first_course || "service"} · ${next.service.driver_name || "conducteur non renseigné"}`;
    } else {
      $("nextDuty").textContent = services.length
        ? "Toutes les prises de service prévues sont passées."
        : "Aucun service à effectuer aujourd’hui.";
    }
  } catch (error) {
    $("validatedCount").textContent = "— / —";
    $("nextDuty").textContent = "Impossible de charger les prises de service pour le moment.";
  }
}

updateClock();
setInterval(updateClock, 1000);
loadDashboard();
setInterval(loadDashboard, 60000);
