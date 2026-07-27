# BreizhStops V10.3 — Déblocage du lecteur OCR

## Corrections

- Initialisation explicite de Tesseract.js.
- Téléchargement d'une seule langue (`eng`) au lieu de `fra+eng`.
- Affichage détaillé de toutes les étapes de chargement et de lecture.
- Délai maximal de deux minutes pour éviter un chargement infini.
- Message explicite si un bloqueur de scripts ou la connexion empêche le chargement.
- Fermeture propre du worker OCR après chaque analyse.
- Récupération des mots compatible avec plusieurs formats de sortie de Tesseract.js.

Aucune liaison Workers AI ni licence Meta n'est nécessaire.
