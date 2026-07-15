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
