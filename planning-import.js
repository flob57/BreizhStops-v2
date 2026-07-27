
const $ = id => document.getElementById(id);
let analysis = null;
let loadedImage = null;
let vehicleIndex = null;
let vehicleList = [];
let driverList = [];
let lastOcrDiagnostics = null;

function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
$("planningDate").value = parisDate();

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_OCR_DIMENSION = 3200;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("La capture n’a pas pu être lue."));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(
      "Le navigateur n’arrive pas à ouvrir cette image. Essaie de l’enregistrer en JPEG ou PNG."
    ));
    image.src = source;
  });
}

async function prepareImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier choisi n’est pas une image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("La capture dépasse 12 Mo. Réduis sa taille ou enregistre-la en JPEG.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadHtmlImage(source);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) {
    throw new Error("Les dimensions de la capture sont invalides.");
  }

  const scale = Math.min(1, MAX_OCR_DIMENSION / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Tesseract reçoit un PNG complet et lisible, pas un ImageBitmap.
  const ocrSource = canvas.toDataURL("image/png");
  return { canvas, ocrSource, previewSource: source, naturalWidth, naturalHeight };
}

$("planningImage").addEventListener("change", async () => {
  const file = $("planningImage").files[0];
  loadedImage = null;
  analysis = null;
  $("resultSection").hidden = true;
  $("saveButton").disabled = true;
  if (!file) return;

  message("Préparation de la capture…");
  $("analyzeButton").disabled = true;
  try {
    loadedImage = await prepareImage(file);
    $("preview").src = loadedImage.previewSource;
    $("preview").hidden = false;
    const reduced = loadedImage.canvas.width !== loadedImage.naturalWidth ||
      loadedImage.canvas.height !== loadedImage.naturalHeight;
    message(
      `Capture prête (${loadedImage.canvas.width} × ${loadedImage.canvas.height}px)` +
      (reduced ? " · redimensionnée pour fiabiliser l’OCR." : ".")
    );
  } catch (exception) {
    $("preview").hidden = true;
    message(exception.message, true);
  } finally {
    $("analyzeButton").disabled = false;
  }
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


function ocrComparable(value) {
  return compact(value)
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2");
}

function similarityScore(first, second) {
  const a = ocrComparable(first);
  const b = ocrComparable(second);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function bestVehicleMatch(rawLabel) {
  const label = normalize(rawLabel);
  const words = label.split(/\s+/).filter(Boolean);
  const chunks = [label, ...words];
  for (let size = 2; size <= Math.min(3, words.length); size++) {
    for (let i = 0; i <= words.length - size; i++) chunks.push(words.slice(i, i + size).join(""));
  }

  let best = null;
  let second = null;
  for (const vehicle of vehicleList) {
    const candidates = [vehicle.park_number, ...(vehicle.keys || [])].filter(Boolean);
    let vehicleScore = 0;
    for (const chunk of chunks) {
      for (const candidate of candidates) {
        let score = similarityScore(chunk, candidate);
        const chunkDigits = compact(chunk).match(/\d{3,}/)?.[0] || "";
        const candidateDigits = compact(candidate).match(/\d{3,}/)?.[0] || "";
        if (chunkDigits && candidateDigits && chunkDigits === candidateDigits) score = Math.max(score, 0.9);
        if (compact(label).includes(compact(candidate))) score = Math.max(score, 0.98);
        vehicleScore = Math.max(vehicleScore, score);
      }
    }
    const entry = { vehicle, score: vehicleScore };
    if (!best || entry.score > best.score) {
      second = best;
      best = entry;
    } else if (!second || entry.score > second.score) second = entry;
  }

  if (!best) return null;
  const clearWinner = !second || best.score - second.score >= 0.05;
  return best.score >= 0.60 && (clearWinner || best.score >= 0.86) ? best : null;
}

async function loadDriverIndex() {
  if (driverList.length) return driverList;
  const response = await fetch("/api/planning/driver-index");
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error("La liste des conducteurs n’a pas pu être chargée."); }
  if (!response.ok) throw new Error(payload.error || "Liste des conducteurs indisponible.");
  driverList = payload.drivers || [];
  return driverList;
}

function bestDriverMatch(rawLabel) {
  const label = normalize(rawLabel);
  if (!label || !driverList.length) return null;
  let best = null;
  for (const driver of driverList) {
    const full = similarityScore(label, driver.name);
    const labelTokens = label.split(/\s+/).filter(v => v.length >= 3);
    const nameTokens = normalize(driver.name).split(/\s+/).filter(v => v.length >= 3);
    let tokenScore = 0;
    for (const a of labelTokens) for (const b of nameTokens) tokenScore = Math.max(tokenScore, similarityScore(a, b));
    const score = Math.max(full, tokenScore * 0.94);
    if (!best || score > best.score) best = { driver, score };
  }
  return best && best.score >= 0.52 ? best : null;
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
  if (type === "driver") await loadDriverIndex();

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

      const rawPark = normalize(label.text).replace(/\s+/g, " ").trim();
      const match = bestVehicleMatch(rawPark);
      const park = match?.vehicle?.park_number || rawPark;
      const registration = match?.vehicle?.registration || index.get(compact(rawPark)) || "";
      items.push({
        entity_name: park,
        ocelorn_number: park,
        registration,
        start_time: hhmm(timeFromX(runs[0][0], grid)),
        end_time: hhmm(timeFromX(runs.at(-1)[1], grid)),
        activity_type: activity,
        activity_label: lineText || activity,
        confidence: registration ? Math.max(0.82, match?.score || 0.94) : 0.45
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
        entity_name: bestDriverMatch(label.text)?.driver?.name || normalize(label.text),
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
        entity_name: bestDriverMatch(label.text)?.driver?.name || normalize(label.text),
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
          entity_name: bestDriverMatch(label.text)?.driver?.name || normalize(label.text),
          start_time: hhmm(timeFromX(gapStart, grid)),
          end_time: hhmm(timeFromX(gapEnd, grid)),
          activity_type: "coupure",
          activity_label: "Coupure / pause",
          confidence: 0.8
        });
      }
    }
  }

  let finalItems = items;
  if (type === "driver") {
    const grouped = new Map();
    for (const item of items) {
      const key = normalize(item.entity_name);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, { name: item.entity_name, rows: [] });
      grouped.get(key).rows.push(item);
    }
    finalItems = [];
    for (const group of grouped.values()) {
      const absence = group.rows.find(row => ["repos", "conge", "at", "maladie"].includes(row.activity_type));
      if (absence) {
        finalItems.push({ ...absence, entity_name: group.name, start_time: "00:00", end_time: "23:55", activity_label: ({repos:"Repos",conge:"Congé",at:"Accident du travail",maladie:"Maladie"})[absence.activity_type] });
        continue;
      }
      const timed = group.rows.filter(row => row.start_time && row.end_time && !["coupure", "prise_service", "fin_service"].includes(row.activity_type));
      if (!timed.length) continue;
      timed.sort((a,b) => a.start_time.localeCompare(b.start_time));
      finalItems.push({
        entity_name: group.name,
        start_time: timed[0].start_time,
        end_time: timed.reduce((max,row) => row.end_time > max ? row.end_time : max, timed[0].end_time),
        activity_type: "service",
        activity_label: "En service",
        confidence: Math.min(...timed.map(row => Number(row.confidence || 0.7)))
      });
    }
  }

  return {
    planning_type: type,
    date: parseDate(fullText) || $("planningDate").value,
    items: finalItems,
    diagnostics: {
      mode: "grid",
      labels: labels.length,
      ...lastOcrDiagnostics
    }
  };
}
function parseDateParts(day, month, year, fallbackDate) {
  const fallbackYear = Number(String(fallbackDate || "").slice(0, 4)) || new Date().getFullYear();
  const numericYear = year ? Number(year) : fallbackYear;
  const d = Number(day), m = Number(month);
  if (!d || !m || d > 31 || m > 12) return "";
  return `${numericYear}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}


function normalizeRegistrationCandidate(value) {
  const raw = compact(value)
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
  if (raw.length !== 7) return "";
  return raw;
}

function workshopLineCandidates(words) {
  const sorted = (words || []).slice().sort((a, b) => {
    const ay = ((a.bbox?.y0 || 0) + (a.bbox?.y1 || 0)) / 2;
    const by = ((b.bbox?.y0 || 0) + (b.bbox?.y1 || 0)) / 2;
    return ay - by || (a.bbox?.x0 || 0) - (b.bbox?.x0 || 0);
  });
  const lines = [];
  for (const word of sorted) {
    const box = word.bbox || {};
    const cy = ((box.y0 || 0) + (box.y1 || 0)) / 2;
    let line = lines.find(item => Math.abs(item.y - cy) < 13);
    if (!line) {
      line = { y: cy, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.y = (line.y * (line.words.length - 1) + cy) / line.words.length;
  }

  const candidates = [];
  for (const line of lines) {
    line.words.sort((a, b) => (a.bbox?.x0 || 0) - (b.bbox?.x0 || 0));
    for (let start = 0; start < line.words.length; start++) {
      for (let size = 1; size <= 4 && start + size <= line.words.length; size++) {
        const group = line.words.slice(start, start + size);
        const text = group.map(word => word.text).join("");
        const box = {
          x0: Math.min(...group.map(word => word.bbox?.x0 || 0)),
          x1: Math.max(...group.map(word => word.bbox?.x1 || 0)),
          y0: Math.min(...group.map(word => word.bbox?.y0 || 0)),
          y1: Math.max(...group.map(word => word.bbox?.y1 || 0))
        };
        const token = normalizeRegistrationCandidate(text);
        if (token && /\d{3}/.test(token)) candidates.push({ token, text, box, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
      }
    }
  }
  return candidates;
}

async function parseWorkshop(words, fullText) {
  await loadVehicleIndex();
  const dateDefault = parseDate(fullText) || $("planningDate").value;
  const dateAnchors = [];
  const registrations = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const text = String(word.text || "").trim();
    const box = word.bbox || {};
    const cx = ((box.x0 || 0) + (box.x1 || 0)) / 2;
    const cy = ((box.y0 || 0) + (box.y1 || 0)) / 2;

    let dateMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (!dateMatch && /^\d{1,2}$/.test(text)) {
      const nearby = words.find(other => {
        const b = other.bbox || {};
        const oy = ((b.y0 || 0) + (b.y1 || 0)) / 2;
        const ox = ((b.x0 || 0) + (b.x1 || 0)) / 2;
        return Math.abs(oy - cy) < 18 && ox > cx && ox < cx + 80 && /^[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?$/.test(String(other.text || ""));
      });
      if (nearby) dateMatch = `${text}${nearby.text}`.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    }
    if (dateMatch) {
      let year = dateMatch[3] || "";
      if (year && year.length === 2) year = `20${year}`;
      const date = parseDateParts(dateMatch[1], dateMatch[2], year, dateDefault);
      if (date) dateAnchors.push({ date, x: cx, y: cy });
    }

    const registration = text.match(/\b[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}\b/i)?.[0];
    if (registration) {
      registrations.push({
        registration: registration.toUpperCase().replace(/\s/g, "-").replace(/^([A-Z]{2})(\d{3})([A-Z]{2})$/, "$1-$2-$3"),
        x: cx, y: cy, box
      });
    }
  }

  // Deuxième lecture : rapproche les fragments OCR avec toutes les immatriculations connues de Mon Parc.
  const fuzzyCandidates = workshopLineCandidates(words);
  for (const vehicle of vehicleList) {
    const expected = compact(vehicle.registration);
    if (!expected || expected.length !== 7) continue;
    let best = null;
    for (const candidate of fuzzyCandidates) {
      let score = similarityScore(candidate.token, expected);
      const expectedDigits = expected.slice(2, 5);
      const candidateDigits = candidate.token.slice(2, 5);
      if (expectedDigits === candidateDigits) score = Math.max(score, 0.88);
      if (!best || score > best.score) best = { ...candidate, score };
    }
    if (!best || best.score < 0.69) continue;
    const already = registrations.some(item => item.registration === vehicle.registration && Math.abs(item.y - best.y) < 25);
    if (!already) registrations.push({ registration: vehicle.registration, x: best.x, y: best.y, box: best.box, fuzzy: true });
  }

  // De-duplicate OCR repetitions at nearly the same position.
  const uniqueRegistrations = [];
  for (const item of registrations.sort((a,b) => a.y-b.y || a.x-b.x)) {
    const duplicate = uniqueRegistrations.some(existing =>
      existing.registration === item.registration && Math.abs(existing.x-item.x) < 35 && Math.abs(existing.y-item.y) < 18
    );
    if (!duplicate) uniqueRegistrations.push(item);
  }

  const sortedDates = dateAnchors
    .filter((value, index, array) => array.findIndex(other => other.date === value.date && Math.abs(other.x-value.x)<25) === index)
    .sort((a,b) => a.x-b.x || a.y-b.y);

  const items = uniqueRegistrations.map(vehicle => {
    let chosenDate = dateDefault;
    if (sortedDates.length) {
      // Weekly sheets generally place dates as column headers. Prefer the nearest header horizontally,
      // with a mild preference for headers above the appointment cell.
      const candidates = sortedDates.map(anchor => ({
        anchor,
        distance: Math.abs(anchor.x - vehicle.x) + (anchor.y > vehicle.y ? 300 : 0)
      })).sort((a,b) => a.distance-b.distance);
      chosenDate = candidates[0].anchor.date;
    }

    const nearbyText = words
      .filter(word => {
        const b = word.bbox || {};
        const x = ((b.x0 || 0) + (b.x1 || 0)) / 2;
        const y = ((b.y0 || 0) + (b.y1 || 0)) / 2;
        return Math.abs(y - vehicle.y) < 24 && Math.abs(x - vehicle.x) < 260;
      })
      .sort((a,b)=>(a.bbox?.x0||0)-(b.bbox?.x0||0))
      .map(word=>word.text).join(" ").trim();

    const normalizedDetail = normalize(nearbyText);
    let detail = "Rendez-vous atelier";
    if (/PREPA[ -]?MINES|MINES/.test(normalizedDetail)) detail = "Prépa-mines";
    else if (/\bCT\b|CONTROLE TECHNIQUE/.test(normalizedDetail)) detail = "Contrôle technique";
    else if (/TODD/.test(normalizedDetail)) detail = "Rendez-vous chez TODD";

    return {
      entity_name: vehicle.registration,
      registration: vehicle.registration,
      start_time: "",
      end_time: "",
      activity_type: "atelier",
      activity_label: detail,
      location: /TODD/.test(normalizedDetail) ? "TODD" : "",
      details: nearbyText || detail,
      confidence: sortedDates.length ? 0.9 : 0.75,
      planning_date: chosenDate
    };
  });

  return {
    planning_type: "workshop",
    date: dateDefault,
    items,
    diagnostics: { mode: "atelier_semaine", dates: sortedDates.length, registrations: items.length, ...lastOcrDiagnostics }
  };
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


function createOcrCrop(sourceCanvas, { x = 0, y = 0, width, height, scale = 2.5, threshold = false } = {}) {
  const cropWidth = Math.max(1, Math.round(width ?? sourceCanvas.width));
  const cropHeight = Math.max(1, Math.round(height ?? sourceCanvas.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, x, y, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);

  if (threshold) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const dark = brightness < 205 || (saturation > 35 && brightness < 238);
      const value = dark ? 0 : 255;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
  }

  return {
    canvas,
    source: canvas.toDataURL("image/png"),
    transform: { x, y, scale }
  };
}

function mapOcrWords(words, transform, source) {
  const { x = 0, y = 0, scale = 1 } = transform || {};
  return (words || []).map(word => {
    const box = word.bbox || {};
    return {
      ...word,
      source,
      bbox: {
        x0: x + (box.x0 || 0) / scale,
        y0: y + (box.y0 || 0) / scale,
        x1: x + (box.x1 || 0) / scale,
        y1: y + (box.y1 || 0) / scale
      }
    };
  });
}

function mergeOcrWords(...groups) {
  const merged = [];
  for (const words of groups) {
    for (const word of words || []) {
      const text = normalize(word.text);
      const box = word.bbox || {};
      const cx = ((box.x0 || 0) + (box.x1 || 0)) / 2;
      const cy = ((box.y0 || 0) + (box.y1 || 0)) / 2;
      const duplicate = merged.some(existing => {
        const e = existing.bbox || {};
        const ex = ((e.x0 || 0) + (e.x1 || 0)) / 2;
        const ey = ((e.y0 || 0) + (e.y1 || 0)) / 2;
        return normalize(existing.text) === text && Math.abs(ex - cx) < 8 && Math.abs(ey - cy) < 6;
      });
      if (!duplicate) merged.push(word);
    }
  }
  return merged;
}

async function recognizeWithWorker(worker, source, parameters = {}) {
  await worker.setParameters({
    preserve_interword_spaces: "1",
    user_defined_dpi: "180",
    ...parameters
  });
  const result = await withTimeout(
    worker.recognize(source, {}, { blocks: true, text: true, tsv: true }),
    120000,
    "La lecture de la capture a dépassé deux minutes. Essaie avec une capture moins lourde."
  );
  return {
    text: result.data?.text || "",
    words: extractWords(result.data)
  };
}

async function runOcr(ocrSource, type, sourceCanvas) {
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
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0",
        langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
        logger: progress => {
          const percent = Math.round((progress.progress || 0) * 100);
          const labels = {
            "loading tesseract core": "Chargement du cœur OCR",
            "initializing tesseract": "Initialisation OCR",
            "loading language traineddata": "Chargement de la langue",
            "initializing api": "Préparation de la lecture",
            "recognizing text": "Lecture du texte"
          };
          message(`${labels[progress.status] || progress.status || "OCR"}… ${percent} %`);
        }
      }),
      120000,
      "Le chargement du moteur OCR a dépassé deux minutes. Recharge la page et réessaie."
    );

    const main = await recognizeWithWorker(worker, ocrSource, {
      tessedit_pageseg_mode: "11"
    });
    let targetedWords = [];
    let targetedText = "";

    if (sourceCanvas && (type === "vehicle" || type === "driver")) {
      message("Lecture renforcée de la colonne des noms…");
      const crop = createOcrCrop(sourceCanvas, {
        x: 0,
        y: Math.round(sourceCanvas.height * 0.075),
        width: Math.round(sourceCanvas.width * 0.235),
        height: Math.round(sourceCanvas.height * 0.77),
        scale: 3.2,
        threshold: true
      });
      const target = await recognizeWithWorker(worker, crop.source, {
        tessedit_pageseg_mode: "6",
        tessedit_char_whitelist: type === "vehicle"
          ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -"
          : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ.'- "
      });
      targetedWords = mapOcrWords(target.words, crop.transform, "labels");
      targetedText = target.text;
    } else if (sourceCanvas && type === "workshop") {
      message("Lecture renforcée des dates et immatriculations…");
      const crop = createOcrCrop(sourceCanvas, {
        x: 0,
        y: Math.round(sourceCanvas.height * 0.03),
        width: sourceCanvas.width,
        height: Math.round(sourceCanvas.height * 0.94),
        scale: 2.25,
        threshold: true
      });
      const target = await recognizeWithWorker(worker, crop.source, {
        tessedit_pageseg_mode: "11",
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/. "
      });
      targetedWords = mapOcrWords(target.words, crop.transform, "workshop");
      targetedText = target.text;
    }

    const words = mergeOcrWords(main.words, targetedWords);
    const text = [main.text, targetedText].filter(Boolean).join("\n");
    if (!text && !words.length) {
      throw new Error("Aucun texte n’a été détecté. Utilise une capture originale et suffisamment nette.");
    }

    lastOcrDiagnostics = {
      characters: text.length,
      words: words.length,
      targeted_words: targetedWords.length,
      has_secondary_pass: targetedWords.length > 0
    };
    return { text, words };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch {}
    }
  }
}
function activityOptions(current) {
  const options = [
    "circulation","service","atelier","transfert","prise_service","conduite_qub",
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
    const type = $("planningType").value;
    const { text, words } = await runOcr(loadedImage.ocrSource, type, loadedImage.canvas);
    message("Analyse de la grille et des couleurs…");
    analysis = type === "workshop"
      ? await parseWorkshop(words, text)
      : await analyzeGrid(type, loadedImage.canvas, words, text);

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
