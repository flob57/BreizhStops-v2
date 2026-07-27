# BreizhStops V10.4 — Diagnostic robuste de l'import

## Corrections

- Journal technique permanent visible sous le bouton d'analyse.
- Capture des erreurs JavaScript globales et des promesses rejetées.
- Affichage des erreurs même lorsqu'elles ne possèdent pas de propriété `message`.
- Redimensionnement de la capture avant OCR pour limiter la mémoire utilisée.
- Utilisation du fichier original comme source OCR, plutôt que d'un ImageBitmap conservé.
- Sortie Tesseract limitée au texte et au TSV.
- Compteurs visibles : dimensions, caractères OCR, mots positionnés et résultats.
- Boutons déclarés explicitement en `type="button"`.
- En cas d'échec, la zone de résultats affiche l'erreur au lieu de disparaître.

Cette version est conçue pour identifier définitivement le point de blocage sur le navigateur utilisé.
