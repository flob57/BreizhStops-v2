const SAE = {
  courses: [],
  selectedCourse: null,
  matchedStops: [],
  currentIndex: 0,
  currentBoardings: 0,
  currentAlightings: 0,
  onboard: 0,
  runId: null,
  map: null,
  routeLayer: null,
  stopsLayer: null,
  positionMarker: null,
  accuracyCircle: null,
  watchId: null,
  lastPosition: null,
  arrivalDetected: false,
  arrivalEnteredAt: null,
  autoAdvanceArmed: false,
  followEnabled: true,
  orientationEnabled: true,
  bearing: 0,
  deviceHeading: null,
  selectedNetwork: "",
  inferredNetwork: "",
  inferredCommune: "",
  automaticMatchSummary: null
};

function saeTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function saeFormatDate(dateString) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${dateString}T12:00:00`));
}

async function saeApi(url, options = {}) {
  return v4ApiFetch(url, {
    credentials: "include",
    ...options
  });
}

async function openSaeToday() {
  $("saeTodayDialog").showModal();
  $("saeTodayDate").textContent = saeFormatDate(saeTodayIso());
  await loadSaeToday();
}

async function loadSaeToday() {
  $("saeTodayList").innerHTML = "<p>Chargement des courses…</p>";

  try {
    const courses = await saeApi(
      `/api/admin/sae/today?date=${saeTodayIso()}`
    );

    SAE.courses = courses;
    renderSaeToday(courses);
  } catch (error) {
    $("saeTodayList").innerHTML = `
      <p>Impossible de charger les courses.<br>
      <small>${escapeHtml(error.message)}</small></p>
    `;
  }
}

function renderSaeToday(courses) {
  if (!courses.length) {
    $("saeTodayList").innerHTML = `
      <p>Aucune course enregistrée pour aujourd’hui.</p>
    `;
    return;
  }

  $("saeTodayList").innerHTML = courses.map(course => `
    <article
      class="sae-course-card"
      onclick="prepareSaeCourse('${course.id}')"
    >
      <div class="sae-course-title">
        ${escapeHtml(course.name)}
      </div>

      <div class="sae-course-meta">
        ${escapeHtml(course.start_time || "—")}
        ${course.end_time ? ` → ${escapeHtml(course.end_time)}` : ""}
        · ${course.stop_count} arrêt(s)
        ${course.girouette ? ` · Girouette ${escapeHtml(course.girouette)}` : ""}
      </div>
    </article>
  `).join("");
}

async function syncSaeNotion() {
  $("saeSyncStatus").innerHTML =
    '<p class="information-box">Synchronisation Notion en cours…</p>';

  try {
    const result = await saeApi("/api/admin/notion/sync-today", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        date: saeTodayIso()
      })
    });

    $("saeSyncStatus").innerHTML = `
      <p class="information-box">
        ✅ ${result.courses} course(s) synchronisée(s),
        ${result.stops} passage(s) d’arrêt.
      </p>
    `;

    await loadSaeToday();
  } catch (error) {
    $("saeSyncStatus").innerHTML = `
      <p class="information-box">
        ${escapeHtml(error.message)}
      </p>
    `;
  }
}

function saeMatchKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Le caractère � provient de certains anciens imports mal encodés.
    // On le traite comme un caractère inconnu plutôt que comme une différence bloquante.
    .replace(/�/g, "")
    .replace(/\bste\b/g, "sainte")
    .replace(/\bst\b/g, "saint")
    .replace(/\bgal\b/g, "general")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function saeEditDistance(left, right) {
  const a = saeMatchKey(left);
  const b = saeMatchKey(right);

  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitution
      );
    }

    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function saeSimilarity(left, right) {
  const a = saeMatchKey(left);
  const b = saeMatchKey(right);
  const longest = Math.max(a.length, b.length);

  if (!longest) return 1;

  return 1 - saeEditDistance(a, b) / longest;
}


function saeCandidateSourceIsInRoute(stop) {
  const network = saeMatchKey(stop?.reseau);

  if (network === "inroute") {
    return true;
  }

  return Array.isArray(stop?.sources) &&
    stop.sources.some(source =>
      saeMatchKey(source).includes("inroute")
    );
}

function saeStopCoordinates(stop) {
  const lat = Number(stop?.lat);
  const lon = Number(stop?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

function saeGeoDistance(left, right) {
  const a = saeStopCoordinates(left);
  const b = saeStopCoordinates(right);

  if (!a || !b) {
    return 9999;
  }

  return distanceKm(a, b);
}

function saeBearingBetween(left, right) {
  const a = saeStopCoordinates(left);
  const b = saeStopCoordinates(right);

  if (!a || !b) {
    return null;
  }

  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLon = (b.lon - a.lon) * Math.PI / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return normalizeBearing(Math.atan2(y, x) * 180 / Math.PI);
}

function saeTurnAngle(previous, current, next) {
  const first = saeBearingBetween(previous, current);
  const second = saeBearingBetween(current, next);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return 0;
  }

  return Math.abs(shortestBearingDelta(first, second));
}

function normalizedStopCandidates(name, maximum = 35) {
  const wanted = saeMatchKey(name);

  if (!wanted) {
    return [];
  }

  return stops
    .map(stop => {
      const candidate = saeMatchKey(stop.nom);
      let similarity = saeSimilarity(wanted, candidate);

      if (candidate === wanted) {
        similarity += 0.65;
      } else if (
        candidate.includes(wanted) ||
        wanted.includes(candidate)
      ) {
        similarity += 0.28;
      }

      return {
        stop,
        similarity
      };
    })
    .filter(item => item.similarity >= 0.50)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, maximum)
    .map(item => item.stop);
}

function saeNetworkCoverage(courseStops) {
  const networks = new Map();

  courseStops.forEach(courseStop => {
    const candidates = normalizedStopCandidates(courseStop.name, 45);
    const seenForThisStop = new Set();

    candidates.forEach(candidate => {
      const network = String(candidate.reseau || "").trim();

      if (!network || saeCandidateSourceIsInRoute(candidate)) {
        return;
      }

      const key = saeMatchKey(network);

      if (seenForThisStop.has(key)) {
        return;
      }

      seenForThisStop.add(key);

      const current = networks.get(network) || {
        network,
        coveredStops: 0,
        exactStops: 0,
        similarityTotal: 0
      };

      const similarity = saeSimilarity(
        candidate.nom,
        courseStop.name
      );

      current.coveredStops += 1;
      current.similarityTotal += similarity;

      if (
        saeMatchKey(candidate.nom) ===
        saeMatchKey(courseStop.name)
      ) {
        current.exactStops += 1;
      }

      networks.set(network, current);
    });
  });

  const totalStops = Math.max(1, courseStops.length);

  return [...networks.values()]
    .map(item => ({
      ...item,
      coverage: item.coveredStops / totalStops,
      averageSimilarity:
        item.coveredStops
          ? item.similarityTotal / item.coveredStops
          : 0,
      score:
        item.coveredStops * 100 +
        item.exactStops * 18 +
        item.averageSimilarity * 25
    }))
    .sort((left, right) => right.score - left.score);
}

function inferSaeCourseContext(courseStops) {
  const coverage = saeNetworkCoverage(courseStops);
  const explicitNetwork =
    String(SAE.selectedCourse?.network || "").trim();

  let inferredNetwork = explicitNetwork;

  if (!inferredNetwork && coverage.length) {
    const best = coverage[0];
    const second = coverage[1];

    const clearlyDominant =
      best.coverage >= 0.80 &&
      (
        !second ||
        best.coveredStops >= second.coveredStops + 2 ||
        best.score >= second.score + 80
      );

    if (clearlyDominant || best.coverage === 1) {
      inferredNetwork = best.network;
    }
  }

  SAE.inferredNetwork = inferredNetwork;
  SAE.selectedNetwork = inferredNetwork;

  const communeCounts = new Map();

  courseStops.forEach(courseStop => {
    normalizedStopCandidates(courseStop.name, 12)
      .filter(candidate =>
        !inferredNetwork ||
        saeMatchKey(candidate.reseau) === saeMatchKey(inferredNetwork) ||
        saeCandidateSourceIsInRoute(candidate)
      )
      .forEach(candidate => {
        const commune = String(candidate.commune || "").trim();

        if (commune) {
          communeCounts.set(
            commune,
            (communeCounts.get(commune) || 0) + 1
          );
        }
      });
  });

  SAE.inferredCommune =
    [...communeCounts.entries()]
      .sort((left, right) => right[1] - left[1])[0]?.[0] ||
    "";

  return coverage;
}

function rankStopCandidate(candidate, courseStop, network) {
  let score =
    saeSimilarity(candidate.nom, courseStop.name) * 115;

  if (
    saeMatchKey(candidate.nom) ===
    saeMatchKey(courseStop.name)
  ) {
    score += 115;
  }

  if (network) {
    if (
      saeMatchKey(candidate.reseau) ===
      saeMatchKey(network)
    ) {
      score += 70;
    } else if (saeCandidateSourceIsInRoute(candidate)) {
      score += 22;
    } else {
      score -= 85;
    }
  }

  if (
    courseStop.commune &&
    saeMatchKey(candidate.commune) ===
    saeMatchKey(courseStop.commune)
  ) {
    score += 38;
  }

  if (candidate.verified_terrain || candidate.trusted) {
    score += 12;
  }

  if (candidate.direction) {
    score += 3;
  }

  return score;
}

function saeBuildCandidateSets(courseStops, network) {
  return courseStops.map(courseStop => {
    let candidates = normalizedStopCandidates(
      courseStop.name,
      45
    );

    if (network) {
      const networkCandidates = candidates.filter(candidate =>
        saeMatchKey(candidate.reseau) === saeMatchKey(network)
      );

      const inRouteCandidates = candidates.filter(
        saeCandidateSourceIsInRoute
      );

      const allowed = [
        ...networkCandidates,
        ...inRouteCandidates
      ];

      if (allowed.length) {
        const unique = new Map();

        allowed.forEach(candidate =>
          unique.set(String(candidate.id), candidate)
        );

        candidates = [...unique.values()];
      }
    }

    return candidates
      .sort(
        (left, right) =>
          rankStopCandidate(right, courseStop, network) -
          rankStopCandidate(left, courseStop, network)
      )
      .slice(0, 12);
  });
}

function saeCandidateLocalCost(candidate, courseStop, network) {
  const ranking = rankStopCandidate(
    candidate,
    courseStop,
    network
  );

  return Math.max(0, 250 - ranking);
}

function saeTransitionCost(previous, current) {
  const distance = saeGeoDistance(previous, current);

  if (!Number.isFinite(distance)) {
    return 500;
  }

  // A scheduled urban/interurban stop sequence should normally
  // progress by short or moderate jumps. Very long jumps are possible,
  // but receive a progressive penalty.
  let cost = distance * 2.2;

  if (distance > 25) {
    cost += (distance - 25) * 5;
  }

  return cost;
}

function saeTurnPenalty(previous, current, next) {
  if (!previous || !current || !next) {
    return 0;
  }

  const angle = saeTurnAngle(previous, current, next);
  const firstLeg = saeGeoDistance(previous, current);
  const secondLeg = saeGeoDistance(current, next);
  const direct = saeGeoDistance(previous, next);

  let penalty = 0;

  // Strongly discourage a near U-turn.
  if (angle >= 155) {
    penalty += 150;
  } else if (angle >= 125) {
    penalty += 65;
  } else if (angle >= 100) {
    penalty += 20;
  }

  // If the two legs are much longer than the direct progression,
  // the chosen stop is probably on the wrong side or wrong branch.
  if (
    Number.isFinite(firstLeg) &&
    Number.isFinite(secondLeg) &&
    Number.isFinite(direct) &&
    firstLeg + secondLeg > direct * 2.6 + 0.8
  ) {
    penalty += Math.min(
      120,
      (firstLeg + secondLeg - direct) * 16
    );
  }

  return penalty;
}

function saeOptimizeCandidateSequence(
  courseStops,
  candidateSets,
  network
) {
  if (!candidateSets.length) {
    return [];
  }

  /*
   * Beam search with the two previous choices retained.
   * This allows the score to detect route reversals and incoherent
   * zigzags without making the browser evaluate every combination.
   */
  let beam = candidateSets[0].map(candidate => ({
    choices: [candidate],
    cost: saeCandidateLocalCost(
      candidate,
      courseStops[0],
      network
    )
  }));

  beam.sort((left, right) => left.cost - right.cost);
  beam = beam.slice(0, 45);

  for (let index = 1; index < candidateSets.length; index++) {
    const nextBeam = [];

    for (const state of beam) {
      const previous =
        state.choices[state.choices.length - 1];
      const beforePrevious =
        state.choices[state.choices.length - 2] || null;

      for (const candidate of candidateSets[index]) {
        let cost = state.cost;

        cost += saeCandidateLocalCost(
          candidate,
          courseStops[index],
          network
        );

        cost += saeTransitionCost(previous, candidate);

        cost += saeTurnPenalty(
          beforePrevious,
          previous,
          candidate
        );

        nextBeam.push({
          choices: [...state.choices, candidate],
          cost
        });
      }
    }

    nextBeam.sort((left, right) => left.cost - right.cost);
    beam = nextBeam.slice(0, 55);

    if (!beam.length) {
      break;
    }
  }

  return beam[0]?.choices || [];
}

function saeAutomaticConfidence(
  courseStop,
  selected,
  candidates,
  network
) {
  if (!selected) {
    return 0;
  }

  const selectedScore = rankStopCandidate(
    selected,
    courseStop,
    network
  );

  const alternatives = candidates
    .filter(candidate =>
      String(candidate.id) !== String(selected.id)
    )
    .map(candidate =>
      rankStopCandidate(candidate, courseStop, network)
    )
    .sort((left, right) => right - left);

  const margin =
    selectedScore - (alternatives[0] ?? selectedScore - 40);

  const baseSimilarity =
    saeSimilarity(selected.nom, courseStop.name);

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        baseSimilarity * 70 +
        Math.max(0, Math.min(30, margin / 2))
      )
    )
  );
}

function saeAutomaticMatchCourse(course) {
  const coverage = inferSaeCourseContext(course.stops);
  const network = SAE.inferredNetwork;
  const candidateSets = saeBuildCandidateSets(
    course.stops,
    network
  );

  const choices = saeOptimizeCandidateSequence(
    course.stops,
    candidateSets,
    network
  );

  const matchedStops = course.stops.map(
    (courseStop, index) => {
      const selected = choices[index] || candidateSets[index][0];
      const confidence = saeAutomaticConfidence(
        courseStop,
        selected,
        candidateSets[index],
        network
      );

      return {
        ...courseStop,
        matched_stop_id: selected?.id || null,
        lat: selected ? Number(selected.lat) : null,
        lon: selected ? Number(selected.lon) : null,
        commune:
          courseStop.commune ||
          selected?.commune ||
          "",
        candidates: candidateSets[index],
        automatic_confidence: confidence
      };
    }
  );

  const recognized = matchedStops.filter(stop =>
    stop.matched_stop_id
  ).length;

  const uncertain = matchedStops.filter(stop =>
    !stop.matched_stop_id ||
    stop.automatic_confidence < 70
  ).length;

  SAE.automaticMatchSummary = {
    network,
    recognized,
    total: matchedStops.length,
    uncertain,
    coverage
  };

  return matchedStops;
}

function saeAutomaticSummaryHtml() {
  const summary = SAE.automaticMatchSummary;

  if (!summary) {
    return "";
  }

  const networkLabel =
    summary.network ||
    "aucun réseau dominant";

  const warning =
    summary.uncertain > 0
      ? `<strong>${summary.uncertain}</strong> proposition(s) à vérifier.`
      : "Toutes les propositions paraissent cohérentes.";

  return `
    <div class="sae-auto-summary">
      <div>
        <strong>Proposition automatique</strong>
        <span class="sae-auto-network">
          Réseau : ${escapeHtml(networkLabel)}
        </span>
      </div>

      <div>
        ${summary.recognized}/${summary.total} arrêts reconnus.
        ${warning}
      </div>

      <small>
        Le parcours a été comparé dans son ensemble pour limiter
        les détours, retours en arrière et demi-tours.
        Chaque choix reste modifiable.
      </small>
    </div>
  `;
}

async function prepareSaeCourse(courseId) {
  try {
    const course = await saeApi(
      `/api/admin/sae/courses/${encodeURIComponent(courseId)}`
    );

    SAE.selectedCourse = course;

    /*
     * Previously confirmed coordinates stay available in the candidate
     * pool, but the whole course is evaluated again so that a stale or
     * incoherent match cannot force a bad itinerary.
     */
    SAE.matchedStops = saeAutomaticMatchCourse(course);

    populateSaeNetworkFilter();
    renderSaeMatches();
    $("saeMatchDialog").showModal();
  } catch (error) {
    alert(error.message);
  }
}


function saeNetworksForCourse() {
  const networks = new Set();

  SAE.matchedStops.forEach(courseStop => {
    (courseStop.candidates || normalizedStopCandidates(courseStop.name))
      .forEach(candidate => {
        if (candidate.reseau) {
          networks.add(candidate.reseau);
        }
      });
  });

  return [...networks].sort((a, b) => a.localeCompare(b, "fr"));
}

function isInRouteStop(stop) {
  return (
    normalize(stop.reseau) === "inroute" ||
    (stop.sources || []).some(source =>
      normalize(source).includes("inroute")
    )
  );
}

function filteredSaeCandidates(courseStop) {
  const all = courseStop.candidates ||
    normalizedStopCandidates(courseStop.name);

  if (!SAE.selectedNetwork) {
    return all;
  }

  return all.filter(candidate =>
    normalize(candidate.reseau) === normalize(SAE.selectedNetwork) ||
    isInRouteStop(candidate)
  );
}

function directionLabel(stop) {
  if (stop.direction === "entrant") {
    return " — Entrant";
  }

  if (stop.direction === "sortant") {
    return " — Sortant";
  }

  return "";
}

function populateSaeNetworkFilter() {
  const select = $("saeNetworkFilter");
  const networks = saeNetworksForCourse();

  select.innerHTML =
    '<option value="">Tous les réseaux</option>' +
    networks.map(network => `
      <option value="${escapeHtml(network)}">
        ${escapeHtml(network)}
      </option>
    `).join("");

  const dominant =
    SAE.selectedCourse?.network ||
    SAE.inferredNetwork ||
    "";

  if (
    dominant &&
    networks.some(network =>
      normalize(network) === normalize(dominant)
    )
  ) {
    SAE.selectedNetwork = dominant;
    select.value = dominant;
  } else {
    SAE.selectedNetwork = "";
  }
}

function renderSaeMatches() {
  $("saeMatchList").innerHTML =
    saeAutomaticSummaryHtml() +
    SAE.matchedStops.map((stop, index) => {
    const candidates = filteredSaeCandidates(stop);

    return `
      <div class="sae-match-row">
        <div>
          <div class="sae-match-source">
            ${index + 1}. ${escapeHtml(stop.name)}
          </div>
          <div class="sae-match-time">
            ${escapeHtml(stop.scheduled_time || "—")}
            ${
              stop.automatic_confidence !== undefined
                ? `<span class="sae-confidence ${
                    stop.automatic_confidence >= 85
                      ? "high"
                      : stop.automatic_confidence >= 70
                        ? "medium"
                        : "low"
                  }">
                    ${stop.automatic_confidence} %
                  </span>`
                : ""
            }
          </div>
        </div>

        <select onchange="selectSaeStopMatch(${index}, this.value)">
          <option value="">Arrêt non reconnu</option>
          ${candidates.map(candidate => `
            <option
              value="${escapeHtml(candidate.id)}"
              ${String(candidate.id) === String(stop.matched_stop_id) ? "selected" : ""}
            >
              ${escapeHtml(candidate.nom)}
              — ${escapeHtml(candidate.commune || "")}
              ${candidate.reseau ? ` — ${escapeHtml(candidate.reseau)}` : ""}
              ${escapeHtml(directionLabel(candidate))}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }).join("");
}

function selectSaeStopMatch(index, stopId) {
  const candidate = stops.find(stop => String(stop.id) === String(stopId));

  if (!candidate) {
    SAE.matchedStops[index].matched_stop_id = null;
    SAE.matchedStops[index].lat = null;
    SAE.matchedStops[index].lon = null;
    return;
  }

  SAE.matchedStops[index].matched_stop_id = candidate.id;
  SAE.matchedStops[index].lat = Number(candidate.lat);
  SAE.matchedStops[index].lon = Number(candidate.lon);
  SAE.matchedStops[index].commune =
    SAE.matchedStops[index].commune || candidate.commune || "";
}

async function confirmSaeMatches() {
  const missing = SAE.matchedStops.filter(
    stop =>
      !Number.isFinite(Number(stop.lat)) ||
      !Number.isFinite(Number(stop.lon))
  );

  if (missing.length) {
    alert(
      `${missing.length} arrêt(s) ne sont pas reconnus. ` +
      `Associe-les avant de lancer le SAE.`
    );
    return;
  }

  try {
    await saeApi(
      `/api/admin/sae/courses/${encodeURIComponent(SAE.selectedCourse.id)}/matches`,
      {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({
          stops: SAE.matchedStops.map(stop => ({
            id: stop.id,
            matched_stop_id: stop.matched_stop_id,
            lat: Number(stop.lat),
            lon: Number(stop.lon),
            commune: stop.commune || ""
          }))
        })
      }
    );

    $("saeMatchDialog").close();
    $("saeTodayDialog").close();
    await startSaeRun();
  } catch (error) {
    alert(error.message);
  }
}

async function buildSaeGeometry() {
  const coordinates = SAE.matchedStops
    .map(stop => `${Number(stop.lon)},${Number(stop.lat)}`)
    .join(";");

  const data = await apiFetch(
    `${ROUTING_ENDPOINT}/${coordinates}` +
    "?overview=full&geometries=geojson&steps=false"
  );

  if (!data.routes?.length) {
    throw new Error("Impossible de tracer la course.");
  }

  return data.routes[0].geometry;
}

async function startSaeRun() {
  try {
    const geometry = await buildSaeGeometry();

    const run = await saeApi("/api/admin/sae/runs", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        course_id: SAE.selectedCourse.id,
        date: saeTodayIso()
      })
    });

    SAE.runId = run.id;
    SAE.currentIndex = run.current_stop_index || 0;
    SAE.onboard = run.onboard || 0;
    SAE.currentBoardings = 0;
    SAE.currentAlightings = 0;
    SAE.arrivalDetected = false;
    SAE.arrivalEnteredAt = null;
    SAE.autoAdvanceArmed = false;

    SAE.selectedCourse.geometry = geometry;

    $("saeCourseName").textContent = SAE.selectedCourse.name;
    $("saeGirouette").textContent =
      `Girouette : ${SAE.selectedCourse.girouette || "—"}`;
    $("saeService").textContent =
      `Service : ${SAE.selectedCourse.service || "—"}`;

    $("saeScreen").classList.remove("hidden");

    initSaeMap();
    renderSaeRoute();
    renderSaeState();
    startSaeGps();
  } catch (error) {
    alert(error.message);
  }
}

function initSaeMap() {
  if (SAE.map) {
    setTimeout(() => SAE.map.invalidateSize(), 50);
    return;
  }

  SAE.map = L.map("saeMap", {
    zoomControl: false
  }).setView([48.2, -3.2], 8);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }
  ).addTo(SAE.map);

  SAE.routeLayer = L.layerGroup().addTo(SAE.map);
  SAE.stopsLayer = L.layerGroup().addTo(SAE.map);

  SAE.map.on("dragstart", () => {
    setSaeFollow(false);
  });
}

function renderSaeRoute() {
  SAE.routeLayer.clearLayers();
  SAE.stopsLayer.clearLayers();

  const latLngs = SAE.selectedCourse.geometry.coordinates
    .map(([lon, lat]) => [lat, lon]);

  const polyline = L.polyline(latLngs, {
    color: "#7fdf37",
    weight: 7,
    opacity: 0.9
  }).addTo(SAE.routeLayer);

  SAE.map.fitBounds(polyline.getBounds(), {
    padding: [35, 35]
  });

  SAE.matchedStops.forEach((stop, index) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="route-stop-marker">${index + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    L.marker([stop.lat, stop.lon], { icon })
      .bindTooltip(stop.name)
      .addTo(SAE.stopsLayer);
  });
}

function currentSaeStop() {
  return SAE.matchedStops[SAE.currentIndex] || null;
}

function nextSaeStop() {
  return SAE.matchedStops[SAE.currentIndex + 1] || null;
}

function parseScheduledDate(time) {
  if (!time) {
    return null;
  }

  const [hours, minutes, seconds = "0"] = time.split(":");
  const date = new Date();

  date.setHours(
    Number(hours),
    Number(minutes),
    Number(seconds),
    0
  );

  return date;
}

function formatDelay(seconds) {
  const absolute = Math.abs(Math.round(seconds));
  const minutes = Math.floor(absolute / 60);
  const remaining = absolute % 60;

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function updateSaeDelay() {
  const stop = currentSaeStop();
  const theoretical = parseScheduledDate(stop?.scheduled_time);

  if (!theoretical) {
    $("saeDelay").textContent = "—";
    $("saeDelay").className = "sae-delay sae-delay-neutral";
    return;
  }

  const difference = (Date.now() - theoretical.getTime()) / 1000;

  if (difference > 30) {
    $("saeDelay").textContent = `+${formatDelay(difference)} RETARD`;
    $("saeDelay").className = "sae-delay sae-delay-late";
  } else if (difference < -30) {
    $("saeDelay").textContent = `-${formatDelay(difference)} AVANCE`;
    $("saeDelay").className = "sae-delay sae-delay-early";
  } else {
    $("saeDelay").textContent = "À L’HEURE";
    $("saeDelay").className = "sae-delay sae-delay-ontime";
  }
}

function renderSaeState() {
  const current = currentSaeStop();
  const next = nextSaeStop();

  $("saeCurrentStop").textContent = current?.name || "Terminé";
  $("saeCurrentScheduled").textContent =
    current?.scheduled_time || "—";

  $("saeCurrentDistance").textContent = "—";

  $("saeNextStopName").textContent =
    next?.name || "Terminus";

  $("saeNextScheduled").textContent =
    next?.scheduled_time || "—";

  $("saeBoardingsValue").textContent = SAE.currentBoardings;
  $("saeAlightingsValue").textContent = SAE.currentAlightings;
  $("saePassengerBadge").textContent = `👥 ${SAE.onboard}`;

  $("saeProgressCount").textContent =
    `${Math.min(SAE.currentIndex + 1, SAE.matchedStops.length)} / ` +
    `${SAE.matchedStops.length}`;

  $("saeStopProgress").innerHTML =
    SAE.matchedStops.map((stop, index) => `
      <div class="sae-progress-stop ${
        index < SAE.currentIndex
          ? "done"
          : index === SAE.currentIndex
            ? "current"
            : ""
      }">
        <strong>${escapeHtml(stop.name)}</strong><br>
        ${escapeHtml(stop.scheduled_time || "")}
      </div>
    `).join("");

  updateSaeDelay();
}

function updateSaeCounts() {
  const provisional =
    Math.max(
      0,
      SAE.onboard +
      SAE.currentBoardings -
      SAE.currentAlightings
    );

  $("saeBoardingsValue").textContent = SAE.currentBoardings;
  $("saeAlightingsValue").textContent = SAE.currentAlightings;
  $("saePassengerBadge").textContent = `👥 ${provisional}`;
}

async function validateSaeStop(auto = false) {
  const stop = currentSaeStop();

  if (!stop) {
    return;
  }

  try {
    const result = await saeApi(
      `/api/admin/sae/runs/${encodeURIComponent(SAE.runId)}/validate-stop`,
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          course_stop_id: stop.id,
          stop_index: SAE.currentIndex,
          actual_time: new Date().toISOString(),
          boardings: SAE.currentBoardings,
          alightings: SAE.currentAlightings,
          onboard_before: SAE.onboard,
          auto
        })
      }
    );

    SAE.onboard = result.onboard_after;
    SAE.currentBoardings = 0;
    SAE.currentAlightings = 0;
    SAE.currentIndex++;

    SAE.arrivalDetected = false;
    SAE.arrivalEnteredAt = null;
    SAE.autoAdvanceArmed = false;

    if (SAE.currentIndex >= SAE.matchedStops.length) {
      await finishSaeRun();
      return;
    }

    renderSaeState();
  } catch (error) {
    alert(error.message);
  }
}

async function finishSaeRun() {
  try {
    await saeApi(
      `/api/admin/sae/runs/${encodeURIComponent(SAE.runId)}/finish`,
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          finished_at: new Date().toISOString()
        })
      }
    );

    alert(
      `Course terminée.\n` +
      `Voyageurs à bord en fin de course : ${SAE.onboard}`
    );

    stopSaeGps();
    $("saeScreen").classList.add("hidden");
    await loadSaeToday();
  } catch (error) {
    alert(error.message);
  }
}

function saeHeading(position) {
  const gpsHeading = Number(position.coords.heading);
  const speed = Number(position.coords.speed);

  if (
    Number.isFinite(gpsHeading) &&
    gpsHeading >= 0 &&
    (!Number.isFinite(speed) || speed > 1.2)
  ) {
    return normalizeBearing(gpsHeading);
  }

  if (Number.isFinite(SAE.deviceHeading)) {
    return normalizeBearing(SAE.deviceHeading);
  }

  return SAE.bearing;
}

function smoothSaeBearing(target) {
  const delta = shortestBearingDelta(SAE.bearing, target);
  SAE.bearing = normalizeBearing(SAE.bearing + delta * 0.22);
  return SAE.bearing;
}

function rotateSaeMap(bearing) {
  const mapPane = SAE.map?.getPane("mapPane");

  if (!mapPane) {
    return;
  }

  mapPane.style.transformOrigin = "50% 50%";
  mapPane.style.transition = "transform 0.25s linear";
  mapPane.style.transform =
    `rotate(${SAE.orientationEnabled ? -bearing : 0}deg)`;
}

function setSaeFollow(enabled) {
  SAE.followEnabled = enabled;
  $("saeFollowToggle").textContent =
    enabled ? "🎯 Suivi actif" : "🎯 Suivi en pause";
}

function setSaeOrientation(enabled) {
  SAE.orientationEnabled = enabled;
  $("saeOrientationToggle").textContent =
    enabled ? "🧭 Orientation active" : "🧭 Orientation coupée";
  rotateSaeMap(enabled ? SAE.bearing : 0);
}

function onSaeOrientation(event) {
  let heading = null;

  if (Number.isFinite(event.webkitCompassHeading)) {
    heading = event.webkitCompassHeading;
  } else if (Number.isFinite(event.alpha)) {
    heading = 360 - event.alpha;
  }

  if (Number.isFinite(heading)) {
    SAE.deviceHeading = normalizeBearing(heading);
  }
}

async function requestSaeOrientation() {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const permission = await DeviceOrientationEvent.requestPermission();

    if (permission !== "granted") {
      throw new Error("Autorisation d’orientation refusée.");
    }
  }

  window.addEventListener(
    "deviceorientationabsolute",
    onSaeOrientation,
    true
  );

  window.addEventListener(
    "deviceorientation",
    onSaeOrientation,
    true
  );
}

function startSaeGps() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n’est pas disponible.");
    return;
  }

  requestSaeOrientation().catch(error => {
    console.warn("Orientation indisponible :", error);
  });

  SAE.watchId = navigator.geolocation.watchPosition(
    onSaePosition,
    error => {
      $("saeGpsBadge").textContent = "GPS indisponible";
      $("saeGpsBadge").className =
        "sae-badge sae-badge-warning";
      console.error(error);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 1500
    }
  );
}

function onSaePosition(position) {
  const point = {
    lat: position.coords.latitude,
    lon: position.coords.longitude
  };

  SAE.lastPosition = point;

  const bearing = smoothSaeBearing(saeHeading(position));

  if (!SAE.positionMarker) {
    const icon = L.divIcon({
      className: "gps-heading-marker",
      html: '<div class="gps-heading-arrow"></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    SAE.positionMarker = L.marker(
      [point.lat, point.lon],
      {
        icon,
        zIndexOffset: 1000
      }
    ).addTo(SAE.map);

    SAE.accuracyCircle = L.circle(
      [point.lat, point.lon],
      {
        radius: position.coords.accuracy,
        color: "#1677ff",
        weight: 1,
        fillOpacity: 0.12
      }
    ).addTo(SAE.map);
  } else {
    SAE.positionMarker.setLatLng([point.lat, point.lon]);
    SAE.accuracyCircle
      .setLatLng([point.lat, point.lon])
      .setRadius(position.coords.accuracy);
  }

  if (SAE.positionMarker?._icon) {
    /*
     * The marker is inside the rotated map pane.
     * Applying the opposite rotation keeps the arrow fixed toward the top.
     */
    SAE.positionMarker._icon.style.transform +=
      ` rotate(${SAE.orientationEnabled ? bearing : 0}deg)`;
  }

  if (SAE.followEnabled) {
    SAE.map.setView(
      [point.lat, point.lon],
      Math.max(SAE.map.getZoom(), 16),
      { animate: true }
    );
  }

  rotateSaeMap(bearing);

  $("saeGpsBadge").textContent =
    `GPS ${Math.round(position.coords.accuracy)} m`;
  $("saeGpsBadge").className =
    "sae-badge sae-badge-success";

  updateSaeGpsProgress(point, position.coords.speed);
}

function updateSaeGpsProgress(point, speed) {
  const current = currentSaeStop();
  const next = nextSaeStop();

  if (!current) {
    return;
  }

  const currentDistance = distanceKm(point, current) * 1000;
  const nextDistance = next
    ? distanceKm(point, next) * 1000
    : 0;

  $("saeCurrentDistance").textContent =
    currentDistance >= 1000
      ? `${(currentDistance / 1000).toFixed(1)} km`
      : `${Math.round(currentDistance)} m`;

  const nextDistanceElement = $("saeNextDistance");

  if (nextDistanceElement) {
    nextDistanceElement.textContent =
      next
        ? nextDistance >= 1000
          ? `${(nextDistance / 1000).toFixed(1)} km`
          : `${Math.round(nextDistance)} m`
        : "Terminus";
  }

  if (currentDistance <= 45) {
    if (!SAE.arrivalDetected) {
      SAE.arrivalDetected = true;
      SAE.arrivalEnteredAt = Date.now();
    }

    SAE.autoAdvanceArmed = true;
  }

  const movingAway =
    SAE.autoAdvanceArmed &&
    currentDistance >= 85 &&
    (
      !Number.isFinite(Number(speed)) ||
      Number(speed) > 1.5
    );

  if (movingAway) {
    validateSaeStop(true);
  }

  updateSaeDelay();
}

function stopSaeGps() {
  if (SAE.watchId !== null) {
    navigator.geolocation.clearWatch(SAE.watchId);
    SAE.watchId = null;
  }

  window.removeEventListener(
    "deviceorientationabsolute",
    onSaeOrientation,
    true
  );
  window.removeEventListener(
    "deviceorientation",
    onSaeOrientation,
    true
  );

  if (SAE.map) {
    SAE.map.remove();
    SAE.map = null;
  }

  SAE.positionMarker = null;
  SAE.accuracyCircle = null;
}

async function quitSae() {
  if (!confirm("Quitter le SAE en cours ?")) {
    return;
  }

  stopSaeGps();
  $("saeScreen").classList.add("hidden");
}

$("openSae").addEventListener("click", openSaeToday);
$("saeSyncNotion").addEventListener("click", syncSaeNotion);
$("saeRefreshToday").addEventListener("click", loadSaeToday);
$("saeConfirmMatches").addEventListener("click", confirmSaeMatches);

$("saeBoardingsPlus").addEventListener("click", () => {
  SAE.currentBoardings++;
  updateSaeCounts();
});

$("saeBoardingsMinus").addEventListener("click", () => {
  SAE.currentBoardings = Math.max(0, SAE.currentBoardings - 1);
  updateSaeCounts();
});

$("saeAlightingsPlus").addEventListener("click", () => {
  const provisional =
    SAE.onboard + SAE.currentBoardings - SAE.currentAlightings;

  if (provisional > 0) {
    SAE.currentAlightings++;
  }

  updateSaeCounts();
});

$("saeAlightingsMinus").addEventListener("click", () => {
  SAE.currentAlightings = Math.max(0, SAE.currentAlightings - 1);
  updateSaeCounts();
});

$("saeValidateStop").addEventListener("click", () => {
  validateSaeStop(false);
});

$("saeQuit").addEventListener("click", quitSae);

$("saeFollowToggle").addEventListener("click", () => {
  setSaeFollow(!SAE.followEnabled);

  if (SAE.followEnabled && SAE.lastPosition) {
    SAE.map.setView(
      [SAE.lastPosition.lat, SAE.lastPosition.lon],
      17,
      { animate: true }
    );
  }
});

$("saeOrientationToggle").addEventListener("click", async () => {
  const next = !SAE.orientationEnabled;

  if (next) {
    try {
      await requestSaeOrientation();
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  setSaeOrientation(next);
});

$("saeNorthUp").addEventListener("click", () => {
  SAE.bearing = 0;
  setSaeOrientation(false);
  rotateSaeMap(0);
});


$("saeNetworkFilter").addEventListener("change", event => {
  SAE.selectedNetwork = event.target.value;
  SAE.inferredNetwork = event.target.value;

  const candidateSets = saeBuildCandidateSets(
    SAE.selectedCourse.stops,
    SAE.selectedNetwork
  );

  const choices = saeOptimizeCandidateSequence(
    SAE.selectedCourse.stops,
    candidateSets,
    SAE.selectedNetwork
  );

  SAE.matchedStops = SAE.selectedCourse.stops.map(
    (courseStop, index) => {
      const selected = choices[index] || candidateSets[index][0];

      return {
        ...courseStop,
        matched_stop_id: selected?.id || null,
        lat: selected ? Number(selected.lat) : null,
        lon: selected ? Number(selected.lon) : null,
        commune:
          courseStop.commune ||
          selected?.commune ||
          "",
        candidates: candidateSets[index],
        automatic_confidence: saeAutomaticConfidence(
          courseStop,
          selected,
          candidateSets[index],
          SAE.selectedNetwork
        )
      };
    }
  );

  SAE.automaticMatchSummary = {
    network: SAE.selectedNetwork,
    recognized: SAE.matchedStops.filter(
      stop => stop.matched_stop_id
    ).length,
    total: SAE.matchedStops.length,
    uncertain: SAE.matchedStops.filter(
      stop =>
        !stop.matched_stop_id ||
        stop.automatic_confidence < 70
    ).length,
    coverage: []
  };

  renderSaeMatches();
});

$("saeZoomIn").addEventListener("click", () => {
  if (SAE.map) {
    SAE.map.zoomIn();
  }
});

$("saeZoomOut").addEventListener("click", () => {
  if (SAE.map) {
    SAE.map.zoomOut();
  }
});
