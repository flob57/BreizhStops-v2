const state = {
  date: "",
  departures: [],
  refreshTimer: null,
  openTraceIds: new Set(),
  traceScrollPositions: new Map()
};

const $ = id => document.getElementById(id);

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function nowParts() {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function secondsOfTime(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

function courseTimeline(departure) {
  const stops = departure.stops || [];
  let previous = null;
  let dayOffset = 0;

  return stops.map(stop => {
    let seconds = secondsOfTime(stop.time);
    if (seconds == null) return { ...stop, seconds: null };

    if (previous !== null && seconds + dayOffset < previous - 6 * 3600) {
      dayOffset += 86400;
    }

    seconds += dayOffset;
    previous = seconds;
    return { ...stop, seconds };
  });
}

function currentSecondsFor(timeline) {
  const now = nowParts();
  let seconds = now.hour * 3600 + now.minute * 60 + now.second;

  if (
    timeline.length &&
    timeline.at(-1).seconds >= 86400 &&
    seconds < 6 * 3600
  ) {
    seconds += 86400;
  }

  return seconds;
}

function statusOf(departure) {
  const timeline = courseTimeline(departure).filter(stop => stop.seconds != null);
  if (!timeline.length) return { running: false, upcoming: false };

  const now = currentSecondsFor(timeline);
  const start = secondsOfTime(departure.departure_time) ?? timeline[0].seconds;
  const adjustedStart =
    timeline[0].seconds >= 86400 && start < 6 * 3600 ? start + 86400 : start;
  const end = timeline.at(-1).seconds;

  let nextIndex = timeline.findIndex(stop => stop.seconds > now);
  if (nextIndex < 0) nextIndex = timeline.length - 1;

  return {
    timeline,
    now,
    start: adjustedStart,
    end,
    running: now >= adjustedStart && now <= end,
    upcoming: adjustedStart > now && adjustedStart - now <= 3600,
    secondsUntil: adjustedStart - now,
    nextIndex,
    nextStop: timeline[nextIndex],
    progress: end > adjustedStart
      ? Math.max(0, Math.min(1, (now - adjustedStart) / (end - adjustedStart)))
      : 0
  };
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    const clean = String(text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);

    const accessBlocked =
      response.redirected ||
      /cloudflare|access|login|authentication/i.test(clean);

    throw new Error(
      accessBlocked
        ? "La synchronisation est bloquée par Cloudflare Access. Vérifiez que les routes /api/public/* ne sont pas protégées."
        : clean
          ? `Erreur serveur ${response.status} : ${clean}`
          : `Réponse du serveur illisible (${response.status}).`
    );
  }

  if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
  return payload;
}


async function synchronizeDutiesInBatches(onProgress = null) {
  let offset = 0;
  let totalImported = 0;
  let done = false;
  let lastResult = null;

  while (!done) {
    if (onProgress) {
      onProgress(offset);
    }

    const result = await api("/api/public/duties/sync", {
      method: "POST",
      body: JSON.stringify({
        date: state.date,
        offset,
        reset: offset === 0
      })
    });

    lastResult = result;
    totalImported += Number(result.imported || 0);
    done = result.done === true;
    offset =
      result.next_offset ??
      result.total_services ??
      offset + 1;

    if (!done) {
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }

  return {
    ...(lastResult || {}),
    imported: totalImported
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function humanDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Europe/Paris"
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function durationLabel(seconds) {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  return `${minutes} min`;
}

function runningCard(departure, status) {
  const next = status.nextStop || {};
  const progressPercent = status.progress * 100;
  const stopsHtml = status.timeline.map((stop, index) => {
    const cls = index < status.nextIndex ? "done" :
      index === status.nextIndex ? "next" : "";
    return `
      <div class="thermo-stop ${cls}">
        <span class="dot"></span>
        <div class="stop-time">${escapeHtml(stop.time.slice(0,5))}</div>
        <div class="stop-name">${escapeHtml(stop.name)}</div>
      </div>
    `;
  }).join("");

  return `
    <article class="running-card ${state.openTraceIds.has(departure.id) ? "open" : ""}" data-running-id="${escapeHtml(departure.id)}">
      <div class="running-main">
        <div class="time">${escapeHtml(departure.departure_time.slice(0,5))}</div>
        <div class="course">${escapeHtml(departure.course_name)}</div>
        <div><span class="label">Lieu</span>${escapeHtml(departure.origin_name)}</div>
        <div><span class="label">Conducteur</span>${escapeHtml(departure.driver_name || "—")}</div>
        <div><span class="label">Véhicule</span>${escapeHtml(departure.vehicle_registration || "—")}</div>
        <div><span class="label">QUB</span>${escapeHtml(departure.qub_reference || "—")}</div>
        <div><span class="label">Prochain arrêt</span>${escapeHtml((next.time || "").slice(0,5))} ${escapeHtml(next.name || "—")}</div>
        <div><span class="label">Arrivée</span>${escapeHtml(departure.arrival_time.slice(0,5) || "—")}</div>
        <button class="trace-button" data-trace-id="${escapeHtml(departure.id)}">${state.openTraceIds.has(departure.id) ? "⌃" : "⌄"}</button>
      </div>
      <div class="thermometer" data-thermometer-id="${escapeHtml(departure.id)}">
        <div class="thermo-track">
          <div class="thermo-line"></div>
          <div class="thermo-progress" style="width:calc((100% - 56px) * ${status.progress})"></div>
          <div class="bus" style="left:calc(28px + (100% - 56px) * ${status.progress})">🚌</div>
          ${stopsHtml}
        </div>
      </div>
    </article>
  `;
}

function saveTraceScrollPositions() {
  document.querySelectorAll("[data-thermometer-id]").forEach(element => {
    state.traceScrollPositions.set(
      element.dataset.thermometerId,
      element.scrollLeft
    );
  });
}

function restoreTraceScrollPositions() {
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-thermometer-id]").forEach(element => {
      const saved = state.traceScrollPositions.get(
        element.dataset.thermometerId
      );
      if (Number.isFinite(saved)) element.scrollLeft = saved;
    });
  });
}

function render() {
  saveTraceScrollPositions();

  const classified = state.departures.map(departure => ({
    departure,
    status: statusOf(departure)
  }));

  const running = classified.filter(item => item.status.running);
  const upcoming = classified.filter(item => item.status.upcoming)
    .sort((a, b) => a.status.secondsUntil - b.status.secondsUntil);

  $("runningList").innerHTML = running
    .map(item => runningCard(item.departure, item.status))
    .join("");
  $("runningEmpty").style.display = running.length ? "none" : "block";

  $("upcomingBody").innerHTML = upcoming.map(({ departure, status }) => {
    const urgent = status.secondsUntil <= 900;
    const validated = Number(departure.duty_validated) === 1;
    return `
      <tr class="${urgent && !validated ? "warning" : ""}">
        <td class="time">${escapeHtml(departure.departure_time.slice(0,5))}</td>
        <td class="minutes ${urgent ? "urgent" : ""}">${durationLabel(status.secondsUntil)}</td>
        <td class="course">${escapeHtml(departure.course_name)}</td>
        <td>${escapeHtml(departure.origin_name)}</td>
        <td>${escapeHtml(departure.driver_name || "—")}</td>
        <td>${escapeHtml(departure.vehicle_registration || "—")}</td>
        <td>${escapeHtml(departure.qub_reference || "—")}</td>
        <td class="${validated ? "validated" : "not-validated"}">
          ${validated ? "✓ Oui" : "⚠ Non"}
        </td>
      </tr>
    `;
  }).join("");

  $("upcomingEmpty").style.display = upcoming.length ? "none" : "block";
  restoreTraceScrollPositions();
}

function enableTimelineDragging() {
  let active = null;
  let startX = 0;
  let startScroll = 0;

  document.addEventListener("pointerdown", event => {
    const thermometer = event.target.closest(".thermometer");
    if (!thermometer || event.pointerType === "touch") return;

    active = thermometer;
    startX = event.clientX;
    startScroll = thermometer.scrollLeft;
    thermometer.classList.add("dragging");
    thermometer.setPointerCapture(event.pointerId);
  });

  document.addEventListener("pointermove", event => {
    if (!active) return;
    active.scrollLeft = startScroll - (event.clientX - startX);
    state.traceScrollPositions.set(
      active.dataset.thermometerId,
      active.scrollLeft
    );
  });

  const finish = event => {
    if (!active) return;
    state.traceScrollPositions.set(
      active.dataset.thermometerId,
      active.scrollLeft
    );
    active.classList.remove("dragging");
    try { active.releasePointerCapture(event.pointerId); } catch {}
    active = null;
  };

  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);
  document.addEventListener("scroll", event => {
    const thermometer = event.target.closest?.("[data-thermometer-id]");
    if (!thermometer) return;
    state.traceScrollPositions.set(
      thermometer.dataset.thermometerId,
      thermometer.scrollLeft
    );
  }, true);
}

function showMessage(text, error = false) {
  const el = $("message");
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("error", error);
}

async function load() {
  const payload = await api(`/api/departures/today?date=${encodeURIComponent(state.date)}`);
  state.departures = payload.departures || [];
  render();
}

async function syncAll() {
  showMessage("Synchronisation des prises de service…");

  try {
    await synchronizeDutiesInBatches(
      offset => {
        showMessage(
          offset === 0
            ? "Lecture des prises de service Notion…"
            : `Prises de service : service ${offset + 1}…`
        );
      }
    );

    let offset = 0;
    let totalImported = 0;
    let done = false;
    let profileLabel = "";

    while (!done) {
      showMessage(
        offset === 0
          ? "Lecture des courses et fiches horaires Notion…"
          : `Synchronisation Notion : service ${offset + 1}…`
      );

      const result = await api("/api/public/departures/sync", {
        method: "POST",
        body: JSON.stringify({
          date: state.date,
          offset,
          reset: offset === 0
        })
      });

      totalImported += Number(result.imported || 0);
      profileLabel = result.profile_label || profileLabel;
      done = result.done === true;
      offset = result.next_offset ?? result.total_services ?? offset + 1;

      if (!done) {
        await new Promise(resolve => setTimeout(resolve, 120));
      }
    }

    $("profileLabel").textContent =
      `Base du jour : ${profileLabel || "synchronisée"}`;

    await load();
    showMessage(`${totalImported} course(s) synchronisée(s).`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-trace-id]");
  if (!button) return;

  const id = button.dataset.traceId;
  if (state.openTraceIds.has(id)) {
    state.openTraceIds.delete(id);
  } else {
    state.openTraceIds.add(id);
  }

  render();
});

$("syncButton").addEventListener("click", syncAll);
$("refreshButton").addEventListener("click", load);
enableTimelineDragging();

async function start() {
  state.date = localDate();
  $("dateLabel").textContent = humanDate(state.date);

  const tick = () => {
    const now = nowParts();
    $("clock").textContent =
      `${String(now.hour).padStart(2,"0")}:${String(now.minute).padStart(2,"0")}`;
    render();

    const newDate = localDate();
    if (newDate !== state.date) {
      state.date = newDate;
      $("dateLabel").textContent = humanDate(state.date);
      syncAll();
    }
  };

  try {
    await load();
    if (!state.departures.length) await syncAll();
  } catch (error) {
    showMessage(error.message, true);
  }

  tick();
  setInterval(tick, 1000);
  state.refreshTimer = setInterval(load, 30000);
}

start();
