# BreizhStops V10.6 — Correctif OCR PC et iPhone

## Correction principale

Le chargement de la capture ne transmet plus un `ImageBitmap` à Tesseract.js.
La nouvelle chaîne est :

1. `FileReader` lit le fichier en Data URL ;
2. un élément `Image` décode réellement la capture ;
3. l’image est dessinée sur un `Canvas` blanc ;
4. le Canvas est converti en PNG valide ;
5. Tesseract.js analyse ce PNG ;
6. l’analyse de la grille et des couleurs utilise exactement le même Canvas, donc les coordonnées OCR et les pixels restent alignés.

## Autres corrections

- correction de la référence inexistante `ocrImage` ;
- limite de 12 Mo contrôlée avant OCR ;
- réduction automatique des très grandes captures à 3200 px maximum ;
- messages d’erreur plus clairs ;
- conservation de la prévisualisation originale ;
- compatibilité renforcée avec Edge, Chrome et Safari/iPhone.

## Fichiers modifiés

- `planning-import.js`
- `planning-import.html`
