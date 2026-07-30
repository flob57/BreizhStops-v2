# Patch V12.6 — Travaux ou déviation

Ce patch ajoute un choix de type lors de la création ou de la modification d'un itinéraire :

- **Travaux** : segment orange avec pictogramme 🚧
- **Déviation** : segment vert avec pictogramme ↪

Le tracé routier, les points de passage, les dates, le commentaire, l'édition, la suppression et la synchronisation Cloudflare D1 restent identiques.

## Fichiers à remplacer

- `breizhstops.html`
- `works-routes.js`
- `style.css`
- `functions/api/works-routes/index.js`
- `functions/api/works-routes/[id].js`

La colonne D1 `route_type` est ajoutée automatiquement au premier appel de l'API. Les itinéraires existants restent classés comme travaux.
