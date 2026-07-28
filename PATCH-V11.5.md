# BreizhStops V11.5 — Itinéraires My Maps partagés

## Corrections

- Le nom complet de chaque itinéraire est désormais affiché sur plusieurs lignes dans « Mes itinéraires ».
- Les liens My Maps et leurs tracés sont enregistrés dans Cloudflare D1.
- Ils survivent aux redéploiements GitHub / Cloudflare.
- Ils sont récupérés automatiquement sur les autres appareils, notamment le smartphone.
- Au premier chargement, les itinéraires déjà présents dans IndexedDB sur le PC sont migrés automatiquement vers D1.
- IndexedDB reste utilisé comme cache local pour accélérer l'affichage et mémoriser les lignes visibles sur chaque appareil.

## Installation

Déployer tous les fichiers du ZIP. Aucune migration manuelle D1 n'est obligatoire : l'API crée automatiquement la table `my_maps_routes` lors du premier accès. Le schéma SQL est aussi ajouté dans `schema.sql` pour documentation.

Après déploiement, effectuer un rechargement forcé (`Ctrl + F5`). Ouvrir ensuite « Itinéraires My Maps » sur le PC une première fois afin de migrer les itinéraires locaux vers D1. Ils apparaîtront ensuite sur le smartphone après actualisation.
