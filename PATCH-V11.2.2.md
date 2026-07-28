# Correctif V11.2.2 — My Maps

## Corrections

- Corrige `Initialisation impossible : t.addLayer is not a function`.
- Évite la confusion entre l’instance Leaflet et le `<div id="map">` exposé par le navigateur sous `window.map`.
- Publie explicitement la carte Leaflet dans `window.breizhStopsMap`.
- L’import par glisser-déposer reste actif même lorsque la carte Leaflet n’est pas encore prête.
- Force le rechargement des scripts avec `?v=11.2.2`.

## Installation

Remplacer `app.js`, `network-map.js` et `breizhstops.html`, puis redéployer Cloudflare Pages et faire `Ctrl + F5`.
