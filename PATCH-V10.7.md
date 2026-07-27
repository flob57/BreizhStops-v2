# BreizhStops V10.7 — reconnaissance métier des plannings

## Véhicules
- rapprochement tolérant aux erreurs OCR entre le numéro de parc Océlorn et la base Notion « Mon Parc » ;
- correction des confusions fréquentes O/0, I/1, S/5, B/8 et Z/2 ;
- l’immatriculation est remplie automatiquement lorsque la correspondance est suffisamment fiable.

## Conducteurs
- ajout de `/api/planning/driver-index` ;
- la liste des conducteurs provient des noms Notion déjà résolus et synchronisés dans `duty_services` ;
- rapprochement approximatif du nom OCR avec cette liste ;
- résultat simplifié à une ligne par conducteur : Repos, Congé, Accident du travail, Maladie, ou En service de telle heure à telle heure ;
- suppression des détails de courses et des coupures dans le résultat final.

## Atelier
- lecture d’une feuille hebdomadaire ;
- association de chaque immatriculation à la date de sa colonne ;
- enregistrement de chaque rendez-vous à sa propre date ;
- détection complémentaire de Prépa-mines, Contrôle technique et rendez-vous chez TODD.
