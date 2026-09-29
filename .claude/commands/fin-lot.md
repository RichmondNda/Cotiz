---
description: Clôturer un lot (définition de fini, progression, nettoyage)
argument-hint: <id du lot>
---
Clôture du lot $ARGUMENTS :
1. Reprends la « Définition de fini » et la liste de contrôle de fin de lot de `docs/lots/$ARGUMENTS-*.md`. Pour chaque point, donne la preuve (test, commande, capture de sortie) ou dis ce qui manque.
2. Vérifie que tous les endpoints et tables du lot existent (compare avec les tableaux du lot) et que les endpoints sont dans `real-endpoints.ts`.
3. Lance `pnpm verify`.
4. Si tout est vert : mets à jour la ligne du lot dans `docs/progress.md` (statut `terminé`, date, jours réellement passés si je te les donne, remarques) et ajoute ce que tu as appris d'utile dans le `CLAUDE.md` du paquet concerné (3 lignes maximum).
5. Propose le message de la PR de fin de lot.
