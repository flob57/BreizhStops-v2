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
