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


## Nouveautés V5.4 — SAE automatique et iPhone

### Correspondance automatique

- analyse de tous les arrêts de la fiche Notion ;
- détection du réseau couvrant le mieux l’ensemble de la course ;
- points inRoute conservés comme compléments ;
- choix du bon arrêt par optimisation de la séquence complète ;
- pénalisation des détours, zigzags et demi-tours ;
- indice de confiance pour chaque proposition ;
- toutes les correspondances restent modifiables avant le lancement.

### Interface iPhone

- version mobile en une seule colonne ;
- aucun élément ne dépasse horizontalement ;
- comptages voyageurs compacts ;
- carte placée avant la progression ;
- commandes GPS réduites ;
- aucune modification des fonctions Cloudflare de la V5.2 stable.


## V5.5 — progression sous la carte

Correction de l'ordre des blocs du SAE sur iPhone :

1. arrêt actuel ;
2. prochain arrêt ;
3. carte GPS ;
4. progression de la course.

La cause était le conteneur `.sae-progress-wrapper`, qui n'avait pas de valeur
`order` en affichage mobile. Aucune fonction SAE, GPS, Notion ou Cloudflare
n'a été modifiée.


## V5.6 — Gestion du dépôt

Nouvelle page `prises-service.html` :

- sélection automatique de la base Notion selon le jour ;
- calendrier manuel des vacances scolaires et jours fériés ;
- synchronisation des propriétés PS, QUB, Conducteur, Course 1 et Véhicule ;
- décompte en temps réel ;
- validation quotidienne ;
- remise à zéro automatique par changement de date ;
- historique des validations conservé dans D1 ;
- présentation PC et smartphone.


## V6.9 — Gestion du dépôt

Cette version corrige les chemins d’import des nouvelles fonctions
Cloudflare Pages et affiche le numéro `V6.9` à côté du nom BreizhStops.

Fonctions incluses :

- page Prises de service ;
- sélection automatique de la base Notion selon le jour ;
- calendrier manuel des vacances scolaires et jours fériés ;
- décompte en temps réel ;
- validation quotidienne ;
- remise à zéro visuelle au changement de date ;
- historique conservé dans D1.


## V6.9 — résolution des conducteurs

Le synchroniseur suit désormais les relations Notion imbriquées :

```text
Prise de service
→ Affectation
→ Conducteur
→ Nom de la fiche conducteur
```

Un cache évite les appels répétés pour les mêmes pages Notion.
Aucune modification D1 supplémentaire n’est nécessaire.


## V6.9 — Conducteur via rollup Notion

Correction du champ Conducteur lorsque Notion le calcule ainsi :

```text
Prise de service
→ relation Véhicule
→ propriété Affectation
→ relation Conducteur
→ nom du conducteur
```

Le synchroniseur sait maintenant résoudre récursivement :

- les relations ;
- les rollups contenant des relations ;
- les relations imbriquées sur plusieurs niveaux.

Aucune modification D1 ni nouveau secret Cloudflare n’est nécessaire.


## V6.9 — nom réel du conducteur

Le synchroniseur suit les relations jusqu’à la fiche du conducteur,
puis lit exclusivement sa propriété `title`.

Il n’utilise plus une course, une affectation, un rollup ou une formule
comme nom de conducteur.

Aucune modification D1 ni nouveau secret Cloudflare n’est nécessaire.


## V6.9 — Tableau des départs

Nouvelle page `departs.html` :

- lecture automatique de toutes les propriétés `Course n` / `Horaire n` ;
- identification des courses en circulation ;
- prochain arrêt théorique selon l’heure courante ;
- diagramme thermomètre dépliable avec position théorique du car ;
- départs dans les 60 prochaines minutes ;
- conducteur, véhicule et QUB repris depuis les prises de service ;
- état de validation de la prise de service ;
- actualisation automatique toutes les 30 secondes ;
- prise en charge des courses passant minuit.


## V6.9 — synchronisation par lots

Correction de l’erreur Cloudflare :

`Too many subrequests by single Worker invocation`

La page Départs synchronise désormais un service Notion par invocation,
puis enchaîne automatiquement les services jusqu’à la fin.

Aucune nouvelle table D1 ni nouvelle variable Cloudflare n’est nécessaire.


## V6.9 — synchronisation complète par lots

Les prises de service sont désormais synchronisées une par une,
afin de respecter la limite Cloudflare sur les sous-requêtes.

La page Départs utilise cette même synchronisation par lots avant
de lire les courses et fiches horaires.

Les messages d’erreur affichent désormais le code HTTP et un extrait
de la réponse Cloudflare au lieu du seul message « réponse illisible ».

Aucune nouvelle table D1 ni nouvelle variable Cloudflare n’est nécessaire.


## V6.9 — Accueil et identité visuelle

- nouvelle page d’accueil Océlorn ;
- horloge d’autocar avec indication ARRÊT DEMANDÉ ;
- compteur des prises de service validées ;
- accès séparés à Gestion du dépôt et BreizhStops ;
- photos et pictogrammes fournis intégrés au site ;
- bannière BreizhStops inspirée du drapeau breton ;
- diagrammes de ligne restant ouverts jusqu’au nouveau clic ;
- services sans conducteur et sans véhicule automatiquement masqués.

Aucune nouvelle table D1 ni variable Cloudflare n’est nécessaire.


## V6.9 — ajustements visuels ciblés

- logo de bus londonien dans la section Aujourd’hui ;
- carte routière de Bretagne/Finistère en fond de la tuile BreizhStops ;
- conservation du logo de car au premier plan ;
- suppression des trois raccourcis redondants du bas de l’accueil ;
- bouton Accueil BreizhStops rendu pleinement visible ;
- suppression des boutons Dépôt et Départs de la barre BreizhStops.

Aucune modification D1 ni nouvelle variable Cloudflare n’est nécessaire.


## V6.9 — visuels et filtrage définitif

- utilisation exacte du nouveau bus londonien fourni ;
- utilisation exacte du nouveau logo de car fourni ;
- fond de la tuile BreizhStops remplacé par une vraie carte routière
  de Bretagne issue de la cartographie ;
- bouton Accueil remis dans le même style que les autres boutons ;
- suppression du fallback qui pouvait lire une course comme conducteur ;
- exclusion immédiate de tout service sans conducteur et sans véhicule ;
- suppression des anciennes lignes D1 devenues non affectées.

Après déploiement, cliquer une fois sur « Synchroniser depuis Notion »
dans Prises de service afin de nettoyer les données du jour.
Aucune nouvelle table D1 ni variable Cloudflare n’est nécessaire.
