# BreizhStops V9.5 — Relations Notion PDVV

## Correction principale

Les propriétés **Théorique** et **Affectation** de la base PDVV sont des relations Notion.
La V9.5 ouvre désormais les pages véhicules liées et lit leur propriété
**Immatriculation**, au lieu de chercher du texte directement dans la relation.

## Utilisation des deux relations

- **Prises de service** : utilise `Affectation` pour afficher le PDVV réellement présent.
- **Page PDVV** : affiche à la fois `Théorique` et `Affectation`.
- **Mon parc** : utilise exclusivement `Théorique` pour afficher le PDVV prévu pour chaque véhicule.

Le statut vert/rouge reste issu de la propriété Notion `Match`.
