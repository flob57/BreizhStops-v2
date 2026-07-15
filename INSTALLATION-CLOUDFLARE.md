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
