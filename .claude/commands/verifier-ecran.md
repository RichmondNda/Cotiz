---
description: Compare le rendu d'une route avec les captures de référence de la maquette
argument-hint: <route> [--role …] [--scenario …] — ex. /asso/paiements --role gestionnaire --scenario file-vide
---
Vérifie visuellement la route suivante : $ARGUMENTS

0. Toutes les commandes se lancent depuis `frontend/` (l'app Nuxt) ; les références sont sous `design/` à la racine.
1. Si le serveur de dev ne tourne pas, lance `npm run dev` en arrière-plan et attends qu'il réponde.
2. Lance `node scripts/capture-ecran.mjs $ARGUMENTS` (sortie dans `frontend/.verif/`).
3. Retrouve dans `design/INVENTAIRE.md` l'écran correspondant et ses captures de référence
   (`design/screens/<espace>/web/<Écran>__<état>.png` et `.../mobile/...`). L'état = le scénario passé, sinon le premier état.
4. Lis les 4 images (référence web/mobile, rendu web/mobile) et liste les écarts, du plus visible au plus fin :
   structure et hiérarchie, textes et données, couleurs (tokens), typographie, espacements, rayons, états, responsive.
5. Corrige les écarts qui relèvent de l'écran (pas ceux d'un autre lot), recapture, et répète jusqu'à ce qu'il ne
   reste que des écarts négligeables. Termine par la liste des écarts restants, s'il y en a, et pourquoi.
Signale aussi toute erreur console remontée par le script.
