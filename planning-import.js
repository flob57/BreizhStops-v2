
const $ = id => document.getElementById(id);
let analysis = null;
let loadedImage = null;
let vehicleIndex = null;
let vehicleList = [];
let lastOcrDiagnostics = null;

function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
$("planningDate").value = parisDate();

$("planningImage").addEventListener("change", async () => {
  const file = $("planningImage").files[0];
  if (!file) return;
  $("preview").src = URL.createObjectURL(file);
  $("preview").hidden = false;
  loadedImage = await createImageBitmap(file);
});

function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
}
function normalize(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .trim();
}
function compact(value) {
  return normalize(value).replace(/[^A-Z0-9]/g, "");
}
function hhmm(minutes) {
  const value = Math.max(0, Math.min(24 * 60, Math.round(minutes / 5) * 5));
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(Math.min(hour, 23)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function parseDate(text) {
  const match = String(text || "").match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/);
  if (!match) return "";
  return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
}
function canvasFor(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
  return canvas;
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * (((b - r) / delta) + 2);
    else h = 60 * (((r - g) / delta) + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? delta / max : 0, v: max };
}
function pixelClass(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < 0.16) return "black";
  if (s < 0.12 && v > 0.78) return "white";
  if (s < 0.18) return "gray";
  if (h >= 45 && h <= 72 && s > 0.55 && v > 0.7) return "yellow";
  if (h >= 315 || h <= 12) return s > 0.5 ? "pink" : "other";
  if (h >= 270 && h < 315 && s > 0.45) return "purple";
  if (h >= 78 && h <= 155 && s > 0.25) return "green";
  if (h >= 175 && h <= 230 && s > 0.2) return "blue";
  if (h >= 25 && h < 45 && s > 0.45) return "orange";
  return "other";
}
function dominantClass(data, x0, y0, x1, y1, step = 3) {
  const counts = {};
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const offset = (y * data.width + x) * 4;
      const cls = pixelClass(data.data[offset], data.data[offset + 1], data.data[offset + 2]);
      counts[cls] = (counts[cls] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "white";
}
function activeAt(data, x, y0, y1) {
  let active = 0, total = 0;
  for (let y = y0; y < y1; y += 2) {
    const offset = (y * data.width + x) * 4;
    const cls = pixelClass(data.data[offset], data.data[offset + 1], data.data[offset + 2]);
    if (!["white", "gray"].includes(cls)) active++;
    total++;
  }
  return total && active / total > 0.18;
}
function runsForRow(data, x0, x1, y0, y1) {
  const raw = [];
  let start = null;
  for (let x = x0; x <= x1; x += 2) {
    const active = x < x1 && activeAt(data, x, y0, y1);
    if (active && start === null) start = x;
    if (!active && start !== null) {
      if (x - start >= 4) raw.push([start, x]);
      start = null;
    }
  }

  // Merge small gaps caused by text and grid lines.
  const merged = [];
  for (const run of raw) {
    const last = merged.at(-1);
    if (last && run[0] - last[1] <= 7) last[1] = run[1];
    else merged.push(run.slice());
  }
  return merged;
}
function wordsInBox(words, x0, y0, x1, y1) {
  return words
    .filter(word => {
      const box = word.bbox || {};
      const cx = ((box.x0 || 0) + (box.x1 || 0)) / 2;
      const cy = ((box.y0 || 0) + (box.y1 || 0)) / 2;
      return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
    })
    .sort((a, b) => (a.bbox?.x0 || 0) - (b.bbox?.x0 || 0))
    .map(word => word.text)
    .join(" ")
    .trim();
}
function detectGrid(image, words, type) {
  const w = image.width, h = image.height;
  if (type === "workshop") {
    return { x0: 0, x1: w, y0: Math.round(h * 0.08), y1: Math.round(h * 0.97) };
  }

  // Typical Gescar layout. OCR hour labels refine x0 when available.
  const hourWords = words.filter(word => /^(?:[0-9]|1[0-9]|2[0-3])h$/i.test(word.text || ""));
  let x0 = Math.round(w * 0.073);
  let x1 = Math.round(w * 0.985);
  if (hourWords.length >= 8) {
    const sorted = hourWords.slice().sort((a, b) => (a.bbox?.x0 || 0) - (b.bbox?.x0 || 0));
    x0 = Math.max(x0, Math.round(sorted[0].bbox.x0));
    const last = sorted.at(-1);
    const step = ((last.bbox.x0 - sorted[0].bbox.x0) / Math.max(1, sorted.length - 1));
    x1 = Math.min(w - 2, Math.round(last.bbox.x0 + step));
  }
  return {
    x0, x1,
    y0: Math.round(h * 0.105),
    y1: Math.round(h * 0.82)
  };
}
function rowLabels(words, grid, type) {
  const leftLimit = grid.x0 - 3;
  const candidates = words
    .filter(word => {
      const b = word.bbox || {};
      const cx = ((b.x0 || 0) + (b.x1 || 0)) / 2;
      const cy = ((b.y0 || 0) + (b.y1 || 0)) / 2;
      return cx < leftLimit && cy > grid.y0 && cy < grid.y1 &&
        String(word.text || "").trim().length >= 2;
    })
    .map(word => ({
      text: String(word.text || "").trim(),
      y: ((word.bbox.y0 || 0) + (word.bbox.y1 || 0)) / 2,
      h: Math.max(6, (word.bbox.y1 || 0) - (word.bbox.y0 || 0))
    }))
    .filter(row => {
      const value = normalize(row.text);
      if (type === "driver") {
        return /^[A-ZÀ-Ü0-9.' -]{3,20}$/.test(value) &&
          !/^(PLANNING|RAFRAICHIR|SUIVANT|PRECEDENT|DATE|ZOOM)$/.test(value);
      }
      return /^[A-Z0-9 -]{3,18}$/.test(value) &&
        /[A-Z]/.test(value) && /[0-9]/.test(value);
    })
    .sort((a, b) => a.y - b.y);

  const merged = [];
  for (const candidate of candidates) {
    const last = merged.at(-1);
    if (last && Math.abs(candidate.y - last.y) < Math.max(candidate.h, last.h) * 0.75) {
      last.text += ` ${candidate.text}`;
      last.y = (last.y + candidate.y) / 2;
    } else merged.push({ ...candidate });
  }
  return merged;
}
async function loadVehicleIndex() {
  if (vehicleIndex) return vehicleIndex;
  const response = await fetch("/api/planning/vehicle-index");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Index véhicules indisponible.");

  vehicleIndex = new Map();
  vehicleList = payload.vehicles || [];

  for (const vehicle of vehicleList) {
    for (const key of vehicle.keys || []) {
      vehicleIndex.set(compact(key), vehicle.registration);
    }
    vehicleIndex.set(compact(vehicle.park_number), vehicle.registration);
  }
  return vehicleIndex;
}
function classifyDriverSegment(data, words, run, rowTop, rowBottom, grid) {
  const [start, end] = run;
  const color = dominantClass(data, start, rowTop, end, rowBottom, 2);
  const text = normalize(wordsInBox(words, start - 2, rowTop - 3, end + 2, rowBottom + 3));

  if (/\b(RH|RHO|REPOS)\b/.test(text)) return ["repos", text];
  if (/\bCONGE\b/.test(text)) return ["conge", text];
  if (/^AT\b|\bACCIDENT\b/.test(text)) return ["at", text];
  if (/MALAD/.test(text)) return ["maladie", text];
  if (/\bQ\s?[A-Z0-9]/.test(text) || /^Q/.test(text)) return ["conduite_qub", text];
  if (/\bAE[A-Z0-9]/.test(text) || /^AE/.test(text)) return ["conduite_breizhgo", text];
  if (/\bLC[A-Z0-9]/.test(text) || /^LC/.test(text)) return ["conduite_lecoeur", text];
  if (color === "black") return ["hlp", text || "HLP"];
  if (["blue", "pink"].includes(color)) return ["occasionnel", text || "Service occasionnel"];
  if (color === "purple") return ["service_marker", text];
  return ["circulation", text || "Conduite"];
}
function timeFromX(x, grid) {
  return ((x - grid.x0) / Math.max(1, grid.x1 - grid.x0)) * 24 * 60;
}

function levenshtein(a, b) {
  const first = compact(a);
  const second = compact(b);
  const matrix = Array.from(
    { length: first.length + 1 },
    (_, row) => Array(second.length + 1).fill(0)
  );
  for (let row = 0; row <= first.length; row++) matrix[row][0] = row;
  for (let column = 0; column <= second.length; column++) matrix[0][column] = column;

  for (let row = 1; row <= first.length; row++) {
    for (let column = 1; column <= second.length; column++) {
      const cost = first[row - 1] === second[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }
  return matrix[first.length][second.length];
}

function fallbackVehicleItems(fullText) {
  const normalizedText = compact(fullText);
  const detected = [];

  for (const vehicle of vehicleList) {
    const candidates = [
      vehicle.park_number,
      ...(vehicle.keys || [])
    ].map(compact).filter(value => value.length >= 4);

    const exact = candidates.some(value => normalizedText.includes(value));
    if (!exact) continue;

    detected.push({
      entity_name: vehicle.park_number || vehicle.registration,
      ocelorn_number: vehicle.park_number || "",
      registration: vehicle.registration || "",
      start_time: "",
      end_time: "",
      activity_type: "circulation",
      activity_label: "Véhicule détecté par lecture OCR (horaires à vérifier)",
      confidence: 0.68
    });
  }

  return detected;
}

function fallbackDriverItems(fullText) {
  const lines = String(fullText || "")
    .split(/\r?\n/)
    .map(line => normalize(line))
    .filter(Boolean);
  const items = [];

  for (const line of lines) {
    const name = line.match(/^([A-ZÀ-Ü.'-]{3,}(?:\.[A-Z])?)/)?.[1];
    if (!name) continue;

    let activity = "";
    if (/\b(RH|RHO|REPOS)\b/.test(line)) activity = "repos";
    else if (/CONGE/.test(line)) activity = "conge";
    else if (/\bAT\b/.test(line)) activity = "at";
    else if (/MALAD/.test(line)) activity = "maladie";
    else continue;

    items.push({
      entity_name: name,
      start_time: "00:00",
      end_time: "23:55",
      activity_type: activity,
      activity_label: line,
      confidence: 0.75
    });
  }

  return items;
}

async function analyzeGrid(type, image, words, fullText) {
  const canvas = canvasFor(image);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grid = detectGrid(image, words, type);
  const labels = rowLabels(words, grid, type);
  const items = [];
  const index = type === "vehicle" ? await loadVehicleIndex() : null;

  if (!labels.length) {
    if (type === "vehicle") {
      return {
        planning_type: type,
        date: parseDate(fullText) || $("planningDate").value,
        items: fallbackVehicleItems(fullText),
        diagnostics: {
          mode: "fallback_text",
          labels: 0,
          ...lastOcrDiagnostics
        }
      };
    }
    return {
      planning_type: type,
      date: parseDate(fullText) || $("planningDate").value,
      items: fallbackDriverItems(fullText),
      diagnostics: {
        mode: "fallback_text",
        labels: 0,
        ...lastOcrDiagnostics
      }
    };
  }

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const previousY = labels[i - 1]?.y ?? (label.y - 12);
    const nextY = labels[i + 1]?.y ?? (label.y + 12);
    const rowTop = Math.max(grid.y0, Math.round((previousY + label.y) / 2));
    const rowBottom = Math.min(grid.y1, Math.round((label.y + nextY) / 2));
    const runs = runsForRow(data, grid.x0, grid.x1, rowTop, rowBottom);

    if (!runs.length) continue;

    if (type === "vehicle") {
      const lineText = normalize(wordsInBox(words, grid.x0, rowTop - 2, grid.x1, rowBottom + 2));
      let activity = "circulation";
      if (/ATELIER/.test(lineText)) activity = "atelier";
      else if (/TRANSFERT/.test(lineText)) activity = "transfert";

      const park = normalize(label.text).replace(/\s+/g, " ").trim();
      const registration = index.get(compact(park)) || "";
      items.push({
        entity_name: park,
        ocelorn_number: park,
        registration,
        start_time: hhmm(timeFromX(runs[0][0], grid)),
        end_time: hhmm(timeFromX(runs.at(-1)[1], grid)),
        activity_type: activity,
        activity_label: lineText || activity,
        confidence: registration ? 0.94 : 0.72
      });
      continue;
    }

    // Full-row absence detected first.
    const lineText = normalize(wordsInBox(words, grid.x0, rowTop - 2, grid.x1, rowBottom + 2));
    const fullColor = dominantClass(data, grid.x0, rowTop, grid.x1, rowBottom, 5);
    let absence = "";
    if (/\b(RH|RHO|REPOS)\b/.test(lineText)) absence = "repos";
    else if (/CONGE/.test(lineText)) absence = "conge";
    else if (/\bAT\b|ACCIDENT/.test(lineText)) absence = "at";
    else if (/MALAD/.test(lineText)) absence = "maladie";
    if (absence || ["yellow", "pink"].includes(fullColor) && runs.length === 1 && runs[0][1] - runs[0][0] > (grid.x1-grid.x0)*0.8) {
      items.push({
        entity_name: normalize(label.text),
        start_time: "00:00", end_time: "23:55",
        activity_type: absence || (fullColor === "pink" ? "repos" : "conge"),
        activity_label: lineText || absence || "Absence",
        confidence: absence ? 0.97 : 0.78
      });
      continue;
    }

    const segments = runs.map(run => ({
      run,
      result: classifyDriverSegment(data, words, run, rowTop, rowBottom, grid)
    }));

    // Purple markers: first = start duty, last = end duty.
    const purpleIndexes = segments
      .map((segment, idx) => segment.result[0] === "service_marker" ? idx : -1)
      .filter(idx => idx >= 0);

    segments.forEach((segment, idx) => {
      let [activityType, labelText] = segment.result;
      if (activityType === "service_marker") {
        activityType = idx === purpleIndexes[0] ? "prise_service" :
          idx === purpleIndexes.at(-1) ? "fin_service" : "circulation";
        labelText ||= activityType === "prise_service" ? "Prise de service" : "Fin de service";
      }
      items.push({
        entity_name: normalize(label.text),
        start_time: hhmm(timeFromX(segment.run[0], grid)),
        end_time: hhmm(timeFromX(segment.run[1], grid)),
        activity_type: activityType,
        activity_label: labelText,
        confidence: labelText ? 0.88 : 0.74
      });
    });

    // Gaps between substantial activities become cut/pause periods.
    for (let s = 0; s < segments.length - 1; s++) {
      const gapStart = segments[s].run[1], gapEnd = segments[s+1].run[0];
      if (gapEnd - gapStart > (grid.x1 - grid.x0) * (20 / (24 * 60))) {
        items.push({
          entity_name: normalize(label.text),
          start_time: hhmm(timeFromX(gapStart, grid)),
          end_time: hhmm(timeFromX(gapEnd, grid)),
          activity_type: "coupure",
          activity_label: "Coupure / pause",
          confidence: 0.8
        });
      }
    }
  }

  return {
    planning_type: type,
    date: parseDate(fullText) || $("planningDate").value,
    items,
    diagnostics: {
      mode: "grid",
      labels: labels.length,
      ...lastOcrDiagnostics
    }
  };
}
function parseWorkshop(words, fullText) {
  const dateDefault = parseDate(fullText) || $("planningDate").value;
  const lines = [];
  const groups = new Map();

  for (const word of words) {
    const y = Math.round((((word.bbox?.y0 || 0) + (word.bbox?.y1 || 0)) / 2) / 10) * 10;
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(word);
  }

  for (const group of groups.values()) {
    const text = group
      .sort((a,b)=>(a.bbox?.x0||0)-(b.bbox?.x0||0))
      .map(word=>word.text).join(" ").trim();
    if (text) lines.push(text);
  }

  const items = [];
  let currentDate = dateDefault;
  for (const line of lines) {
    const detectedDate = parseDate(line);
    if (detectedDate) currentDate = detectedDate;
    const registration = line.match(/\b[A-Z]{2}[-\s]\d{3}[-\s][A-Z]{2}\b/i)?.[0]?.replace(/\s/g, "-") || "";
    if (!registration) continue;
    const times = [...line.matchAll(/\b(\d{1,2})[:h](\d{2})\b/g)]
      .map(match => `${String(match[1]).padStart(2,"0")}:${match[2]}`);
    items.push({
      entity_name: registration.toUpperCase(),
      registration: registration.toUpperCase(),
      start_time: times[0] || "",
      end_time: times[1] || "",
      activity_type: "atelier",
      activity_label: line,
      location: "",
      details: line,
      confidence: 0.82,
      planning_date: currentDate
    });
  }
  return { planning_type:"workshop", date:dateDefault, items };
}
function withTimeout(promise, milliseconds, messageText) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(messageText)),
      milliseconds
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function wordsFromTsv(tsv) {
  const rows = String(tsv || "").split(/\r?\n/);
  if (rows.length < 2) return [];

  const header = rows[0].split("\t");
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  const words = [];

  for (const row of rows.slice(1)) {
    const columns = row.split("\t");
    const value = String(columns[index.text] || "").trim();
    const confidence = Number(columns[index.conf] || -1);
    if (!value || confidence < 0) continue;

    const left = Number(columns[index.left] || 0);
    const top = Number(columns[index.top] || 0);
    const width = Number(columns[index.width] || 0);
    const height = Number(columns[index.height] || 0);

    words.push({
      text: value,
      confidence,
      bbox: {
        x0: left,
        y0: top,
        x1: left + width,
        y1: top + height
      }
    });
  }

  return words;
}

function extractWords(data) {
  if (Array.isArray(data?.words) && data.words.length) return data.words;

  const blockWords = [];
  for (const block of data?.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const word of line.words || []) {
          if (word?.text) blockWords.push(word);
        }
      }
    }
  }
  if (blockWords.length) return blockWords;

  return wordsFromTsv(data?.tsv);
}

async function runOcr(image) {
  if (!window.Tesseract?.createWorker) {
    throw new Error(
      "Le moteur OCR n’a pas pu être chargé. Vérifie la connexion Internet, " +
      "désactive temporairement un bloqueur de scripts, puis recharge la page."
    );
  }

  let worker = null;
  try {
    message("Chargement du moteur OCR…");

    worker = await withTimeout(
      Tesseract.createWorker("eng", 1, {
        workerPath:
          "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
        corePath:
          "https://cdn.jsdelivr.net/npm/tesseract.js-core@5",
        langPath:
          "https://tessdata.projectnaptha.com/4.0.0",
        logger: progress => {
          const percent = Math.round((progress.progress || 0) * 100);
          const labels = {
            "loading tesseract core": "Chargement du cœur OCR",
            "initializing tesseract": "Initialisation OCR",
            "loading language traineddata": "Chargement de la langue",
            "initializing api": "Préparation de la lecture",
            "recognizing text": "Lecture du texte"
          };
          const label = labels[progress.status] || progress.status || "OCR";
          message(`${label}… ${percent} %`);
        }
      }),
      120000,
      "Le chargement du moteur OCR a dépassé deux minutes. " +
      "Recharge la page et réessaie avec une connexion stable."
    );

    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "150"
    });

    const result = await withTimeout(
      worker.recognize(image, {}, { blocks: true, text: true, tsv: true }),
      120000,
      "La lecture de la capture a dépassé deux minutes. " +
      "Essaie avec une capture JPEG ou PNG moins lourde."
    );

    const words = extractWords(result.data);
    if (!result.data?.text && !words.length) {
      throw new Error(
        "Aucun texte n’a été détecté. Utilise une capture originale, " +
        "non recadrée et suffisamment nette."
      );
    }

    const ocrText = result.data?.text || "";
    lastOcrDiagnostics = {
      characters: ocrText.length,
      words: words.length,
      has_tsv: Boolean(result.data?.tsv),
      has_blocks: Array.isArray(result.data?.blocks) && result.data.blocks.length > 0
    };

    return {
      text: ocrText,
      words
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // La terminaison du worker ne doit pas masquer le résultat.
      }
    }
  }
}
function activityOptions(current) {
  const options = [
    "circulation","atelier","transfert","prise_service","conduite_qub",
    "conduite_breizhgo","conduite_lecoeur","hlp","occasionnel","coupure",
    "repos","conge","at","maladie","fin_service"
  ];
  return options.map(value =>
    `<option value="${value}" ${value === current ? "selected" : ""}>${value}</option>`
  ).join("");
}
function render() {
  const rows = analysis?.items || [];
  $("detectedCount").textContent = rows.length;
  $("resultTable").innerHTML = rows.map((item,index)=>`
    <div class="result-row" data-index="${index}">
      <input class="entity wide" value="${esc(item.entity_name||item.ocelorn_number||"")}" placeholder="Conducteur / parc / véhicule">
      <input class="registration" value="${esc(item.registration||"")}" placeholder="Immatriculation">
      <input class="start" type="time" value="${esc(item.start_time||"")}">
      <input class="end" type="time" value="${esc(item.end_time||"")}">
      <select class="type">${activityOptions(item.activity_type||"circulation")}</select>
      <input class="label wide" value="${esc(item.activity_label||item.details||"")}" placeholder="Détail">
      <button class="remove" type="button">×</button>
    </div>`).join("");
  if (!rows.length) {
    $("resultTable").innerHTML = `
      <div class="empty-analysis">
        <strong>Aucune ligne exploitable détectée</strong>
        <p>Le texte a bien été lu, mais la structure du planning n’a pas été reconnue.</p>
        <p>Diagnostic : ${esc(JSON.stringify(analysis?.diagnostics || lastOcrDiagnostics || {}))}</p>
      </div>`;
  }
  $("saveButton").disabled = rows.length === 0;
  $("resultSection").hidden = false;
}
$("resultTable").addEventListener("click", event => {
  if (!event.target.classList.contains("remove")) return;
  const index = Number(event.target.closest(".result-row").dataset.index);
  analysis.items.splice(index, 1);
  render();
});
$("analyzeButton").addEventListener("click", async () => {
  const file = $("planningImage").files[0];
  if (!file || !loadedImage) return message("Choisis d’abord une capture.", true);

  $("analyzeButton").disabled = true;
  $("resultSection").hidden = true;
  analysis = null;
  message("Préparation de l’image…");
  try {
    const { text, words } = await runOcr(loadedImage);
    const type = $("planningType").value;
    message("Analyse de la grille et des couleurs…");
    analysis = type === "workshop"
      ? parseWorkshop(words, text)
      : await analyzeGrid(type, loadedImage, words, text);

    if (analysis.date) $("planningDate").value = analysis.date;
    render();
    const diagnostics = analysis.diagnostics || lastOcrDiagnostics || {};
    if (!analysis.items.length) {
      message(
        `Aucun résultat exploitable. Texte OCR : ${diagnostics.characters || 0} caractère(s), ` +
        `${diagnostics.words || 0} mot(s), ${diagnostics.labels || 0} ligne(s) reconnue(s).`,
        true
      );
    } else {
      message(
        `${analysis.items.length} élément(s) détecté(s) · ` +
        `${diagnostics.words || 0} mot(s) OCR · mode ${diagnostics.mode || "atelier"}. ` +
        `Vérifie et corrige avant validation.`
      );
    }
  } catch (exception) {
    message(exception.message, true);
  } finally {
    $("analyzeButton").disabled = false;
  }
});
function collect() {
  return [...document.querySelectorAll(".result-row")].map((row,index) => {
    const original = analysis.items[index] || {};
    return {
      ...original,
      entity_name: row.querySelector(".entity").value,
      registration: row.querySelector(".registration").value,
      ocelorn_number: original.ocelorn_number ||
        ($("planningType").value === "vehicle" ? row.querySelector(".entity").value : ""),
      start_time: row.querySelector(".start").value,
      end_time: row.querySelector(".end").value,
      activity_type: row.querySelector(".type").value,
      activity_label: row.querySelector(".label").value
    };
  });
}
$("saveButton").addEventListener("click", async () => {
  const rows = collect();
  if (!rows.length) {
    return message("Aucune donnée ne peut être enregistrée.", true);
  }
  const file = $("planningImage").files[0];
  const body = {
    type: $("planningType").value,
    date: $("planningDate").value,
    source_name: file?.name || "",
    items: rows
  };
  $("saveButton").disabled = true;
  try {
    const response = await fetch("/api/planning/imports", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.");
    message(`${payload.saved} élément(s) enregistrés pour le ${payload.date}.`);
    setTimeout(() => location.href =
      body.type === "driver" ? "./planning-conducteurs.html" :
      body.type === "workshop" ? "./atelier.html" :
      "./stationnement.html", 700);
  } catch (exception) {
    message(exception.message, true);
  } finally {
    $("saveButton").disabled = false;
  }
});
$("cancelButton").addEventListener("click", () => {
  $("resultSection").hidden = true;
  analysis = null;
});
