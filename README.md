# BreizhStops V3 métier

Nombre d’arrêts inclus : 14087

Fonctions :

- moteur de recherche d’arrêts ;
- filtres réseau et commune ;
- fiches enrichies ;
- lignes, état et remarques ;
- photos depuis smartphone ;
- tracé routier réel ;
- passages imposés par une rue ;
- itinéraires enregistrés dans D1 ;
- partage par lien ;
- Google Maps, inRoute et GPX.

Lire impérativement `INSTALLATION-CLOUDFLARE.md` avant le déploiement.


## Sécurité

Les opérations d'écriture utilisent `/api/admin/*` et doivent être protégées
par Cloudflare Access. Aucun mot de passe n'est stocké dans le dépôt ni dans le
navigateur.


## Nouveautés V3.1

- affichage épuré lors du tracé d’un itinéraire ;
- import incrémental GTFS ZIP, stops.txt et GPX ;
- conservation systématique des anciens arrêts ;
- création manuelle d’un arrêt sur la carte ;
- création depuis la position GPS du smartphone ;
- stockage des nouveaux arrêts dans D1.


## Nouveautés V4 bêta

- import des réseaux, lignes, courses, variantes et shapes GTFS ;
- recherche réseau → ligne → variante ;
- affichage des lignes dans chaque fiche arrêt ;
- parcours officiels GTFS sur la carte ;
- GPS temps réel pour une ligne GTFS ou un itinéraire enregistré ;
- prochain arrêt automatique ;
- détection de sortie d'itinéraire ;
- annonces vocales simples.
