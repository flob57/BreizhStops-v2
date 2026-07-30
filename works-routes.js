(() => {
  const STORAGE_KEY = 'breizhstops-roadworks-routes-v2';
  const LEGACY_KEY = 'breizhstops-roadworks-routes-v1';
  const ROUTING_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
  const $ = id => document.getElementById(id);

  let map;
  let layerGroup;
  let draftLayer;
  let draftLine;
  let draftMarkers = [];
  let drawing = false;
  let waypointPicking = false;
  let controlPoints = []; // départ, passages, arrivée
  let routedPoints = [];
  let worksVisible = true;
  let records = [];
  let routeRequest = 0;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function getMap() {
    if (window.breizhStopsMap?.addLayer) return window.breizhStopsMap;
    if (window.BreizhStopsMapApi?.getMap) return window.BreizhStopsMapApi.getMap();
    try { if (window.map?.addLayer) return window.map; } catch {}
    return null;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || '[]';
      records = JSON.parse(raw).map(record => ({
        ...record,
        controlPoints: record.controlPoints || record.points || [],
        routePoints: record.routePoints || record.points || []
      }));
      save();
    } catch { records = []; }
  }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }

  function formatDate(value) {
    if (!value) return 'Non renseignée';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR').format(date);
  }

  function makePopup(record) {
    const dates = record.startDate || record.endDate
      ? `<div><strong>Dates :</strong> ${esc(formatDate(record.startDate))} → ${esc(formatDate(record.endDate))}</div>` : '';
    return `<div class="works-popup">
      <strong>🚧 ${esc(record.title || 'Travaux')}</strong>
      ${dates}
      ${record.comment ? `<p>${esc(record.comment)}</p>` : ''}
      <div><small>${Math.max(0, (record.controlPoints?.length || 2) - 2)} passage(s) imposé(s)</small></div>
      <div class="works-popup-actions">
        <button type="button" data-work-edit="${esc(record.id)}">Modifier</button>
        <button type="button" class="danger" data-work-delete="${esc(record.id)}">Supprimer</button>
      </div>
    </div>`;
  }

  function roadworksIcon() {
    return L.divIcon({ className: 'roadworks-map-icon', html: '<span>🚧</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
  }

  function midpointOnPath(points) {
    if (!points.length) return null;
    return points[Math.floor(points.length / 2)];
  }

  function render() {
    if (!map || !window.L) return;
    if (!layerGroup) layerGroup = L.layerGroup().addTo(map);
    layerGroup.clearLayers();
    if (!worksVisible) { syncWorksToggle(); return; }

    records.forEach(record => {
      const source = record.routePoints?.length >= 2 ? record.routePoints : record.controlPoints;
      if (!Array.isArray(source) || source.length < 2) return;
      const latlngs = source.map(point => [point.lat, point.lng]);
      L.polyline(latlngs, { color: '#f57c00', weight: 9, opacity: 0.9, lineCap: 'round', dashArray: '15 8' })
        .bindPopup(makePopup(record), { minWidth: 240 }).addTo(layerGroup);
      const middle = midpointOnPath(latlngs);
      if (middle) L.marker(middle, { icon: roadworksIcon(), interactive: true })
        .bindPopup(makePopup(record), { minWidth: 240 }).addTo(layerGroup);
    });
    syncWorksToggle();
  }

  function setRoutingStatus(message, isError = false) {
    const el = $('worksRoutingStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
  }

  async function calculateRoadRoute(fit = false) {
    if (controlPoints.length < 2) return;
    const requestId = ++routeRequest;
    setRoutingStatus('Calcul du tracé routier…');
    const coordinates = controlPoints.map(p => `${Number(p.lng)},${Number(p.lat)}`).join(';');
    try {
      const response = await fetch(`${ROUTING_ENDPOINT}/${coordinates}?overview=full&geometries=geojson&steps=false`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (requestId !== routeRequest) return;
      if (!data.routes?.[0]?.geometry?.coordinates) throw new Error('Aucun itinéraire routier trouvé');
      routedPoints = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      drawDraft(fit);
      const km = data.routes[0].distance / 1000;
      setRoutingStatus(`${km.toFixed(2)} km · ${Math.max(0, controlPoints.length - 2)} passage(s) imposé(s)`);
    } catch (error) {
      routedPoints = controlPoints.map(p => ({ ...p }));
      drawDraft(fit);
      setRoutingStatus('Routage indisponible : tracé provisoire en ligne droite.', true);
    }
  }

  function clearDraft() {
    if (draftLayer) draftLayer.clearLayers();
    draftLine = null;
    draftMarkers = [];
    controlPoints = [];
    routedPoints = [];
  }

  function drawDraft(fit = false) {
    if (!map || controlPoints.length < 2) return;
    if (!draftLayer) draftLayer = L.layerGroup().addTo(map);
    draftLayer.clearLayers();
    draftMarkers = [];
    const displayed = routedPoints.length >= 2 ? routedPoints : controlPoints;
    draftLine = L.polyline(displayed.map(p => [p.lat, p.lng]), {
      color: '#ff9800', weight: 10, opacity: 0.95, dashArray: '12 8', lineCap: 'round'
    }).addTo(draftLayer);

    controlPoints.forEach((point, index) => {
      const isStart = index === 0;
      const isEnd = index === controlPoints.length - 1;
      const title = isStart ? 'Départ des travaux' : isEnd ? 'Fin des travaux' : `Passage ${index}`;
      const marker = L.marker([point.lat, point.lng], { draggable: true, title }).addTo(draftLayer);
      marker.bindTooltip(title);
      marker.on('dragend', async event => {
        const ll = event.target.getLatLng();
        controlPoints[index] = { lat: ll.lat, lng: ll.lng };
        await calculateRoadRoute(false);
      });
      draftMarkers.push(marker);
    });
    if (fit && draftLine.getBounds().isValid()) map.fitBounds(draftLine.getBounds(), { padding: [35, 35] });
  }

  function stopDrawing() {
    drawing = false;
    map?.off('click', handleMapClick);
    map?.getContainer().classList.remove('works-drawing-mode');
    const button = $('createWorksRoute');
    if (button) button.textContent = '🚧 Créer un itinéraire travaux';
  }

  async function handleMapClick(event) {
    if (!drawing) return;
    controlPoints.push({ lat: event.latlng.lat, lng: event.latlng.lng });
    if (controlPoints.length === 1) {
      if (!draftLayer) draftLayer = L.layerGroup().addTo(map);
      L.marker(event.latlng, { draggable: true }).bindTooltip('Point de départ').addTo(draftLayer);
      return;
    }
    controlPoints = controlPoints.slice(0, 2);
    stopDrawing();
    await calculateRoadRoute(true);
    openForm();
  }

  function startDrawing() {
    if (!map) return alert('La carte n’est pas encore prête.');
    clearDraft();
    drawing = true;
    map.on('click', handleMapClick);
    map.getContainer().classList.add('works-drawing-mode');
    const button = $('createWorksRoute');
    if (button) button.textContent = 'Cliquez sur le départ puis l’arrivée…';
  }

  function openForm(record = null) {
    const dialog = $('worksRouteDialog');
    if (!dialog) return;
    $('worksRouteId').value = record?.id || $('worksRouteId').value || '';
    if (record) {
      $('worksRouteTitle').value = record.title || '';
      $('worksRouteStart').value = record.startDate || '';
      $('worksRouteEnd').value = record.endDate || '';
      $('worksRouteComment').value = record.comment || '';
      controlPoints = (record.controlPoints || record.points || []).map(p => ({ ...p }));
      routedPoints = (record.routePoints || record.points || []).map(p => ({ ...p }));
      drawDraft(true);
      calculateRoadRoute(false);
    }
    dialog.showModal?.() || dialog.setAttribute('open', '');
  }

  function startWaypointPicking() {
    if (controlPoints.length < 2) return alert('Créez d’abord le départ et l’arrivée.');
    $('worksRouteDialog')?.close();
    waypointPicking = true;
    map.getContainer().classList.add('works-drawing-mode');
    setRoutingStatus('Cliquez sur la rue par laquelle le chantier doit passer.');
    const onPick = async event => {
      map.off('click', onPick);
      waypointPicking = false;
      map.getContainer().classList.remove('works-drawing-mode');
      controlPoints.splice(controlPoints.length - 1, 0, { lat: event.latlng.lat, lng: event.latlng.lng });
      await calculateRoadRoute(true);
      openForm();
    };
    map.on('click', onPick);
  }

  async function clearWaypoints() {
    if (controlPoints.length > 2) controlPoints = [controlPoints[0], controlPoints[controlPoints.length - 1]];
    await calculateRoadRoute(true);
  }

  function submitForm(event) {
    event.preventDefault();
    if (controlPoints.length < 2) return alert('Sélectionnez d’abord un point de départ et un point d’arrivée.');
    const id = $('worksRouteId').value || `works-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id,
      title: $('worksRouteTitle').value.trim() || 'Travaux',
      startDate: $('worksRouteStart').value,
      endDate: $('worksRouteEnd').value,
      comment: $('worksRouteComment').value.trim(),
      controlPoints: controlPoints.map(p => ({ lat: p.lat, lng: p.lng })),
      routePoints: (routedPoints.length >= 2 ? routedPoints : controlPoints).map(p => ({ lat: p.lat, lng: p.lng })),
      updatedAt: new Date().toISOString()
    };
    const index = records.findIndex(item => item.id === id);
    if (index >= 0) records[index] = record; else records.push(record);
    save();
    $('worksRouteDialog').close();
    clearDraft();
    worksVisible = true;
    render();
    document.dispatchEvent(new CustomEvent('breizhstops:works-updated'));
  }

  function editRecord(id) { const record = records.find(item => item.id === id); if (record) openForm(record); }
  function deleteRecord(id) {
    const record = records.find(item => item.id === id);
    if (!record || !confirm(`Supprimer « ${record.title || 'Travaux'} » ?`)) return;
    records = records.filter(item => item.id !== id); save(); map?.closePopup(); render();
  }

  function injectWorksToggle() {
    const body = $('visibleLinesBody');
    if (!body || body.querySelector('#toggleWorksLayer')) return;
    const block = document.createElement('div');
    block.className = 'floating-works-layer';
    block.innerHTML = `<label><input type="checkbox" id="toggleWorksLayer" ${worksVisible ? 'checked' : ''}> <span>🚧 Travaux</span><strong>${records.length}</strong></label>`;
    body.prepend(block);
    $('toggleWorksLayer')?.addEventListener('change', event => { worksVisible = event.target.checked; render(); });
  }

  function syncWorksToggle() {
    injectWorksToggle();
    const toggle = $('toggleWorksLayer'); if (toggle) toggle.checked = worksVisible;
    const count = toggle?.closest('label')?.querySelector('strong'); if (count) count.textContent = records.length;
  }

  function cancelEditing() {
    $('worksRouteDialog')?.close();
    clearDraft(); stopDrawing();
    waypointPicking = false;
    map?.getContainer().classList.remove('works-drawing-mode');
  }

  function init() {
    map = getMap(); if (!map || !window.L) return false;
    load(); layerGroup = L.layerGroup().addTo(map); draftLayer = L.layerGroup().addTo(map); render();
    $('createWorksRoute')?.addEventListener('click', startDrawing);
    $('worksRouteForm')?.addEventListener('submit', submitForm);
    $('addWorksWaypoint')?.addEventListener('click', startWaypointPicking);
    $('clearWorksWaypoints')?.addEventListener('click', clearWaypoints);
    [$('cancelWorksRoute'), $('cancelWorksRouteFooter')].filter(Boolean).forEach(button => button.addEventListener('click', cancelEditing));
    document.addEventListener('click', event => {
      const edit = event.target.closest('[data-work-edit]'); if (edit) editRecord(edit.dataset.workEdit);
      const del = event.target.closest('[data-work-delete]'); if (del) deleteRecord(del.dataset.workDelete);
    });
    const observer = new MutationObserver(syncWorksToggle);
    const target = $('visibleLinesBody'); if (target) observer.observe(target, { childList: true, subtree: false });
    syncWorksToggle();
    window.BreizhStopsWorksApi = {
      getAll: () => records.map(item => structuredClone(item)),
      setVisible: visible => { worksVisible = Boolean(visible); render(); },
      startDrawing
    };
    return true;
  }

  const timer = setInterval(() => { if (init()) clearInterval(timer); }, 150);
  setTimeout(() => clearInterval(timer), 15000);
})();
