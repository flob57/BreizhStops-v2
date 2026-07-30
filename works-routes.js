(() => {
  const STORAGE_KEY = 'breizhstops-roadworks-routes-v1';
  const $ = id => document.getElementById(id);
  let map;
  let layerGroup;
  let draftLine;
  let draftMarkers = [];
  let drawing = false;
  let selectedPoints = [];
  let worksVisible = true;
  let records = [];

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function getMap() {
    if (window.breizhStopsMap && typeof window.breizhStopsMap.addLayer === 'function') return window.breizhStopsMap;
    if (window.BreizhStopsMapApi?.getMap) return window.BreizhStopsMapApi.getMap();
    try { if (typeof window.map !== 'undefined' && window.map?.addLayer) return window.map; } catch {}
    return null;
  }

  function load() {
    try { records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { records = []; }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

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
      <div class="works-popup-actions">
        <button type="button" data-work-edit="${esc(record.id)}">Modifier</button>
        <button type="button" class="danger" data-work-delete="${esc(record.id)}">Supprimer</button>
      </div>
    </div>`;
  }

  function roadworksIcon() {
    return L.divIcon({
      className: 'roadworks-map-icon',
      html: '<span>🚧</span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function render() {
    if (!map || !window.L) return;
    if (!layerGroup) layerGroup = L.layerGroup().addTo(map);
    layerGroup.clearLayers();
    if (!worksVisible) return;

    records.forEach(record => {
      if (!Array.isArray(record.points) || record.points.length < 2) return;
      const latlngs = record.points.map(point => [point.lat, point.lng]);
      const line = L.polyline(latlngs, {
        color: '#f57c00', weight: 9, opacity: 0.9, lineCap: 'round', dashArray: '15 8'
      }).bindPopup(makePopup(record), { minWidth: 240 });
      line.addTo(layerGroup);

      const middle = L.latLng(
        (latlngs[0][0] + latlngs[latlngs.length - 1][0]) / 2,
        (latlngs[0][1] + latlngs[latlngs.length - 1][1]) / 2
      );
      L.marker(middle, { icon: roadworksIcon(), interactive: true })
        .bindPopup(makePopup(record), { minWidth: 240 })
        .addTo(layerGroup);
    });
    syncWorksToggle();
  }

  function clearDraft() {
    if (draftLine && map) map.removeLayer(draftLine);
    draftMarkers.forEach(marker => map?.removeLayer(marker));
    draftLine = null;
    draftMarkers = [];
    selectedPoints = [];
  }

  function updateDraft() {
    if (!map || selectedPoints.length < 2) return;
    if (draftLine) map.removeLayer(draftLine);
    draftMarkers.forEach(marker => map.removeLayer(marker));
    draftMarkers = [];

    draftLine = L.polyline(selectedPoints.map(p => [p.lat, p.lng]), {
      color: '#ff9800', weight: 10, opacity: 0.95, dashArray: '12 8'
    }).addTo(map);

    selectedPoints.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], { draggable: true, title: index === 0 ? 'Départ des travaux' : 'Fin des travaux' }).addTo(map);
      marker.on('drag', event => {
        const ll = event.target.getLatLng();
        selectedPoints[index] = { lat: ll.lat, lng: ll.lng };
        draftLine.setLatLngs(selectedPoints.map(p => [p.lat, p.lng]));
      });
      draftMarkers.push(marker);
    });
  }

  function stopDrawing() {
    drawing = false;
    map?.off('click', handleMapClick);
    map?.getContainer().classList.remove('works-drawing-mode');
    const button = $('createWorksRoute');
    if (button) button.textContent = '🚧 Créer un itinéraire travaux';
  }

  function handleMapClick(event) {
    if (!drawing) return;
    selectedPoints.push({ lat: event.latlng.lat, lng: event.latlng.lng });
    if (selectedPoints.length === 1) {
      const marker = L.marker(event.latlng, { draggable: true }).addTo(map);
      marker.bindTooltip('Point de départ', { permanent: false }).openTooltip();
      marker.on('drag', ev => selectedPoints[0] = { lat: ev.target.getLatLng().lat, lng: ev.target.getLatLng().lng });
      draftMarkers.push(marker);
      return;
    }
    selectedPoints = selectedPoints.slice(0, 2);
    updateDraft();
    stopDrawing();
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
    $('worksRouteId').value = record?.id || '';
    $('worksRouteTitle').value = record?.title || '';
    $('worksRouteStart').value = record?.startDate || '';
    $('worksRouteEnd').value = record?.endDate || '';
    $('worksRouteComment').value = record?.comment || '';
    if (record) {
      selectedPoints = record.points.map(p => ({ ...p }));
      updateDraft();
    }
    dialog.showModal?.() || dialog.setAttribute('open', '');
  }

  function submitForm(event) {
    event.preventDefault();
    if (selectedPoints.length < 2) return alert('Sélectionnez d’abord un point de départ et un point d’arrivée.');
    const id = $('worksRouteId').value || `works-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id,
      title: $('worksRouteTitle').value.trim() || 'Travaux',
      startDate: $('worksRouteStart').value,
      endDate: $('worksRouteEnd').value,
      comment: $('worksRouteComment').value.trim(),
      points: selectedPoints.map(p => ({ lat: p.lat, lng: p.lng })),
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

  function editRecord(id) {
    const record = records.find(item => item.id === id);
    if (record) openForm(record);
  }

  function deleteRecord(id) {
    const record = records.find(item => item.id === id);
    if (!record || !confirm(`Supprimer « ${record.title || 'Travaux'} » ?`)) return;
    records = records.filter(item => item.id !== id);
    save();
    map?.closePopup();
    render();
  }

  function injectWorksToggle() {
    const body = $('visibleLinesBody');
    if (!body || body.querySelector('#toggleWorksLayer')) return;
    const block = document.createElement('div');
    block.className = 'floating-works-layer';
    block.innerHTML = `<label><input type="checkbox" id="toggleWorksLayer" ${worksVisible ? 'checked' : ''}> <span>🚧 Travaux</span><strong>${records.length}</strong></label>`;
    body.prepend(block);
    $('toggleWorksLayer')?.addEventListener('change', event => {
      worksVisible = event.target.checked;
      render();
    });
  }

  function syncWorksToggle() {
    injectWorksToggle();
    const toggle = $('toggleWorksLayer');
    if (toggle) toggle.checked = worksVisible;
    const count = toggle?.closest('label')?.querySelector('strong');
    if (count) count.textContent = records.length;
  }

  function init() {
    map = getMap();
    if (!map || !window.L) return false;
    load();
    layerGroup = L.layerGroup().addTo(map);
    render();

    $('createWorksRoute')?.addEventListener('click', startDrawing);
    $('worksRouteForm')?.addEventListener('submit', submitForm);
    [$('cancelWorksRoute'), $('cancelWorksRouteFooter')].filter(Boolean).forEach(button => button.addEventListener('click', () => {
      $('worksRouteDialog')?.close();
      clearDraft();
      stopDrawing();
    }));

    document.addEventListener('click', event => {
      const edit = event.target.closest('[data-work-edit]');
      if (edit) editRecord(edit.dataset.workEdit);
      const del = event.target.closest('[data-work-delete]');
      if (del) deleteRecord(del.dataset.workDelete);
    });

    const observer = new MutationObserver(syncWorksToggle);
    const target = $('visibleLinesBody');
    if (target) observer.observe(target, { childList: true, subtree: false });
    syncWorksToggle();

    window.BreizhStopsWorksApi = {
      getAll: () => records.map(item => ({ ...item, points: item.points.map(p => ({ ...p })) })),
      setVisible: visible => { worksVisible = Boolean(visible); render(); },
      startDrawing
    };
    return true;
  }

  const timer = setInterval(() => { if (init()) clearInterval(timer); }, 150);
  setTimeout(() => clearInterval(timer), 15000);
})();
