# BreizhStops V12.4 — Travaux suivant la route

## Nouveautés

- Le segment travaux est maintenant calculé sur le réseau routier avec OSRM/OpenStreetMap.
- Le départ et l’arrivée restent déplaçables : le tracé est recalculé après chaque déplacement.
- Le bouton **Faire passer par une autre rue** permet d’ajouter un point de passage sur la carte.
- Chaque point de passage est déplaçable et le tracé se recalcule automatiquement.
- Le bouton **Effacer les passages** revient au trajet routier direct entre le départ et l’arrivée.
- Les anciens travaux V12.4 sont conservés et migrés automatiquement.

## Fichiers modifiés

- `breizhstops.html`
- `works-routes.js`
- `style.css`

## Déploiement

Remplacer les trois fichiers, redéployer Cloudflare Pages puis effectuer un rechargement forcé (`Ctrl + F5`).
