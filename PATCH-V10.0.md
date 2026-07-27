# BreizhStops V10.4 — Import intelligent des plannings

## Fonctions ajoutées

- Import d'une capture :
  - planning véhicules ;
  - planning atelier ;
  - planning conducteurs.
- Analyse locale spécialisée de la grille et des couleurs, complétée par une lecture OCR unique.
- Contrôle et correction des résultats avant enregistrement.
- Correspondance numéro de parc Océlorn → immatriculation via la base Notion Mon parc.
- Véhicules prévus en circulation affichés en orange dans Stationnement.
- Nouvelles pages :
  - `planning-import.html`
  - `atelier.html`
  - `planning-conducteurs.html`
- Les fiches des véhicules sur la carte Départs restent ouvertes jusqu'au second clic.

## Configuration Cloudflare obligatoire

Dans Cloudflare Pages :

1. Ouvrir **Settings → Functions → Workers AI bindings**.
2. Ajouter une liaison nommée exactement `AI`.
3. Accepter une fois la licence du modèle :
   `@cf/meta/llama-3.2-11b-vision-instruct`.

La base D1 crée automatiquement ses nouvelles tables lors du premier import.
Le SQL est également ajouté à `schema.sql`.
