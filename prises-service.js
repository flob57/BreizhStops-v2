const state = {
  date: "",
  services: [],
  timer: null,
  calendarEvents: []
};

const $ = id => document.getElementById(id);

function localDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date);
}

function humanDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
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

  if (!response.ok) {
    throw new Error(payload.error || `Erreur ${response.status}`);
  }

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

function showStatus(message, isError = false) {
  const element = $("statusMessage");
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function clearStatus() {
  $("statusMessage").hidden = true;
}

function serviceDateTime(service) {
  const match = String(service.ps_time || "")
    .match(/([01]?\d|2[0-3]):([0-5]\d)/);

  if (!match) {
    return null;
  }

  const [year, month, day] = service.service_date
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    Number(match[1]),
    Number(match[2]),
    0,
    0
  );
}

function countdownData(service) {
  if (service.validated) {
    return {
      text: "Validée",
      className: "validated",
      rowClass: "validated"
    };
  }

  const target = serviceDateTime(service);

  if (!target) {
    return {
      text: "Heure inconnue",
      className: "",
      rowClass: ""
    };
  }

  const seconds = Math.round((target.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const remainingSeconds = absolute % 60;

  const clock = [
    hours > 0 ? String(hours).padStart(2, "0") : null,
    String(minutes).padStart(2, "0"),
    String(remainingSeconds).padStart(2, "0")
  ].filter(Boolean).join(":");

  if (seconds < 0) {
    return {
      text: `Retard ${clock}`,
      className: "overdue",
      rowClass: "overdue"
    };
  }

  if (seconds <= 900) {
    return {
      text: `Dans ${clock}`,
      className: "soon",
      rowClass: "soon"
    };
  }

  return {
    text: `Dans ${clock}`,
    className: "future",
    rowClass: ""
  };
}

function validationTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris"
  }).format(date);
}

function escaped(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  const tableBody = $("dutyTableBody");
  const mobileList = $("dutyMobileList");
  const empty = $("emptyState");

  tableBody.innerHTML = "";
  mobileList.innerHTML = "";

  empty.hidden = state.services.length > 0;

  let validatedCount = 0;

  state.services.forEach(service => {
    const countdown = countdownData(service);

    if (service.validated) {
      validatedCount++;
    }

    const row = document.createElement("tr");
    row.className = `duty-row ${countdown.rowClass}`;

    row.innerHTML = `
      <td>
        <button
          class="validation-button ${service.validated ? "checked" : ""}"
          data-duty-id="${escaped(service.id)}"
          aria-label="Valider la prise de service"
        >${service.validated ? "✓" : ""}</button>
      </td>
      <td class="ps-time">${escaped(service.ps_time || "—")}</td>
      <td>
        <span class="countdown ${countdown.className}">
          ${escaped(countdown.text)}
        </span>
        ${
          service.validated_at
            ? `<span class="validation-time">
                à ${escaped(validationTime(service.validated_at))}
               </span>`
            : ""
        }
      </td>
      <td>${escaped(service.qub_reference || "—")}</td>
      <td>${escaped(service.driver_name || "—")}</td>
      <td>${escaped(service.first_course || "—")}</td>
      <td>${escaped(service.vehicle_registration || "—")}</td>
    `;

    tableBody.appendChild(row);

    const mobile = document.createElement("article");
    mobile.className = `mobile-duty ${countdown.rowClass}`;

    mobile.innerHTML = `
      <button
        class="validation-button ${service.validated ? "checked" : ""}"
        data-duty-id="${escaped(service.id)}"
        aria-label="Valider la prise de service"
      >${service.validated ? "✓" : ""}</button>

      <div class="mobile-duty-main">
        <div class="mobile-duty-heading">
          <strong>${escaped(service.ps_time || "—")}</strong>
          <span>QUB ${escaped(service.qub_reference || "—")}</span>
        </div>

        <div class="mobile-duty-line">
          ${escaped(service.driver_name || "Conducteur non affecté")}
        </div>

        <div class="mobile-duty-line">
          ${escaped(service.first_course || "Course non renseignée")}
        </div>

        <div class="mobile-duty-meta">
          ${escaped(service.vehicle_registration || "Véhicule non affecté")}
        </div>
      </div>

      <div class="mobile-duty-countdown">
        <span class="countdown ${countdown.className}">
          ${escaped(countdown.text)}
        </span>
        ${
          service.validated_at
            ? `<span class="validation-time">
                ${escaped(validationTime(service.validated_at))}
               </span>`
            : ""
        }
      </div>
    `;

    mobileList.appendChild(mobile);
  });

  $("validationCount").textContent =
    `${validatedCount} / ${state.services.length}`;
}

async function loadServices() {
  clearStatus();

  const payload = await api(
    `/api/duties/today?date=${encodeURIComponent(state.date)}`
  );

  state.services = payload.services || [];

  if (payload.calendar_event) {
    $("profileBadge").textContent =
      `Calendrier : ${payload.calendar_event.label}`;
  }

  render();
}

async function syncServices() {
  showStatus("Synchronisation Notion en cours…");

  try {
    const payload = await synchronizeDutiesInBatches(
      offset => {
        showStatus(
          offset === 0
            ? "Lecture de la base Notion…"
            : `Synchronisation : service ${offset + 1}…`
        );
      }
    );

    $("profileBadge").textContent =
      payload.profile === "none"
        ? `Aucun service — ${payload.profile_label}`
        : `Base du jour : ${payload.profile_label}`;

    await loadServices();

    showStatus(
      payload.profile === "none"
        ? "Aucune base chargée pour cette journée."
        : `${payload.imported} prise(s) de service synchronisée(s).`
    );
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function toggleValidation(dutyId) {
  const service = state.services.find(item => item.id === dutyId);

  if (!service) {
    return;
  }

  try {
    const payload = await api(
      `/api/duties/${encodeURIComponent(dutyId)}/validate`,
      {
        method: "POST",
        body: JSON.stringify({
          validated: !service.validated
        })
      }
    );

    service.validated = payload.validated ? 1 : 0;
    service.validated_at = payload.validated_at;
    render();
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function loadCalendar() {
  state.calendarEvents = await api("/api/public/depot-calendar");
  renderCalendar();
}

function profileName(value) {
  return {
    vacation: "Samedi + Vacances",
    none: "Aucun service",
    lmjv: "LMJV période scolaire",
    wednesday: "Mercredi période scolaire"
  }[value] || value;
}

function renderCalendar() {
  $("calendarEvents").innerHTML = state.calendarEvents
    .map(event => `
      <article class="calendar-event">
        <div>
          <strong>${escaped(event.label)}</strong>
          <small>
            ${escaped(event.start_date)}
            →
            ${escaped(event.end_date)}
            •
            ${escaped(profileName(event.service_profile))}
          </small>
        </div>

        <button data-calendar-delete="${escaped(event.id)}">
          Supprimer
        </button>
      </article>
    `)
    .join("");
}

async function addCalendarEvent(event) {
  event.preventDefault();

  try {
    await api("/api/public/depot-calendar", {
      method: "POST",
      body: JSON.stringify({
        label: $("calendarLabel").value,
        event_type: $("calendarType").value,
        start_date: $("calendarStart").value,
        end_date: $("calendarEnd").value,
        service_profile: $("calendarProfile").value,
        notes: $("calendarNotes").value
      })
    });

    $("calendarForm").reset();
    $("calendarProfile").value = "vacation";
    await loadCalendar();
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function deleteCalendarEvent(id) {
  await api(
    `/api/public/depot-calendar/${encodeURIComponent(id)}`,
    {
      method: "DELETE"
    }
  );

  await loadCalendar();
}

document.addEventListener("click", event => {
  const validationButton = event.target.closest("[data-duty-id]");

  if (validationButton) {
    toggleValidation(validationButton.dataset.dutyId);
    return;
  }

  const deleteButton = event.target.closest("[data-calendar-delete]");

  if (deleteButton) {
    deleteCalendarEvent(deleteButton.dataset.calendarDelete);
  }
});

$("syncNotion").addEventListener("click", syncServices);
$("refreshServices").addEventListener("click", loadServices);

$("openCalendar").addEventListener("click", async () => {
  await loadCalendar();
  $("calendarDialog").showModal();
});

$("closeCalendar").addEventListener("click", () => {
  $("calendarDialog").close();
});

$("calendarForm").addEventListener("submit", addCalendarEvent);

async function start() {
  state.date = localDateString();
  $("todayLabel").textContent = humanDate(state.date);

  try {
    await loadServices();

    if (!state.services.length) {
      await syncServices();
    }
  } catch (error) {
    showStatus(error.message, true);
  }

  state.timer = window.setInterval(() => {
    const newDate = localDateString();

    if (newDate !== state.date) {
      state.date = newDate;
      $("todayLabel").textContent = humanDate(state.date);
      syncServices();
      return;
    }

    render();
  }, 1000);
}

start();
