# BreizhStops V10.4 — Résultats d'import corrigés

## Corrections

- Demande explicite de la sortie TSV de Tesseract.
- Conversion du TSV en mots positionnés lorsque `data.words` est absent.
- Détection plus tolérante des numéros de parc et des noms de conducteurs.
- Mode de secours pour retrouver les véhicules Océlorn directement dans le texte OCR.
- Mode de secours pour les absences conducteurs.
- Affichage du diagnostic OCR lorsque zéro ligne est détectée.
- Enregistrement impossible tant que l'analyse est vide.
- Confirmation visible du nombre de mots et du mode d'analyse utilisé.

Après analyse, il faut vérifier les résultats puis cliquer sur **Valider et enregistrer**.
Ce n'est qu'après cette validation que Stationnement, Atelier ou Planning conducteurs sont alimentés.
