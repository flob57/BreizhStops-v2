(() => {
  const body = document.body;
  const layout = document.querySelector('.layout');
  if (!layout) return;

  const buttons = {
    search: document.getElementById('toggleSearchPanel'),
    route: document.getElementById('toggleRoutePanel'),
    lines: document.getElementById('toggleLinesPanel')
  };

  const storageKey = 'breizhstops-map-panels-v11.6';
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  let state = isMobile
    ? { search: false, route: false, lines: false }
    : { search: true, route: true, lines: true };
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) state = { ...state, ...JSON.parse(saved) };
  } catch (_) {}

  const invalidateMap = () => {
    window.setTimeout(() => {
      const map = window.BreizhStopsMapApi?.getMap?.() || window.map;
      if (map && typeof map.invalidateSize === 'function') map.invalidateSize(true);
    }, 260);
  };

  function apply() {
    body.classList.toggle('search-panel-collapsed', !state.search);
    body.classList.toggle('route-panel-collapsed', !state.route);
    body.classList.toggle('lines-panel-collapsed', !state.lines);

    if (buttons.search) {
      buttons.search.setAttribute('aria-expanded', String(state.search));
      buttons.search.classList.toggle('active', state.search);
      buttons.search.textContent = state.search ? '◀ Recherche' : '🔎 Recherche';
    }
    if (buttons.route) {
      buttons.route.setAttribute('aria-expanded', String(state.route));
      buttons.route.classList.toggle('active', state.route);
      buttons.route.textContent = state.route ? 'Mon itinéraire ▶' : '🧭 Mon itinéraire';
    }
    if (buttons.lines) {
      buttons.lines.setAttribute('aria-expanded', String(state.lines));
      buttons.lines.classList.toggle('active', state.lines);
      buttons.lines.textContent = state.lines ? '▼ Lignes affichées' : '🚌 Lignes affichées';
    }

    const visibleLines = document.getElementById('visibleLinesPanel');
    if (visibleLines) visibleLines.classList.toggle('panel-hidden', !state.lines);
    localStorage.setItem(storageKey, JSON.stringify(state));
    invalidateMap();
  }

  buttons.search?.addEventListener('click', () => { state.search = !state.search; apply(); });
  buttons.route?.addEventListener('click', () => { state.route = !state.route; apply(); });
  buttons.lines?.addEventListener('click', () => { state.lines = !state.lines; apply(); });

  const observer = new MutationObserver(() => {
    const panel = document.getElementById('visibleLinesPanel');
    if (panel) panel.classList.toggle('panel-hidden', !state.lines);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  apply();
})();
