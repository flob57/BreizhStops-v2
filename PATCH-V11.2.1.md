# BreizhStops V11.2.1 — Correctif My Maps

## Correction principale
Le bouton « Itinéraires My Maps » restait sans effet parce que `network-map.js` attendait `window.map`, alors que `app.js` crée la carte dans la variable globale `map` sans l'ajouter à `window`.

## Modifications
- ouverture immédiate de la fenêtre My Maps ;
- rattachement différé de la couche des tracés à Leaflet ;
- affichage de la version V11.2 ;
- cache-busting du JavaScript ;
- conservation de l'import multiple des KML de lien réseau ;
- conservation de la synchronisation via `/api/my-maps/sync`.

Après déploiement, effectuer un rechargement forcé avec Ctrl+F5.
