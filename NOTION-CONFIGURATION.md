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
