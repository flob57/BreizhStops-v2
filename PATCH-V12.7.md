# Patch V12.7 — Module Vidange Tachy

## Installation
Copier le contenu du ZIP à la racine du dépôt GitHub BreizhStops en acceptant le remplacement de `index.html`, `home.css` et `home.js`.

## Fichiers ajoutés
- `tachy.html`
- `tachy.css`
- `tachy.js`
- `functions/api/tachy/index.js`

## Fichiers modifiés
- `index.html`
- `home.css`
- `home.js`

## Fonctionnement
- Lit la base Notion définie par `NOTION_VEHICLES_DATABASE_ID`.
- Conserve uniquement les véhicules dont l’état est `En service` ou `En service sur mon parc`.
- Lit la propriété Notion `Vidange Tachy`.
- Calcule l’échéance à J+90.
- Classe les véhicules : date manquante, retard, à vider sous 30 jours, à jour.
- La photo utilisée est la couverture de la page Notion du véhicule.

Aucune nouvelle variable Cloudflare n’est nécessaire si la connexion à la base `Mon parc` fonctionne déjà.
