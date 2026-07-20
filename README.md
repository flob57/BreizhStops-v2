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


## V8.0 — Gestion du dépôt

Cette version corrige les chemins d’import des nouvelles fonctions
Cloudflare Pages et affiche le numéro `V8.0` à côté du nom BreizhStops.

Fonctions incluses :

- page Prises de service ;
- sélection automatique de la base Notion selon le jour ;
- calendrier manuel des vacances scolaires et jours fériés ;
- décompte en temps réel ;
- validation quotidienne ;
- remise à zéro visuelle au changement de date ;
- historique conservé dans D1.


## V8.0 — résolution des conducteurs

Le synchroniseur suit désormais les relations Notion imbriquées :

```text
Prise de service
→ Affectation
→ Conducteur
→ Nom de la fiche conducteur
```

Un cache évite les appels répétés pour les mêmes pages Notion.
Aucune modification D1 supplémentaire n’est nécessaire.


## V8.0 — Conducteur via rollup Notion

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


## V8.0 — nom réel du conducteur

Le synchroniseur suit les relations jusqu’à la fiche du conducteur,
puis lit exclusivement sa propriété `title`.

Il n’utilise plus une course, une affectation, un rollup ou une formule
comme nom de conducteur.

Aucune modification D1 ni nouveau secret Cloudflare n’est nécessaire.


## V8.0 — Tableau des départs

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


## V8.0 — synchronisation par lots

Correction de l’erreur Cloudflare :

`Too many subrequests by single Worker invocation`

La page Départs synchronise désormais un service Notion par invocation,
puis enchaîne automatiquement les services jusqu’à la fin.

Aucune nouvelle table D1 ni nouvelle variable Cloudflare n’est nécessaire.


## V8.0 — synchronisation complète par lots

Les prises de service sont désormais synchronisées une par une,
afin de respecter la limite Cloudflare sur les sous-requêtes.

La page Départs utilise cette même synchronisation par lots avant
de lire les courses et fiches horaires.

Les messages d’erreur affichent désormais le code HTTP et un extrait
de la réponse Cloudflare au lieu du seul message « réponse illisible ».

Aucune nouvelle table D1 ni nouvelle variable Cloudflare n’est nécessaire.


## V8.0 — Accueil et identité visuelle

- nouvelle page d’accueil Océlorn ;
- horloge d’autocar avec indication ARRÊT DEMANDÉ ;
- compteur des prises de service validées ;
- accès séparés à Gestion du dépôt et BreizhStops ;
- photos et pictogrammes fournis intégrés au site ;
- bannière BreizhStops inspirée du drapeau breton ;
- diagrammes de ligne restant ouverts jusqu’au nouveau clic ;
- services sans conducteur et sans véhicule automatiquement masqués.

Aucune nouvelle table D1 ni variable Cloudflare n’est nécessaire.


## V8.0 — ajustements visuels ciblés

- logo de bus londonien dans la section Aujourd’hui ;
- carte routière de Bretagne/Finistère en fond de la tuile BreizhStops ;
- conservation du logo de car au premier plan ;
- suppression des trois raccourcis redondants du bas de l’accueil ;
- bouton Accueil BreizhStops rendu pleinement visible ;
- suppression des boutons Dépôt et Départs de la barre BreizhStops.

Aucune modification D1 ni nouvelle variable Cloudflare n’est nécessaire.


## V8.0 — visuels et filtrage définitif

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


## V8.0 — Prise de poste et statistiques

Nouveautés :
- prise et fin de poste avec compteur réel ;
- sessions de conduite avec véhicule Notion et kilométrages ;
- pleins de carburant pendant une conduite ;
- accès direct au SAE pendant la conduite ;
- déclaration quotidienne d’heures préremplie selon la période ;
- page Mes statistiques ;
- heures supplémentaires basées sur les heures déclarées ;
- congés payés N et N−1 ;
- statistiques réelles par jour, semaine, mois et année ;
- historiques modifiables et supprimables ;
- consommations et distances par véhicule ;
- calendrier enrichi avec récupération et congé payé.

Base Notion véhicules utilisée par défaut :
`2e66bbfa7ec1804f963bc019a4d6de92`

Soldes initiaux préconfigurés :
- heures supplémentaires : +12h au 17/07/2026 à 00h00 ;
- congés N−1 : 28 jours ;
- congés N : 5 jours.

### Mise à jour D1 obligatoire

Exécuter dans la console D1 tout le bloc V8.0 présent à la fin de `schema.sql`,
ou réexécuter l’intégralité du fichier `schema.sql`.


## Correctif V8.0
Les tables D1 personnelles sont désormais créées automatiquement au premier appel API. Les boutons Prendre mon poste, Déclarer mes heures et Soldes initiaux fonctionnent sans exécution SQL manuelle.


## V8.0 — Activité et progressions

- Le bouton « Ouvrir les prises de service » est désormais placé avant « Mon activité ».
- La section « Mon activité » comporte un visuel de chronotachygraphe et le compteur d’heures supplémentaires en surimpression.
- Les cartes Aujourd’hui, Cette semaine, Ce mois et Cette année affichent une barre de progression des heures réelles par rapport aux heures attendues.
- Au-delà de 100 %, la barre reste pleine et le pourcentage réel continue de s’afficher.


## V8.0 — correction de l'emplacement du chronotachygraphe
- Suppression du grand visuel dans le bloc temps réel « Mon activité » de la section Aujourd'hui.
- Le bloc « Mon activité » reste compact avec les compteurs et les boutons.
- Ajout du véritable disque de chronotachygraphe dans la carte inférieure « Prise de poste et statistiques ».
- Le solde d'heures supplémentaires est affiché en surimpression sur cette image.


## V8.0 — Stationnement

Nouvelle page `stationnement.html` :

- synchronisation de la base Notion Stationnement ;
- plans schématiques de Lestonan et Gourvily ;
- affichage de l'immatriculation sur chaque emplacement ;
- prise en charge de plusieurs véhicules sur un même emplacement ;
- couleurs spécifiques aux places standard, Mini, VL et surcharge ;
- alerte renforcée lorsqu'une place de surcharge est occupée ;
- regroupement des affectations extérieures dans l'ordre Quimper, Briec,
  Extérieur, Atelier et Autre dépôt.

Base Notion utilisée par défaut :
`35e6bbfa7ec180a18deff12d69f95ebc`

La variable facultative `NOTION_PARKING_DATABASE_ID` peut remplacer cet identifiant.
Le secret existant `NOTION_TOKEN` est réutilisé.


## V8.0 — correction Stationnement

- La base véhicules liée à la propriété Notion `Mon parc` est maintenant détectée automatiquement.
- Les immatriculations sont récupérées depuis la véritable base liée, sans identifiant codé en dur.
- Les cartes d'emplacement ne possèdent plus de largeur minimale susceptible de provoquer des chevauchements.
- Les coordonnées de Lestonan et Gourvily ont été espacées et ajustées.
- La synchronisation indique aussi le nombre de véhicules réellement lus dans Notion.


## V8.0 — schéma final et détection des véhicules

- Lestonan Mini est positionné directement au-dessus de Lestonan 11.
- L'aire de lavage et la station AdBlue sont placées entre Lestonan 5 et Lestonan 11.
- Gourvily Mini et Gourvily 1 à 8 utilisent toute la largeur disponible.
- Les identifiants Notion sont comparés sans tirets pour fiabiliser les relations.
- Les pages de véhicules liées non retrouvées dans la requête principale sont récupérées directement.
- Une place est considérée occupée dès qu'une relation `Mon parc` existe.
- Le message de synchronisation indique le nombre de véhicules affectés et d'immatriculations reconnues.


## V8.0 — synchronisation Notion par lots

- traitement de 10 emplacements par requête ;
- lecture directe de la propriété relation `Mon parc` ;
- récupération des pages véhicules liées ;
- suppression du dépassement de limite Cloudflare responsable de `Failed to fetch` ;
- une place est occupée dès qu'une relation existe ;
- affichage du nombre d'immatriculations réellement reconnues.


## V8.0 — optimisation Stationnement et Départs

### Stationnement
- immatriculations agrandies sur ordinateur ;
- emplacements extérieurs rouges lorsqu'ils sont occupés ;
- plans Lestonan et Gourvily élargis sur iPhone pour éviter les chevauchements ;
- sur mobile, les places occupées affichent prioritairement l'immatriculation ;
- les emplacements Gourvily Mini et 1 à 8 conservent l'orientation de la version PC ;
- défilement horizontal tactile amélioré.

### Départs
- cartes des courses en circulation réorganisées pour iPhone ;
- boutons et informations plus lisibles ;
- tableau des prochains départs défilable horizontalement ;
- diagramme thermomètre déplaçable à la souris et au doigt ;
- position horizontale du diagramme conservée lors des mises à jour automatiques.


## V8.0 — proportions PC, paysage iPhone et compteurs

- Lestonan 1 à 5 : format vertical avec nom et immatriculation répartis verticalement.
- Les autres emplacements de Lestonan restent inchangés.
- Gourvily Mini et Gourvily 1 à 8 sont agrandis en conservant leur inclinaison.
- Gourvily 9, 10, 11 et les surcharges restent inchangés.
- En paysage sur iPhone, le plan complet est ajusté à la largeur disponible.
- Compteur cars : emplacements standards, surcharges et extérieurs Quimper/Briec/Extérieur.
- Atelier et Autre dépôt sont exclus.
- La capacité cars exclut les emplacements de surcharge.
- Un compteur minibus séparé utilise Lestonan Mini 1 et 2 et Gourvily Mini.



## V8.0 — Stationnement et tâches du jour

### Stationnement
- Lestonan 1 à 5 ont désormais exactement les proportions physiques des places 6 à 10, tournées verticalement.
- Le sens vertical des textes est conservé.
- Gourvily Mini et 1 à 8 sont abaissés et rapprochés sans toucher Gourvily 11.

### To do
- lecture de la base Notion `Tâches récurrentes` ;
- affichage des tâches correspondant au jour de la semaine ;
- affichage des tâches ponctuelles correspondant à la date ;
- validation directement depuis la section Aujourd’hui ;
- une tâche validée disparaît pour la journée ;
- la propriété Notion `Last completed` n’est pas modifiée.



## V8.0 — Accueil enrichi

- La carte Mon activité reprend la taille des autres modules.
- Ajout des véhicules actuellement à l’atelier avec couverture, immatriculation et durée.
- Ajout des conducteurs en arrêt avec date de fin et nombre de jours.
- Actualisation automatique toutes les cinq minutes.



## V8.0 — correction des vues Notion

Les deux liens précédemment fournis étaient des vues, et non des bases autonomes.

- Atelier : lecture de la base Parc Océlorn, puis filtrage sur la relation
  Stationnement = `Coat-Conq - Atelier`.
- Durée atelier : lecture de `Durée atelier` lorsqu’elle existe, sinon calcul
  depuis `Date atelier` ou `Entrée atelier`.
- Arrêts de travail : lecture de la base source et sélection des lignes pour
  lesquelles aujourd’hui est compris entre `Date de début` et `Date de fin`.
- Nom du conducteur : résolution de la relation `Mes Conducteurs`.


## V8.0 — nom des conducteurs corrigé

- La section « Conducteurs en arrêt » lit désormais systématiquement la relation Notion vers la base des conducteurs.
- Les noms des conducteurs remplacent les titres techniques des fiches d'arrêt tels que `2026.04`.
- La détection reste fonctionnelle même si la propriété Relation est renommée ou précédée d'un emoji.


## V8.0 — synchronisation publique et heures locales

### Synchronisation sans reconnexion Cloudflare

Les pages Prises de service et Départs utilisent désormais :

- `/api/public/duties/sync`
- `/api/public/departures/sync`

Ces routes doivent rester en dehors de la règle Cloudflare Access qui protège
`/api/admin/*`. Les anciennes routes administratives restent présentes pour
conserver la compatibilité.

### Modification des heures réelles

Les champs ISO ont été supprimés de l'interface. La modification s'effectue
maintenant avec :

- une date ;
- une heure de début ;
- une heure de fin ;
- une durée recalculée automatiquement.

L'affichage et la saisie utilisent le fuseau `Europe/Paris`. Les dates UTC ne
sont conservées qu'en interne dans la base D1.
