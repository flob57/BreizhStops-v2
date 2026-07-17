# Configuration Notion pour le SAE

## 1. Créer une intégration Notion

Crée une intégration interne Notion, puis partage avec elle :

- la base `Mon planning` ;
- les pages ou bases contenant les fiches horaires des courses.

Dans Cloudflare Pages, ajoute les variables secrètes :

```text
NOTION_TOKEN
NOTION_PLANNING_DATABASE_ID
```

## 2. Noms des propriétés

Les valeurs par défaut sont :

```text
Date
Course 1
Course 2
Course 3
Course 4
Course 5
Nom
Girouette
Service
Réseau
```

Elles peuvent être modifiées avec les variables :

```text
NOTION_DATE_PROPERTY
NOTION_COURSE_PROPERTIES
NOTION_COURSE_TITLE_PROPERTY
NOTION_GIROUETTE_PROPERTY
NOTION_SERVICE_PROPERTY
NOTION_NETWORK_PROPERTY
```

Exemple de `NOTION_COURSE_PROPERTIES` :

```json
["Course 1","Course 2","Course 3","Course 4","Course 5"]
```

## 3. Format des fiches horaires

Le connecteur reconnaît :

- une table Notion dont une colonne contient l’heure et une autre le nom de
  l’arrêt ;
- ou des lignes de texte au format :

```text
10:45 Résistance
10:48 Pont Firmin Gare
10:51 Poste Centrale
```

Les secondes sont facultatives.


# Prises de service — variables supplémentaires

Ajoute trois secrets Cloudflare Pages :

```text
NOTION_LMJV_DATABASE_ID
NOTION_WEDNESDAY_DATABASE_ID
NOTION_SATURDAY_HOLIDAYS_DATABASE_ID
```

Valeurs :

```text
NOTION_LMJV_DATABASE_ID=2e66bbfa7ec1801e9214d3f06d3bee91
NOTION_WEDNESDAY_DATABASE_ID=37c6bbfa7ec180458081c38c3b6a8c3f
NOTION_SATURDAY_HOLIDAYS_DATABASE_ID=37c6bbfa7ec180019abae1cb85893b16
```

Les trois bases doivent être partagées avec l’intégration Notion utilisée par
`NOTION_TOKEN`.

Propriétés lues :

```text
PS
QUB
Conducteur
Course 1
Véhicule
```


## Stationnement V7.6

Partager avec l'intégration Cloudflare :

1. la base Stationnement ;
2. la base véhicules liée par la propriété `Mon parc`.

Propriétés reconnues :

- `Emplacement`
- `Depot` ou `Dépôt`
- `Mon parc`
- `X`
- `Y`
- `Type`
- `Statut`

Identifiant par défaut de la base Stationnement :
`35e6bbfa7ec180a18deff12d69f95ebc`



## Base Tâches récurrentes — V7.6

Base utilisée :

`3846bbfa7ec180928dc0d29a9b7aa8c6`

Propriétés reconnues :

- `To do` : titre de la tâche ;
- `Jour` : jour récurrent, par exemple `Mardi` ;
- `Date` : date d’une tâche ponctuelle ;
- `Last completed` peut rester dans Notion, mais BreizhStops ne la modifie pas.

La connexion Cloudflare/Notion doit avoir accès à cette base.



## V7.6 — Atelier et arrêts de travail

### Véhicules à l’atelier
Base :

`35f6bbfa7ec180b6a5eee3e10f899ebc`

Propriétés recherchées :
- immatriculation : `Immatriculation`, `Véhicule`, `Nom` ou propriété titre ;
- durée : `Durée atelier`, `Durée`, `Nombre de jours` ou `Jours` ;
- photo : couverture de la page Notion.

### Conducteurs en arrêt
Base :

`3676bbfa7ec18044a3a4e3c511cc92af`

Propriétés recherchées :
- conducteur : `Conducteur`, `Conducteurs`, `Mes Conducteurs`, `Nom` ou propriété titre ;
- fin : `Date de fin`, `Fin` ou `Date fin` ;
- durée : `Nombre de jours`, `Jours` ou `Durée`.

La connexion Notion `Cloudflare` doit être partagée avec ces deux bases.
