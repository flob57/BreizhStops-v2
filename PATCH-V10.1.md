# BreizhStops V10.2 — Lecteur Océlorn sans licence Meta

## Changement principal

La capture n'est plus envoyée à un modèle Meta ou à Workers AI.

Le navigateur effectue désormais :

1. une lecture OCR unique du texte avec Tesseract.js ;
2. la détection géométrique de la grille horaire ;
3. la détection des lignes véhicules ou conducteurs ;
4. la détection des segments selon leurs couleurs ;
5. l'estimation des heures à partir de leur position entre 0 h et 24 h ;
6. un écran de correction avant enregistrement.

## Planning véhicules

- lecture du numéro de parc Océlorn ;
- correspondance avec l'immatriculation via la base Notion Mon parc ;
- détection circulation, atelier et transfert ;
- heure approximative de première et dernière activité.

## Planning conducteurs

- prise et fin de service via les segments violets ;
- HLP via les segments noirs ;
- QUB, BreizhGo et Le Cœur selon le préfixe lisible ;
- services occasionnels bleu clair ou rose ;
- coupures estimées entre deux activités ;
- RH/RHO, repos, congé, AT et maladie.

## Planning atelier

Les lignes contenant une immatriculation sont extraites par OCR et restent modifiables avant validation.

## Configuration

Aucune liaison Workers AI et aucune licence Meta ne sont nécessaires.
Une connexion internet reste nécessaire au premier chargement du module OCR Tesseract.js.
