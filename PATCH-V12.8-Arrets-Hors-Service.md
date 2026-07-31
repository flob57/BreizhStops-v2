# Patch V12.8 — Arrêts hors service

Ce patch ajoute l’état **Hors service** à la fiche d’un arrêt.

## Fonctionnement

- Dans **État de l’arrêt**, choisir **Hors service** puis enregistrer.
- La punaise de cet arrêt devient grise avec un pictogramme d’interdiction.
- Un badge **Hors service** apparaît dans les résultats et dans la popup.
- Le statut est conservé dans Cloudflare D1 et retrouvé sur les autres appareils.
- En choisissant un autre état, la punaise reprend son affichage bleu habituel.

## Installation

Copier le contenu du ZIP à la racine du dépôt GitHub en conservant l’arborescence, puis remplacer les fichiers existants :

- `breizhstops.html`
- `app.js`
- `style.css`
- `functions/api/stop-overrides.js`

Aucune migration D1 n’est nécessaire : la colonne `status` existante est réutilisée.
