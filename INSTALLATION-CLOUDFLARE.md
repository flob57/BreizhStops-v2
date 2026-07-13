# BreizhStops V3 — mise en service

Cette version ajoute les fiches d’arrêt, les photos, le tracé routier, les
itinéraires enregistrés et les liens de partage.

## 1. Déposer les fichiers dans GitHub

Remplace le contenu du dépôt avec les fichiers de cette archive.

Le dossier `functions` doit impérativement rester à la racine du dépôt.
Cloudflare Pages utilise ce dossier pour créer automatiquement les routes API.

Ne recrée pas encore de service worker : cette version reste volontairement
sans cache PWA.

## 2. Créer la base D1

Dans Cloudflare :

1. Ouvre **Storage & Databases**.
2. Choisis **D1 SQL database**.
3. Crée une base nommée `breizhstops-db`.
4. Ouvre la console SQL de cette base.
5. Copie tout le contenu de `schema.sql`.
6. Exécute le script.

## 3. Relier D1 au projet Pages

Dans ton projet Cloudflare Pages :

1. Ouvre **Settings**.
2. Va dans **Bindings** ou **Functions** selon l’affichage.
3. Ajoute une liaison **D1 database**.
4. Nom de variable : `DB`.
5. Base : `breizhstops-db`.
6. Configure la liaison en production et en prévisualisation.

Le nom `DB` doit être écrit exactement ainsi.

## 4. Créer le stockage photo R2

1. Dans Cloudflare, ouvre **R2 Object Storage**.
2. Crée un bucket nommé `breizhstops-photos`.
3. Dans les liaisons du projet Pages, ajoute une liaison R2.
4. Nom de variable : `PHOTOS`.
5. Bucket : `breizhstops-photos`.

Le bucket n’a pas besoin d’être public : les photos passent par
`/api/photos/...`.

## 5. Créer le code administrateur

Dans les variables et secrets du projet Pages, ajoute un secret :

- nom : `ADMIN_TOKEN`
- valeur : un code long et personnel, par exemple une phrase de passe

Ne mets jamais ce code directement dans GitHub.

Après le déploiement :

1. Ouvre BreizhStops.
2. Clique sur **Accès**.
3. Saisis le même code.
4. Il sera conservé uniquement dans ton navigateur.

## 6. Redéployer

Après avoir ajouté D1, R2 et le secret, lance un nouveau déploiement Pages.

## 7. Tests

### Fiche arrêt

1. Recherche un arrêt.
2. Clique sur **Fiche arrêt**.
3. Ajoute une ligne et une remarque.
4. Enregistre.
5. Recharge la fiche.

### Photo

1. Ouvre une fiche sur smartphone.
2. Clique sur le champ photo.
3. Prends une photo.
4. Clique sur **Envoyer la photo**.

### Itinéraire

1. Ajoute au moins deux arrêts.
2. Clique sur **Tracer dans BreizhStops**.
3. Active **Ajouter un passage par une rue**.
4. Clique sur la rue désirée.
5. Déplace le marqueur si nécessaire.
6. Enregistre l’itinéraire.

### Partage

1. Enregistre l’itinéraire avec la visibilité **Accessible par lien**.
2. Clique sur **Partager**.
3. Le lien est copié dans le presse-papiers.

## Important sur le moteur routier

La version fournie utilise le serveur public de démonstration OSRM pour calculer
les routes. Il convient pour les essais et un usage modéré, mais ne doit pas être
considéré comme un service garanti.

Le point de configuration se trouve au début de `app.js` :

```js
const ROUTING_ENDPOINT =
  "https://router.project-osrm.org/route/v1/driving";
```

Plus tard, on pourra remplacer ce service par une instance dédiée ou un autre
moteur de routage.
