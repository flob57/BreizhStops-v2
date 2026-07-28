# BreizhStops V11.2 — Synchronisation Google My Maps

## Nouveautés
- Import multiple des petits fichiers KML « lien réseau » exportés depuis Google My Maps.
- Extraction automatique du nom et de l’URL My Maps.
- Synchronisation individuelle ou globale des itinéraires.
- Proxy Cloudflare sécurisé pour contourner les restrictions CORS de Google.
- Conservation locale des tracés dans IndexedDB pour un affichage rapide.
- Les cartes My Maps restent la source principale : toute modification y sera récupérée à la prochaine synchronisation.

## Utilisation
1. Dans My Maps, exporte chaque carte en cochant « fichier KML de lien réseau ».
2. Dans BreizhStops, ouvre « Itinéraires My Maps ».
3. Sélectionne tous les petits fichiers KML en une seule fois.
4. Clique ensuite sur « Synchroniser tout » quand tu modifies les cartes My Maps.

## Important
Les cartes doivent être accessibles au compte qui ouvre BreizhStops ou partagées par lien. Pour une synchronisation serveur sans authentification Google, le partage par lien est recommandé.
