# BreizhStops V12.5 — Synchronisation des itinéraires travaux

## Fichiers à remplacer / ajouter

- Remplacer `works-routes.js`
- Ajouter `functions/api/works-routes/index.js`
- Ajouter `functions/api/works-routes/[id].js`

## Fonctionnement

- Les itinéraires travaux sont enregistrés dans Cloudflare D1.
- Ils sont chargés automatiquement sur chaque appareil.
- Les travaux locaux créés avec les V12.3/V12.4 sont migrés automatiquement vers D1 au premier chargement.
- La création, la modification et la suppression sont synchronisées.
- Si le réseau ou D1 est momentanément indisponible, le cache local continue de fonctionner.

La table `works_routes` est créée automatiquement lors du premier appel API. Aucun script SQL manuel n'est nécessaire.
