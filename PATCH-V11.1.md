# BreizhStops V11.1 — Carte réseau et import KML/KMZ

## Nouveautés
- Tous les arrêts sont affichés dès l'ouverture de la carte.
- Regroupement automatique des arrêts par grappes avec leur nombre.
- Dégroupement progressif au zoom et affichage individuel à partir du zoom 16.
- Une recherche ou un filtre affiche tous les arrêts correspondants sur la carte, même si la liste reste limitée aux 100 premiers.
- Import simultané de plusieurs fichiers KML et KMZ par sélection ou glisser-déposer.
- Conservation locale des tracés dans IndexedDB, plus adaptée aux nombreux fichiers que localStorage.
- Affichage/masquage, cadrage et suppression de chaque tracé.
- Détection des doublons identiques lors d'un nouvel import.

## Déploiement
Remplacer les fichiers du dépôt par le contenu de l'archive, déployer sur Cloudflare Pages, puis faire Ctrl + F5.
