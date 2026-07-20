# BreizhStops V3 — Cloudflare Access

Cette version n'utilise plus `ADMIN_TOKEN`.

## Déploiement

Dépose tous les fichiers de l'archive dans GitHub en conservant les dossiers.

Les liaisons Cloudflare restent :

- D1 : `DB`
- R2 : `PHOTOS`

## Protéger les écritures

Dans Cloudflare :

1. Ouvre **Zero Trust**.
2. Va dans **Access controls → Applications**.
3. Crée une application **Self-hosted**.
4. Sélectionne le domaine de BreizhStops.
5. Ajoute le chemin :

```text
/api/admin/*
```

6. Ajoute une politique **Allow**.
7. Autorise uniquement ton adresse e-mail.
8. Utilise le code à usage unique envoyé par e-mail, ou ton fournisseur
   d'identité habituel.

Le site, les fiches en lecture, les photos et les liens partagés restent
publics. Les modifications, uploads et itinéraires enregistrés demandent une
connexion Cloudflare Access.

## Base D1

L'identifiant utilisé dans `wrangler.jsonc` est celui de `breizhstops-db` :

```text
e060ea26-eb7e-4c98-95ec-9d783dbb2770
```

Exécute `schema.sql` uniquement si les quatre tables n'existent pas déjà.


## Migration V3.1

La V3.1 ajoute deux tables :

- `custom_stops`
- `stop_sources`

Dans la console D1, recopie et exécute la partie correspondante située à la fin
de `schema.sql`.

Cette opération ne supprime aucune table ni aucune donnée existante.

## Protection Cloudflare Access

Les nouvelles routes d’écriture sont déjà sous :

```text
/api/admin/*
```

La règle Access existante les protège donc automatiquement.

## Principe des mises à jour

- source déjà connue : mise à jour de la date de dernière apparition ;
- arrêt D1 déjà connu : mise à jour des informations ;
- doublon d’un arrêt statique : création d’un lien de source uniquement ;
- nouvel arrêt : ajout dans `custom_stops` ;
- arrêt absent d’un nouvel import : aucune suppression.


## Migration V4

Exécute la nouvelle partie située à la fin de `schema.sql`. Elle crée les tables :

- `gtfs_agencies`
- `gtfs_routes`
- `gtfs_patterns`
- `gtfs_pattern_stops`
- `gtfs_stop_routes`
- `gtfs_imports`

Aucune table existante n'est supprimée.

## Connexion Cloudflare Access

Avant un import :

1. ouvre **Données** ;
2. utilise le bouton de connexion administrateur si l'application le demande ;
3. termine la connexion dans le nouvel onglet ;
4. reviens sur BreizhStops ;
5. clique sur **Tester la connexion** puis relance l'import.

La route `/api/admin/session` sert uniquement à établir et vérifier la session.


## V4.1 GPS

Aucune nouvelle table D1 ni liaison Cloudflare n'est nécessaire.

Sur iPhone, l'autorisation d'accéder à l'orientation du téléphone peut être
demandée au démarrage du GPS. Cette autorisation nécessite une action de
l'utilisateur et un site HTTPS.

Le suivi GPS reste actif tant que BreizhStops est visible à l'écran.


## Migration V5 SAE

Exécute la nouvelle partie située à la fin de `schema.sql`. Elle crée :

- `sae_courses`
- `sae_course_stops`
- `sae_runs`
- `sae_stop_events`

Ajoute ensuite dans Cloudflare Pages :

```text
NOTION_TOKEN
NOTION_PLANNING_DATABASE_ID
```

Lis `NOTION-CONFIGURATION.md` pour adapter les noms des propriétés Notion.

La règle Cloudflare Access `/api/admin/*` protège automatiquement toutes les
données SAE et la synchronisation Notion.


## Migration V5.1

Exécute la dernière partie de `schema.sql` pour créer :

```text
stop_overrides
```

Cette table conserve les changements de nom, le sens entrant/sortant et les
suppressions sans modifier directement le gros fichier `data/stops.json`.


## Migration V5.4

Aucune nouvelle table D1 et aucune nouvelle variable Cloudflare ne sont
nécessaires.

La version repart de la V5.2 stable. Les changements portent uniquement sur :

- `sae.js` pour la proposition automatique ;
- `style.css` pour la présentation iPhone.

Les correspondances choisies sont toujours enregistrées par le mécanisme SAE
déjà présent.


## V5.6 — Prises de service

1. Exécuter la dernière partie de `schema.sql` dans D1.
2. Ajouter les trois secrets Notion décrits dans `NOTION-CONFIGURATION.md`.
3. Partager les trois bases Notion avec l’intégration.
4. Déployer tous les fichiers.
5. Ouvrir BreizhStops puis cliquer sur `🏢 Dépôt`.

Le calendrier intégré permet de renseigner :

- une période de vacances scolaires ;
- un jour férié ;
- le profil de services à utiliser ;
- ou l’absence totale de service.


## V6.4 — Tableau des départs

Exécuter la section V6.4 de `schema.sql` dans D1 pour créer
la table `daily_departures`.

Aucun nouveau secret Cloudflare n’est nécessaire.
Après déploiement, ouvrir `🚉 Départs` puis cliquer sur
`Synchroniser Notion`.


## Réglage Cloudflare Access pour la V8

La règle Access existante peut continuer à protéger :

```text
breizhstops-v2.pages.dev/api/admin/*
```

Ne créez aucune règle Access couvrant :

```text
breizhstops-v2.pages.dev/api/public/*
```

Les deux routes publiques servent uniquement à déclencher les synchronisations
Notion utilisées par l'interface :

```text
/api/public/duties/sync
/api/public/departures/sync
```

Après le déploiement, testez ces deux adresses depuis une fenêtre privée. Elles
ne doivent pas afficher la page de connexion Cloudflare.

## Route publique supplémentaire en V8.2

La synchronisation du stationnement appelle maintenant :

```text
/api/public/parking/sync
```

La règle Cloudflare Access doit continuer à cibler uniquement :

```text
breizhstops-v2.pages.dev/api/admin/*
```

Elle ne doit pas couvrir `/api/public/*`.

Après déploiement, le bouton Stationnement ne doit plus produire de
redirection HTTP 302 vers `cloudflareaccess.com`.


## V8.2 — chemins publics utilisés par l'application

La règle Access doit cibler uniquement :

```text
breizhstops-v2.pages.dev/api/admin/*
```

Ne pas ajouter `/api/public/*`. Les actions de l'interface BreizhStops utilisent maintenant ces chemins publics pour éviter les redirections 302 vers `cloudflareaccess.com`.
