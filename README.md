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


## Nouveautés V4.1 GPS

- position automatiquement maintenue au centre de la carte ;
- orientation de la carte selon le cap GPS ou la boussole du téléphone ;
- flèche de position orientée ;
- lissage du cap pour éviter les rotations brutales ;
- suspension automatique du suivi lorsque l'utilisateur déplace la carte ;
- bouton pour reprendre le suivi ;
- bouton Nord en haut.


## Nouveautés V5 SAE

- synchronisation du planning journalier Notion ;
- lecture des fiches horaires ;
- correspondance des noms d'arrêts avec BreizhStops ;
- tracé automatique de la course ;
- écran SAE conducteur ;
- heure théorique, avance ou retard et distance ;
- passage automatique à l'arrêt suivant ;
- comptage des montées et descentes ;
- calcul du nombre de voyageurs à bord ;
- enregistrement des passages réels et comptages dans D1 ;
- aucune annonce vocale.


## Nouveautés V5.1

- filtre de réseau dans la correspondance des arrêts du SAE ;
- points inRoute toujours disponibles en complément ;
- modification du nom des arrêts ;
- sens entrant ou sortant ;
- suppression logique des arrêts ;
- sens affiché dans la sélection SAE ;
- flèche GPS fixe vers le haut ;
- rotation de la carte selon le cap ;
- boutons de zoom dédiés.


## Nouveautés V5.2 iPhone

- affichage SAE réorganisé pour l’iPhone 16 ;
- arrêt actuel avec heure, avance/retard et distance ;
- montées et descentes compactes sur une seule ligne ;
- prochain arrêt avec heure théorique ;
- carte avant la progression ;
- progression placée en bas ;
- commandes GPS plus compactes.
